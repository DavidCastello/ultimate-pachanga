-- ============================================================================
-- 008 — One account, one player
--
-- Until now any account that registered was silently dropped into the league
-- as a member, and the very first one became its administrator. That is fine
-- for a local stack and wrong for a public URL: it makes the league joinable
-- by anyone who finds it, and it ties the administrator to a race rather than
-- to a person.
--
-- This migration replaces it with an explicit model:
--
--   * A player record may be linked to an account (players.user_id). At most
--     one account per player, at most one player per account per league.
--   * Registering grants nothing. A new account has no membership and sees an
--     empty application until it joins a league by picking its player.
--   * The owner's address is the administrator, by name rather than by luck.
--   * A member may edit their own player — name, nickname, position, photo —
--     and nothing else.
--
-- Joining is self-service through the functions below rather than through RLS
-- policies, because it crosses a privilege boundary: the caller is by
-- definition not yet a member, so no policy on players or league_members
-- could see the rows involved.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- players.user_id
--
-- Nullable: an administrator creates the roster up front, and those players
-- stay unclaimed until their owner registers. Nulls do not collide in a unique
-- index, so any number of players may be unclaimed at once.
--
-- ON DELETE SET NULL rather than CASCADE: deleting an account must release the
-- player, never destroy a career's worth of scores.
-- ---------------------------------------------------------------------------

alter table public.players
  add column user_id uuid references auth.users (id) on delete set null;

comment on column public.players.user_id is
  'The account that plays as this player, or null while unclaimed.';

create unique index players_league_user_idx
  on public.players (league_id, user_id)
  where user_id is not null;

-- ---------------------------------------------------------------------------
-- The owner
--
-- Hardcoded alongside the initial league id, and for the same reason: the
-- bootstrap has to work before there is any row to configure it from.
-- ---------------------------------------------------------------------------

create function app.owner_email() returns text
  language sql immutable
  set search_path = ''
as $$ select 'dcastellotejera@gmail.com'::text $$;

comment on function app.owner_email is
  'The address that administers the initial league. Compared case-'
  'insensitively; see app.handle_new_user.';

-- ---------------------------------------------------------------------------
-- Registration
--
-- Replaces "the first account to register becomes the administrator". Only the
-- owner is granted anything on sign-up; everyone else arrives with no
-- membership at all and goes through the join flow.
--
-- A membership without a linked player is a legitimate intermediate state —
-- the owner is an administrator from their first sign-in and picks which
-- player they are afterwards.
-- ---------------------------------------------------------------------------

create or replace function app.handle_new_user() returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  if new.email is null
     or lower(btrim(new.email)) <> app.owner_email()
  then
    return new;
  end if;

  insert into public.league_members (league_id, user_id, role)
  values (app.initial_league_id(), new.id, 'admin')
  on conflict (league_id, user_id) do update set role = 'admin';

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Player codes
--
-- Previously generated in the browser, which was acceptable while only an
-- administrator could create a player. Now that a member can create their own
-- through a SECURITY DEFINER function, the code has to be produced where the
-- uniqueness can actually be checked.
--
-- The alphabet omits I, O, 0 and 1: these codes are typed by hand into
-- spreadsheets, where those characters get confused for each other.
-- ---------------------------------------------------------------------------

create function app.generate_player_code(p_league_id uuid) returns text
  language plpgsql volatile
  set search_path = ''
as $$
declare
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_code text;
begin
  for _attempt in 1 .. 20 loop
    select 'PLR-' || string_agg(
             substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::int, 1),
             ''
           )
      into v_code
      from generate_series(1, 4);

    if not exists (
      select 1 from public.players
      where league_id = p_league_id and player_code = v_code
    ) then
      return v_code;
    end if;
  end loop;

  raise exception 'Could not generate a free player code for league %',
    p_league_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- owns_player
--
-- The counterpart to is_league_member / is_league_admin, for the policies and
-- functions that authorize a member against their own player.
-- ---------------------------------------------------------------------------

create function public.owns_player(p_player_id uuid) returns boolean
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select exists (
    select 1
    from public.players p
    where p.id = p_player_id
      and p.user_id = auth.uid()
  );
$$;

comment on function public.owns_player is
  'True when the given player is the current user''s own. SECURITY DEFINER so '
  'that storage policies can call it without a policy on players applying.';

revoke all on function public.owns_player(uuid) from public;
grant execute on function public.owns_player(uuid) to authenticated;

-- ============================================================================
-- Joining a league
-- ============================================================================

-- ---------------------------------------------------------------------------
-- list_joinable_leagues
--
-- Every active league, whether or not the caller belongs to it, because a
-- caller who belongs to none has to be able to choose one. RLS on `leagues`
-- shows only the leagues you are already in, which is exactly the wrong answer
-- here, hence SECURITY DEFINER.
--
-- Nothing sensitive is exposed: a title and a count of players still waiting
-- for an owner.
-- ---------------------------------------------------------------------------

create function public.list_joinable_leagues()
returns table (
  league_id uuid,
  title text,
  unclaimed_player_count integer,
  is_member boolean
)
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select
    l.id,
    l.title,
    (
      select count(*)
      from public.players p
      where p.league_id = l.id
        and p.is_active
        and p.user_id is null
    )::integer,
    exists (
      select 1
      from public.league_members m
      where m.league_id = l.id
        and m.user_id = auth.uid()
    )
  from public.leagues l
  where l.status = 'active'
    and auth.uid() is not null
  order by l.title;
$$;

comment on function public.list_joinable_leagues is
  'Active leagues a newly registered account may join, with how many players '
  'in each are still unclaimed.';

revoke all on function public.list_joinable_leagues() from public;
grant execute on function public.list_joinable_leagues() to authenticated;

-- ---------------------------------------------------------------------------
-- list_unclaimed_players
--
-- The roster an arriving account picks itself from. Deliberately readable by
-- any authenticated account, member or not — a first name and a position for
-- players who have not yet been claimed is the minimum the flow can work with,
-- and the alternative is an invitation system nobody wants to run for a
-- twenty-person kickabout.
-- ---------------------------------------------------------------------------

create function public.list_unclaimed_players(p_league_id uuid)
returns table (
  player_id uuid,
  player_code text,
  first_name text,
  last_name text,
  nickname text,
  display_name text,
  preferred_position public.player_position,
  avatar_path text
)
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select
    p.id,
    p.player_code,
    p.first_name,
    p.last_name,
    p.nickname,
    coalesce(nullif(btrim(p.nickname), ''), p.first_name || ' ' || p.last_name),
    p.preferred_position,
    p.avatar_path
  from public.players p
  join public.leagues l on l.id = p.league_id
  where p.league_id = p_league_id
    and p.is_active
    and p.user_id is null
    and l.status = 'active'
    and auth.uid() is not null
  order by p.first_name, p.last_name;
$$;

comment on function public.list_unclaimed_players is
  'Active players in a league that no account has claimed yet.';

revoke all on function public.list_unclaimed_players(uuid) from public;
grant execute on function public.list_unclaimed_players(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- app.assert_may_join
--
-- Shared by both join paths: the league has to be open and the caller must not
-- already play in it.
-- ---------------------------------------------------------------------------

create function app.assert_may_join(p_league_id uuid) returns void
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Sign in before joining a league'
      using errcode = 'insufficient_privilege';
  end if;

  if not exists (
    select 1 from public.leagues
    where id = p_league_id and status = 'active'
  ) then
    raise exception 'League % is not open to new players', p_league_id
      using errcode = 'check_violation';
  end if;

  if exists (
    select 1 from public.players
    where league_id = p_league_id and user_id = auth.uid()
  ) then
    raise exception 'You already play in league %', p_league_id
      using errcode = 'unique_violation';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- join_league_as_player
--
-- Claims an existing player. The conditional UPDATE is the whole concurrency
-- story: two accounts racing for the same player both run it, exactly one
-- matches the `user_id is null` predicate, and the loser gets the exception.
-- Checking first and updating second would let both through.
-- ---------------------------------------------------------------------------

create function public.join_league_as_player(
  p_league_id uuid,
  p_player_id uuid
) returns void
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  perform app.assert_may_join(p_league_id);

  update public.players
     set user_id = auth.uid()
   where id = p_player_id
     and league_id = p_league_id
     and is_active
     and user_id is null;

  if not found then
    raise exception
      'Player % is not available in league %', p_player_id, p_league_id
      using errcode = 'check_violation';
  end if;

  -- No-op for the owner, who is already an administrator when they arrive.
  insert into public.league_members (league_id, user_id, role)
  values (p_league_id, auth.uid(), 'member')
  on conflict (league_id, user_id) do nothing;
end;
$$;

comment on function public.join_league_as_player is
  'Links the current account to an unclaimed player and joins its league.';

revoke all on function public.join_league_as_player(uuid, uuid) from public;
grant execute on function public.join_league_as_player(uuid, uuid)
  to authenticated;

-- ---------------------------------------------------------------------------
-- create_player_and_join
--
-- For the arrival who is not on the roster — the flow the interface offers
-- when nothing is left to claim.
--
-- Deliberately not restricted to "only when the unclaimed list is empty". That
-- rule belongs in the interface, which can steer people towards claiming; as a
-- database constraint it would permanently lock out anyone the administrator
-- simply forgot to add. An unwanted player can be deactivated in one click,
-- whereas being unable to join has no remedy inside the application.
-- ---------------------------------------------------------------------------

create function public.create_player_and_join(
  p_league_id uuid,
  p_first_name text,
  p_last_name text,
  p_nickname text,
  p_preferred_position public.player_position
) returns uuid
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_player_id uuid;
begin
  perform app.assert_may_join(p_league_id);

  insert into public.players (
    league_id, player_code, first_name, last_name, nickname,
    preferred_position, user_id
  )
  values (
    p_league_id,
    app.generate_player_code(p_league_id),
    btrim(p_first_name),
    btrim(p_last_name),
    nullif(btrim(coalesce(p_nickname, '')), ''),
    p_preferred_position,
    auth.uid()
  )
  returning id into v_player_id;

  insert into public.league_members (league_id, user_id, role)
  values (p_league_id, auth.uid(), 'member')
  on conflict (league_id, user_id) do nothing;

  return v_player_id;
end;
$$;

comment on function public.create_player_and_join is
  'Creates a player for the current account and joins its league.';

revoke all on function
  public.create_player_and_join(uuid, text, text, text, public.player_position)
  from public;
grant execute on function
  public.create_player_and_join(uuid, text, text, text, public.player_position)
  to authenticated;

-- ============================================================================
-- Editing your own player
--
-- RLS cannot express "these columns and no others", so a plain update policy
-- on players would also hand a member their own player_code, is_active flag
-- and user_id. The editable fields are therefore reached through functions
-- that name them explicitly; administrators keep the broad policy from 002.
-- ============================================================================

create function public.update_own_player_profile(
  p_player_id uuid,
  p_first_name text,
  p_last_name text,
  p_nickname text,
  p_preferred_position public.player_position
) returns void
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  update public.players
     set first_name = btrim(p_first_name),
         last_name = btrim(p_last_name),
         nickname = nullif(btrim(coalesce(p_nickname, '')), ''),
         preferred_position = p_preferred_position
   where id = p_player_id
     and user_id = auth.uid();

  if not found then
    raise exception 'Player % is not yours to edit', p_player_id
      using errcode = 'insufficient_privilege';
  end if;
end;
$$;

comment on function public.update_own_player_profile is
  'Lets a member edit their own name, nickname and position — and nothing '
  'else. The check constraints on players still apply.';

revoke all on function public.update_own_player_profile(
  uuid, text, text, text, public.player_position) from public;
grant execute on function public.update_own_player_profile(
  uuid, text, text, text, public.player_position) to authenticated;

-- ---------------------------------------------------------------------------
-- set_own_player_avatar
--
-- Records a photograph the member has just uploaded. The path is re-derived
-- here rather than trusted, so a caller cannot point their card at another
-- league's object.
-- ---------------------------------------------------------------------------

create function public.set_own_player_avatar(
  p_player_id uuid,
  p_extension text
) returns text
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_path text;
begin
  if p_extension not in ('jpg', 'png', 'webp') then
    raise exception 'Unsupported image type: %', p_extension
      using errcode = 'check_violation';
  end if;

  select p.league_id || '/' || p.id || '.' || p_extension
    into v_path
    from public.players p
   where p.id = p_player_id
     and p.user_id = auth.uid();

  if v_path is null then
    raise exception 'Player % is not yours to edit', p_player_id
      using errcode = 'insufficient_privilege';
  end if;

  update public.players set avatar_path = v_path where id = p_player_id;

  return v_path;
end;
$$;

comment on function public.set_own_player_avatar is
  'Points the caller''s own card at {league_id}/{player_id}.{ext} and returns '
  'the path.';

revoke all on function public.set_own_player_avatar(uuid, text) from public;
grant execute on function public.set_own_player_avatar(uuid, text)
  to authenticated;

-- ---------------------------------------------------------------------------
-- Storage: a member may write their own photograph
--
-- Objects are `{league_id}/{player_id}.{ext}`, so the player is the file name
-- with its extension removed. The admin policies from 005 stay; permissive
-- policies are OR-ed, so an administrator keeps access to every object.
-- ---------------------------------------------------------------------------

create function app.player_id_from_object_name(p_name text) returns uuid
  language plpgsql immutable
  set search_path = ''
as $$
begin
  return split_part(storage.filename(p_name), '.', 1)::uuid;
exception
  when invalid_text_representation then
    return null;
end;
$$;

comment on function app.player_id_from_object_name is
  'Extracts the player id from an avatar object path, or null when the file '
  'name is not a UUID.';

-- Both statements are needed: `upsert` on an existing object is an UPDATE, on
-- a new one an INSERT, and the member replacing their photo does the first.
create policy player_avatars_insert_own on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'player-avatars'
    and public.owns_player(app.player_id_from_object_name(name))
  );

create policy player_avatars_update_own on storage.objects
  for update to authenticated
  using (
    bucket_id = 'player-avatars'
    and public.owns_player(app.player_id_from_object_name(name))
  )
  with check (
    bucket_id = 'player-avatars'
    and public.owns_player(app.player_id_from_object_name(name))
  );

-- ---------------------------------------------------------------------------
-- player_cards gains user_id
--
-- So the interface can find "my player" in the data it already loads, and the
-- administration screen can show which players are still unclaimed. Appended
-- last because CREATE OR REPLACE VIEW may only add columns at the end.
-- ---------------------------------------------------------------------------

create or replace view public.player_cards
with (security_invoker = true) as
with metric_stats as (
  select
    player_id,
    jsonb_object_agg(metric_code, card_stat order by display_order)
      as metric_card_stats,
    jsonb_object_agg(metric_code, career_average order by display_order)
      as metric_averages
  from public.player_metric_averages
  group by player_id
),
attribute_counts as (
  select
    counted.player_id,
    jsonb_object_agg(a.code, counted.total) as attribute_counts,
    sum(counted.total)::integer as attribute_total
  from (
    select s.player_id, sa.league_attribute_id, count(*)::integer as total
    from public.player_match_score_attributes sa
    join public.player_match_scores s on s.id = sa.player_match_score_id
    join public.matches m on m.id = s.match_id and m.status = 'scored'
    group by s.player_id, sa.league_attribute_id
  ) as counted
  join public.league_attributes a on a.id = counted.league_attribute_id
  group by counted.player_id
)
select
  p.id,
  p.league_id,
  p.player_code,
  p.first_name,
  p.last_name,
  p.nickname,
  -- One display name so every card, table and dropdown agrees.
  coalesce(nullif(btrim(p.nickname), ''), p.first_name || ' ' || p.last_name)
    as display_name,
  p.preferred_position,
  p.avatar_path,
  p.is_active,
  mv.matches_played,
  mv.career_average,
  mv.latest_score,
  mv.weighted_performance_score,
  mv.market_value_gbp,
  mv.card_rating,
  coalesce(ms.metric_card_stats, '{}'::jsonb) as metric_card_stats,
  coalesce(ms.metric_averages, '{}'::jsonb) as metric_averages,
  coalesce(ac.attribute_counts, '{}'::jsonb) as attribute_counts,
  coalesce(ac.attribute_total, 0) as attribute_total,
  p.created_at,
  p.updated_at,
  p.user_id
from public.players p
join public.player_market_values mv on mv.player_id = p.id
left join metric_stats ms on ms.player_id = p.id
left join attribute_counts ac on ac.player_id = p.id;

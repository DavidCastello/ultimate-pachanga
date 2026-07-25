-- ============================================================================
-- 002 — Row Level Security
--
-- The browser talks to PostgREST directly with the publishable key, so these
-- policies are the ONLY authorization boundary in the system. Hiding a button
-- in React is not authorization.
--
-- Policy matrix:
--
--   Resource            Member                Administrator
--   ------------------  --------------------  -------------------------
--   leagues             read                  read, update
--   league_members      read own membership    read all, manage all
--   league_metrics      read                  manage
--   league_attributes   read                  manage
--   players             read                  create, update
--   matches             read                  create, update
--   match_players       read                  create, update, delete
--   scores              read                  import and correct
--   score attributes    read                  manage
--
-- Nothing is deletable by anyone except match_players: players and matches
-- carry history, so the application deactivates or cancels instead.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Membership helpers
--
-- SECURITY DEFINER is load-bearing, not a shortcut. A policy on
-- league_members that queried league_members directly would recurse
-- infinitely; running the lookup as the owner bypasses RLS on the inner read
-- and breaks the cycle.
--
-- search_path is pinned to '' and every reference is schema-qualified so the
-- function cannot be redirected by a caller-controlled search_path.
-- ---------------------------------------------------------------------------

create function public.is_league_member(p_league_id uuid) returns boolean
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select exists (
    select 1
    from public.league_members m
    where m.league_id = p_league_id
      and m.user_id = auth.uid()
  );
$$;

comment on function public.is_league_member is
  'True when the current user belongs to the league. SECURITY DEFINER to avoid '
  'recursive RLS evaluation on league_members.';

create function public.is_league_admin(p_league_id uuid) returns boolean
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select exists (
    select 1
    from public.league_members m
    where m.league_id = p_league_id
      and m.user_id = auth.uid()
      and m.role = 'admin'
  );
$$;

comment on function public.is_league_admin is
  'True when the current user is an administrator of the league. '
  'SECURITY DEFINER to avoid recursive RLS evaluation on league_members.';

-- Resolves the league behind a match, for policies on match-scoped tables.
create function public.match_league_id(p_match_id uuid) returns uuid
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select league_id from public.matches where id = p_match_id;
$$;

revoke all on function public.is_league_member(uuid) from public;
revoke all on function public.is_league_admin(uuid) from public;
revoke all on function public.match_league_id(uuid) from public;

grant execute on function public.is_league_member(uuid) to authenticated;
grant execute on function public.is_league_admin(uuid) to authenticated;
grant execute on function public.match_league_id(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- New user onboarding
--
-- The first account to register becomes the administrator of the initial
-- league; everyone after that joins as a member. This is why the owner must
-- register before the production URL is shared.
--
-- Advisory lock rather than a plain count: two simultaneous first sign-ups
-- would otherwise both see an empty table and both become admin.
-- ---------------------------------------------------------------------------

create function app.handle_new_user() returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_league_id uuid := app.initial_league_id();
  v_role public.member_role;
begin
  perform pg_advisory_xact_lock(hashtext('league_member_bootstrap'));

  if exists (select 1 from public.league_members where league_id = v_league_id)
  then
    v_role := 'member';
  else
    v_role := 'admin';
  end if;

  insert into public.league_members (league_id, user_id, role)
  values (v_league_id, new.id, v_role)
  on conflict (league_id, user_id) do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function app.handle_new_user();

-- ---------------------------------------------------------------------------
-- Enable RLS everywhere
--
-- Every table reachable through the API. A table with RLS enabled and no
-- policy denies everything, which is the safe direction to fail.
-- ---------------------------------------------------------------------------

alter table public.leagues                        enable row level security;
alter table public.league_members                 enable row level security;
alter table public.league_metrics                 enable row level security;
alter table public.league_attributes              enable row level security;
alter table public.players                        enable row level security;
alter table public.matches                        enable row level security;
alter table public.match_players                  enable row level security;
alter table public.player_match_scores            enable row level security;
alter table public.player_match_score_attributes  enable row level security;

-- ---------------------------------------------------------------------------
-- leagues
-- ---------------------------------------------------------------------------

create policy leagues_select_members on public.leagues
  for select to authenticated
  using (public.is_league_member(id));

create policy leagues_update_admins on public.leagues
  for update to authenticated
  using (public.is_league_admin(id))
  with check (public.is_league_admin(id));

-- ---------------------------------------------------------------------------
-- league_members
--
-- Members see only their own membership, so the roster of who else has an
-- account is not readable by everyone. Administrators see and manage all.
-- ---------------------------------------------------------------------------

create policy league_members_select_own on public.league_members
  for select to authenticated
  using (user_id = auth.uid());

create policy league_members_select_admins on public.league_members
  for select to authenticated
  using (public.is_league_admin(league_id));

create policy league_members_insert_admins on public.league_members
  for insert to authenticated
  with check (public.is_league_admin(league_id));

create policy league_members_update_admins on public.league_members
  for update to authenticated
  using (public.is_league_admin(league_id))
  with check (public.is_league_admin(league_id));

create policy league_members_delete_admins on public.league_members
  for delete to authenticated
  using (public.is_league_admin(league_id));

-- ---------------------------------------------------------------------------
-- league_metrics and league_attributes
-- ---------------------------------------------------------------------------

create policy league_metrics_select_members on public.league_metrics
  for select to authenticated
  using (public.is_league_member(league_id));

create policy league_metrics_manage_admins on public.league_metrics
  for all to authenticated
  using (public.is_league_admin(league_id))
  with check (public.is_league_admin(league_id));

create policy league_attributes_select_members on public.league_attributes
  for select to authenticated
  using (public.is_league_member(league_id));

create policy league_attributes_manage_admins on public.league_attributes
  for all to authenticated
  using (public.is_league_admin(league_id))
  with check (public.is_league_admin(league_id));

-- ---------------------------------------------------------------------------
-- players
--
-- No delete policy: players accumulate match history, so the application sets
-- is_active = false instead.
-- ---------------------------------------------------------------------------

create policy players_select_members on public.players
  for select to authenticated
  using (public.is_league_member(league_id));

create policy players_insert_admins on public.players
  for insert to authenticated
  with check (public.is_league_admin(league_id));

create policy players_update_admins on public.players
  for update to authenticated
  using (public.is_league_admin(league_id))
  with check (public.is_league_admin(league_id));

-- ---------------------------------------------------------------------------
-- matches
--
-- No delete policy either: cancelled matches use status = 'cancelled'.
-- ---------------------------------------------------------------------------

create policy matches_select_members on public.matches
  for select to authenticated
  using (public.is_league_member(league_id));

create policy matches_insert_admins on public.matches
  for insert to authenticated
  with check (public.is_league_admin(league_id));

create policy matches_update_admins on public.matches
  for update to authenticated
  using (public.is_league_admin(league_id))
  with check (public.is_league_admin(league_id));

-- ---------------------------------------------------------------------------
-- match_players
--
-- Squad selection is genuinely editable before a match, so this table does
-- allow deletes — for administrators only.
-- ---------------------------------------------------------------------------

create policy match_players_select_members on public.match_players
  for select to authenticated
  using (public.is_league_member(public.match_league_id(match_id)));

create policy match_players_manage_admins on public.match_players
  for all to authenticated
  using (public.is_league_admin(public.match_league_id(match_id)))
  with check (public.is_league_admin(public.match_league_id(match_id)));

-- ---------------------------------------------------------------------------
-- player_match_scores
--
-- Writes normally go through import_match_scores, which validates the whole
-- batch. These policies also permit direct correction by an administrator;
-- they intentionally do not permit deletes.
-- ---------------------------------------------------------------------------

create policy player_match_scores_select_members on public.player_match_scores
  for select to authenticated
  using (public.is_league_member(public.match_league_id(match_id)));

create policy player_match_scores_insert_admins on public.player_match_scores
  for insert to authenticated
  with check (public.is_league_admin(public.match_league_id(match_id)));

create policy player_match_scores_update_admins on public.player_match_scores
  for update to authenticated
  using (public.is_league_admin(public.match_league_id(match_id)))
  with check (public.is_league_admin(public.match_league_id(match_id)));

-- ---------------------------------------------------------------------------
-- player_match_score_attributes
--
-- Re-importing a match replaces a player's attributes wholesale, so this
-- table does allow deletes for administrators.
-- ---------------------------------------------------------------------------

create function public.score_league_id(p_score_id uuid) returns uuid
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select m.league_id
  from public.player_match_scores s
  join public.matches m on m.id = s.match_id
  where s.id = p_score_id;
$$;

revoke all on function public.score_league_id(uuid) from public;
grant execute on function public.score_league_id(uuid) to authenticated;

create policy score_attributes_select_members
  on public.player_match_score_attributes
  for select to authenticated
  using (public.is_league_member(
    public.score_league_id(player_match_score_id)));

create policy score_attributes_manage_admins
  on public.player_match_score_attributes
  for all to authenticated
  using (public.is_league_admin(
    public.score_league_id(player_match_score_id)))
  with check (public.is_league_admin(
    public.score_league_id(player_match_score_id)));

-- ---------------------------------------------------------------------------
-- Table privileges
--
-- RLS filters rows; GRANTs decide which statements are possible at all. Both
-- are needed. `anon` gets nothing: every route requires a session.
-- ---------------------------------------------------------------------------

revoke all on all tables in schema public from anon;

grant select on public.leagues to authenticated;
grant update on public.leagues to authenticated;

grant select, insert, update, delete on public.league_members to authenticated;
grant select, insert, update, delete on public.league_metrics to authenticated;
grant select, insert, update, delete
  on public.league_attributes to authenticated;

grant select, insert, update on public.players to authenticated;
grant select, insert, update on public.matches to authenticated;

grant select, insert, update, delete on public.match_players to authenticated;

grant select, insert, update on public.player_match_scores to authenticated;
grant select, insert, update, delete
  on public.player_match_score_attributes to authenticated;

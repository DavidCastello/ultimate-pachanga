-- ============================================================================
-- 011 — Self-service convocatorias
--
-- Until now a squad was entirely the administrator's: they called everyone up,
-- assigned the sides and arranged both line-ups, and a member could only read
-- the result. For a twenty-person kickabout organised over WhatsApp that is one
-- person doing everybody's typing.
--
-- The lifecycle of a match now decides who may do what, and there is exactly
-- one boundary: whether it has been played.
--
--   Before it is played (draft, scheduled)
--     * an administrator calls up and removes anyone
--     * a member adds THEMSELVES, and only themselves
--     * any member rearranges the teams — sides, slots and the bench
--     * nobody but an administrator removes anyone
--
--   Once it is played (played, scored, cancelled)
--     * nobody adds or removes anyone, administrator included: the squad is
--       the record of who turned up, and the scores hang off it
--     * only an administrator may still move players around, to correct where
--       people actually played
--
-- A member may change where people stand and nothing else. Repointing a squad
-- row at a different player would remove one person and call up another in a
-- single UPDATE, neatly sidestepping "only an administrator removes people" —
-- and RLS cannot say "these columns and no others", so a trigger says it
-- instead, the same shape of answer that 008 gave for editing your own player.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- match_is_upcoming
--
-- The single definition of "not yet played", used by every policy below.
-- SECURITY DEFINER for the same reason as match_league_id: a policy on
-- match_players must be able to read the match behind the row it is judging
-- without the caller's own visibility of `matches` entering into it.
--
-- Mirrored in the frontend by isUpcomingMatch (src/lib/matchLifecycle.ts),
-- which decides what to render. This is what decides what is allowed.
-- ---------------------------------------------------------------------------

create function public.match_is_upcoming(p_match_id uuid) returns boolean
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select exists (
    select 1
    from public.matches m
    where m.id = p_match_id
      and m.status in ('draft', 'scheduled')
  );
$$;

comment on function public.match_is_upcoming is
  'True while a match has not been played: status draft or scheduled. The '
  'boundary for who may change its convocatoria.';

revoke all on function public.match_is_upcoming(uuid) from public;
grant execute on function public.match_is_upcoming(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Replacing the blanket administrator policy
--
-- 002 gave administrators `for all` on match_players with no regard for the
-- match's state. Split into one policy per command so that adding and removing
-- can be closed once a match is played while rearranging stays open.
--
-- An administrator who genuinely has to fix the squad of a played match sets it
-- back to `scheduled` first, which is a deliberate, visible act rather than a
-- silent edit of history.
-- ---------------------------------------------------------------------------

drop policy match_players_manage_admins on public.match_players;

create policy match_players_insert_admins on public.match_players
  for insert to authenticated
  with check (
    public.is_league_admin(public.match_league_id(match_id))
    and public.match_is_upcoming(match_id)
  );

create policy match_players_delete_admins on public.match_players
  for delete to authenticated
  using (
    public.is_league_admin(public.match_league_id(match_id))
    and public.match_is_upcoming(match_id)
  );

-- Not restricted to upcoming matches: this is how a scored line-up gets
-- corrected to what actually happened on the pitch.
create policy match_players_update_admins on public.match_players
  for update to authenticated
  using (public.is_league_admin(public.match_league_id(match_id)))
  with check (public.is_league_admin(public.match_league_id(match_id)));

-- ---------------------------------------------------------------------------
-- A member calls themselves up
--
-- `owns_player` (008) is what makes this safe: the row has to be about the
-- caller's own player, so signing up for a match cannot become signing anybody
-- else up. They arrive with no side and no slot — on the bench — and place
-- themselves by tapping a free position afterwards.
--
-- Deliberately not a delete policy. A member who signs up cannot then quietly
-- disappear from the list an hour before kickoff; the administrator removes
-- them, which is the same conversation that already happens in the group chat.
-- ---------------------------------------------------------------------------

create policy match_players_join_self on public.match_players
  for insert to authenticated
  with check (
    public.is_league_member(public.match_league_id(match_id))
    and public.match_is_upcoming(match_id)
    and public.owns_player(player_id)
  );

-- ---------------------------------------------------------------------------
-- Any member arranges an unplayed match
--
-- Not just their own card: before a match is played, whoever opens the app can
-- sort the teams out. Balancing the sides is a group activity in practice, and
-- restricting each person to dragging themselves around would make the pitch
-- unusable for the one person who actually does it.
--
-- What they may change is narrowed by the trigger below, not by this policy.
-- ---------------------------------------------------------------------------

create policy match_players_arrange_members on public.match_players
  for update to authenticated
  using (
    public.is_league_member(public.match_league_id(match_id))
    and public.match_is_upcoming(match_id)
  )
  with check (
    public.is_league_member(public.match_league_id(match_id))
    and public.match_is_upcoming(match_id)
  );

-- ---------------------------------------------------------------------------
-- Which columns a member may change
--
-- RLS decides which rows, never which columns, and the row a member is allowed
-- to update contains one thing that is not theirs to touch: who the row is
-- about. Repointing it at another player would remove one player and call up
-- another in a single UPDATE, neatly sidestepping "only an administrator removes
-- people".
--
-- Steps aside entirely when there is no authenticated user: seeds, the
-- production loaders and anything running as the service role bypass RLS by
-- design, and a trigger that second-guessed them would only break the data
-- load.
-- ---------------------------------------------------------------------------

create function app.guard_match_player_columns() returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  if auth.uid() is null
     or public.is_league_admin(public.match_league_id(old.match_id))
  then
    return new;
  end if;

  if new.match_id <> old.match_id or new.player_id <> old.player_id then
    raise exception 'Only an administrator can change who is called up'
      using errcode = 'insufficient_privilege';
  end if;

  return new;
end;
$$;

comment on function app.guard_match_player_columns is
  'Restricts a member''s UPDATE on match_players to team_side and pitch_slot. '
  'The row-level half of the rule lives in match_players_arrange_members.';

create trigger match_players_guard_columns
  before update on public.match_players
  for each row execute function app.guard_match_player_columns();

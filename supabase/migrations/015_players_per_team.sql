-- ============================================================================
-- 015 — Players per team
--
-- How many played a side is a property of the match, not of the league: the
-- same group plays eight a side when everyone turns up and five when nobody
-- does. Seven remains the default, so every existing fixture is unaffected.
--
-- Two invariants are enforced here rather than trusted to the interface,
-- because both of them, when broken, produce a line-up that cannot be read:
--
--   1. A formation always fits its match's squad size. A match of five showing
--      seven positions is not a rendering quirk, it is two positions nobody can
--      ever be in.
--
--   2. No player sits in a slot the formation does not have. Shrinking a match
--      from eight to five would otherwise leave three players placed in slots
--      the pitch no longer draws — present in the squad, invisible on screen,
--      and impossible to move.
--
-- Both are maintained by correcting the row, not by rejecting the write: an
-- administrator changing the size is telling us something true about the match,
-- and the shape and the placements are what has to give.
-- ============================================================================

alter table public.matches
  add column players_per_team smallint not null default 7
    check (players_per_team between 5 and 8);

comment on column public.matches.players_per_team is
  'Players a side, goalkeeper included. Five to eight; seven is the default. '
  'The formations and pitch slots of the match are kept consistent with it by '
  'trigger.';

-- ---------------------------------------------------------------------------
-- Slots
--
-- Eight a side means seven outfielders, so the ceiling rises from 6 to 7. As in
-- 007 the bound is the largest any supported size needs rather than this
-- match's own count: switching formation, or size, never renumbers anyone who
-- still fits.
-- ---------------------------------------------------------------------------

alter table public.match_players
  drop constraint match_players_pitch_slot_check,
  add constraint match_players_pitch_slot_check
    check (pitch_slot is null or pitch_slot between 0 and 7);

comment on column public.match_players.pitch_slot is
  'Position within the team''s formation: 0 is the goalkeeper, 1-7 the outfield '
  'slots, of which a match uses players_per_team - 1. Null means unplaced (on '
  'the bench).';

-- ---------------------------------------------------------------------------
-- Reading a squad size out of a formation name
--
-- The name lists the outfield lines, so adding it up and adding the goalkeeper
-- gives the size. This keeps the mapping in one place instead of a second
-- table that could disagree with the enum.
-- ---------------------------------------------------------------------------

create function app.formation_squad_size(p_formation public.pitch_formation)
  returns smallint
  language sql immutable
  set search_path = ''
as $$
  select ((
    select sum(line::smallint)
    from unnest(string_to_array(p_formation::text, '-')) as line
  ) + 1)::smallint
$$;

comment on function app.formation_squad_size is
  'Players a side a formation describes, goalkeeper included: the lines of the '
  'name, plus one.';

-- The shape a size falls back to when the one it had no longer exists.
-- plpgsql rather than sql so the literals are resolved when it runs, which is
-- what lets this migration be applied in the same transaction as 014.
create function app.default_formation(p_players_per_team smallint)
  returns public.pitch_formation
  language plpgsql immutable
  set search_path = ''
as $$
begin
  return case p_players_per_team
    when 5 then '2-2'
    when 6 then '2-1-2'
    when 7 then '2-3-1'
    when 8 then '3-3-1'
  end;
end;
$$;

comment on function app.default_formation is
  'The formation a match of this size gets when it has no valid one of its own. '
  'Null for a size that is not supported, which is how the trigger below '
  'recognises one.';

-- ---------------------------------------------------------------------------
-- Invariant 1: the formations fit the size
--
-- Silently corrected rather than rejected. The interface only ever offers the
-- shapes that fit, so the replacement is unreachable from the application and
-- exists to keep the column honest against anything else — a data load, a fix
-- applied by hand, a future client.
--
-- An unsupported size is the one thing this rejects, and it has to reject it
-- itself: a BEFORE trigger runs ahead of the CHECK above, so left alone it would
-- replace both formations with the null that `default_formation` returns for a
-- size it does not know, and the caller would be told `home_formation` is null
-- rather than that nobody plays four a side. `default_formation` returning null
-- is what defines "unsupported" here, so the supported sizes are still listed in
-- exactly one place.
-- ---------------------------------------------------------------------------

-- security definer because the helpers above live in `app`, which is internal
-- and granted to nobody: an administrator writing a match through PostgREST is
-- `authenticated`, and a plain function call from inside a trigger is still
-- checked against the caller's rights. Without this, creating a match fails with
-- "permission denied for schema app".
create function app.fit_formations_to_squad_size() returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_default public.pitch_formation := app.default_formation(new.players_per_team);
begin
  if v_default is null then
    raise exception
      'Unsupported squad size %: a match is between five and eight a side',
      new.players_per_team
      using errcode = 'check_violation';
  end if;

  if app.formation_squad_size(new.home_formation) <> new.players_per_team then
    new.home_formation := v_default;
  end if;

  if app.formation_squad_size(new.away_formation) <> new.players_per_team then
    new.away_formation := v_default;
  end if;

  return new;
end;
$$;

comment on function app.fit_formations_to_squad_size is
  'Replaces a formation that does not describe players_per_team with the '
  'default for that size.';

create trigger matches_fit_formations_to_squad_size
  before insert or update of players_per_team, home_formation, away_formation
  on public.matches
  for each row execute function app.fit_formations_to_squad_size();

-- ---------------------------------------------------------------------------
-- Invariant 2: nobody is left in a slot that no longer exists
--
-- A shrunk match benches whoever fell off the end. They keep their side and
-- their place in the convocatoria — being called up and being placed are
-- separate facts, and only the second one is affected by the pitch getting
-- smaller. Growing a match needs nothing: the new slots simply render empty.
--
-- Which players are benched follows from the slot numbering: 0 is the keeper
-- and the outfielders run from the back line forwards, so a shrinking match
-- loses its attack first and keeps its defence. Deterministic, and undone by
-- dragging someone back on.
--
-- security definer so the cascade cannot half-apply on someone whose own grants
-- would not have reached match_players.
-- ---------------------------------------------------------------------------

create function app.bench_players_beyond_squad_size() returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  update public.match_players
  set pitch_slot = null
  where match_id = new.id
    and pitch_slot >= new.players_per_team;

  return null;
end;
$$;

comment on function app.bench_players_beyond_squad_size is
  'Unplaces the players whose pitch_slot no longer exists after a match was '
  'made smaller.';

create trigger matches_bench_players_beyond_squad_size
  after update of players_per_team on public.matches
  for each row
  when (new.players_per_team < old.players_per_team)
  execute function app.bench_players_beyond_squad_size();

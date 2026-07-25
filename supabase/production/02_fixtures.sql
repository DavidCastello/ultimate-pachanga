-- ============================================================================
-- Production — 02 Fixtures and squads
--
-- The four matches played so far and who was called up for each. Run after
-- 01_roster.sql and before 03_results.sql.
--
-- Every match: «Campo de fútbol UIB», 19:30, Blanco at home and Negro away.
-- Kickoff is written as +02:00 because that is Europe/Madrid in June and July;
-- the column is timestamptz, so the offset is what makes 19:30 mean 19:30.
--
-- Matches land in status `played`, not `scored`. 03_results.sql promotes them
-- when it imports, which is the same transition the app makes and the only one
-- that satisfies matches_scored_has_import_time.
--
-- Match ids are fixed rather than generated so 03_results.sql can address them
-- and so a second run of this script corrects the fixtures instead of creating
-- four more.
--
-- ---------------------------------------------------------------------------
-- Squad sizes
--
-- Fútbol 7, but the spreadsheet does not always show seven a side: matches 1
-- and 3 had eight in Blanco against six and seven in Negro, and match 4 had
-- eight against eight. That is transcribed as it stands. Anyone beyond the
-- seven pitch slots is left on the bench, which is exactly what the schema
-- means by a null pitch_slot.
--
-- ---------------------------------------------------------------------------
-- The arrangement on the pitch is derived, not recorded
--
-- The spreadsheet says who played, never where. Slots are filled from
-- preferred_position — keeper first, then back to front — so each match opens
-- on a plausible 2-3-1 rather than an empty pitch with the whole squad on the
-- bench. Drag anyone into their real position in the app; a second run of this
-- script will not undo it, because it only places sides that have no slots
-- assigned at all.
-- ============================================================================

begin;

insert into public.matches (
  id, league_id, title, location, played_at,
  home_team_name, away_team_name, status
)
values
  (
    '44444444-4444-4444-8444-000000000001', app.initial_league_id(),
    'Jornada 1', 'Campo de fútbol UIB', '2026-06-05 19:30:00+02',
    'Blanco', 'Negro', 'played'
  ),
  (
    '44444444-4444-4444-8444-000000000002', app.initial_league_id(),
    'Jornada 2', 'Campo de fútbol UIB', '2026-06-26 19:30:00+02',
    'Blanco', 'Negro', 'played'
  ),
  (
    '44444444-4444-4444-8444-000000000003', app.initial_league_id(),
    'Jornada 3', 'Campo de fútbol UIB', '2026-07-17 19:30:00+02',
    'Blanco', 'Negro', 'played'
  ),
  (
    '44444444-4444-4444-8444-000000000004', app.initial_league_id(),
    'Jornada 4', 'Campo de fútbol UIB', '2026-07-24 19:30:00+02',
    'Blanco', 'Negro', 'played'
  )
on conflict (id) do update
  set title = excluded.title,
      location = excluded.location,
      played_at = excluded.played_at,
      home_team_name = excluded.home_team_name,
      away_team_name = excluded.away_team_name;

-- ---------------------------------------------------------------------------
-- Squads
--
-- `home` is Blanco and `away` is Negro throughout, matching the «Equipo»
-- column: B and N. Everyone listed here turned out, so attendance is `played`.
-- ---------------------------------------------------------------------------

insert into public.match_players (
  match_id, player_id, team_side, attendance_status
)
select
  squad.match_id::uuid,
  p.id,
  squad.team_side::public.team_side,
  'played'::public.attendance_status
from (
  values
    -- Jornada 1 — Blanco 8, Negro 6. Negro won.
    ('44444444-4444-4444-8444-000000000001', 'home', 'JOSEP-M'),
    ('44444444-4444-4444-8444-000000000001', 'home', 'JOAN'),
    ('44444444-4444-4444-8444-000000000001', 'home', 'RAUL'),
    ('44444444-4444-4444-8444-000000000001', 'home', 'SERGI-P'),
    ('44444444-4444-4444-8444-000000000001', 'home', 'JOSEP-P'),
    ('44444444-4444-4444-8444-000000000001', 'home', 'ALEIX'),
    ('44444444-4444-4444-8444-000000000001', 'home', 'MARC'),
    ('44444444-4444-4444-8444-000000000001', 'home', 'ANDREU'),
    ('44444444-4444-4444-8444-000000000001', 'away', 'JOSE'),
    ('44444444-4444-4444-8444-000000000001', 'away', 'SERGIO-M'),
    ('44444444-4444-4444-8444-000000000001', 'away', 'DAVID-C'),
    ('44444444-4444-4444-8444-000000000001', 'away', 'LLUIS'),
    ('44444444-4444-4444-8444-000000000001', 'away', 'PERICO'),
    ('44444444-4444-4444-8444-000000000001', 'away', 'RODRI'),

    -- Jornada 2 — seven a side. Blanco won.
    ('44444444-4444-4444-8444-000000000002', 'home', 'ALEX'),
    ('44444444-4444-4444-8444-000000000002', 'home', 'JOSEP-M'),
    ('44444444-4444-4444-8444-000000000002', 'home', 'JOAN'),
    ('44444444-4444-4444-8444-000000000002', 'home', 'DAVID-W'),
    ('44444444-4444-4444-8444-000000000002', 'home', 'LLUIS'),
    ('44444444-4444-4444-8444-000000000002', 'home', 'RODRI'),
    ('44444444-4444-4444-8444-000000000002', 'home', 'ANDREU'),
    ('44444444-4444-4444-8444-000000000002', 'away', 'JORDI'),
    ('44444444-4444-4444-8444-000000000002', 'away', 'JOSE'),
    ('44444444-4444-4444-8444-000000000002', 'away', 'SERGIO-M'),
    ('44444444-4444-4444-8444-000000000002', 'away', 'RAUL'),
    ('44444444-4444-4444-8444-000000000002', 'away', 'DAVID-C'),
    ('44444444-4444-4444-8444-000000000002', 'away', 'PERICO'),
    ('44444444-4444-4444-8444-000000000002', 'away', 'JOSEP-P'),

    -- Jornada 3 — Blanco 8, Negro 7. Blanco won.
    ('44444444-4444-4444-8444-000000000003', 'home', 'SERGIO-M'),
    ('44444444-4444-4444-8444-000000000003', 'home', 'JOSEP-M'),
    ('44444444-4444-4444-8444-000000000003', 'home', 'JOAN'),
    ('44444444-4444-4444-8444-000000000003', 'home', 'PEP-M'),
    ('44444444-4444-4444-8444-000000000003', 'home', 'JAN-M'),
    ('44444444-4444-4444-8444-000000000003', 'home', 'PERICO'),
    ('44444444-4444-4444-8444-000000000003', 'home', 'RODRI'),
    ('44444444-4444-4444-8444-000000000003', 'home', 'CARLOS'),
    ('44444444-4444-4444-8444-000000000003', 'away', 'JORDI'),
    ('44444444-4444-4444-8444-000000000003', 'away', 'JOSE'),
    ('44444444-4444-4444-8444-000000000003', 'away', 'ALEX'),
    ('44444444-4444-4444-8444-000000000003', 'away', 'DAVID-C'),
    ('44444444-4444-4444-8444-000000000003', 'away', 'DAVID-W'),
    ('44444444-4444-4444-8444-000000000003', 'away', 'LLUIS'),
    ('44444444-4444-4444-8444-000000000003', 'away', 'JOSEP-P'),

    -- Jornada 4 — eight a side. Drawn.
    ('44444444-4444-4444-8444-000000000004', 'home', 'JORDI'),
    ('44444444-4444-4444-8444-000000000004', 'home', 'JOSE'),
    ('44444444-4444-4444-8444-000000000004', 'home', 'PAU-R'),
    ('44444444-4444-4444-8444-000000000004', 'home', 'ALEX'),
    ('44444444-4444-4444-8444-000000000004', 'home', 'SERGIO-M'),
    ('44444444-4444-4444-8444-000000000004', 'home', 'JOSEP-M'),
    ('44444444-4444-4444-8444-000000000004', 'home', 'JOAN'),
    ('44444444-4444-4444-8444-000000000004', 'home', 'PEP-M'),
    ('44444444-4444-4444-8444-000000000004', 'away', 'RAUL'),
    ('44444444-4444-4444-8444-000000000004', 'away', 'DAVID-C'),
    ('44444444-4444-4444-8444-000000000004', 'away', 'KIRILL'),
    ('44444444-4444-4444-8444-000000000004', 'away', 'DAVID-W'),
    ('44444444-4444-4444-8444-000000000004', 'away', 'LLUIS'),
    ('44444444-4444-4444-8444-000000000004', 'away', 'JAN-M'),
    ('44444444-4444-4444-8444-000000000004', 'away', 'PERICO'),
    ('44444444-4444-4444-8444-000000000004', 'away', 'RODRI')
) as squad (match_id, team_side, player_code)
join public.players p
  on p.league_id = app.initial_league_id()
 and p.player_code = squad.player_code
on conflict (match_id, player_id) do update
  set team_side = excluded.team_side,
      attendance_status = excluded.attendance_status;

-- ---------------------------------------------------------------------------
-- Place each side in a 2-3-1
--
-- Ordered by how far back the position plays, then by code so the result is
-- deterministic: the keeper takes slot 0, defenders the two behind, and so on
-- forwards. Anyone past slot 6 stays on the bench.
--
-- Restricted to sides with nothing placed yet, so re-running never overwrites
-- an arrangement an administrator has since dragged into shape.
-- ---------------------------------------------------------------------------

with unplaced_sides as (
  select mp.match_id, mp.team_side
  from public.match_players mp
  join public.matches m on m.id = mp.match_id
  where m.league_id = app.initial_league_id()
    and mp.team_side in ('home', 'away')
  group by mp.match_id, mp.team_side
  having count(mp.pitch_slot) = 0
),
ranked as (
  select
    mp.id,
    row_number() over (
      partition by mp.match_id, mp.team_side
      order by
        array_position(
          array[
            'GK', 'CB', 'LB', 'RB', 'CDM', 'CM', 'UT', 'CAM', 'LW', 'RW', 'ST'
          ]::public.player_position[],
          p.preferred_position
        ),
        p.player_code
    ) - 1 as slot
  from public.match_players mp
  join unplaced_sides u
    on u.match_id = mp.match_id
   and u.team_side = mp.team_side
  join public.players p on p.id = mp.player_id
)
update public.match_players mp
set pitch_slot = ranked.slot
from ranked
where ranked.id = mp.id
  and ranked.slot <= 6;

-- Scoped to these four fixtures rather than to the league, so the assertion
-- still holds when the script is rehearsed against a local stack that also
-- carries supabase/seed.sql.
do $$
declare
  v_match_ids constant uuid[] := array[
    '44444444-4444-4444-8444-000000000001',
    '44444444-4444-4444-8444-000000000002',
    '44444444-4444-4444-8444-000000000003',
    '44444444-4444-4444-8444-000000000004'
  ]::uuid[];
  v_matches integer;
  v_squad integer;
begin
  select count(*) into v_matches
  from public.matches
  where league_id = app.initial_league_id()
    and id = any (v_match_ids);

  select count(*) into v_squad
  from public.match_players
  where match_id = any (v_match_ids);

  if v_matches <> 4 then
    raise exception 'Expected 4 matches, found %', v_matches;
  end if;

  -- 14 + 14 + 15 + 16 call-ups across the four matches.
  if v_squad <> 59 then
    raise exception 'Expected 59 call-ups, found %', v_squad;
  end if;

  raise notice 'Fixtures loaded: 4 matches, 59 call-ups.';
end;
$$;

commit;

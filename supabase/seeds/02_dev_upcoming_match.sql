-- ============================================================================
-- Development seed — one fixture still to be played
--
-- Development only, and the one piece of invented data in the local database.
-- The real league's four matches are all scored, which leaves nothing locally
-- to exercise the half of the app that deals with a match before it happens:
-- picking a squad, arranging a line-up, downloading the CSV template, importing
-- results. It is also what the pgTAP import tests score against.
--
-- Seven a side and deliberately not the whole roster, so that "this player was
-- not called up" is a state that exists to be tested. ALEX, KIRILL, RODRI,
-- SERGI-P, JOSEP-P, ALEIX, MARC and CARLOS are the ones left out.
--
-- Loaded after production/03_results.sql so it is the league's next match
-- rather than one buried in the middle; see [db.seed] sql_paths.
-- ============================================================================

insert into public.matches (
  id, league_id, title, location, played_at,
  home_team_name, away_team_name, status
)
values (
  'bbbbbbbb-bbbb-4bbb-8bbb-000000000001',
  app.initial_league_id(),
  'Jornada 5',
  'Campo de fútbol UIB',
  -- Relative, so the dashboard always has a sensible "next match" however long
  -- after seeding the app is opened.
  date_trunc('day', now() + interval '7 days') + interval '19 hours 30 minutes',
  'Blanco',
  'Negro',
  'scheduled'
);

insert into public.match_players (
  match_id, player_id, team_side, attendance_status
)
select
  'bbbbbbbb-bbbb-4bbb-8bbb-000000000001',
  p.id,
  squad.team_side::public.team_side,
  'confirmed'::public.attendance_status
from (
  values
    ('home', 'JORDI'),
    ('home', 'PAU-R'),
    ('home', 'SERGIO-M'),
    ('home', 'JOSEP-M'),
    ('home', 'JOAN'),
    ('home', 'PEP-M'),
    ('home', 'ANDREU'),
    ('away', 'JOSE'),
    ('away', 'RAUL'),
    ('away', 'DAVID-C'),
    ('away', 'DAVID-W'),
    ('away', 'LLUIS'),
    ('away', 'JAN-M'),
    ('away', 'PERICO')
) as squad (team_side, player_code)
join public.players p
  on p.league_id = app.initial_league_id()
 and p.player_code = squad.player_code;

-- Same arrangement rule as the played fixtures: keeper first, then back to
-- front. One player is left on the bench on purpose, so the interface has a
-- non-empty bench to render.
with ranked as (
  select
    mp.id,
    row_number() over (
      partition by mp.team_side
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
  join public.players p on p.id = mp.player_id
  where mp.match_id = 'bbbbbbbb-bbbb-4bbb-8bbb-000000000001'
)
update public.match_players mp
set pitch_slot = ranked.slot
from ranked
where ranked.id = mp.id
  and ranked.slot <= 6;

update public.match_players
set pitch_slot = null
where match_id = 'bbbbbbbb-bbbb-4bbb-8bbb-000000000001'
  and player_id = (
    select id from public.players
    where league_id = app.initial_league_id() and player_code = 'JOAN'
  );

-- ============================================================================
-- Development seed data
--
-- Runs after every migration on `supabase db reset`. Everything here is
-- fictional and development-only; the league, metrics and attributes come from
-- migration 001 because production needs them too.
--
-- Deliberately contains NO auth users. The first account to register becomes
-- the administrator (see app.handle_new_user), and seeding a user would quietly
-- demote whoever signs up first.
--
-- Three matches rather than the two originally specified: two scored matches
-- mean some players have a career history, so the two-or-more-matches branch of
-- the market value formula is actually observable while developing. With a
-- single scored match every valuation would just be latest_score x constant.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Players
-- ---------------------------------------------------------------------------

insert into public.players (
  id, league_id, player_code, first_name, last_name, nickname,
  preferred_position
)
values
  ('22222222-2222-4222-8222-000000000001', app.initial_league_id(), 'PLR-A7K2', 'David',   'Castelló',  null,       'CM'),
  ('22222222-2222-4222-8222-000000000002', app.initial_league_id(), 'PLR-B9F1', 'Juan',    'García',    'Juanito',  'GK'),
  ('22222222-2222-4222-8222-000000000003', app.initial_league_id(), 'PLR-C3M8', 'Álvaro',  'Ruiz',      null,       'CB'),
  ('22222222-2222-4222-8222-000000000004', app.initial_league_id(), 'PLR-D5P4', 'Sergio',  'Moreno',    'Sergi',    'LB'),
  ('22222222-2222-4222-8222-000000000005', app.initial_league_id(), 'PLR-E8T6', 'Nacho',   'Ferrer',    null,       'RB'),
  ('22222222-2222-4222-8222-000000000006', app.initial_league_id(), 'PLR-F2H9', 'Pablo',   'Navarro',   'Pablito',  'CDM'),
  ('22222222-2222-4222-8222-000000000007', app.initial_league_id(), 'PLR-G6J3', 'Marcos',  'Iglesias',  null,       'CAM'),
  ('22222222-2222-4222-8222-000000000008', app.initial_league_id(), 'PLR-H4L7', 'Iván',    'Domínguez', 'Chino',    'LW'),
  ('22222222-2222-4222-8222-000000000009', app.initial_league_id(), 'PLR-J9N5', 'Rubén',   'Vidal',     null,       'RW'),
  ('22222222-2222-4222-8222-000000000010', app.initial_league_id(), 'PLR-K1Q2', 'Carlos',  'Herrera',   'Charly',   'ST'),
  ('22222222-2222-4222-8222-000000000011', app.initial_league_id(), 'PLR-L7R8', 'Adrián',  'Sáez',      null,       'ST'),
  ('22222222-2222-4222-8222-000000000012', app.initial_league_id(), 'PLR-M3S4', 'Guille',  'Ortega',    null,       'UT'),
  ('22222222-2222-4222-8222-000000000013', app.initial_league_id(), 'PLR-N8V6', 'Toni',    'Lorenzo',   'Tonet',    'CM'),
  ('22222222-2222-4222-8222-000000000014', app.initial_league_id(), 'PLR-P5W9', 'Hugo',    'Blanco',    null,       'GK');

-- Two players who have never been called up, so the "no matches" branch of the
-- market value formula has something to render.
insert into public.players (
  id, league_id, player_code, first_name, last_name, nickname,
  preferred_position, is_active
)
values
  ('22222222-2222-4222-8222-000000000015', app.initial_league_id(), 'PLR-Q2X3', 'Bruno',  'Peña',   null, 'CB', true),
  ('22222222-2222-4222-8222-000000000016', app.initial_league_id(), 'PLR-R6Y7', 'Martín', 'Cabrera', null, 'CM', false);

-- ---------------------------------------------------------------------------
-- Matches
--
-- Dates are relative so the dashboard always has a sensible "latest" and
-- "next" match however long after seeding the app is opened.
-- ---------------------------------------------------------------------------

insert into public.matches (
  id, league_id, title, location, played_at,
  home_team_name, away_team_name, status, results_imported_at
)
values
  (
    '33333333-3333-4333-8333-000000000001',
    app.initial_league_id(),
    'Jornada 1',
    'Polideportivo Roco',
    now() - interval '14 days',
    'Los Cracks',
    'Los Pachangueros',
    'scored',
    now() - interval '13 days'
  ),
  (
    '33333333-3333-4333-8333-000000000002',
    app.initial_league_id(),
    'Jornada 2',
    'Campo Municipal La Dehesa',
    now() - interval '7 days',
    'Los Cracks',
    'Los Pachangueros',
    'scored',
    now() - interval '6 days'
  ),
  (
    '33333333-3333-4333-8333-000000000003',
    app.initial_league_id(),
    'Jornada 3',
    'Polideportivo Roco',
    now() + interval '7 days',
    'Los Cracks',
    'Los Pachangueros',
    'scheduled',
    null
  );

-- ---------------------------------------------------------------------------
-- Squads
--
-- The first 14 players are called up for all three matches, seven a side.
-- ---------------------------------------------------------------------------

insert into public.match_players (
  match_id, player_id, team_side, attendance_status
)
select
  m.id,
  p.id,
  case when p.player_code in (
    'PLR-A7K2', 'PLR-B9F1', 'PLR-C3M8', 'PLR-D5P4',
    'PLR-E8T6', 'PLR-F2H9', 'PLR-G6J3'
  ) then 'home'::public.team_side
  else 'away'::public.team_side end,
  case when m.status = 'scored'
    then 'played'::public.attendance_status
    else 'confirmed'::public.attendance_status
  end
from public.matches m
cross join public.players p
where m.league_id = app.initial_league_id()
  and p.league_id = app.initial_league_id()
  and p.player_code not in ('PLR-Q2X3', 'PLR-R6Y7');

-- Place each squad in its formation, so the pitch view has something to show
-- straight after a reset. Goalkeepers take slot 0; the rest fill 1..6 in a
-- stable order.
--
-- Migration 007 contains the same backfill for databases that already held
-- squads, but seeding runs after migrations, so dev data has to do it here.
with ranked as (
  select
    mp.id,
    row_number() over (
      partition by mp.match_id, mp.team_side
      order by (p.preferred_position <> 'GK'), p.player_code
    ) - 1 as slot
  from public.match_players mp
  join public.players p on p.id = mp.player_id
  where mp.team_side in ('home', 'away')
)
update public.match_players mp
set pitch_slot = ranked.slot
from ranked
where ranked.id = mp.id
  and ranked.slot <= 6;

-- One player left on the bench in the upcoming match, so the interface has a
-- non-empty bench to render during development.
update public.match_players mp
set pitch_slot = null
where mp.match_id = '33333333-3333-4333-8333-000000000003'
  and mp.player_id = (
    select p.id from public.players p
    where p.player_code = 'PLR-G6J3'
  );

-- ---------------------------------------------------------------------------
-- Scores
--
-- base_score and final_score are derived here in SQL rather than written out
-- by hand, so the seed cannot drift from the formula the database enforces.
--
-- Scores and their attributes are inserted by a single data-modifying CTE:
-- the Supabase CLI applies seed statements under autocommit, so a temporary
-- table would be dropped the moment its own statement ended.
-- ---------------------------------------------------------------------------

-- Jornada 1 went 3-1 to Los Cracks, the home side; Jornada 2 finished 2-2, so
-- everyone in it takes half a victory. Between them the two results exercise
-- both ends of the victory share and the decimal in the middle.
with seed_scores (
  match_id, player_code,
  attack, defence, tactics, physical, goals, victory, attribute_codes
) as (
  values
  -- Jornada 1 — Los Cracks (home) 3-1 Los Pachangueros (away)
  ('33333333-3333-4333-8333-000000000001', 'PLR-A7K2', 6, 9, 8, 7, 1, 1.0, '{zamora}'),
  ('33333333-3333-4333-8333-000000000001', 'PLR-B9F1', 2, 9, 7, 6, 0, 1.0, '{}'),
  ('33333333-3333-4333-8333-000000000001', 'PLR-C3M8', 4, 8, 7, 8, 0, 1.0, '{}'),
  ('33333333-3333-4333-8333-000000000001', 'PLR-D5P4', 5, 7, 6, 7, 0, 1.0, '{}'),
  ('33333333-3333-4333-8333-000000000001', 'PLR-E8T6', 5, 6, 6, 8, 0, 1.0, '{injury}'),
  ('33333333-3333-4333-8333-000000000001', 'PLR-F2H9', 6, 8, 8, 7, 0, 1.0, '{}'),
  ('33333333-3333-4333-8333-000000000001', 'PLR-G6J3', 8, 5, 8, 7, 2, 1.0, '{mvp,pichichi}'),
  ('33333333-3333-4333-8333-000000000001', 'PLR-H4L7', 8, 4, 7, 8, 0, 0.0, '{}'),
  ('33333333-3333-4333-8333-000000000001', 'PLR-J9N5', 7, 4, 6, 8, 0, 0.0, '{}'),
  ('33333333-3333-4333-8333-000000000001', 'PLR-K1Q2', 9, 3, 7, 7, 1, 0.0, '{puskas}'),
  ('33333333-3333-4333-8333-000000000001', 'PLR-L7R8', 7, 3, 6, 6, 0, 0.0, '{}'),
  ('33333333-3333-4333-8333-000000000001', 'PLR-M3S4', 6, 6, 6, 6, 0, 0.0, '{revelation}'),
  ('33333333-3333-4333-8333-000000000001', 'PLR-N8V6', 6, 7, 7, 6, 0, 0.0, '{}'),
  ('33333333-3333-4333-8333-000000000001', 'PLR-P5W9', 2, 8, 6, 6, 0, 0.0, '{}'),
  -- Jornada 2 — 2-2
  ('33333333-3333-4333-8333-000000000002', 'PLR-A7K2', 7, 8, 9, 7, 1, 0.5, '{mvp}'),
  ('33333333-3333-4333-8333-000000000002', 'PLR-B9F1', 3, 8, 7, 6, 0, 0.5, '{}'),
  ('33333333-3333-4333-8333-000000000002', 'PLR-C3M8', 4, 9, 8, 8, 0, 0.5, '{}'),
  ('33333333-3333-4333-8333-000000000002', 'PLR-D5P4', 5, 6, 6, 7, 0, 0.5, '{}'),
  ('33333333-3333-4333-8333-000000000002', 'PLR-E8T6', 6, 7, 7, 7, 0, 0.5, '{}'),
  ('33333333-3333-4333-8333-000000000002', 'PLR-F2H9', 6, 7, 8, 8, 0, 0.5, '{}'),
  ('33333333-3333-4333-8333-000000000002', 'PLR-G6J3', 9, 5, 9, 7, 1, 0.5, '{puskas}'),
  ('33333333-3333-4333-8333-000000000002', 'PLR-H4L7', 7, 5, 7, 7, 0, 0.5, '{}'),
  ('33333333-3333-4333-8333-000000000002', 'PLR-J9N5', 8, 4, 7, 8, 0, 0.5, '{}'),
  ('33333333-3333-4333-8333-000000000002', 'PLR-K1Q2', 9, 4, 8, 8, 2, 0.5, '{mvp,puskas,pichichi}'),
  ('33333333-3333-4333-8333-000000000002', 'PLR-L7R8', 6, 4, 6, 6, 0, 0.5, '{injury}'),
  ('33333333-3333-4333-8333-000000000002', 'PLR-M3S4', 7, 6, 7, 6, 0, 0.5, '{}'),
  ('33333333-3333-4333-8333-000000000002', 'PLR-N8V6', 6, 6, 7, 7, 0, 0.5, '{}'),
  ('33333333-3333-4333-8333-000000000002', 'PLR-P5W9', 3, 9, 7, 6, 0, 0.5, '{zamora}')
),
resolved as (
  select
    s.match_id::uuid as match_id,
    p.id as player_id,
    jsonb_build_object(
      'attack', s.attack,
      'defence', s.defence,
      'tactics', s.tactics,
      'physical', s.physical
    ) as metric_scores,
    -- The sum of the metrics, matching import_match_scores since 009.
    round((s.attack + s.defence + s.tactics + s.physical)::numeric, 3)
      as base_score,
    coalesce(points.total, 0) as attribute_points,
    s.goals as goals,
    s.victory::numeric as victory,
    s.attribute_codes::text[] as attribute_codes
  from seed_scores s
  join public.players p
    on p.league_id = app.initial_league_id()
   and p.player_code = s.player_code
  left join lateral (
    select sum(a.points)::integer as total
    from unnest(s.attribute_codes::text[]) as requested (code)
    join public.league_attributes a
      on a.league_id = app.initial_league_id()
     and a.code = requested.code
  ) as points on true
),
inserted as (
  insert into public.player_match_scores (
    match_id, player_id, metric_scores, goals, victory,
    base_score, attribute_points, final_score
  )
  select
    match_id, player_id, metric_scores, goals, victory,
    base_score,
    attribute_points,
    base_score + attribute_points + victory * public.victory_points()
  from resolved
  returning id, match_id, player_id
)
insert into public.player_match_score_attributes
  (player_match_score_id, league_attribute_id)
select inserted.id, a.id
from inserted
join resolved
  on resolved.match_id = inserted.match_id
 and resolved.player_id = inserted.player_id
cross join unnest(resolved.attribute_codes) as requested (code)
join public.league_attributes a
  on a.league_id = app.initial_league_id()
 and a.code = requested.code;

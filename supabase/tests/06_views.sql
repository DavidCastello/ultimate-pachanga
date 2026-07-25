-- ============================================================================
-- Derived views: market values, card ratings and metric averages
--
-- The 0.5/0.5 weighting only becomes distinguishable from a plain career
-- average once a player has three or more matches, so this file builds that
-- case explicitly rather than relying on the two-match seed.
-- ============================================================================

begin;
select plan(17);

-- Cleared so the new-user trigger makes this account an administrator
-- regardless of who already exists in this database.
delete from public.league_members;

insert into auth.users (id, instance_id, aud, role, email)
values (
  '99999999-9999-4999-8999-00000000000a',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'admin@test.local'
);

-- ---------------------------------------------------------------------------
-- The specification's worked example, built from scratch:
--
--   previous scores 7.0, 8.0, 6.0  -> previous average 7.0
--   latest score    9.5
--   weighted        (0.5 x 7.0) + (0.5 x 9.5) = 8.25
--   market value    8.25 x 1,000,000 = 8,250,000
--
-- Note this differs from the career average of 7.625, which is the point of
-- the weighting.
-- ---------------------------------------------------------------------------

insert into public.leagues (id, title, market_constant_gbp)
values ('66666666-6666-4666-8666-000000000001', 'Liga de prueba', 1000000);

insert into public.league_metrics
  (league_id, code, label, display_order, minimum_score, maximum_score)
values
  ('66666666-6666-4666-8666-000000000001', 'attack',  'Ataque',  1, 0, 10),
  ('66666666-6666-4666-8666-000000000001', 'defence', 'Defensa', 2, 0, 10);

insert into public.players
  (id, league_id, player_code, first_name, last_name, preferred_position)
values
  ('77777777-7777-4777-8777-000000000001',
   '66666666-6666-4666-8666-000000000001',
   'TST-0001', 'Cuatro', 'Partidos', 'CM'),
  ('77777777-7777-4777-8777-000000000002',
   '66666666-6666-4666-8666-000000000001',
   'TST-0002', 'Un', 'Partido', 'ST'),
  ('77777777-7777-4777-8777-000000000003',
   '66666666-6666-4666-8666-000000000001',
   'TST-0003', 'Cero', 'Partidos', 'GK');

-- Four matches, oldest to newest. played_at drives which score counts as
-- "latest", so the dates matter more than the insert order.
insert into public.matches (
  id, league_id, title, location, played_at,
  home_team_name, away_team_name, status, results_imported_at
)
values
  ('88888888-8888-4888-8888-000000000001',
   '66666666-6666-4666-8666-000000000001', 'P1', 'Sitio',
   now() - interval '40 days', 'A', 'B', 'scored', now()),
  ('88888888-8888-4888-8888-000000000002',
   '66666666-6666-4666-8666-000000000001', 'P2', 'Sitio',
   now() - interval '30 days', 'A', 'B', 'scored', now()),
  ('88888888-8888-4888-8888-000000000003',
   '66666666-6666-4666-8666-000000000001', 'P3', 'Sitio',
   now() - interval '20 days', 'A', 'B', 'scored', now()),
  ('88888888-8888-4888-8888-000000000004',
   '66666666-6666-4666-8666-000000000001', 'P4', 'Sitio',
   now() - interval '10 days', 'A', 'B', 'scored', now());

insert into public.match_players (match_id, player_id, attendance_status)
select m.id, '77777777-7777-4777-8777-000000000001', 'played'
from public.matches m
where m.league_id = '66666666-6666-4666-8666-000000000001';

insert into public.match_players (match_id, player_id, attendance_status)
values ('88888888-8888-4888-8888-000000000004',
        '77777777-7777-4777-8777-000000000002', 'played');

-- Scores 7.0, 8.0, 6.0 then a latest of 9.5. metric_scores are set so the
-- averages land exactly on those figures.
insert into public.player_match_scores
  (match_id, player_id, metric_scores, base_score, attribute_points,
   final_score)
values
  ('88888888-8888-4888-8888-000000000001',
   '77777777-7777-4777-8777-000000000001',
   '{"attack": 7, "defence": 7}', 7.0, 0, 7.0),
  ('88888888-8888-4888-8888-000000000002',
   '77777777-7777-4777-8777-000000000001',
   '{"attack": 8, "defence": 8}', 8.0, 0, 8.0),
  ('88888888-8888-4888-8888-000000000003',
   '77777777-7777-4777-8777-000000000001',
   '{"attack": 6, "defence": 6}', 6.0, 0, 6.0),
  ('88888888-8888-4888-8888-000000000004',
   '77777777-7777-4777-8777-000000000001',
   '{"attack": 10, "defence": 9}', 9.5, 0, 9.5),
  -- A single match, so the one-match branch applies.
  ('88888888-8888-4888-8888-000000000004',
   '77777777-7777-4777-8777-000000000002',
   '{"attack": 5, "defence": 3}', 4.0, 0, 4.0);

-- ---------------------------------------------------------------------------
-- Four matches: the weighted branch
-- ---------------------------------------------------------------------------

select is(
  (select matches_played from public.player_market_values
   where player_id = '77777777-7777-4777-8777-000000000001'),
  4,
  'every scored match counts towards matches_played'
);

select is(
  (select latest_score from public.player_market_values
   where player_id = '77777777-7777-4777-8777-000000000001'),
  9.5::numeric,
  'the most recently played match is the latest score'
);

select is(
  (select career_average from public.player_market_values
   where player_id = '77777777-7777-4777-8777-000000000001'),
  7.625::numeric,
  'career average is the plain mean of every match'
);

select is(
  (select weighted_performance_score from public.player_market_values
   where player_id = '77777777-7777-4777-8777-000000000001'),
  8.25::numeric,
  'the weighted score halves the earlier career and the latest match'
);

select is(
  (select market_value_gbp from public.player_market_values
   where player_id = '77777777-7777-4777-8777-000000000001'),
  8250000.00::numeric,
  'market value is the weighted score times the league constant'
);

-- The rating is a standing, not a measurement. Two players have a latest score
-- here — 9.5 and 4.0 — so the league mean is 6.75 and the population standard
-- deviation is exactly 2.75. Each of them therefore sits one deviation from the
-- centre, which is twelve points.
select is(
  (select card_rating from public.player_market_values
   where player_id = '77777777-7777-4777-8777-000000000001'),
  82,
  'a player one standard deviation above the league rates 70 + 12'
);

select is(
  (select card_rating from public.player_market_values
   where player_id = '77777777-7777-4777-8777-000000000002'),
  58,
  'and one standard deviation below rates 70 - 12'
);

-- Nobody to compare against yet, so the centre is the only honest answer.
select is(
  (select card_rating from public.player_market_values
   where player_id = '77777777-7777-4777-8777-000000000003'),
  70,
  'a player who has never been scored sits at the centre'
);

-- ---------------------------------------------------------------------------
-- One match: the latest score is used directly
-- ---------------------------------------------------------------------------

select is(
  (select weighted_performance_score from public.player_market_values
   where player_id = '77777777-7777-4777-8777-000000000002'),
  4.0::numeric,
  'with one match the weighted score is that match'
);

select is(
  (select market_value_gbp from public.player_market_values
   where player_id = '77777777-7777-4777-8777-000000000002'),
  4000000.00::numeric,
  'with one match the market value is that score times the constant'
);

-- ---------------------------------------------------------------------------
-- No matches: the league average of players who have played
--
-- (8.25 + 4.0) / 2 = 6.125
-- ---------------------------------------------------------------------------

select is(
  (select matches_played from public.player_market_values
   where player_id = '77777777-7777-4777-8777-000000000003'),
  0,
  'a player who has never played reports zero matches'
);

select is(
  (select weighted_performance_score from public.player_market_values
   where player_id = '77777777-7777-4777-8777-000000000003'),
  6.125::numeric,
  'a player with no matches inherits the league average'
);

select ok(
  (select career_average is null from public.player_market_values
   where player_id = '77777777-7777-4777-8777-000000000003'),
  'a player with no matches has no career average'
);

-- ---------------------------------------------------------------------------
-- Clamping
-- ---------------------------------------------------------------------------

select is(
  public.to_card_stat(12.5::numeric),
  99,
  'card stats are clamped to 99'
);

select is(
  public.to_card_stat(-3::numeric),
  0,
  'card stats are clamped to 0'
);

-- ---------------------------------------------------------------------------
-- Per-metric averages
-- ---------------------------------------------------------------------------

select is(
  (select career_average from public.player_metric_averages
   where player_id = '77777777-7777-4777-8777-000000000001'
     and metric_code = 'attack'),
  7.75::numeric,
  'metric averages are computed per metric'
);

select is(
  (select (metric_card_stats ->> 'attack')::integer from public.player_cards
   where id = '77777777-7777-4777-8777-000000000001'),
  78,
  'player_cards exposes per-metric card stats'
);

select * from finish();
rollback;

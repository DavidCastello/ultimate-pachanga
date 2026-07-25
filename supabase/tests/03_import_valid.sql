-- ============================================================================
-- import_match_scores: the happy path
--
-- Checks the arithmetic against the worked example in the specification:
--
--   attack 6, defence 9, tactics 8, physical 7  ->  base 30
--   Zamora                                      ->  +2
--   a win                                       ->  +2
--                                               ->  final 34
-- ============================================================================

begin;
select plan(16);

-- Cleared so this file's memberships are the only ones in the database.
delete from public.league_members;

insert into auth.users (id, instance_id, aud, role, email)
values (
  '99999999-9999-4999-8999-00000000000a',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'admin@test.local'
);

-- Registering grants nothing since 008, so the membership is explicit.
insert into public.league_members (league_id, user_id, role)
values (app.initial_league_id(), '99999999-9999-4999-8999-00000000000a', 'admin');

set local role authenticated;
set local request.jwt.claims to
  '{"sub": "99999999-9999-4999-8999-00000000000a", "role": "authenticated"}';

-- The seeded Jornada 5 is scheduled with a full squad and no scores yet.
select is(
  (select status::text from public.matches
   where id = 'bbbbbbbb-bbbb-4bbb-8bbb-000000000001'),
  'scheduled',
  'the target match starts out scheduled'
);

select is(
  (select count(*)::integer from public.player_match_scores
   where match_id = 'bbbbbbbb-bbbb-4bbb-8bbb-000000000001'),
  0,
  'the target match starts out unscored'
);

select is(
  (select (result ->> 'imported_count')::integer
   from public.import_match_scores(
     'bbbbbbbb-bbbb-4bbb-8bbb-000000000001',
     '[
        {"player_code": "JORDI",
         "metric_scores": {"attack": 6, "defence": 9, "tactics": 8,
                           "physical": 7},
         "attribute_codes": ["zamora"],
         "goals": 2, "victory": 1},
        {"player_code": "JOSE",
         "metric_scores": {"attack": 2, "defence": 8, "tactics": 7,
                           "physical": 6},
         "attribute_codes": [],
         "goals": 0, "victory": 0.5},
        {"player_code": "PERICO",
         "metric_scores": {"attack": 8, "defence": 8, "tactics": 9,
                           "physical": 7},
         "attribute_codes": ["mvp", "puskas"]},
        {"player_code": "DAVID-C",
         "metric_scores": {"attack": 5, "defence": 4, "tactics": 5,
                           "physical": 6},
         "attribute_codes": ["injury"]}
      ]'::jsonb
   ) as result),
  4,
  'the import reports the number of rows written'
);

-- ---------------------------------------------------------------------------
-- Arithmetic
-- ---------------------------------------------------------------------------

select is(
  (select base_score from public.player_match_scores s
   join public.players p on p.id = s.player_id
   where s.match_id = 'bbbbbbbb-bbbb-4bbb-8bbb-000000000001'
     and p.player_code = 'JORDI'),
  30::numeric(6, 3),
  'base score is the sum of the active metrics'
);

select is(
  (select attribute_points from public.player_match_scores s
   join public.players p on p.id = s.player_id
   where s.match_id = 'bbbbbbbb-bbbb-4bbb-8bbb-000000000001'
     and p.player_code = 'JORDI'),
  2,
  'a single positive attribute contributes its points'
);

select is(
  (select final_score from public.player_match_scores s
   join public.players p on p.id = s.player_id
   where s.match_id = 'bbbbbbbb-bbbb-4bbb-8bbb-000000000001'
     and p.player_code = 'JORDI'),
  34::numeric(6, 3),
  'final score is base, plus attribute points, plus two for the win'
);

select is(
  (select attribute_points from public.player_match_scores s
   join public.players p on p.id = s.player_id
   where s.match_id = 'bbbbbbbb-bbbb-4bbb-8bbb-000000000001'
     and p.player_code = 'PERICO'),
  4,
  'multiple attributes accumulate'
);

-- MVP +2 and Puskas +2 on a base of 32, with no victory recorded for this
-- row: the two optional fields default to zero rather than failing the import.
--
-- final_score is deliberately unclamped, so nothing caps this at the metric
-- total.
select is(
  (select final_score from public.player_match_scores s
   join public.players p on p.id = s.player_id
   where s.match_id = 'bbbbbbbb-bbbb-4bbb-8bbb-000000000001'
     and p.player_code = 'PERICO'),
  36::numeric(6, 3),
  'final score may exceed the metric maximum'
);

select is(
  (select final_score from public.player_match_scores s
   join public.players p on p.id = s.player_id
   where s.match_id = 'bbbbbbbb-bbbb-4bbb-8bbb-000000000001'
     and p.player_code = 'DAVID-C'),
  18::numeric(6, 3),
  'a negative attribute subtracts'
);

select is(
  (select count(*)::integer
   from public.player_match_score_attributes sa
   join public.player_match_scores s on s.id = sa.player_match_score_id
   join public.players p on p.id = s.player_id
   where s.match_id = 'bbbbbbbb-bbbb-4bbb-8bbb-000000000001'
     and p.player_code = 'PERICO'),
  2,
  'each assigned attribute is recorded'
);

-- ---------------------------------------------------------------------------
-- Match state
-- ---------------------------------------------------------------------------

select is(
  (select status::text from public.matches
   where id = 'bbbbbbbb-bbbb-4bbb-8bbb-000000000001'),
  'scored',
  'a successful import marks the match as scored'
);

select ok(
  (select results_imported_at is not null from public.matches
   where id = 'bbbbbbbb-bbbb-4bbb-8bbb-000000000001'),
  'a successful import stamps the import time'
);

-- ---------------------------------------------------------------------------
-- Goals and victories
-- ---------------------------------------------------------------------------

select is(
  (select goals from public.player_match_scores s
   join public.players p on p.id = s.player_id
   where s.match_id = 'bbbbbbbb-bbbb-4bbb-8bbb-000000000001'
     and p.player_code = 'JORDI'),
  2,
  'goals are recorded as given'
);

-- Recorded, but absent from the arithmetic: two goals added nothing to the 34
-- asserted above.
select is(
  (select victory from public.player_match_scores s
   join public.players p on p.id = s.player_id
   where s.match_id = 'bbbbbbbb-bbbb-4bbb-8bbb-000000000001'
     and p.player_code = 'JOSE'),
  0.5::numeric(3, 2),
  'a draw is stored as half a victory'
);

-- 2+8+7+6 = 23, no attributes, half a win.
select is(
  (select final_score from public.player_match_scores s
   join public.players p on p.id = s.player_id
   where s.match_id = 'bbbbbbbb-bbbb-4bbb-8bbb-000000000001'
     and p.player_code = 'JOSE'),
  24::numeric(6, 3),
  'a draw is worth one point'
);

-- The rows that sent neither field.
select is(
  (select victory from public.player_match_scores s
   join public.players p on p.id = s.player_id
   where s.match_id = 'bbbbbbbb-bbbb-4bbb-8bbb-000000000001'
     and p.player_code = 'PERICO'),
  0::numeric(3, 2),
  'an omitted victory is a defeat rather than an error'
);

select * from finish();
rollback;

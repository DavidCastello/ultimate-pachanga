-- ============================================================================
-- import_match_scores: the happy path
--
-- Checks the arithmetic against the worked example in the specification:
--
--   attack 6, defence 9, tactics 8, physical 7  ->  base 7.5
--   Zamora                                      ->  +2
--                                               ->  final 9.5
-- ============================================================================

begin;
select plan(12);

-- Cleared so the new-user trigger makes this account an administrator
-- regardless of who already exists in this database.
delete from public.league_members;

insert into auth.users (id, instance_id, aud, role, email)
values (
  '99999999-9999-4999-8999-00000000000a',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'admin@test.local'
);

set local role authenticated;
set local request.jwt.claims to
  '{"sub": "99999999-9999-4999-8999-00000000000a", "role": "authenticated"}';

-- The seeded Jornada 3 is scheduled with a full squad and no scores yet.
select is(
  (select status::text from public.matches
   where id = '33333333-3333-4333-8333-000000000003'),
  'scheduled',
  'the target match starts out scheduled'
);

select is(
  (select count(*)::integer from public.player_match_scores
   where match_id = '33333333-3333-4333-8333-000000000003'),
  0,
  'the target match starts out unscored'
);

select is(
  (select (result ->> 'imported_count')::integer
   from public.import_match_scores(
     '33333333-3333-4333-8333-000000000003',
     '[
        {"player_code": "PLR-A7K2",
         "metric_scores": {"attack": 6, "defence": 9, "tactics": 8,
                           "physical": 7},
         "attribute_codes": ["zamora"]},
        {"player_code": "PLR-B9F1",
         "metric_scores": {"attack": 2, "defence": 8, "tactics": 7,
                           "physical": 6},
         "attribute_codes": []},
        {"player_code": "PLR-K1Q2",
         "metric_scores": {"attack": 8, "defence": 8, "tactics": 9,
                           "physical": 7},
         "attribute_codes": ["mvp", "puskas"]},
        {"player_code": "PLR-L7R8",
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
   where s.match_id = '33333333-3333-4333-8333-000000000003'
     and p.player_code = 'PLR-A7K2'),
  7.5::numeric(6, 3),
  'base score is the mean of the active metrics'
);

select is(
  (select attribute_points from public.player_match_scores s
   join public.players p on p.id = s.player_id
   where s.match_id = '33333333-3333-4333-8333-000000000003'
     and p.player_code = 'PLR-A7K2'),
  2,
  'a single positive attribute contributes its points'
);

select is(
  (select final_score from public.player_match_scores s
   join public.players p on p.id = s.player_id
   where s.match_id = '33333333-3333-4333-8333-000000000003'
     and p.player_code = 'PLR-A7K2'),
  9.5::numeric(6, 3),
  'final score is base score plus attribute points'
);

select is(
  (select attribute_points from public.player_match_scores s
   join public.players p on p.id = s.player_id
   where s.match_id = '33333333-3333-4333-8333-000000000003'
     and p.player_code = 'PLR-K1Q2'),
  4,
  'multiple attributes accumulate'
);

-- MVP +2 and Puskas +2 on a base of 8.0 exceeds the metric maximum. That is
-- intentional: final_score is not clamped.
select is(
  (select final_score from public.player_match_scores s
   join public.players p on p.id = s.player_id
   where s.match_id = '33333333-3333-4333-8333-000000000003'
     and p.player_code = 'PLR-K1Q2'),
  12.0::numeric(6, 3),
  'final score may exceed the metric maximum'
);

select is(
  (select final_score from public.player_match_scores s
   join public.players p on p.id = s.player_id
   where s.match_id = '33333333-3333-4333-8333-000000000003'
     and p.player_code = 'PLR-L7R8'),
  3.0::numeric(6, 3),
  'a negative attribute subtracts'
);

select is(
  (select count(*)::integer
   from public.player_match_score_attributes sa
   join public.player_match_scores s on s.id = sa.player_match_score_id
   join public.players p on p.id = s.player_id
   where s.match_id = '33333333-3333-4333-8333-000000000003'
     and p.player_code = 'PLR-K1Q2'),
  2,
  'each assigned attribute is recorded'
);

-- ---------------------------------------------------------------------------
-- Match state
-- ---------------------------------------------------------------------------

select is(
  (select status::text from public.matches
   where id = '33333333-3333-4333-8333-000000000003'),
  'scored',
  'a successful import marks the match as scored'
);

select ok(
  (select results_imported_at is not null from public.matches
   where id = '33333333-3333-4333-8333-000000000003'),
  'a successful import stamps the import time'
);

select * from finish();
rollback;

-- ============================================================================
-- import_match_scores: rejections
--
-- Each case asserts both that the call raises AND that nothing was written.
-- The second half is the point: a partially applied import would leave the
-- league with scores nobody entered.
-- ============================================================================

begin;
select plan(21);

insert into auth.users (id, instance_id, aud, role, email)
values (
  '99999999-9999-4999-8999-00000000000a',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'admin@test.local'
);

insert into auth.users (id, instance_id, aud, role, email)
values (
  '99999999-9999-4999-8999-00000000000b',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'member@test.local'
);

-- ---------------------------------------------------------------------------
-- A member cannot import at all
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims to
  '{"sub": "99999999-9999-4999-8999-00000000000b", "role": "authenticated"}';

select throws_ok(
  $$select public.import_match_scores(
      '33333333-3333-4333-8333-000000000003',
      '[{"player_code": "PLR-A7K2",
         "metric_scores": {"attack": 5, "defence": 5, "tactics": 5,
                           "physical": 5}}]'::jsonb
    )$$,
  '42501',
  null,
  'a member cannot import match results'
);

select is(
  (select count(*)::integer from public.player_match_scores
   where match_id = '33333333-3333-4333-8333-000000000003'),
  0,
  'nothing was written after the member attempt'
);

-- ---------------------------------------------------------------------------
-- Administrator, invalid payloads
-- ---------------------------------------------------------------------------

set local request.jwt.claims to
  '{"sub": "99999999-9999-4999-8999-00000000000a", "role": "authenticated"}';

-- Player 15 exists but was never called up for any match.
select throws_ok(
  $$select public.import_match_scores(
      '33333333-3333-4333-8333-000000000003',
      '[{"player_code": "PLR-Q2X3",
         "metric_scores": {"attack": 5, "defence": 5, "tactics": 5,
                           "physical": 5}}]'::jsonb
    )$$,
  '23514',
  null,
  'a player who was not called up cannot be scored'
);

select is(
  (select count(*)::integer from public.player_match_scores
   where match_id = '33333333-3333-4333-8333-000000000003'),
  0,
  'nothing was written after the non-convoked attempt'
);

select throws_ok(
  $$select public.import_match_scores(
      '33333333-3333-4333-8333-000000000003',
      '[{"player_code": "PLR-NOPE",
         "metric_scores": {"attack": 5, "defence": 5, "tactics": 5,
                           "physical": 5}}]'::jsonb
    )$$,
  'P0002',
  null,
  'an unknown player code is rejected'
);

select throws_ok(
  $$select public.import_match_scores(
      '33333333-3333-4333-8333-000000000003',
      '[{"player_code": "PLR-A7K2",
         "metric_scores": {"attack": 11, "defence": 5, "tactics": 5,
                           "physical": 5}}]'::jsonb
    )$$,
  '22003',
  null,
  'a metric above the league maximum is rejected'
);

select throws_ok(
  $$select public.import_match_scores(
      '33333333-3333-4333-8333-000000000003',
      '[{"player_code": "PLR-A7K2",
         "metric_scores": {"attack": -1, "defence": 5, "tactics": 5,
                           "physical": 5}}]'::jsonb
    )$$,
  '22003',
  null,
  'a metric below the league minimum is rejected'
);

select throws_ok(
  $$select public.import_match_scores(
      '33333333-3333-4333-8333-000000000003',
      '[{"player_code": "PLR-A7K2",
         "metric_scores": {"attack": 5, "defence": 5, "tactics": 5}}]'::jsonb
    )$$,
  '22023',
  null,
  'a missing metric is rejected'
);

select throws_ok(
  $$select public.import_match_scores(
      '33333333-3333-4333-8333-000000000003',
      '[{"player_code": "PLR-A7K2",
         "metric_scores": {"attack": "muy bueno", "defence": 5,
                           "tactics": 5, "physical": 5}}]'::jsonb
    )$$,
  '22023',
  null,
  'a non-numeric metric is rejected'
);

-- A mistyped metric must fail rather than silently drop out of the average.
select throws_ok(
  $$select public.import_match_scores(
      '33333333-3333-4333-8333-000000000003',
      '[{"player_code": "PLR-A7K2",
         "metric_scores": {"attack": 5, "defence": 5, "tactics": 5,
                           "physical": 5, "velocidad": 9}}]'::jsonb
    )$$,
  '22023',
  null,
  'an unknown metric key is rejected'
);

select throws_ok(
  $$select public.import_match_scores(
      '33333333-3333-4333-8333-000000000003',
      '[{"player_code": "PLR-A7K2",
         "metric_scores": {"attack": 5, "defence": 5, "tactics": 5,
                           "physical": 5},
         "attribute_codes": ["balon_de_oro"]}]'::jsonb
    )$$,
  'P0002',
  null,
  'an unknown attribute is rejected'
);

select throws_ok(
  $$select public.import_match_scores(
      '33333333-3333-4333-8333-000000000003',
      '[{"player_code": "PLR-A7K2",
         "metric_scores": {"attack": 5, "defence": 5, "tactics": 5,
                           "physical": 5},
         "attribute_codes": ["mvp", "mvp"]}]'::jsonb
    )$$,
  '23505',
  null,
  'the same attribute cannot be assigned twice to one player'
);

select throws_ok(
  $$select public.import_match_scores(
      '33333333-3333-4333-8333-000000000003',
      '[{"player_code": "PLR-A7K2",
         "metric_scores": {"attack": 5, "defence": 5, "tactics": 5,
                           "physical": 5}},
        {"player_code": "PLR-A7K2",
         "metric_scores": {"attack": 6, "defence": 6, "tactics": 6,
                           "physical": 6}}]'::jsonb
    )$$,
  '23505',
  null,
  'a player cannot appear twice in one import'
);

select throws_ok(
  $$select public.import_match_scores(
      '33333333-3333-4333-8333-000000000003', '[]'::jsonb
    )$$,
  '22023',
  null,
  'an empty result set is rejected'
);

select throws_ok(
  $$select public.import_match_scores(
      '33333333-3333-4333-8333-000000000003', '{}'::jsonb
    )$$,
  '22023',
  null,
  'a payload that is not an array is rejected'
);

select throws_ok(
  $$select public.import_match_scores(
      '55555555-5555-4555-8555-000000000001',
      '[{"player_code": "PLR-A7K2",
         "metric_scores": {"attack": 5, "defence": 5, "tactics": 5,
                           "physical": 5}}]'::jsonb
    )$$,
  'P0002',
  null,
  'importing into a match that does not exist is rejected'
);

-- ---------------------------------------------------------------------------
-- Nothing above wrote anything, including the rows that were individually
-- valid but shared a batch with an invalid one.
-- ---------------------------------------------------------------------------

select is(
  (select count(*)::integer from public.player_match_scores
   where match_id = '33333333-3333-4333-8333-000000000003'),
  0,
  'no scores exist after every rejected import'
);

select is(
  (select status::text from public.matches
   where id = '33333333-3333-4333-8333-000000000003'),
  'scheduled',
  'the match status is untouched by rejected imports'
);

select ok(
  (select results_imported_at is null from public.matches
   where id = '33333333-3333-4333-8333-000000000003'),
  'the import timestamp is untouched by rejected imports'
);

-- ---------------------------------------------------------------------------
-- A valid row batched with an invalid one must not survive
-- ---------------------------------------------------------------------------

select throws_ok(
  $$select public.import_match_scores(
      '33333333-3333-4333-8333-000000000003',
      '[{"player_code": "PLR-A7K2",
         "metric_scores": {"attack": 7, "defence": 7, "tactics": 7,
                           "physical": 7}},
        {"player_code": "PLR-B9F1",
         "metric_scores": {"attack": 99, "defence": 7, "tactics": 7,
                           "physical": 7}}]'::jsonb
    )$$,
  '22003',
  null,
  'one bad row rejects the whole batch'
);

select is(
  (select count(*)::integer from public.player_match_scores
   where match_id = '33333333-3333-4333-8333-000000000003'),
  0,
  'the valid row in a failed batch was rolled back too'
);

select * from finish();
rollback;

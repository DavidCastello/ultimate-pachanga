-- ============================================================================
-- import_match_scores: correcting a match
--
-- Re-importing must upsert, not duplicate, and must replace the previous
-- attribute set rather than accumulate on top of it.
-- ============================================================================

begin;
select plan(10);

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

-- First import: 6/6/6/6 with an MVP.
select public.import_match_scores(
  'bbbbbbbb-bbbb-4bbb-8bbb-000000000001',
  '[{"player_code": "JORDI",
     "metric_scores": {"attack": 6, "defence": 6, "tactics": 6,
                       "physical": 6},
     "attribute_codes": ["mvp"]},
    {"player_code": "JOSE",
     "metric_scores": {"attack": 4, "defence": 8, "tactics": 6,
                       "physical": 6},
     "attribute_codes": []}]'::jsonb
);

select is(
  (select count(*)::integer from public.player_match_scores
   where match_id = 'bbbbbbbb-bbbb-4bbb-8bbb-000000000001'),
  2,
  'the first import writes one row per player'
);

select is(
  (select final_score from public.player_match_scores s
   join public.players p on p.id = s.player_id
   where s.match_id = 'bbbbbbbb-bbbb-4bbb-8bbb-000000000001'
     and p.player_code = 'JORDI'),
  26::numeric(6, 3),
  'the first import scores 24 base plus 2 for the MVP'
);

-- Correction: the scores were wrong and the MVP went to someone else.
select public.import_match_scores(
  'bbbbbbbb-bbbb-4bbb-8bbb-000000000001',
  '[{"player_code": "JORDI",
     "metric_scores": {"attack": 8, "defence": 8, "tactics": 8,
                       "physical": 8},
     "attribute_codes": ["zamora", "puskas"]},
    {"player_code": "JOSE",
     "metric_scores": {"attack": 4, "defence": 8, "tactics": 6,
                       "physical": 6},
     "attribute_codes": []}]'::jsonb
);

select is(
  (select count(*)::integer from public.player_match_scores
   where match_id = 'bbbbbbbb-bbbb-4bbb-8bbb-000000000001'),
  2,
  're-importing upserts rather than inserting duplicates'
);

select is(
  (select base_score from public.player_match_scores s
   join public.players p on p.id = s.player_id
   where s.match_id = 'bbbbbbbb-bbbb-4bbb-8bbb-000000000001'
     and p.player_code = 'JORDI'),
  32::numeric(6, 3),
  'the corrected base score replaces the original'
);

select is(
  (select attribute_points from public.player_match_scores s
   join public.players p on p.id = s.player_id
   where s.match_id = 'bbbbbbbb-bbbb-4bbb-8bbb-000000000001'
     and p.player_code = 'JORDI'),
  4,
  'attribute points are recomputed from the new attribute set'
);

select is(
  (select final_score from public.player_match_scores s
   join public.players p on p.id = s.player_id
   where s.match_id = 'bbbbbbbb-bbbb-4bbb-8bbb-000000000001'
     and p.player_code = 'JORDI'),
  36::numeric(6, 3),
  'the corrected final score is 32 plus 4'
);

select is(
  (select count(*)::integer
   from public.player_match_score_attributes sa
   join public.player_match_scores s on s.id = sa.player_match_score_id
   join public.players p on p.id = s.player_id
   where s.match_id = 'bbbbbbbb-bbbb-4bbb-8bbb-000000000001'
     and p.player_code = 'JORDI'),
  2,
  'the previous attribute set is replaced, not added to'
);

select is(
  (select count(*)::integer
   from public.player_match_score_attributes sa
   join public.player_match_scores s on s.id = sa.player_match_score_id
   join public.players p on p.id = s.player_id
   join public.league_attributes a on a.id = sa.league_attribute_id
   where s.match_id = 'bbbbbbbb-bbbb-4bbb-8bbb-000000000001'
     and p.player_code = 'JORDI'
     and a.code = 'mvp'),
  0,
  'the withdrawn MVP is gone'
);

select is(
  (select status::text from public.matches
   where id = 'bbbbbbbb-bbbb-4bbb-8bbb-000000000001'),
  'scored',
  'the match remains scored after a correction'
);

-- A previously scored match can also be corrected; nothing about `scored`
-- blocks a re-import.
select lives_ok(
  $$select public.import_match_scores(
      '44444444-4444-4444-8444-000000000002',
      '[{"player_code": "JORDI",
         "metric_scores": {"attack": 7, "defence": 7, "tactics": 7,
                           "physical": 7},
         "attribute_codes": []}]'::jsonb
    )$$,
  'an already-scored match can be corrected'
);

select * from finish();
rollback;

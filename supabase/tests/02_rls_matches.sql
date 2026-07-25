-- ============================================================================
-- RLS: matches, squads and scores
--
-- Members are read-only across the whole match lifecycle. Squad selection is
-- the one place administrators may delete, because a squad is genuinely
-- editable before kickoff.
-- ============================================================================

begin;
select plan(16);

-- Cleared so the new-user trigger makes the first insert below an
-- administrator regardless of who already exists in this database.
delete from public.league_members;

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
-- Member
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims to
  '{"sub": "99999999-9999-4999-8999-00000000000b", "role": "authenticated"}';

-- Asserted as "the seeded fixtures are visible" rather than an exact total:
-- an absolute count would break the moment anything else created a match in
-- this database, which says nothing about whether the policy works.
select ok(
  (select count(*) from public.matches
   where id in (
     '33333333-3333-4333-8333-000000000001',
     '33333333-3333-4333-8333-000000000002',
     '33333333-3333-4333-8333-000000000003'
   )) = 3,
  'a member can read the fixture list'
);

select ok(
  (select count(*) from public.match_players) > 0,
  'a member can read squads'
);

select ok(
  (select count(*) from public.player_match_scores) > 0,
  'a member can read scores'
);

select ok(
  (select count(*) from public.player_match_score_attributes) > 0,
  'a member can read score attributes'
);

select ok(
  (select count(*) from public.league_metrics
   where league_id = '11111111-1111-4111-8111-111111111111'
     and is_active) = 4,
  'a member can read the league metrics'
);

select ok(
  (select count(*) from public.league_attributes
   where league_id = '11111111-1111-4111-8111-111111111111'
     and is_active) = 5,
  'a member can read the league attributes'
);

select throws_ok(
  $$insert into public.matches
      (league_id, title, location, played_at, home_team_name, away_team_name)
    values (
      '11111111-1111-4111-8111-111111111111',
      'Partido pirata', 'En ningún sitio', now(), 'A', 'B'
    )$$,
  '42501',
  null,
  'a member cannot create a match'
);

with attempted as (
  update public.matches set location = 'Otro sitio'
  where id = '33333333-3333-4333-8333-000000000003'
  returning 1
)
select is(
  (select count(*)::integer from attempted),
  0,
  'a member cannot edit a match'
);

select throws_ok(
  $$insert into public.match_players (match_id, player_id)
    values (
      '33333333-3333-4333-8333-000000000003',
      '22222222-2222-4222-8222-000000000015'
    )$$,
  '42501',
  null,
  'a member cannot add a player to a squad'
);

with attempted as (
  delete from public.match_players
  where match_id = '33333333-3333-4333-8333-000000000003'
  returning 1
)
select is(
  (select count(*)::integer from attempted),
  0,
  'a member cannot remove a player from a squad'
);

select throws_ok(
  $$insert into public.player_match_scores
      (match_id, player_id, metric_scores, base_score, final_score)
    values (
      '33333333-3333-4333-8333-000000000003',
      '22222222-2222-4222-8222-000000000001',
      '{"attack": 10, "defence": 10, "tactics": 10, "physical": 10}',
      10, 10
    )$$,
  '42501',
  null,
  'a member cannot write a score directly'
);

with attempted as (
  update public.player_match_scores set final_score = 10
  where match_id = '33333333-3333-4333-8333-000000000001'
  returning 1
)
select is(
  (select count(*)::integer from attempted),
  0,
  'a member cannot alter an existing score'
);

with attempted as (
  update public.leagues set market_constant_gbp = 999
  where id = '11111111-1111-4111-8111-111111111111'
  returning 1
)
select is(
  (select count(*)::integer from attempted),
  0,
  'a member cannot change league settings'
);

-- ---------------------------------------------------------------------------
-- Administrator
-- ---------------------------------------------------------------------------

set local request.jwt.claims to
  '{"sub": "99999999-9999-4999-8999-00000000000a", "role": "authenticated"}';

select lives_ok(
  $$insert into public.matches
      (id, league_id, title, location, played_at,
       home_team_name, away_team_name, status)
    values (
      '33333333-3333-4333-8333-0000000000ff',
      '11111111-1111-4111-8111-111111111111',
      'Jornada 4', 'Polideportivo Roco', now() + interval '14 days',
      'Los Cracks', 'Los Pachangueros', 'scheduled'
    )$$,
  'an administrator can create a match'
);

select lives_ok(
  $$insert into public.match_players (match_id, player_id, team_side)
    values (
      '33333333-3333-4333-8333-0000000000ff',
      '22222222-2222-4222-8222-000000000001',
      'home'
    )$$,
  'an administrator can select a squad'
);

with attempted as (
  delete from public.match_players
  where match_id = '33333333-3333-4333-8333-0000000000ff'
  returning 1
)
select is(
  (select count(*)::integer from attempted),
  1,
  'an administrator can remove a player from a squad'
);

select * from finish();
rollback;

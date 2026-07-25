-- ============================================================================
-- Pitch formations and slot assignment
--
-- The unique index on (match_id, team_side, pitch_slot) is what stops two
-- players occupying one position. It has to be partial, or every unplaced
-- player would collide with every other on a shared null.
-- ============================================================================

begin;
select plan(13);

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
-- Defaults and seeded state
-- ---------------------------------------------------------------------------

select is(
  (select home_formation::text from public.matches
   where id = '33333333-3333-4333-8333-000000000001'),
  '2-3-1',
  'matches default to the 2-3-1 formation'
);

select is(
  (select count(*)::integer from public.match_players
   where match_id = '33333333-3333-4333-8333-000000000001'
     and team_side = 'home'
     and pitch_slot is not null),
  7,
  'the seeded home squad is fully placed'
);

select is(
  (select p.preferred_position::text
   from public.match_players mp
   join public.players p on p.id = mp.player_id
   where mp.match_id = '33333333-3333-4333-8333-000000000001'
     and mp.team_side = 'home'
     and mp.pitch_slot = 0),
  'GK',
  'a goalkeeper takes slot 0'
);

-- ---------------------------------------------------------------------------
-- Constraints
-- ---------------------------------------------------------------------------

select throws_ok(
  $$update public.match_players
    set pitch_slot = 1
    where match_id = '33333333-3333-4333-8333-000000000001'
      and team_side = 'home'
      and pitch_slot = 2$$,
  '23505',
  null,
  'two players cannot share a slot on the same team'
);

-- The same slot number on the opposing side is a different position.
select lives_ok(
  $$update public.match_players
    set pitch_slot = 4
    where match_id = '33333333-3333-4333-8333-000000000002'
      and team_side = 'away'
      and pitch_slot = 4$$,
  'the two teams number their slots independently'
);

select throws_ok(
  $$update public.match_players
    set pitch_slot = 7
    where match_id = '33333333-3333-4333-8333-000000000001'
      and team_side = 'home'
      and pitch_slot = 1$$,
  '23514',
  null,
  'a slot above 6 is rejected'
);

select throws_ok(
  $$update public.match_players
    set pitch_slot = -1
    where match_id = '33333333-3333-4333-8333-000000000001'
      and team_side = 'home'
      and pitch_slot = 1$$,
  '23514',
  null,
  'a negative slot is rejected'
);

-- Unplaced players all share a null slot, so the index must not treat that as
-- a collision.
select lives_ok(
  $$update public.match_players
    set pitch_slot = null
    where match_id = '33333333-3333-4333-8333-000000000001'
      and team_side = 'home'$$,
  'a whole team can sit on the bench at once'
);

select is(
  (select count(*)::integer from public.match_players
   where match_id = '33333333-3333-4333-8333-000000000001'
     and team_side = 'home'
     and pitch_slot is null),
  7,
  'every one of them is unplaced'
);

-- ---------------------------------------------------------------------------
-- Authorization
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims to
  '{"sub": "99999999-9999-4999-8999-00000000000b", "role": "authenticated"}';

select ok(
  (select count(*) from public.match_players
   where pitch_slot is not null) > 0,
  'a member can read the line-ups'
);

with attempted as (
  update public.match_players
  set pitch_slot = 3
  where match_id = '33333333-3333-4333-8333-000000000002'
    and team_side = 'home'
    and pitch_slot = 1
  returning 1
)
select is(
  (select count(*)::integer from attempted),
  0,
  'a member cannot rearrange a line-up'
);

with attempted as (
  update public.matches set home_formation = '3-3'
  where id = '33333333-3333-4333-8333-000000000002'
  returning 1
)
select is(
  (select count(*)::integer from attempted),
  0,
  'a member cannot change the formation'
);

set local request.jwt.claims to
  '{"sub": "99999999-9999-4999-8999-00000000000a", "role": "authenticated"}';

with attempted as (
  update public.matches set away_formation = '1-3-2'
  where id = '33333333-3333-4333-8333-000000000002'
  returning 1
)
select is(
  (select count(*)::integer from attempted),
  1,
  'an administrator can change the formation'
);

select * from finish();
rollback;

-- ============================================================================
-- Self-service convocatorias
--
-- Migration 011 opened match_players to members for the first time, which makes
-- these the tests that stop it becoming a hole. Two rules carry the whole
-- feature and both are asserted from either side:
--
--   * a member adds themselves and nobody else, and never removes anyone
--   * once a match is played, nobody adds or removes anyone at all, and only an
--     administrator may still move people around
--
-- Player and match ids come from the real roster and fixtures loaded by
-- supabase/production; `bbbb-…-0001` is the development stack's one unplayed
-- fixture and the `4444-…` matches are all scored.
-- ============================================================================

begin;
select plan(13);

-- Cleared so this file's memberships are the only ones in the database.
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

insert into public.league_members (league_id, user_id, role)
values
  (app.initial_league_id(), '99999999-9999-4999-8999-00000000000a', 'admin'),
  (app.initial_league_id(), '99999999-9999-4999-8999-00000000000b', 'member');

-- The member plays as ALEX, who is deliberately not in the unplayed fixture's
-- squad — there would be nothing to sign up for otherwise. Linked here while
-- still holding postgres rights, because claiming a player is 008's flow and
-- not what this file is testing.
update public.players
set user_id = '99999999-9999-4999-8999-00000000000b'
where id = '55555555-5555-4555-8555-000000000004';

-- Slot 6 of the home side is freed so that the placement test below does not
-- depend on how the seed happened to number the line-up. JOAN is already on the
-- bench and is the player who will take it.
update public.match_players
set pitch_slot = null
where match_id = 'bbbbbbbb-bbbb-4bbb-8bbb-000000000001'
  and team_side = 'home'
  and pitch_slot = 6;

-- ---------------------------------------------------------------------------
-- A member, before the match is played
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims to
  '{"sub": "99999999-9999-4999-8999-00000000000b", "role": "authenticated"}';

select throws_ok(
  $$insert into public.match_players (match_id, player_id)
    values (
      'bbbbbbbb-bbbb-4bbb-8bbb-000000000001',
      '55555555-5555-4555-8555-000000000011'
    )$$,
  '42501',
  null,
  'a member cannot call anybody else up'
);

select lives_ok(
  $$insert into public.match_players (match_id, player_id)
    values (
      'bbbbbbbb-bbbb-4bbb-8bbb-000000000001',
      '55555555-5555-4555-8555-000000000004'
    )$$,
  'a member can call themselves up for a match still to be played'
);

select is(
  (select team_side::text || coalesce('/' || pitch_slot::text, '/bench')
   from public.match_players
   where match_id = 'bbbbbbbb-bbbb-4bbb-8bbb-000000000001'
     and player_id = '55555555-5555-4555-8555-000000000004'),
  'unassigned/bench',
  'they arrive with no side and no position: on the bench'
);

with attempted as (
  delete from public.match_players
  where match_id = 'bbbbbbbb-bbbb-4bbb-8bbb-000000000001'
    and player_id = '55555555-5555-4555-8555-000000000001'
  returning 1
)
select is(
  (select count(*)::integer from attempted),
  0,
  'a member cannot remove anyone from the convocatoria'
);

with attempted as (
  update public.match_players
  set pitch_slot = 6
  where match_id = 'bbbbbbbb-bbbb-4bbb-8bbb-000000000001'
    and player_id = '55555555-5555-4555-8555-000000000007'
  returning 1
)
select is(
  (select count(*)::integer from attempted),
  1,
  'a member can place another player in a free position'
);

select throws_ok(
  $$update public.match_players
    set player_id = '55555555-5555-4555-8555-000000000020'
    where match_id = 'bbbbbbbb-bbbb-4bbb-8bbb-000000000001'
      and player_id = '55555555-5555-4555-8555-000000000001'$$,
  '42501',
  null,
  'a member cannot repoint a squad row at a different player'
);

-- ---------------------------------------------------------------------------
-- The same member, once a match has been played
-- ---------------------------------------------------------------------------

select throws_ok(
  $$insert into public.match_players (match_id, player_id)
    values (
      '44444444-4444-4444-8444-000000000001',
      '55555555-5555-4555-8555-000000000004'
    )$$,
  '42501',
  null,
  'a member cannot add themselves to a match that has been played'
);

with attempted as (
  update public.match_players
  set pitch_slot = null
  where match_id = '44444444-4444-4444-8444-000000000003'
    and player_id = '55555555-5555-4555-8555-000000000022'
  returning 1
)
select is(
  (select count(*)::integer from attempted),
  0,
  'a member cannot rearrange a line-up once the match has been played'
);

-- ---------------------------------------------------------------------------
-- The administrator
-- ---------------------------------------------------------------------------

set local request.jwt.claims to
  '{"sub": "99999999-9999-4999-8999-00000000000a", "role": "authenticated"}';

select lives_ok(
  $$insert into public.match_players (match_id, player_id, team_side)
    values (
      'bbbbbbbb-bbbb-4bbb-8bbb-000000000001',
      '55555555-5555-4555-8555-000000000011',
      'away'
    )$$,
  'an administrator calls up whoever they like before the match'
);

with attempted as (
  delete from public.match_players
  where match_id = 'bbbbbbbb-bbbb-4bbb-8bbb-000000000001'
    and player_id = '55555555-5555-4555-8555-000000000011'
  returning 1
)
select is(
  (select count(*)::integer from attempted),
  1,
  'and removes them again'
);

select throws_ok(
  $$insert into public.match_players (match_id, player_id)
    values (
      '44444444-4444-4444-8444-000000000001',
      '55555555-5555-4555-8555-000000000011'
    )$$,
  '42501',
  null,
  'not even an administrator adds a player to a match already played'
);

with attempted as (
  delete from public.match_players
  where match_id = '44444444-4444-4444-8444-000000000001'
    and player_id = '55555555-5555-4555-8555-000000000007'
  returning 1
)
select is(
  (select count(*)::integer from attempted),
  0,
  'nor removes one: the squad is the record of who turned up'
);

-- The one thing that stays open afterwards, so a line-up can be corrected to
-- what actually happened on the pitch.
with attempted as (
  update public.match_players
  set pitch_slot = null
  where match_id = '44444444-4444-4444-8444-000000000003'
    and player_id = '55555555-5555-4555-8555-000000000022'
  returning 1
)
select is(
  (select count(*)::integer from attempted),
  1,
  'an administrator can still rearrange a played line-up'
);

select * from finish();
rollback;

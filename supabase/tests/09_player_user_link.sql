-- ============================================================================
-- One account, one player
--
-- Registration is no longer a way into the league: an account arrives with
-- nothing and has to claim a player. These are the tests that stop that flow
-- becoming a hole — two accounts must not share a player, and a member editing
-- their own card must not be able to reach anything else.
-- ============================================================================

begin;
select plan(21);

delete from public.league_members;

-- Unlike every other test file, this one needs the *real* owner address rather
-- than something @test.local — the trigger recognises that one and nothing
-- else. So it has to make room for it: whoever runs this locally has very
-- probably registered that account already. Rolled back with the rest.
delete from auth.users where lower(email) = app.owner_email();

-- The owner. app.handle_new_user recognises this address and nobody else.
insert into auth.users (id, instance_id, aud, role, email)
values (
  '99999999-9999-4999-8999-00000000000c',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'dcastellotejera@gmail.com'
);

insert into auth.users (id, instance_id, aud, role, email)
values (
  '99999999-9999-4999-8999-00000000000d',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'one@test.local'
);

insert into auth.users (id, instance_id, aud, role, email)
values (
  '99999999-9999-4999-8999-00000000000e',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'two@test.local'
);

-- ---------------------------------------------------------------------------
-- Bootstrap
-- ---------------------------------------------------------------------------

select is(
  (select role::text from public.league_members
   where user_id = '99999999-9999-4999-8999-00000000000c'),
  'admin',
  'the owner address administers the initial league on sign-up'
);

select is(
  (select count(*)::integer from public.league_members
   where user_id = '99999999-9999-4999-8999-00000000000d'),
  0,
  'any other account registers with no membership at all'
);

-- ---------------------------------------------------------------------------
-- Choosing a league and a player
--
-- The seed has 16 players, of whom 15 are active. None start out claimed.
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims to
  '{"sub": "99999999-9999-4999-8999-00000000000d", "role": "authenticated"}';

select is(
  (select title from public.list_joinable_leagues()),
  'Liga de verano roco',
  'an account with no membership can still see which leagues exist'
);

select is(
  (select unclaimed_player_count from public.list_joinable_leagues()),
  15,
  'the listing counts the players still waiting for an owner'
);

select is(
  (select count(*)::integer from public.list_unclaimed_players(
     '11111111-1111-4111-8111-111111111111')),
  15,
  'the roster to pick from is every active, unclaimed player'
);

select ok(
  not exists (
    select 1 from public.list_unclaimed_players(
      '11111111-1111-4111-8111-111111111111')
    where player_code = 'PLR-R6Y7'
  ),
  'a deactivated player is not offered'
);

-- ---------------------------------------------------------------------------
-- Claiming
-- ---------------------------------------------------------------------------

select public.join_league_as_player(
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-000000000002'
);

select is(
  (select user_id from public.players
   where id = '22222222-2222-4222-8222-000000000002'),
  '99999999-9999-4999-8999-00000000000d'::uuid,
  'claiming links the player to the account'
);

select is(
  (select role::text from public.league_members
   where user_id = '99999999-9999-4999-8999-00000000000d'),
  'member',
  'claiming joins the league as an ordinary member'
);

select is(
  (select count(*)::integer from public.list_unclaimed_players(
     '11111111-1111-4111-8111-111111111111')),
  14,
  'a claimed player leaves the roster'
);

select throws_ok(
  $$select public.join_league_as_player(
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-000000000003')$$,
  '23505',
  null,
  'an account that already plays cannot claim a second player'
);

-- The conditional UPDATE inside join_league_as_player is what makes this safe
-- under concurrency; here it is simply the second caller losing.
set local request.jwt.claims to
  '{"sub": "99999999-9999-4999-8999-00000000000e", "role": "authenticated"}';

select throws_ok(
  $$select public.join_league_as_player(
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-000000000002')$$,
  '23514',
  null,
  'a player already claimed cannot be claimed again'
);

-- ---------------------------------------------------------------------------
-- Arriving without a player on the roster
-- ---------------------------------------------------------------------------

select lives_ok(
  $$select public.create_player_and_join(
      '11111111-1111-4111-8111-111111111111',
      'Nuevo', 'Fichaje', null, 'ST'::public.player_position)$$,
  'an account with nothing to claim can create its own player'
);

select matches(
  (select player_code from public.players
   where user_id = '99999999-9999-4999-8999-00000000000e'),
  '^PLR-[A-Z0-9]{4}$',
  'the new player gets a generated import code'
);

select is(
  (select role::text from public.league_members
   where user_id = '99999999-9999-4999-8999-00000000000e'),
  'member',
  'creating a player also joins the league'
);

-- ---------------------------------------------------------------------------
-- Editing your own player, and only your own
-- ---------------------------------------------------------------------------

set local request.jwt.claims to
  '{"sub": "99999999-9999-4999-8999-00000000000d", "role": "authenticated"}';

select public.update_own_player_profile(
  '22222222-2222-4222-8222-000000000002',
  'Juan', 'García', 'Juanito el Grande', 'CB'::public.player_position
);

select is(
  (select nickname || ' / ' || preferred_position::text from public.players
   where id = '22222222-2222-4222-8222-000000000002'),
  'Juanito el Grande / CB',
  'a member can rename and reposition their own player'
);

select throws_ok(
  $$select public.update_own_player_profile(
      '22222222-2222-4222-8222-000000000003',
      'Robado', 'Ajeno', null, 'GK'::public.player_position)$$,
  '42501',
  null,
  'a member cannot edit somebody else''s player'
);

-- The function exists precisely because RLS cannot restrict columns. This is
-- the check that the broad table policy still refuses a member outright.
with attempted as (
  update public.players
  set player_code = 'PLR-ZZZZ', is_active = false
  where id = '22222222-2222-4222-8222-000000000002'
  returning 1
)
select is(
  (select count(*)::integer from attempted),
  0,
  'a member cannot reach player_code or is_active through the table'
);

-- ---------------------------------------------------------------------------
-- Photographs
-- ---------------------------------------------------------------------------

select is(
  public.set_own_player_avatar(
    '22222222-2222-4222-8222-000000000002', 'jpg'),
  '11111111-1111-4111-8111-111111111111/'
    || '22222222-2222-4222-8222-000000000002.jpg',
  'the avatar path is derived from the league and player, never from input'
);

select is(
  (select avatar_path from public.players
   where id = '22222222-2222-4222-8222-000000000002'),
  '11111111-1111-4111-8111-111111111111/'
    || '22222222-2222-4222-8222-000000000002.jpg',
  'and recorded on the card'
);

select throws_ok(
  $$select public.set_own_player_avatar(
      '22222222-2222-4222-8222-000000000002', 'svg')$$,
  '23514',
  null,
  'an unsupported image type is refused'
);

-- ---------------------------------------------------------------------------
-- The owner picks their player too
--
-- They are already an administrator, so the join must not quietly demote them
-- to member on the way through.
-- ---------------------------------------------------------------------------

set local request.jwt.claims to
  '{"sub": "99999999-9999-4999-8999-00000000000c", "role": "authenticated"}';

select public.join_league_as_player(
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-000000000001'
);

select is(
  (select role::text from public.league_members
   where user_id = '99999999-9999-4999-8999-00000000000c'),
  'admin',
  'the owner stays an administrator after claiming their player'
);

select * from finish();
rollback;

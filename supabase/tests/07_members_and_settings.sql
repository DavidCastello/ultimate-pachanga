-- ============================================================================
-- Member directory and league settings
--
-- The member screen is the one place the application reads email addresses, and
-- the one place an administrator can lock themselves out of their own league.
-- Both are covered here.
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
-- list_league_members
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims to
  '{"sub": "99999999-9999-4999-8999-00000000000a", "role": "authenticated"}';

select is(
  (select count(*)::integer from public.list_league_members(
     '11111111-1111-4111-8111-111111111111')),
  2,
  'an administrator can list every member of the league'
);

select is(
  (select email from public.list_league_members(
     '11111111-1111-4111-8111-111111111111') where role = 'admin'),
  'admin@test.local',
  'the listing includes email addresses, which are not otherwise exposed'
);

select ok(
  (select is_self from public.list_league_members(
     '11111111-1111-4111-8111-111111111111')
   where email = 'admin@test.local'),
  'the caller''s own row is marked'
);

select ok(
  (select not is_self from public.list_league_members(
     '11111111-1111-4111-8111-111111111111')
   where email = 'member@test.local'),
  'other members are not marked as the caller'
);

-- The function is SECURITY DEFINER, so its own authorization check is the only
-- thing standing between a member and everyone's email address.
set local request.jwt.claims to
  '{"sub": "99999999-9999-4999-8999-00000000000b", "role": "authenticated"}';

select throws_ok(
  $$select * from public.list_league_members(
      '11111111-1111-4111-8111-111111111111')$$,
  '42501',
  null,
  'a member cannot list the league''s members'
);

-- auth.users must stay unreachable through the API regardless.
select throws_ok(
  $$select email from auth.users$$,
  '42501',
  null,
  'a member cannot read auth.users directly'
);

set local request.jwt.claims to
  '{"sub": "99999999-9999-4999-8999-00000000000a", "role": "authenticated"}';

select throws_ok(
  $$select email from auth.users$$,
  '42501',
  null,
  'not even an administrator can read auth.users directly'
);

-- ---------------------------------------------------------------------------
-- League settings
-- ---------------------------------------------------------------------------

with attempted as (
  update public.leagues
  set title = 'Liga renombrada',
      market_constant_gbp = 2000000
  where id = '11111111-1111-4111-8111-111111111111'
  returning 1
)
select is(
  (select count(*)::integer from attempted),
  1,
  'an administrator can change the league settings'
);

-- Market values are derived, so a new constant applies immediately with
-- nothing to re-import.
select is(
  (select market_value_gbp from public.player_market_values mv
   join public.players p on p.id = mv.player_id
   where p.player_code = 'PLR-K1Q2'),
  19750000.00::numeric,
  'doubling the market constant doubles every valuation at once'
);

set local request.jwt.claims to
  '{"sub": "99999999-9999-4999-8999-00000000000b", "role": "authenticated"}';

with attempted as (
  update public.leagues
  set market_constant_gbp = 1
  where id = '11111111-1111-4111-8111-111111111111'
  returning 1
)
select is(
  (select count(*)::integer from attempted),
  0,
  'a member cannot change the league settings'
);

-- ---------------------------------------------------------------------------
-- The league must keep an administrator
--
-- RLS lets an administrator manage memberships including their own, so without
-- this guard the last administrator could demote themselves and leave the
-- league permanently unmanageable.
-- ---------------------------------------------------------------------------

set local request.jwt.claims to
  '{"sub": "99999999-9999-4999-8999-00000000000a", "role": "authenticated"}';

select throws_ok(
  $$update public.league_members set role = 'member' where role = 'admin'$$,
  '23514',
  null,
  'the only administrator cannot demote themselves'
);

select throws_ok(
  $$delete from public.league_members where role = 'admin'$$,
  '23514',
  null,
  'the only administrator cannot remove themselves'
);

select is(
  (select role::text from public.league_members
   where user_id = '99999999-9999-4999-8999-00000000000a'),
  'admin',
  'the administrator is still an administrator after those attempts'
);

-- Swapping who administers in one statement is legitimate and must work.
select lives_ok(
  $$update public.league_members
    set role = case when role = 'admin'
                    then 'member'::public.member_role
                    else 'admin'::public.member_role end$$,
  'the administrator role can be handed over in a single statement'
);

-- Checked without the caller's own RLS view: having handed the role over, they
-- are now an ordinary member and can no longer see anyone else's membership,
-- which is the policy working correctly.
reset role;

select is(
  (select role::text from public.league_members
   where user_id = '99999999-9999-4999-8999-00000000000b'),
  'admin',
  'the other member is now the administrator'
);

-- Removing an ordinary member is unaffected by the guard.
select lives_ok(
  $$delete from public.league_members
    where user_id = '99999999-9999-4999-8999-00000000000a'$$,
  'an ordinary member can be removed'
);

select * from finish();
rollback;

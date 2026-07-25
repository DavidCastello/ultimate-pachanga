-- ============================================================================
-- RLS: players
--
-- The browser holds only the publishable key, so these policies are the whole
-- authorization boundary for player management. A member must not be able to
-- create, rename or deactivate a player no matter what the UI allows.
-- ============================================================================

begin;
select plan(16);

-- ---------------------------------------------------------------------------
-- Two accounts. The first to register becomes administrator of the initial
-- league (app.handle_new_user), so insert order is significant.
--
-- Membership is cleared first so the trigger's decision does not depend on
-- whoever happens to have signed up in this database already. Everything here
-- is rolled back at the end of the file.
-- ---------------------------------------------------------------------------

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

select is(
  (select role::text from public.league_members
   where user_id = '99999999-9999-4999-8999-00000000000a'),
  'admin',
  'the first registered account becomes the league administrator'
);

select is(
  (select role::text from public.league_members
   where user_id = '99999999-9999-4999-8999-00000000000b'),
  'member',
  'subsequent accounts join as members'
);

select ok(
  (select bool_and(rowsecurity) from pg_tables
   where schemaname = 'public'
     and tablename in (
       'leagues', 'league_members', 'league_metrics', 'league_attributes',
       'players', 'matches', 'match_players', 'player_match_scores',
       'player_match_score_attributes'
     )),
  'row level security is enabled on every public table'
);

-- Every route requires a session, so the anonymous role should hold nothing.
select is(
  (select count(*)::integer from information_schema.role_table_grants
   where grantee = 'anon' and table_schema = 'public'),
  0,
  'the anon role has no privileges on anything in public'
);

-- A view without security_invoker runs as its owner and silently bypasses RLS
-- on its base tables, which the browser queries directly.
select ok(
  (select bool_and(c.reloptions::text like '%security_invoker=true%')
   from pg_class c
   join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'v'),
  'every public view runs with security_invoker'
);

-- ---------------------------------------------------------------------------
-- Member
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims to
  '{"sub": "99999999-9999-4999-8999-00000000000b", "role": "authenticated"}';

select ok(
  (select count(*) from public.players) > 0,
  'a member can read the player roster'
);

select throws_ok(
  $$insert into public.players
      (league_id, player_code, first_name, last_name, preferred_position)
    values (
      '11111111-1111-4111-8111-111111111111',
      'PLR-HACK1', 'Mallory', 'Member', 'ST'
    )$$,
  '42501',
  null,
  'a member cannot create a player'
);

-- An UPDATE filtered out by a USING clause affects zero rows rather than
-- raising, so the assertion has to be about rows changed.
with attempted as (
  update public.players
  set first_name = 'Renamed'
  where player_code = 'PLR-A7K2'
  returning 1
)
select is(
  (select count(*)::integer from attempted),
  0,
  'a member cannot rename a player'
);

with attempted as (
  update public.players
  set is_active = false
  where player_code = 'PLR-A7K2'
  returning 1
)
select is(
  (select count(*)::integer from attempted),
  0,
  'a member cannot deactivate a player'
);

select is(
  (select first_name from public.players where player_code = 'PLR-A7K2'),
  'David',
  'the player is unchanged after the member attempts'
);

-- Nobody is granted DELETE on players: history must stay resolvable, so the
-- application deactivates instead.
select throws_ok(
  $$delete from public.players where player_code = 'PLR-A7K2'$$,
  '42501',
  null,
  'a member cannot delete a player'
);

-- ---------------------------------------------------------------------------
-- Administrator
-- ---------------------------------------------------------------------------

set local request.jwt.claims to
  '{"sub": "99999999-9999-4999-8999-00000000000a", "role": "authenticated"}';

select lives_ok(
  $$insert into public.players
      (league_id, player_code, first_name, last_name, preferred_position)
    values (
      '11111111-1111-4111-8111-111111111111',
      'PLR-NEW01', 'Nuevo', 'Jugador', 'CM'
    )$$,
  'an administrator can create a player'
);

with attempted as (
  update public.players
  set nickname = 'El Nuevo'
  where player_code = 'PLR-NEW01'
  returning 1
)
select is(
  (select count(*)::integer from attempted),
  1,
  'an administrator can update a player'
);

with attempted as (
  update public.players
  set is_active = false
  where player_code = 'PLR-NEW01'
  returning 1
)
select is(
  (select count(*)::integer from attempted),
  1,
  'an administrator can deactivate a player'
);

select throws_ok(
  $$delete from public.players where player_code = 'PLR-NEW01'$$,
  '42501',
  null,
  'not even an administrator can delete a player'
);

-- ---------------------------------------------------------------------------
-- Cross-league isolation
-- ---------------------------------------------------------------------------

reset role;

insert into public.leagues (id, title)
values ('44444444-4444-4444-8444-000000000001', 'Otra liga');

insert into public.players
  (league_id, player_code, first_name, last_name, preferred_position)
values (
  '44444444-4444-4444-8444-000000000001',
  'PLR-OTHER', 'Ajeno', 'Jugador', 'ST'
);

set local role authenticated;
set local request.jwt.claims to
  '{"sub": "99999999-9999-4999-8999-00000000000a", "role": "authenticated"}';

select is(
  (select count(*)::integer from public.players
   where player_code = 'PLR-OTHER'),
  0,
  'an administrator of one league cannot see another league''s players'
);

select * from finish();
rollback;

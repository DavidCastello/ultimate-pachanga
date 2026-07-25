-- ============================================================================
-- Match photographs
--
-- Two things carry the feature and both are asserted from either side: a match
-- starts with no photograph of its own — the app falls back to the bundled
-- picture for its location — and only an administrator may give it one, in the
-- table and in the bucket alike.
--
-- Match ids come from the real fixtures loaded by supabase/production.
-- ============================================================================

begin;
select plan(8);

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

-- ---------------------------------------------------------------------------
-- The default
-- ---------------------------------------------------------------------------

select is(
  (select count(*)::integer from public.matches where photo_path is not null),
  0,
  'a match starts with no photograph of its own'
);

select throws_ok(
  $$update public.matches set photo_path = '   '
    where id = '44444444-4444-4444-8444-000000000002'$$,
  '23514',
  null,
  'a blank photograph path is rejected'
);

-- ---------------------------------------------------------------------------
-- Authorization on the match row
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims to
  '{"sub": "99999999-9999-4999-8999-00000000000b", "role": "authenticated"}';

with attempted as (
  update public.matches set photo_path = 'somewhere/else.webp'
  where id = '44444444-4444-4444-8444-000000000002'
  returning 1
)
select is(
  (select count(*)::integer from attempted),
  0,
  'a member cannot set the photograph'
);

set local request.jwt.claims to
  '{"sub": "99999999-9999-4999-8999-00000000000a", "role": "authenticated"}';

with attempted as (
  update public.matches
  set photo_path =
    '11111111-1111-4111-8111-111111111111'
    || '/44444444-4444-4444-8444-000000000002.webp'
  where id = '44444444-4444-4444-8444-000000000002'
  returning 1
)
select is(
  (select count(*)::integer from attempted),
  1,
  'an administrator can set the photograph'
);

-- ---------------------------------------------------------------------------
-- Authorization on the object
--
-- The path is `{league_id}/{match_id}.{ext}`, so the policies authorize by the
-- first segment without a lookup table.
-- ---------------------------------------------------------------------------

select lives_ok(
  $$insert into storage.objects (bucket_id, name)
    values (
      'match-photos',
      '11111111-1111-4111-8111-111111111111'
        || '/44444444-4444-4444-8444-000000000002.webp'
    )$$,
  'an administrator can upload a match photograph'
);

set local request.jwt.claims to
  '{"sub": "99999999-9999-4999-8999-00000000000b", "role": "authenticated"}';

select throws_ok(
  $$insert into storage.objects (bucket_id, name)
    values (
      'match-photos',
      '11111111-1111-4111-8111-111111111111'
        || '/44444444-4444-4444-8444-000000000003.webp'
    )$$,
  '42501',
  null,
  'a member cannot upload a match photograph'
);

select is(
  (select count(*)::integer from storage.objects
   where bucket_id = 'match-photos'),
  1,
  'a member can still see the photographs'
);

-- A path whose first segment is not a league is nobody's to write, and the
-- UUID cast must fail the policy rather than raise.
set local request.jwt.claims to
  '{"sub": "99999999-9999-4999-8999-00000000000a", "role": "authenticated"}';

select throws_ok(
  $$insert into storage.objects (bucket_id, name)
    values ('match-photos', 'not-a-league/photo.webp')$$,
  '42501',
  null,
  'an unrooted path is refused, not a cast error'
);

select * from finish();
rollback;

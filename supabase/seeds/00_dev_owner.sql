-- ============================================================================
-- Development seed — the owner's account
--
-- Development only. Production has no equivalent: there the owner registers
-- through the app like anybody else.
--
-- Two reasons this exists rather than being registered by hand after every
-- reset. The obvious one is convenience — `db reset` used to leave you with no
-- way into the app until you signed up again. The load-bearing one is that
-- `production/03_results.sql` runs the real import as the owner, and refuses to
-- run at all without that account, so seeding the real results depends on this
-- file having run first. See [db.seed] sql_paths in config.toml for the order.
--
-- Sign in as:
--
--   dcastellotejera@gmail.com  /  pachanga
--
-- Safe to hardcode because it is unreachable from anywhere but this machine:
-- seed files never run against a deployed project, and `supabase db push` does
-- not carry them.
--
-- app.handle_new_user (migration 008) recognises this address and grants it
-- administrator rights on the initial league. No player is claimed — that is
-- the join flow's job, and leaving it undone means the flow can actually be
-- walked through locally.
-- ============================================================================

insert into auth.users (
  id,
  instance_id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at,
  -- Empty strings rather than the nulls the columns allow. GoTrue scans these
  -- into plain Go strings, so a null makes every sign-in fail with "Database
  -- error querying schema" — which says nothing about the actual cause and
  -- costs an hour to find. They are nullable only because the schema is older
  -- than the code reading it.
  confirmation_token,
  recovery_token,
  email_change_token_new,
  email_change,
  email_change_token_current,
  phone_change_token,
  reauthentication_token
)
values (
  'aaaaaaaa-aaaa-4aaa-8aaa-000000000001',
  '00000000-0000-0000-0000-000000000000',
  'authenticated',
  'authenticated',
  'dcastellotejera@gmail.com',
  extensions.crypt('pachanga', extensions.gen_salt('bf')),
  -- Confirmed, because an unconfirmed address cannot sign in and email
  -- confirmation is on locally. Without this, `db reset` would leave the owner
  -- locked out and production/03_results.sql with nobody to import as.
  now(),
  '{"provider": "email", "providers": ["email"]}'::jsonb,
  '{}'::jsonb,
  now(),
  now(),
  '', '', '', '', '', '', ''
)
on conflict (id) do nothing;

-- GoTrue resolves a password sign-in through auth.identities, not auth.users
-- alone: without this row the account exists but cannot log in.
insert into auth.identities (
  provider_id, user_id, identity_data, provider, last_sign_in_at,
  created_at, updated_at
)
values (
  'aaaaaaaa-aaaa-4aaa-8aaa-000000000001',
  'aaaaaaaa-aaaa-4aaa-8aaa-000000000001',
  '{"sub": "aaaaaaaa-aaaa-4aaa-8aaa-000000000001",
    "email": "dcastellotejera@gmail.com",
    "email_verified": true,
    "phone_verified": false}'::jsonb,
  'email',
  now(),
  now(),
  now()
)
on conflict (provider_id, provider) do nothing;

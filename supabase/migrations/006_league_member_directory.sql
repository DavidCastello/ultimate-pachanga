-- ============================================================================
-- 006 — League member directory
--
-- Managing members means seeing who they are, but `auth.users` is not exposed
-- to the API and must not be: it holds password hashes, recovery tokens and
-- confirmation state.
--
-- So email addresses are surfaced through one narrow SECURITY DEFINER function
-- that returns only the columns the admin screen needs, and only to an
-- administrator of the league in question. A view would not do — a view over
-- auth.users either bypasses RLS entirely (no security_invoker) or is
-- unreadable by `authenticated` (with it).
-- ============================================================================

create function public.list_league_members(p_league_id uuid)
returns table (
  member_id uuid,
  user_id uuid,
  email text,
  role public.member_role,
  joined_at timestamptz,
  is_self boolean
)
  language plpgsql
  stable
  security definer
  set search_path = ''
as $$
begin
  if not public.is_league_admin(p_league_id) then
    raise exception 'Only league administrators may list members'
      using errcode = 'insufficient_privilege';
  end if;

  return query
  select
    m.id,
    m.user_id,
    u.email::text,
    m.role,
    m.created_at,
    m.user_id = auth.uid()
  from public.league_members m
  join auth.users u on u.id = m.user_id
  where m.league_id = p_league_id
  order by m.role, u.email;
end;
$$;

comment on function public.list_league_members is
  'Members of a league with their email addresses, for the admin screen. '
  'SECURITY DEFINER because auth.users is deliberately not exposed to the API; '
  'refuses any caller who is not an administrator of the league.';

revoke all on function public.list_league_members(uuid) from public;
grant execute on function public.list_league_members(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Guard against removing the last administrator
--
-- The RLS policies let an administrator manage memberships, which includes
-- their own. Demoting or deleting the only administrator would leave the
-- league permanently unmanageable, with no way back through the interface.
-- ---------------------------------------------------------------------------

-- Statement-level rather than row-level, so a single statement that swaps which
-- account is administrator passes: the check runs once, after every row has
-- been written.
--
-- Deliberately not a DEFERRABLE constraint trigger. Deferring to COMMIT would
-- mean the check never runs in a transaction that rolls back, which makes it
-- untestable and its timing surprising.
--
-- SECURITY DEFINER is essential, not incidental. An administrator who deletes
-- their own membership immediately stops satisfying is_league_admin(), so the
-- RLS policies on league_members would hide every remaining row from this
-- function — it would see an empty league, conclude there is nothing to
-- protect, and allow exactly the case it exists to prevent. An integrity check
-- has to evaluate against the real table, not the caller's filtered view.
create function app.assert_every_league_keeps_an_admin() returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_orphaned_league uuid;
begin
  select l.id into v_orphaned_league
  from public.leagues l
  where exists (
          select 1 from public.league_members m where m.league_id = l.id
        )
    and not exists (
          select 1 from public.league_members m
          where m.league_id = l.id and m.role = 'admin'
        )
  limit 1;

  if v_orphaned_league is not null then
    raise exception
      'League % must keep at least one administrator', v_orphaned_league
      using errcode = 'check_violation';
  end if;

  return null;
end;
$$;

create trigger league_members_keep_an_admin
  after update or delete on public.league_members
  for each statement
  execute function app.assert_every_league_keeps_an_admin();

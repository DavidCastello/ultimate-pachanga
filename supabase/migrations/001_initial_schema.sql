-- ============================================================================
-- 001 — Initial schema
--
-- Tables, enums, constraints and the reference data the application cannot
-- function without (the league itself, its metrics and its attributes).
--
-- Development-only data (players, matches, scores) lives in supabase/seed.sql
-- so that this migration can be applied to production unchanged.
--
-- The schema is multi-league throughout even though the MVP interface exposes
-- a single league.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Fixed identifiers
--
-- The initial league and its reference rows use hardcoded UUIDs so that
-- seed.sql, the pgTAP tests and the new-user trigger can all reference them
-- without a lookup.
-- ---------------------------------------------------------------------------

create schema if not exists app;

comment on schema app is
  'Internal helpers and constants. Not exposed through the Supabase API.';

create function app.initial_league_id() returns uuid
  language sql immutable
  set search_path = ''
as $$ select '11111111-1111-4111-8111-111111111111'::uuid $$;

comment on function app.initial_league_id is
  'The league created by this migration. The MVP interface shows exactly one '
  'league; this is it.';

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

create type public.league_category as enum ('football_7');

create type public.league_status as enum ('active', 'inactive');

create type public.member_role as enum ('admin', 'member');

-- Fútbol 7 positions. UT covers versatile players; the MVP stores exactly one
-- preferred position per player.
create type public.player_position as enum (
  'GK',   -- goalkeeper
  'CB',   -- centre-back
  'LB',   -- left-back
  'RB',   -- right-back
  'CDM',  -- defensive midfielder
  'CM',   -- central midfielder
  'CAM',  -- attacking midfielder
  'LW',   -- left winger
  'RW',   -- right winger
  'ST',   -- striker
  'UT'    -- utility / versatile
);

create type public.match_status as enum (
  'draft',
  'scheduled',
  'played',
  'scored',
  'cancelled'
);

create type public.team_side as enum ('home', 'away', 'unassigned');

create type public.attendance_status as enum (
  'called_up',
  'confirmed',
  'played',
  'absent'
);

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------

create function app.touch_updated_at() returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- leagues
-- ---------------------------------------------------------------------------

create table public.leagues (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(btrim(title)) > 0),
  category public.league_category not null default 'football_7',
  status public.league_status not null default 'active',
  -- Multiplier turning a weighted performance score into a market value.
  market_constant_gbp numeric(14, 2) not null default 1000000
    check (market_constant_gbp >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger leagues_touch_updated_at
  before update on public.leagues
  for each row execute function app.touch_updated_at();

-- ---------------------------------------------------------------------------
-- league_members
--
-- Maps Supabase auth users onto leagues with a role. This table is the source
-- of truth for authorization; see 002_rls_policies.sql.
-- ---------------------------------------------------------------------------

create table public.league_members (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.member_role not null default 'member',
  created_at timestamptz not null default now(),
  unique (league_id, user_id)
);

create index league_members_user_id_idx
  on public.league_members (user_id);

-- ---------------------------------------------------------------------------
-- league_metrics
--
-- The scored dimensions of a performance, configurable per league. Because
-- they are configurable, scores are stored as JSONB keyed by `code` rather
-- than as fixed columns.
-- ---------------------------------------------------------------------------

create table public.league_metrics (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues (id) on delete cascade,
  code text not null check (code ~ '^[a-z][a-z0-9_]*$'),
  label text not null check (length(btrim(label)) > 0),
  display_order integer not null,
  minimum_score numeric(6, 2) not null default 0,
  maximum_score numeric(6, 2) not null default 10,
  is_active boolean not null default true,
  unique (league_id, code),
  constraint league_metrics_range_ordered
    check (minimum_score < maximum_score)
);

create index league_metrics_active_idx
  on public.league_metrics (league_id, display_order)
  where is_active;

-- ---------------------------------------------------------------------------
-- league_attributes
--
-- Awards and penalties applied on top of the metric average. Points may be
-- negative, and a player may receive several in one match.
-- ---------------------------------------------------------------------------

create table public.league_attributes (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues (id) on delete cascade,
  code text not null check (code ~ '^[a-z][a-z0-9_]*$'),
  label text not null check (length(btrim(label)) > 0),
  points integer not null,
  is_active boolean not null default true,
  unique (league_id, code)
);

create index league_attributes_active_idx
  on public.league_attributes (league_id)
  where is_active;

-- ---------------------------------------------------------------------------
-- players
--
-- Players are league records, not user accounts: most players never sign in.
-- Anyone with match history is deactivated rather than deleted, so historical
-- scores keep resolving.
-- ---------------------------------------------------------------------------

create table public.players (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues (id) on delete cascade,
  -- Stable, human-safe key used to match rows during CSV import. Names are
  -- never used as identifiers.
  player_code text not null check (player_code ~ '^[A-Z0-9-]{3,20}$'),
  first_name text not null check (length(btrim(first_name)) > 0),
  last_name text not null check (length(btrim(last_name)) > 0),
  nickname text,
  preferred_position public.player_position not null,
  -- Path within the `player-avatars` storage bucket, null when the card falls
  -- back to initials.
  avatar_path text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (league_id, player_code)
);

create index players_league_active_idx
  on public.players (league_id, is_active);

create trigger players_touch_updated_at
  before update on public.players
  for each row execute function app.touch_updated_at();

-- ---------------------------------------------------------------------------
-- matches
-- ---------------------------------------------------------------------------

create table public.matches (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues (id) on delete cascade,
  title text not null check (length(btrim(title)) > 0),
  location text not null check (length(btrim(location)) > 0),
  played_at timestamptz not null,
  home_team_name text not null check (length(btrim(home_team_name)) > 0),
  away_team_name text not null check (length(btrim(away_team_name)) > 0),
  status public.match_status not null default 'draft',
  results_imported_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- `scored` is set by import_match_scores, which always stamps the time.
  constraint matches_scored_has_import_time
    check (status <> 'scored' or results_imported_at is not null)
);

create index matches_league_played_at_idx
  on public.matches (league_id, played_at desc);

create trigger matches_touch_updated_at
  before update on public.matches
  for each row execute function app.touch_updated_at();

-- A new match may only be created while its league is active. Enforced by
-- trigger rather than CHECK because it spans two tables.
create function app.assert_league_active() returns trigger
  language plpgsql
  set search_path = ''
as $$
declare
  v_status public.league_status;
begin
  select status into v_status
  from public.leagues
  where id = new.league_id;

  if v_status <> 'active' then
    raise exception
      'Cannot create a match in league % because it is not active (status: %)',
      new.league_id, v_status
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create trigger matches_assert_league_active
  before insert on public.matches
  for each row execute function app.assert_league_active();

-- ---------------------------------------------------------------------------
-- match_players
--
-- The convocated squad. Only players listed here may receive a score for the
-- match; import_match_scores enforces that.
-- ---------------------------------------------------------------------------

create table public.match_players (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches (id) on delete cascade,
  player_id uuid not null references public.players (id) on delete cascade,
  team_side public.team_side not null default 'unassigned',
  attendance_status public.attendance_status not null default 'called_up',
  created_at timestamptz not null default now(),
  unique (match_id, player_id)
);

create index match_players_player_id_idx
  on public.match_players (player_id);

-- ---------------------------------------------------------------------------
-- player_match_scores
--
-- One row per player per match. base_score, attribute_points and final_score
-- are derived during import and stored so that historical scores stay stable
-- if a league's metrics or attribute values are later reconfigured.
-- ---------------------------------------------------------------------------

create table public.player_match_scores (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches (id) on delete cascade,
  player_id uuid not null references public.players (id) on delete cascade,
  -- Keyed by league_metrics.code, e.g. {"attack": 6, "defence": 9}.
  -- Validated by import_match_scores against the league's active metrics.
  metric_scores jsonb not null check (jsonb_typeof(metric_scores) = 'object'),
  base_score numeric(6, 3) not null,
  attribute_points integer not null default 0,
  -- Intentionally unbounded: attributes can push a score above the metric
  -- maximum or below zero.
  final_score numeric(6, 3) not null,
  imported_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (match_id, player_id)
);

create index player_match_scores_player_id_idx
  on public.player_match_scores (player_id);

create trigger player_match_scores_touch_updated_at
  before update on public.player_match_scores
  for each row execute function app.touch_updated_at();

-- ---------------------------------------------------------------------------
-- player_match_score_attributes
-- ---------------------------------------------------------------------------

create table public.player_match_score_attributes (
  id uuid primary key default gen_random_uuid(),
  player_match_score_id uuid not null
    references public.player_match_scores (id) on delete cascade,
  league_attribute_id uuid not null
    references public.league_attributes (id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (player_match_score_id, league_attribute_id)
);

create index player_match_score_attributes_attribute_idx
  on public.player_match_score_attributes (league_attribute_id);

-- ============================================================================
-- Reference data
-- ============================================================================

insert into public.leagues (id, title, category, status, market_constant_gbp)
values (
  app.initial_league_id(),
  'Liga de verano roco',
  'football_7',
  'active',
  1000000
);

insert into public.league_metrics
  (league_id, code, label, display_order, minimum_score, maximum_score)
values
  (app.initial_league_id(), 'attack',   'Ataque',  1, 0, 10),
  (app.initial_league_id(), 'defence',  'Defensa', 2, 0, 10),
  (app.initial_league_id(), 'tactics',  'Táctica', 3, 0, 10),
  (app.initial_league_id(), 'physical', 'Físico',  4, 0, 10);

insert into public.league_attributes (league_id, code, label, points)
values
  (app.initial_league_id(), 'mvp',        'MVP',                 2),
  (app.initial_league_id(), 'revelation', 'Jugador revelación',  2),
  (app.initial_league_id(), 'zamora',     'Zamora',              2),
  (app.initial_league_id(), 'puskas',     'Puskas',              2),
  (app.initial_league_id(), 'injury',     'Lesión',             -2);

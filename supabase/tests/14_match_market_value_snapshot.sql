-- ============================================================================
-- What each side was worth
--
-- The point of the column is that it does not move. Everything below is a way
-- of asking that: the frozen figure has to be what the player was worth
-- *before* the import, it has to survive a correction, and it has to cover the
-- whole convocatoria rather than whoever happened to be scored first.
--
-- Jornada 5 comes from supabase/seeds — scheduled, fully squadded, no results.
-- ============================================================================

begin;
select plan(10);

-- Cleared so this file's memberships are the only ones in the database.
delete from public.league_members;

insert into auth.users (id, instance_id, aud, role, email)
values
  ('99999999-9999-4999-8999-00000000000a',
   '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'admin@test.local'),
  ('99999999-9999-4999-8999-00000000000b',
   '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'member@test.local');

-- Registering grants nothing since 008, so both memberships are explicit.
insert into public.league_members (league_id, user_id, role)
values
  (app.initial_league_id(), '99999999-9999-4999-8999-00000000000a', 'admin'),
  (app.initial_league_id(), '99999999-9999-4999-8999-00000000000b', 'member');

-- ---------------------------------------------------------------------------
-- Nothing is frozen before a match is scored
-- ---------------------------------------------------------------------------

select is(
  (select count(*)::integer from public.match_players
   where match_id = 'bbbbbbbb-bbbb-4bbb-8bbb-000000000001'
     and market_value_gbp is not null),
  0,
  'a match still to be played carries no frozen values'
);

-- The league's own history is loaded by supabase/production/03_results.sql,
-- which goes through import_match_scores like everything else — so on this
-- database the four played fixtures were frozen as they were imported. On the
-- deployed one they were scored before the column existed and keep their nulls
-- for good; the match page falls back to current values there and says so.
-- Nothing is backfilled either way: today's figures are not what those players
-- were worth then.
select is(
  (select count(*)::integer from public.match_players mp
   join public.matches m on m.id = mp.match_id
   where m.status = 'scored' and mp.market_value_gbp is null),
  0,
  'a match scored through the import carries a frozen value for every call-up'
);

-- What the league is worth at kickoff, kept so the import can be compared
-- against it rather than against itself.
create temporary table value_at_kickoff on commit drop as
select mv.player_id, mv.market_value_gbp
from public.player_market_values mv
join public.match_players mp
  on mp.player_id = mv.player_id
 and mp.match_id = 'bbbbbbbb-bbbb-4bbb-8bbb-000000000001';

-- Read back below under two different roles, and a temporary table grants
-- nothing to anybody by default.
grant select on value_at_kickoff to authenticated;

-- ---------------------------------------------------------------------------
-- Not a member's column
--
-- Checked while the match is still upcoming, which is the only time a member
-- may update one of its rows at all — afterwards the row-level policy alone
-- would stop them and this would pass without the guard doing anything.
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims to
  '{"sub": "99999999-9999-4999-8999-00000000000b", "role": "authenticated"}';

select throws_ok(
  $$update public.match_players
    set market_value_gbp = 99000000
    where match_id = 'bbbbbbbb-bbbb-4bbb-8bbb-000000000001'$$,
  '42501',
  null,
  'a member arranging the teams cannot rewrite what a player is worth'
);

select lives_ok(
  $$update public.match_players mp
    set pitch_slot = null
    from public.players p
    where p.id = mp.player_id
      and p.player_code = 'JORDI'
      and mp.match_id = 'bbbbbbbb-bbbb-4bbb-8bbb-000000000001'$$,
  'but may still send somebody to the bench'
);

set local request.jwt.claims to
  '{"sub": "99999999-9999-4999-8999-00000000000a", "role": "authenticated"}';

-- Two players scored out of a full squad, deliberately: the freeze is about
-- who was called up, not about who ended up on the scorecard.
select public.import_match_scores(
  'bbbbbbbb-bbbb-4bbb-8bbb-000000000001',
  '[{"player_code": "JORDI",
     "metric_scores": {"attack": 9, "defence": 9, "tactics": 9,
                       "physical": 9},
     "attribute_codes": [], "goals": 3, "victory": 1},
    {"player_code": "JOSE",
     "metric_scores": {"attack": 1, "defence": 1, "tactics": 1,
                       "physical": 1},
     "attribute_codes": [], "goals": 0, "victory": 0}]'::jsonb
);

-- ---------------------------------------------------------------------------
-- The whole convocatoria, at the value it had going in
-- ---------------------------------------------------------------------------

select is(
  (select count(*)::integer from public.match_players
   where match_id = 'bbbbbbbb-bbbb-4bbb-8bbb-000000000001'
     and market_value_gbp is null),
  0,
  'scoring a match freezes every player called up for it, scored or not'
);

select is(
  (select count(*)::integer
   from public.match_players mp
   join value_at_kickoff k on k.player_id = mp.player_id
   where mp.match_id = 'bbbbbbbb-bbbb-4bbb-8bbb-000000000001'
     and mp.market_value_gbp is distinct from k.market_value_gbp),
  0,
  'at exactly what each of them was worth before the results landed'
);

-- The check above only means something if the import actually revalued people,
-- which is the whole reason the figure cannot be recomputed later.
select isnt(
  (select market_value_gbp from public.player_market_values mv
   join public.players p on p.id = mv.player_id
   where p.player_code = 'JORDI'),
  (select market_value_gbp from value_at_kickoff k
   join public.players p on p.id = k.player_id
   where p.player_code = 'JORDI'),
  'and the import did move that player, so the two figures differ'
);

select is(
  (select mp.market_value_gbp
   from public.match_players mp
   join public.players p on p.id = mp.player_id
   where mp.match_id = 'bbbbbbbb-bbbb-4bbb-8bbb-000000000001'
     and p.player_code = 'JORDI'),
  (select market_value_gbp from value_at_kickoff k
   join public.players p on p.id = k.player_id
   where p.player_code = 'JORDI'),
  'while the frozen figure stayed where it was'
);

-- ---------------------------------------------------------------------------
-- A correction does not re-freeze
-- ---------------------------------------------------------------------------

select public.import_match_scores(
  'bbbbbbbb-bbbb-4bbb-8bbb-000000000001',
  '[{"player_code": "JORDI",
     "metric_scores": {"attack": 2, "defence": 2, "tactics": 2,
                       "physical": 2},
     "attribute_codes": [], "goals": 0, "victory": 0},
    {"player_code": "JOSE",
     "metric_scores": {"attack": 10, "defence": 10, "tactics": 10,
                       "physical": 10},
     "attribute_codes": [], "goals": 4, "victory": 1}]'::jsonb
);

select is(
  (select count(*)::integer
   from public.match_players mp
   join value_at_kickoff k on k.player_id = mp.player_id
   where mp.match_id = 'bbbbbbbb-bbbb-4bbb-8bbb-000000000001'
     and mp.market_value_gbp is distinct from k.market_value_gbp),
  0,
  'correcting a scorecard leaves every frozen value alone'
);

-- ---------------------------------------------------------------------------
-- Nobody joins a squad after the fact
--
-- Which is what stops a frozen value from ever being missing on a match this
-- application scored: the convocatoria closes when the match does, so there is
-- no route to a row that the freeze did not see. Only fixtures played before
-- the column existed have nulls, and for those the page falls back to current
-- values and says which it is showing.
-- ---------------------------------------------------------------------------

select throws_ok(
  $$insert into public.match_players (match_id, player_id, team_side)
    select 'bbbbbbbb-bbbb-4bbb-8bbb-000000000001', id, 'home'
    from public.players where player_code = 'CARLOS'$$,
  '42501',
  null,
  'not even an administrator adds a player to a match already scored'
);

select * from finish();
rollback;

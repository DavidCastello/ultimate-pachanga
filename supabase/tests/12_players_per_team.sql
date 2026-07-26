-- ============================================================================
-- Players per team
--
-- A match is between five and eight a side, and two things follow from the size
-- that the interface must never be the only thing maintaining: the formations
-- describe that many players, and nobody is left standing in a slot the pitch no
-- longer draws.
--
-- The second is the one worth a test of its own. A player with a pitch_slot the
-- formation does not have is in the squad, invisible on screen, and impossible
-- to move — so shrinking a match has to bench them, and must not do anything
-- more drastic than that: being called up and being placed are separate facts.
--
-- Match ids come from the real fixtures loaded by supabase/production, and the
-- fully placed upcoming match from supabase/seeds.
-- ============================================================================

begin;
select plan(17);

-- ---------------------------------------------------------------------------
-- Defaults, so the migration changed nothing about the matches already played
-- ---------------------------------------------------------------------------

select is(
  (select count(*)::integer from public.matches where players_per_team <> 7),
  0,
  'every existing match is seven a side'
);

select is(
  (select home_formation::text from public.matches
   where id = '44444444-4444-4444-8444-000000000002'),
  '2-3-1',
  'and keeps the formation it had'
);

-- ---------------------------------------------------------------------------
-- The size a formation describes
-- ---------------------------------------------------------------------------

select is(
  app.formation_squad_size('2-2'), 5::smallint,
  '2-2 is five a side: four outfielders and a goalkeeper'
);

select is(
  app.formation_squad_size('2-3-1'), 7::smallint,
  '2-3-1 is seven a side'
);

select is(
  app.formation_squad_size('2-4-1'), 8::smallint,
  '2-4-1 is eight a side'
);

-- ---------------------------------------------------------------------------
-- The range
-- ---------------------------------------------------------------------------

select throws_ok(
  $$update public.matches set players_per_team = 4
    where id = '44444444-4444-4444-8444-000000000002'$$,
  'Unsupported squad size 4: a match is between five and eight a side',
  'four a side is refused, and says why'
);

select throws_ok(
  $$update public.matches set players_per_team = 9
    where id = '44444444-4444-4444-8444-000000000002'$$,
  'Unsupported squad size 9: a match is between five and eight a side',
  'nine a side is refused'
);

-- ---------------------------------------------------------------------------
-- Invariant 1: the formations follow the size
-- ---------------------------------------------------------------------------

update public.matches set players_per_team = 5
where id = '44444444-4444-4444-8444-000000000002';

select is(
  (select home_formation::text || ' / ' || away_formation::text
   from public.matches where id = '44444444-4444-4444-8444-000000000002'),
  '2-2 / 2-2',
  'shrinking to five replaces both seven-a-side shapes with the five-a-side default'
);

update public.matches set home_formation = '1-2-1'
where id = '44444444-4444-4444-8444-000000000002';

select is(
  (select home_formation::text from public.matches
   where id = '44444444-4444-4444-8444-000000000002'),
  '1-2-1',
  'another shape of the right size is kept'
);

update public.matches set home_formation = '2-3-1'
where id = '44444444-4444-4444-8444-000000000002';

select is(
  (select home_formation::text from public.matches
   where id = '44444444-4444-4444-8444-000000000002'),
  '2-2',
  'a shape of the wrong size is replaced rather than stored'
);

-- Unrelated edits leave the shape alone: the trigger is scoped to the columns
-- it maintains, and a title change must not reset a chosen formation.
update public.matches set home_formation = '1-2-1'
where id = '44444444-4444-4444-8444-000000000002';

update public.matches set title = 'Jornada 2 (corregida)'
where id = '44444444-4444-4444-8444-000000000002';

select is(
  (select home_formation::text from public.matches
   where id = '44444444-4444-4444-8444-000000000002'),
  '1-2-1',
  'editing something else does not disturb the formation'
);

-- ---------------------------------------------------------------------------
-- Invariant 2: shrinking benches, and only benches
--
-- The upcoming match is placed to the last slot on both sides, which is what
-- makes it the interesting one to shrink.
-- ---------------------------------------------------------------------------

select is(
  (select count(*)::integer from public.match_players
   where match_id = 'bbbbbbbb-bbbb-4bbb-8bbb-000000000001'
     and pitch_slot >= 5),
  3,
  'three of the upcoming squad stand in slots that five a side does not have'
);

update public.matches set players_per_team = 5
where id = 'bbbbbbbb-bbbb-4bbb-8bbb-000000000001';

select is(
  (select count(*)::integer from public.match_players
   where match_id = 'bbbbbbbb-bbbb-4bbb-8bbb-000000000001'
     and pitch_slot >= 5),
  0,
  'and are unplaced once the match is five a side'
);

select is(
  (select count(*)::integer from public.match_players
   where match_id = 'bbbbbbbb-bbbb-4bbb-8bbb-000000000001'),
  14,
  'while the convocatoria is untouched: benched is not dropped'
);

select is(
  (select count(*)::integer from public.match_players
   where match_id = 'bbbbbbbb-bbbb-4bbb-8bbb-000000000001'
     and pitch_slot = 0),
  2,
  'both goalkeepers keep their place'
);

-- ---------------------------------------------------------------------------
-- Eight a side reaches slot 7
--
-- The ceiling the check constraint allows is the largest any size needs, so a
-- match that grows never renumbers the players who already fit.
-- ---------------------------------------------------------------------------

update public.matches set players_per_team = 8
where id = 'bbbbbbbb-bbbb-4bbb-8bbb-000000000001';

select lives_ok(
  $$update public.match_players set pitch_slot = 7
    where match_id = 'bbbbbbbb-bbbb-4bbb-8bbb-000000000001'
      and team_side = 'home'
      and pitch_slot is null
      and player_id = (
        select player_id from public.match_players
        where match_id = 'bbbbbbbb-bbbb-4bbb-8bbb-000000000001'
          and team_side = 'home' and pitch_slot is null
        limit 1
      )$$,
  'slot 7 is a legal position at eight a side'
);

select throws_ok(
  $$update public.match_players set pitch_slot = 8
    where match_id = 'bbbbbbbb-bbbb-4bbb-8bbb-000000000001'
      and team_side = 'away' and pitch_slot = 0$$,
  '23514',
  null,
  'slot 8 is beyond every supported size and is refused'
);

select * from finish();
rollback;

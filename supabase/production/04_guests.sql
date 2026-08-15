-- ============================================================================
-- Production — 04 Guests
--
-- The five people who play but are not in the league. They are convocated,
-- scored and valued exactly like everybody else; they are simply left out of
-- the standings and the statistics, because a table that ranks somebody who
-- turned up once against somebody who has been there every week is describing
-- neither of them accurately.
--
-- Not a migration, for the same reason the roster is not: who is a guest is a
-- fact about this league, it gets corrected, and another league would have its
-- own answer. See README.md in this directory.
--
-- ---------------------------------------------------------------------------
-- Two ways of naming the same thing, because the roster has two origins
--
-- Three of the five came from the spreadsheet and are in 01_roster.sql. The
-- other two registered themselves through the app, which generated the codes
-- below; they exist only in the deployed database.
--
-- Everyone is matched on `player_code`, which is the natural key everything
-- else in this directory resolves by and is never rewritten. The two
-- self-registered players are *also* matched on their display name — the same
-- `coalesce(nickname, first + last)` the cards use — which is redundant
-- against this database and is what would find them in another one.
--
-- The name is worth being careful with: the league calls him **Georgino**
-- Rutter, and an earlier draft of this file transposed it to "Gerogino", which
-- matched nobody and said so only in a notice.
--
-- ---------------------------------------------------------------------------
-- Why this one warns instead of failing
--
-- The other three production scripts abort on a row they cannot find, because
-- everything downstream resolves players by code and a missing one would
-- surface much later as a confusing import error. Nothing depends on this file:
-- an unmatched name means one person is still counted in the standings, which
-- is visible immediately and fixed with a toggle in the admin screen.
--
-- It also has to warn rather than fail to be usable as a local seed at all. The
-- two self-registered players exist only in the deployed database — they were
-- never in the spreadsheet, so 01_roster.sql does not create them and no
-- developer's machine has them.
--
-- Re-runnable: setting a flag that is already set changes nothing.
-- ============================================================================

begin;

update public.players
set is_guest = true
where league_id = app.initial_league_id()
  and (
    player_code in (
      'SERGI-P',    -- Sergio Ramos
      'ALEIX',      -- Aleixus Sanchez
      'MARC',       -- Marcradona
      'PLR-HHXG',   -- Georgino Rutter, self-registered
      'PLR-FGLZ'    -- Padre Inglés, self-registered
    )
    or coalesce(nullif(btrim(nickname), ''), first_name || ' ' || last_name)
       in ('Georgino Rutter', 'Padre Inglés')
  );

-- Report rather than assert. The three from the roster are checked, because
-- their absence would mean the roster itself did not load; the two matched by
-- name are only named.
do $$
declare
  v_from_roster integer;
  v_self_registered text[];
  v_missing text[];
begin
  select count(*) into v_from_roster
  from public.players
  where league_id = app.initial_league_id()
    and player_code in ('SERGI-P', 'ALEIX', 'MARC')
    and is_guest;

  if v_from_roster <> 3 then
    raise exception
      'Expected the three guests from the roster to be flagged, found %',
      v_from_roster;
  end if;

  select coalesce(array_agg(display_name order by display_name), '{}')
    into v_self_registered
  from (
    select coalesce(nullif(btrim(nickname), ''), first_name || ' ' || last_name)
             as display_name
    from public.players
    where league_id = app.initial_league_id()
      and is_guest
      and player_code not in ('SERGI-P', 'ALEIX', 'MARC')
  ) as flagged;

  select coalesce(array_agg(expected), '{}')
    into v_missing
  from unnest(array['Georgino Rutter', 'Padre Inglés']) as expected
  where not exists (
    select 1 from public.players
    where league_id = app.initial_league_id()
      and coalesce(nullif(btrim(nickname), ''), first_name || ' ' || last_name)
          = expected
  );

  raise notice 'Guests from the roster: 3 (SERGI-P, ALEIX, MARC).';
  raise notice 'Self-registered guests flagged: %.',
    coalesce(nullif(array_to_string(v_self_registered, ', '), ''), 'none');

  if array_length(v_missing, 1) > 0 then
    raise notice
      'Nobody in this database is called %. Expected on a local database, '
      'where only the spreadsheet roster exists. Against the deployed one it '
      'means the name has since been edited — flag them from /admin/players.',
      array_to_string(v_missing, ' or ');
  end if;
end;
$$;

commit;

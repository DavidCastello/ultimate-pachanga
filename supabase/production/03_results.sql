-- ============================================================================
-- Production — 03 Results
--
-- The scores of the four matches, transcribed from the league spreadsheet. Run
-- last, after 01_roster.sql and 02_fixtures.sql.
--
-- ---------------------------------------------------------------------------
-- Why this calls the application's own function
--
-- It would be shorter to insert into player_match_scores directly, and wrong.
-- final_score is stored, so whatever writes it *defines* the league table —
-- and there is already one thing that does, public.import_match_scores, which
-- the app calls for every CSV upload. Going through it means these four
-- historical matches are scored by exactly the same code as every future one,
-- and that every row is validated first: an unknown code, a player who was not
-- called up, a duplicate, a score out of range or an unknown award aborts the
-- whole import rather than writing half a match.
--
-- The function is SECURITY INVOKER and refuses anyone who is not a league
-- administrator, so the script has to run *as* the owner rather than as
-- postgres. That is what the set_config and `set local role` below are for:
-- they make auth.uid() resolve to the owner's account for the duration of this
-- transaction, which is why the owner must have registered in the app before
-- this script can run. The role reverts at commit.
--
-- ---------------------------------------------------------------------------
-- Two things about the numbers
--
-- **Scores are the spreadsheet's 1-5 doubled.** The league's metrics are
-- configured 0-10 (migration 001) and the cards divide by that maximum, so a
-- 4 out of 5 is stored as an 8 out of 10 and draws as 80/99 rather than 40/99.
-- Halve any value here to read it back as it was written.
--
-- **The «ESP» column is not carried over.** It held 1 for some awards and 2 for
-- others; in the current model every award is worth 2 points (league_attributes
-- in migration 001), so only the award itself — the «ESP Cat» column — is
-- transcribed. Nothing is lost that the model still uses.
--
-- Re-runnable: import_match_scores upserts on (match_id, player_id) and
-- rewrites a player's award set wholesale, so a second run corrects rather than
-- accumulates.
-- ============================================================================

begin;

-- Refuse clearly rather than fail later inside the function with a permissions
-- error that says nothing about the actual cause.
do $$
begin
  if not exists (
    select 1 from auth.users
    where lower(btrim(email)) = app.owner_email()
  ) then
    raise exception
      'The owner account (%) has not registered yet. Sign up in the app first: '
      'importing results requires a league administrator.',
      app.owner_email()
      using errcode = 'no_data_found';
  end if;
end;
$$;

select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', (
      select id from auth.users
      where lower(btrim(email)) = app.owner_email()
    ),
    'role', 'authenticated'
  )::text,
  true
);

set local role authenticated;

-- ---------------------------------------------------------------------------
-- Jornada 1 — 5 June. Negro won.
-- ---------------------------------------------------------------------------

select public.import_match_scores(
  '44444444-4444-4444-8444-000000000001',
  '[
    {"player_code": "JOSEP-M", "metric_scores": {"attack": 4, "defence": 4,  "tactics": 6,  "physical": 4},  "goals": 0, "victory": 0, "attribute_codes": []},
    {"player_code": "JOAN",    "metric_scores": {"attack": 8, "defence": 4,  "tactics": 8,  "physical": 8},  "goals": 0, "victory": 0, "attribute_codes": []},
    {"player_code": "RAUL",    "metric_scores": {"attack": 4, "defence": 6,  "tactics": 2,  "physical": 6},  "goals": 0, "victory": 0, "attribute_codes": []},
    {"player_code": "SERGI-P", "metric_scores": {"attack": 4, "defence": 4,  "tactics": 4,  "physical": 4},  "goals": 0, "victory": 0, "attribute_codes": []},
    {"player_code": "JOSEP-P", "metric_scores": {"attack": 6, "defence": 4,  "tactics": 4,  "physical": 4},  "goals": 0, "victory": 0, "attribute_codes": []},
    {"player_code": "ALEIX",   "metric_scores": {"attack": 8, "defence": 4,  "tactics": 6,  "physical": 6},  "goals": 0, "victory": 0, "attribute_codes": []},
    {"player_code": "MARC",    "metric_scores": {"attack": 8, "defence": 6,  "tactics": 8,  "physical": 6},  "goals": 0, "victory": 0, "attribute_codes": ["revelation"]},
    {"player_code": "ANDREU",  "metric_scores": {"attack": 2, "defence": 10, "tactics": 2,  "physical": 4},  "goals": 0, "victory": 0, "attribute_codes": ["zamora"]},

    {"player_code": "JOSE",     "metric_scores": {"attack": 8, "defence": 6, "tactics": 8,  "physical": 6},  "goals": 0, "victory": 1, "attribute_codes": []},
    {"player_code": "SERGIO-M", "metric_scores": {"attack": 4, "defence": 6, "tactics": 6,  "physical": 2},  "goals": 0, "victory": 1, "attribute_codes": []},
    {"player_code": "DAVID-C",  "metric_scores": {"attack": 6, "defence": 6, "tactics": 6,  "physical": 6},  "goals": 0, "victory": 1, "attribute_codes": []},
    {"player_code": "LLUIS",    "metric_scores": {"attack": 6, "defence": 6, "tactics": 10, "physical": 4},  "goals": 0, "victory": 1, "attribute_codes": []},
    {"player_code": "PERICO",   "metric_scores": {"attack": 8, "defence": 6, "tactics": 4,  "physical": 10}, "goals": 4, "victory": 1, "attribute_codes": ["mvp"]},
    {"player_code": "RODRI",    "metric_scores": {"attack": 4, "defence": 8, "tactics": 4,  "physical": 2},  "goals": 0, "victory": 1, "attribute_codes": []}
  ]'::jsonb
) as jornada_1;

-- ---------------------------------------------------------------------------
-- Jornada 2 — 26 June. Blanco won.
-- ---------------------------------------------------------------------------

select public.import_match_scores(
  '44444444-4444-4444-8444-000000000002',
  '[
    {"player_code": "ALEX",    "metric_scores": {"attack": 6, "defence": 6, "tactics": 6,  "physical": 6}, "goals": 0, "victory": 1, "attribute_codes": []},
    {"player_code": "JOSEP-M", "metric_scores": {"attack": 6, "defence": 8, "tactics": 6,  "physical": 6}, "goals": 0, "victory": 1, "attribute_codes": []},
    {"player_code": "JOAN",    "metric_scores": {"attack": 8, "defence": 6, "tactics": 8,  "physical": 8}, "goals": 0, "victory": 1, "attribute_codes": []},
    {"player_code": "DAVID-W", "metric_scores": {"attack": 8, "defence": 4, "tactics": 10, "physical": 4}, "goals": 3, "victory": 1, "attribute_codes": ["revelation"]},
    {"player_code": "LLUIS",   "metric_scores": {"attack": 8, "defence": 8, "tactics": 10, "physical": 8}, "goals": 0, "victory": 1, "attribute_codes": ["mvp"]},
    {"player_code": "RODRI",   "metric_scores": {"attack": 6, "defence": 8, "tactics": 8,  "physical": 8}, "goals": 0, "victory": 1, "attribute_codes": []},
    {"player_code": "ANDREU",  "metric_scores": {"attack": 4, "defence": 8, "tactics": 4,  "physical": 8}, "goals": 0, "victory": 1, "attribute_codes": []},

    {"player_code": "JORDI",    "metric_scores": {"attack": 8, "defence": 4, "tactics": 6, "physical": 6},  "goals": 0, "victory": 0, "attribute_codes": []},
    {"player_code": "JOSE",     "metric_scores": {"attack": 8, "defence": 6, "tactics": 8, "physical": 8},  "goals": 0, "victory": 0, "attribute_codes": []},
    {"player_code": "SERGIO-M", "metric_scores": {"attack": 6, "defence": 6, "tactics": 6, "physical": 6},  "goals": 0, "victory": 0, "attribute_codes": []},
    {"player_code": "RAUL",     "metric_scores": {"attack": 2, "defence": 6, "tactics": 2, "physical": 8},  "goals": 0, "victory": 0, "attribute_codes": ["zamora"]},
    {"player_code": "DAVID-C",  "metric_scores": {"attack": 8, "defence": 6, "tactics": 8, "physical": 8},  "goals": 0, "victory": 0, "attribute_codes": []},
    {"player_code": "PERICO",   "metric_scores": {"attack": 6, "defence": 6, "tactics": 6, "physical": 10}, "goals": 0, "victory": 0, "attribute_codes": []},
    {"player_code": "JOSEP-P",  "metric_scores": {"attack": 4, "defence": 6, "tactics": 6, "physical": 6},  "goals": 0, "victory": 0, "attribute_codes": []}
  ]'::jsonb
) as jornada_2;

-- ---------------------------------------------------------------------------
-- Jornada 3 — 17 July. Blanco won.
-- ---------------------------------------------------------------------------

select public.import_match_scores(
  '44444444-4444-4444-8444-000000000003',
  '[
    {"player_code": "SERGIO-M", "metric_scores": {"attack": 4,  "defence": 8,  "tactics": 8,  "physical": 4},  "goals": 0, "victory": 1, "attribute_codes": ["zamora"]},
    {"player_code": "JOSEP-M",  "metric_scores": {"attack": 10, "defence": 6,  "tactics": 8,  "physical": 6},  "goals": 3, "victory": 1, "attribute_codes": ["puskas"]},
    {"player_code": "JOAN",     "metric_scores": {"attack": 10, "defence": 6,  "tactics": 8,  "physical": 6},  "goals": 0, "victory": 1, "attribute_codes": ["mvp"]},
    {"player_code": "PEP-M",    "metric_scores": {"attack": 6,  "defence": 8,  "tactics": 8,  "physical": 6},  "goals": 0, "victory": 1, "attribute_codes": []},
    {"player_code": "JAN-M",    "metric_scores": {"attack": 8,  "defence": 6,  "tactics": 6,  "physical": 6},  "goals": 0, "victory": 1, "attribute_codes": []},
    {"player_code": "PERICO",   "metric_scores": {"attack": 8,  "defence": 6,  "tactics": 6,  "physical": 10}, "goals": 0, "victory": 1, "attribute_codes": []},
    {"player_code": "RODRI",    "metric_scores": {"attack": 6,  "defence": 10, "tactics": 10, "physical": 8},  "goals": 0, "victory": 1, "attribute_codes": []},
    {"player_code": "CARLOS",   "metric_scores": {"attack": 6,  "defence": 6,  "tactics": 6,  "physical": 8},  "goals": 0, "victory": 1, "attribute_codes": []},

    {"player_code": "JORDI",   "metric_scores": {"attack": 6, "defence": 6,  "tactics": 6,  "physical": 6}, "goals": 0, "victory": 0, "attribute_codes": []},
    {"player_code": "JOSE",    "metric_scores": {"attack": 6, "defence": 6,  "tactics": 8,  "physical": 8}, "goals": 0, "victory": 0, "attribute_codes": []},
    {"player_code": "ALEX",    "metric_scores": {"attack": 6, "defence": 10, "tactics": 8,  "physical": 6}, "goals": 0, "victory": 0, "attribute_codes": ["revelation"]},
    {"player_code": "DAVID-C", "metric_scores": {"attack": 8, "defence": 8,  "tactics": 8,  "physical": 8}, "goals": 0, "victory": 0, "attribute_codes": []},
    {"player_code": "DAVID-W", "metric_scores": {"attack": 8, "defence": 6,  "tactics": 8,  "physical": 4}, "goals": 0, "victory": 0, "attribute_codes": []},
    {"player_code": "LLUIS",   "metric_scores": {"attack": 8, "defence": 6,  "tactics": 10, "physical": 6}, "goals": 0, "victory": 0, "attribute_codes": []},
    {"player_code": "JOSEP-P", "metric_scores": {"attack": 4, "defence": 6,  "tactics": 4,  "physical": 8}, "goals": 0, "victory": 0, "attribute_codes": []}
  ]'::jsonb
) as jornada_3;

-- ---------------------------------------------------------------------------
-- Jornada 4 — 24 July. Drawn, so everyone takes half a victory — except
-- PERICO, whose «VICT» cell reads 1 in the spreadsheet. Transcribed as written.
-- Change the 1 below to 0.5 if that turns out to be a typo.
-- ---------------------------------------------------------------------------

select public.import_match_scores(
  '44444444-4444-4444-8444-000000000004',
  '[
    {"player_code": "JORDI",    "metric_scores": {"attack": 8, "defence": 6,  "tactics": 6, "physical": 8},  "goals": 0, "victory": 0.5, "attribute_codes": []},
    {"player_code": "JOSE",     "metric_scores": {"attack": 6, "defence": 6,  "tactics": 8, "physical": 8},  "goals": 0, "victory": 0.5, "attribute_codes": []},
    {"player_code": "PAU-R",    "metric_scores": {"attack": 8, "defence": 6,  "tactics": 8, "physical": 6},  "goals": 0, "victory": 0.5, "attribute_codes": []},
    {"player_code": "ALEX",     "metric_scores": {"attack": 6, "defence": 10, "tactics": 8, "physical": 6},  "goals": 0, "victory": 0.5, "attribute_codes": []},
    {"player_code": "SERGIO-M", "metric_scores": {"attack": 6, "defence": 8,  "tactics": 6, "physical": 4},  "goals": 0, "victory": 0.5, "attribute_codes": []},
    {"player_code": "JOSEP-M",  "metric_scores": {"attack": 8, "defence": 8,  "tactics": 6, "physical": 6},  "goals": 0, "victory": 0.5, "attribute_codes": []},
    {"player_code": "JOAN",     "metric_scores": {"attack": 8, "defence": 6,  "tactics": 8, "physical": 10}, "goals": 0, "victory": 0.5, "attribute_codes": []},
    {"player_code": "PEP-M",    "metric_scores": {"attack": 6, "defence": 6,  "tactics": 6, "physical": 6},  "goals": 0, "victory": 0.5, "attribute_codes": []},

    {"player_code": "RAUL",    "metric_scores": {"attack": 6,  "defence": 8,  "tactics": 4,  "physical": 8},  "goals": 0, "victory": 0.5, "attribute_codes": []},
    {"player_code": "DAVID-C", "metric_scores": {"attack": 8,  "defence": 6,  "tactics": 8,  "physical": 8},  "goals": 3, "victory": 0.5, "attribute_codes": ["puskas"]},
    {"player_code": "KIRILL",  "metric_scores": {"attack": 6,  "defence": 6,  "tactics": 4,  "physical": 8},  "goals": 0, "victory": 0.5, "attribute_codes": ["revelation"]},
    {"player_code": "DAVID-W", "metric_scores": {"attack": 8,  "defence": 4,  "tactics": 6,  "physical": 6},  "goals": 0, "victory": 0.5, "attribute_codes": ["puskas"]},
    {"player_code": "LLUIS",   "metric_scores": {"attack": 6,  "defence": 8,  "tactics": 10, "physical": 6},  "goals": 0, "victory": 0.5, "attribute_codes": []},
    {"player_code": "JAN-M",   "metric_scores": {"attack": 6,  "defence": 6,  "tactics": 6,  "physical": 6},  "goals": 0, "victory": 0.5, "attribute_codes": []},
    {"player_code": "PERICO",  "metric_scores": {"attack": 10, "defence": 6,  "tactics": 8,  "physical": 10}, "goals": 0, "victory": 1,   "attribute_codes": ["mvp"]},
    {"player_code": "RODRI",   "metric_scores": {"attack": 6,  "defence": 10, "tactics": 10, "physical": 8},  "goals": 0, "victory": 0.5, "attribute_codes": []}
  ]'::jsonb
) as jornada_4;

reset role;

-- ---------------------------------------------------------------------------
-- Everyone who was called up must have a score, and every match must now be
-- scored. Either failing means the transcription and 02_fixtures.sql disagree.
-- ---------------------------------------------------------------------------

do $$
declare
  v_match_ids constant uuid[] := array[
    '44444444-4444-4444-8444-000000000001',
    '44444444-4444-4444-8444-000000000002',
    '44444444-4444-4444-8444-000000000003',
    '44444444-4444-4444-8444-000000000004'
  ]::uuid[];
  v_scores integer;
  v_unscored integer;
begin
  select count(*) into v_scores
  from public.player_match_scores
  where match_id = any (v_match_ids);

  select count(*) into v_unscored
  from public.matches
  where id = any (v_match_ids)
    and status <> 'scored';

  if v_scores <> 59 then
    raise exception 'Expected 59 scores, found %', v_scores;
  end if;

  if v_unscored <> 0 then
    raise exception '% match(es) were not marked as scored', v_unscored;
  end if;

  raise notice 'Results imported: 59 scores across 4 matches.';
end;
$$;

commit;

-- ============================================================================
-- 003 — Transactional score import
--
-- The single write path for match results. The frontend validates the CSV for
-- fast feedback, but this function re-validates everything: the browser is not
-- a trustworthy validator.
--
-- A plpgsql function body runs inside one transaction, so any RAISE aborts the
-- whole import. That is what makes "a failed import leaves no partial records"
-- true by construction rather than by careful bookkeeping.
--
-- SECURITY INVOKER (the default) is deliberate — RLS still applies to every
-- statement inside, so the administrator check below is defence in depth
-- rather than the only gate.
--
-- Expected shape of p_rows:
--
--   [
--     {
--       "player_code": "PLR-A7K2",
--       "metric_scores": { "attack": 6, "defence": 9, ... },
--       "attribute_codes": ["zamora"]
--     },
--     ...
--   ]
--
-- Attributes are addressed by `code`, not by user-facing label. Translating
-- the Spanish labels in the CSV into codes is the frontend's job.
-- ============================================================================

create function public.import_match_scores(
  p_match_id uuid,
  p_rows jsonb
) returns jsonb
  language plpgsql
  set search_path = ''
as $$
declare
  v_league_id uuid;
  v_match_status public.match_status;
  v_active_metric_codes text[];

  v_row jsonb;
  v_row_index integer := 0;
  v_seen_player_ids uuid[] := '{}';
  v_imported_count integer := 0;

  v_player_code text;
  v_player_id uuid;

  v_metric_scores jsonb;
  v_metric_key text;
  v_metric record;
  v_raw_value jsonb;
  v_metric_value numeric;
  v_metric_total numeric;
  v_metric_count integer;
  v_base_score numeric;

  v_attribute_codes text[];
  v_attribute_ids uuid[];
  v_attribute_points integer;
  v_score_id uuid;
begin
  if p_match_id is null then
    raise exception 'A match id is required'
      using errcode = 'invalid_parameter_value';
  end if;

  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'p_rows must be a JSON array, got %',
      coalesce(jsonb_typeof(p_rows), 'null')
      using errcode = 'invalid_parameter_value';
  end if;

  if jsonb_array_length(p_rows) = 0 then
    raise exception 'Cannot import an empty result set'
      using errcode = 'invalid_parameter_value';
  end if;

  -- Resolve and authorize before locking. `SELECT ... FOR UPDATE` needs UPDATE
  -- privilege, so RLS would filter the row away for a non-administrator and
  -- the function would report "match does not exist" instead of a permission
  -- error. These messages reach the user, so the order matters.
  select league_id, status
    into v_league_id, v_match_status
  from public.matches
  where id = p_match_id;

  if v_league_id is null then
    raise exception 'Match % does not exist', p_match_id
      using errcode = 'no_data_found';
  end if;

  if not public.is_league_admin(v_league_id) then
    raise exception 'Only league administrators may import match results'
      using errcode = 'insufficient_privilege';
  end if;

  -- Now lock it for the rest of the transaction so two concurrent imports of
  -- the same match cannot interleave.
  perform 1 from public.matches where id = p_match_id for update;

  if v_match_status = 'cancelled' then
    raise exception 'Match % is cancelled and cannot be scored', p_match_id
      using errcode = 'check_violation';
  end if;

  select array_agg(code order by display_order)
    into v_active_metric_codes
  from public.league_metrics
  where league_id = v_league_id and is_active;

  if v_active_metric_codes is null then
    raise exception 'League % has no active metrics to score against',
      v_league_id
      using errcode = 'check_violation';
  end if;

  -- -------------------------------------------------------------------------
  -- Validate and write each row. Ordering does not matter for atomicity: the
  -- first failure rolls the entire statement back.
  -- -------------------------------------------------------------------------
  for v_row in select value from jsonb_array_elements(p_rows) as t (value)
  loop
    v_row_index := v_row_index + 1;

    -- --- player -----------------------------------------------------------
    v_player_code := upper(btrim(coalesce(v_row ->> 'player_code', '')));
    if v_player_code = '' then
      raise exception 'Row %: player code is missing', v_row_index
        using errcode = 'invalid_parameter_value';
    end if;

    select id into v_player_id
    from public.players
    where league_id = v_league_id
      and player_code = v_player_code;

    if v_player_id is null then
      raise exception 'Row %: no player in this league has the code %',
        v_row_index, v_player_code
        using errcode = 'no_data_found';
    end if;

    if v_player_id = any (v_seen_player_ids) then
      raise exception 'Row %: player % appears more than once',
        v_row_index, v_player_code
        using errcode = 'unique_violation';
    end if;
    v_seen_player_ids := v_seen_player_ids || v_player_id;

    if not exists (
      select 1 from public.match_players
      where match_id = p_match_id and player_id = v_player_id
    ) then
      raise exception 'Row %: player % was not called up for this match',
        v_row_index, v_player_code
        using errcode = 'check_violation';
    end if;

    -- --- metrics ----------------------------------------------------------
    v_metric_scores := coalesce(v_row -> 'metric_scores', '{}'::jsonb);
    if jsonb_typeof(v_metric_scores) <> 'object' then
      raise exception 'Row %: metric_scores must be a JSON object', v_row_index
        using errcode = 'invalid_parameter_value';
    end if;

    -- Unknown keys are rejected rather than ignored: a mistyped metric would
    -- otherwise drop silently out of the average.
    for v_metric_key in select jsonb_object_keys(v_metric_scores)
    loop
      if not (v_metric_key = any (v_active_metric_codes)) then
        raise exception 'Row %: "%" is not an active metric in this league',
          v_row_index, v_metric_key
          using errcode = 'invalid_parameter_value';
      end if;
    end loop;

    v_metric_total := 0;
    v_metric_count := 0;

    for v_metric in
      select code, minimum_score, maximum_score
      from public.league_metrics
      where league_id = v_league_id and is_active
      order by display_order
    loop
      v_raw_value := v_metric_scores -> v_metric.code;

      if v_raw_value is null or jsonb_typeof(v_raw_value) = 'null' then
        raise exception 'Row %: metric "%" is missing',
          v_row_index, v_metric.code
          using errcode = 'invalid_parameter_value';
      end if;

      if jsonb_typeof(v_raw_value) <> 'number' then
        raise exception 'Row %: metric "%" must be a number, got %',
          v_row_index, v_metric.code, jsonb_typeof(v_raw_value)
          using errcode = 'invalid_parameter_value';
      end if;

      v_metric_value := (v_raw_value #>> '{}')::numeric;

      if v_metric_value < v_metric.minimum_score
         or v_metric_value > v_metric.maximum_score then
        raise exception
          'Row %: metric "%" is % but must be between % and %',
          v_row_index, v_metric.code, v_metric_value,
          v_metric.minimum_score, v_metric.maximum_score
          using errcode = 'numeric_value_out_of_range';
      end if;

      v_metric_total := v_metric_total + v_metric_value;
      v_metric_count := v_metric_count + 1;
    end loop;

    v_base_score := round(v_metric_total / v_metric_count, 3);

    -- --- attributes -------------------------------------------------------
    if v_row ? 'attribute_codes'
       and jsonb_typeof(v_row -> 'attribute_codes') not in ('array', 'null')
    then
      raise exception 'Row %: attribute_codes must be a JSON array', v_row_index
        using errcode = 'invalid_parameter_value';
    end if;

    select coalesce(array_agg(lower(btrim(value))), '{}'::text[])
      into v_attribute_codes
    from jsonb_array_elements_text(
           case
             when jsonb_typeof(v_row -> 'attribute_codes') = 'array'
               then v_row -> 'attribute_codes'
             else '[]'::jsonb
           end
         ) as t (value)
    where btrim(value) <> '';

    if exists (
      select 1
      from unnest(v_attribute_codes) as code
      group by code
      having count(*) > 1
    ) then
      raise exception
        'Row %: the same attribute is assigned more than once to player %',
        v_row_index, v_player_code
        using errcode = 'unique_violation';
    end if;

    -- Resolve every code before writing anything, so an unknown attribute
    -- fails the row before it can contribute a partial score.
    select array_agg(a.id order by a.code),
           coalesce(sum(a.points), 0)::integer
      into v_attribute_ids, v_attribute_points
    from unnest(v_attribute_codes) as requested (code)
    join public.league_attributes a
      on a.league_id = v_league_id
     and a.code = requested.code
     and a.is_active;

    v_attribute_ids := coalesce(v_attribute_ids, '{}'::uuid[]);
    v_attribute_points := coalesce(v_attribute_points, 0);

    if array_length(v_attribute_ids, 1) is distinct from
       nullif(array_length(v_attribute_codes, 1), 0) then
      raise exception
        'Row %: one or more attributes are not active in this league (%)',
        v_row_index, array_to_string(v_attribute_codes, ', ')
        using errcode = 'no_data_found';
    end if;

    -- --- write ------------------------------------------------------------
    -- The derived scores are stored rather than recomputed on read, so
    -- reconfiguring a league's metrics or attribute values later does not
    -- silently rewrite history.
    insert into public.player_match_scores (
      match_id, player_id, metric_scores,
      base_score, attribute_points, final_score, imported_by
    )
    values (
      p_match_id, v_player_id, v_metric_scores,
      v_base_score, v_attribute_points, v_base_score + v_attribute_points,
      auth.uid()
    )
    on conflict (match_id, player_id) do update
      set metric_scores = excluded.metric_scores,
          base_score = excluded.base_score,
          attribute_points = excluded.attribute_points,
          final_score = excluded.final_score,
          imported_by = excluded.imported_by
    returning id into v_score_id;

    -- A re-import replaces the previous attribute set wholesale.
    delete from public.player_match_score_attributes
    where player_match_score_id = v_score_id;

    if array_length(v_attribute_ids, 1) > 0 then
      insert into public.player_match_score_attributes
        (player_match_score_id, league_attribute_id)
      select v_score_id, attribute_id
      from unnest(v_attribute_ids) as attribute_id;
    end if;

    v_imported_count := v_imported_count + 1;
  end loop;

  update public.matches
  set status = 'scored',
      results_imported_at = now()
  where id = p_match_id;

  return jsonb_build_object(
    'match_id', p_match_id,
    'imported_count', v_imported_count
  );
end;
$$;

comment on function public.import_match_scores is
  'Validates and imports a full set of match results in one transaction, then '
  'marks the match as scored. Re-importing upserts. Any invalid row aborts the '
  'entire import.';

revoke all on function public.import_match_scores(uuid, jsonb) from public;
grant execute on function public.import_match_scores(uuid, jsonb)
  to authenticated;

-- ============================================================================
-- 009 — Goals, victories, and a scoring model that rewards winning
--
-- Three changes, in order of how much they move:
--
--   1. A result now records goals and a victory share per player. Goals are a
--      statistic only; the victory share is worth two points.
--   2. The metric part of a score becomes the SUM of the four metrics rather
--      than their mean, so the scale goes from 0-10 to 0-40:
--
--        final = attack + defence + tactics + physical
--              + attribute points
--              + victory x 2
--
--   3. The 0-99 card rating stops being "score x 10" and becomes a player's
--      standing among their peers: a normal distribution over everyone's most
--      recent score, centred on 70 and bounded at 45 and 99.
--
-- (1) and (3) are additive. (2) is not: base_score and final_score are stored
-- at import time precisely so that reconfiguring a league does not rewrite
-- history — which means changing the formula does not fix already-imported
-- matches either. They are recomputed once, below, from the metric_scores that
-- were stored alongside them.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Goals and victories
--
-- A victory share rather than a boolean: a draw is half a win, and the league
-- occasionally settles a game in ways that deserve something between the two.
-- ---------------------------------------------------------------------------

alter table public.player_match_scores
  add column goals integer not null default 0
    check (goals >= 0),
  add column victory numeric(3, 2) not null default 0
    check (victory >= 0 and victory <= 1);

comment on column public.player_match_scores.goals is
  'Goals scored in this match. Recorded and displayed; deliberately not part '
  'of any score.';

comment on column public.player_match_scores.victory is
  'Share of a win: 1 won, 0 lost, 0.5 drawn. Worth public.victory_points() each.';

-- The weight in one place. Metrics and attributes are configurable per league;
-- this one is not, because it is part of the definition of the score rather
-- than a dial.
--
-- In `public` rather than `app` alongside initial_league_id(), because
-- import_match_scores runs as SECURITY INVOKER — so it reads this as the
-- calling administrator, who has no business being granted the run of an
-- internal schema. It keeps company with to_card_stat: a scoring constant the
-- API may see, which is harmless, rather than a bootstrap detail.
create function public.victory_points() returns numeric
  language sql immutable
  set search_path = ''
as $$ select 2::numeric $$;

comment on function public.victory_points is
  'Points a full victory contributes to a final score.';

grant execute on function public.victory_points() to authenticated;

-- ---------------------------------------------------------------------------
-- Recompute what is already stored
--
-- Every imported row keeps the metric_scores it was built from, so the sum can
-- be recovered exactly. Rows are matched against their league's *active*
-- metrics, the same set the import used. victory is 0 for all of them — none
-- of these matches recorded one — so the victory term adds nothing here.
-- ---------------------------------------------------------------------------

with recomputed as (
  select
    s.id,
    round(
      (
        select sum((s.metric_scores ->> lm.code)::numeric)
        from public.league_metrics lm
        where lm.league_id = m.league_id
          and lm.is_active
          and s.metric_scores ? lm.code
          and jsonb_typeof(s.metric_scores -> lm.code) = 'number'
      ),
      3
    ) as metric_total
  from public.player_match_scores s
  join public.matches m on m.id = s.match_id
)
update public.player_match_scores s
   set base_score = r.metric_total,
       final_score = r.metric_total + s.attribute_points
  from recomputed r
 where r.id = s.id
   and r.metric_total is not null;

-- ---------------------------------------------------------------------------
-- Market value constant
--
-- A sum-based score is roughly four times a mean-based one, and the constant
-- moves from one million to three at the same time, so valuations grow by
-- about twelve. Deliberate: the numbers are meant to read like transfer fees.
-- ---------------------------------------------------------------------------

alter table public.leagues
  alter column market_constant_gbp set default 3000000;

update public.leagues
   set market_constant_gbp = 3000000
 where id = app.initial_league_id();

-- ============================================================================
-- Import
--
-- Same signature and the same all-or-nothing behaviour; what changes is how a
-- row is scored and that two more fields travel with it.
--
-- Expected shape of p_rows:
--
--   [
--     {
--       "player_code": "PLR-A7K2",
--       "metric_scores": { "attack": 6, "defence": 9, ... },
--       "attribute_codes": ["zamora"],
--       "goals": 2,
--       "victory": 0.5
--     },
--     ...
--   ]
--
-- goals and victory are optional and default to zero, so a caller that predates
-- them still imports rather than failing. Present but malformed is an error:
-- a victory typed as "yes" must not silently become a loss.
-- ============================================================================

create or replace function public.import_match_scores(
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
  v_base_score numeric;

  v_goals integer;
  v_victory numeric;

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
    -- otherwise drop silently out of the total.
    for v_metric_key in select jsonb_object_keys(v_metric_scores)
    loop
      if not (v_metric_key = any (v_active_metric_codes)) then
        raise exception 'Row %: "%" is not an active metric in this league',
          v_row_index, v_metric_key
          using errcode = 'invalid_parameter_value';
      end if;
    end loop;

    v_metric_total := 0;

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
    end loop;

    -- The sum, not the mean. A player who is good at everything should score
    -- higher than one who is good at one thing, and the mean hid that.
    v_base_score := round(v_metric_total, 3);

    -- --- goals ------------------------------------------------------------
    v_raw_value := v_row -> 'goals';

    if v_raw_value is null or jsonb_typeof(v_raw_value) = 'null' then
      v_goals := 0;
    elsif jsonb_typeof(v_raw_value) <> 'number' then
      raise exception 'Row %: goals must be a number, got %',
        v_row_index, jsonb_typeof(v_raw_value)
        using errcode = 'invalid_parameter_value';
    else
      v_metric_value := (v_raw_value #>> '{}')::numeric;

      if v_metric_value <> trunc(v_metric_value) or v_metric_value < 0 then
        raise exception 'Row %: goals is % but must be a whole number of zero '
          'or more', v_row_index, v_metric_value
          using errcode = 'numeric_value_out_of_range';
      end if;

      v_goals := v_metric_value::integer;
    end if;

    -- --- victory ----------------------------------------------------------
    v_raw_value := v_row -> 'victory';

    if v_raw_value is null or jsonb_typeof(v_raw_value) = 'null' then
      v_victory := 0;
    elsif jsonb_typeof(v_raw_value) <> 'number' then
      raise exception 'Row %: victory must be a number, got %',
        v_row_index, jsonb_typeof(v_raw_value)
        using errcode = 'invalid_parameter_value';
    else
      v_victory := (v_raw_value #>> '{}')::numeric;

      if v_victory < 0 or v_victory > 1 then
        raise exception 'Row %: victory is % but must be between 0 and 1',
          v_row_index, v_victory
          using errcode = 'numeric_value_out_of_range';
      end if;
    end if;

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
      match_id, player_id, metric_scores, goals, victory,
      base_score, attribute_points, final_score, imported_by
    )
    values (
      p_match_id, v_player_id, v_metric_scores, v_goals, v_victory,
      v_base_score,
      v_attribute_points,
      v_base_score + v_attribute_points + v_victory * public.victory_points(),
      auth.uid()
    )
    on conflict (match_id, player_id) do update
      set metric_scores = excluded.metric_scores,
          goals = excluded.goals,
          victory = excluded.victory,
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

-- ============================================================================
-- The card rating
--
-- Previously the rating was the weighted score times ten, which on the new
-- scale would peg every competent player at 99 and say nothing. It is now a
-- ranking rather than a measurement: where a player's most recent score sits
-- in the spread of everybody's most recent score.
--
-- Centred on 70 with nine points of headroom above and 25 below, and a spread
-- of 12 per standard deviation, so a normal-looking league puts most of the
-- squad between roughly 55 and 85 and only a genuine outlier reaches the ends.
-- The bounds are hard: nobody drops below 45 however bad the afternoon was.
--
-- Consequences worth knowing. A rating is relative, so a player's own number
-- moves when *other* people play. And every rating shifts after each match, by
-- design — the card is a snapshot of current standing, not a career record.
-- Career figures live in career_average and market value.
-- ============================================================================

create function public.to_card_rating(
  p_latest_score numeric,
  p_league_mean numeric,
  p_league_spread numeric
) returns integer
  language sql immutable
  set search_path = ''
as $$
  select case
    -- Nobody has played, or everyone scored identically: there is no spread to
    -- place anyone within, so everyone sits at the centre.
    when p_latest_score is null
      or p_league_mean is null
      or coalesce(p_league_spread, 0) = 0
    then 70
    else least(99, greatest(45,
      round(70 + 12 * (p_latest_score - p_league_mean) / p_league_spread)
    ))::integer
  end;
$$;

comment on function public.to_card_rating(numeric, numeric, numeric) is
  'A player''s 0-99 card rating: their latest score placed on a normal '
  'distribution of every player''s latest score, centred on 70 and bounded '
  'at 45 and 99.';

grant execute on function
  public.to_card_rating(numeric, numeric, numeric) to authenticated;

-- ---------------------------------------------------------------------------
-- player_market_values
--
-- Unchanged in shape:
--
--   no matches   -> the average market value across players who have played
--   one match    -> latest_final_score            x market_constant_gbp
--   two or more  -> (0.5 x previous_average
--                    + 0.5 x latest_final_score)  x market_constant_gbp
--
-- Only scored matches count, so a fixture nobody has played yet never drags a
-- valuation down. What is new is the goal and victory totals, and the rating.
-- ---------------------------------------------------------------------------

create or replace view public.player_market_values
with (security_invoker = true) as
with scored as (
  select
    s.player_id,
    s.final_score,
    s.goals,
    s.victory,
    m.played_at,
    -- Ties on played_at are broken by created_at so "latest" is deterministic
    -- when two matches share a kickoff time.
    row_number() over (
      partition by s.player_id
      order by m.played_at desc, s.created_at desc
    ) as recency_rank
  from public.player_match_scores s
  join public.matches m on m.id = s.match_id
  where m.status = 'scored'
),
per_player as (
  select
    player_id,
    count(*)::integer as matches_played,
    round(avg(final_score), 3) as career_average,
    max(final_score) filter (where recency_rank = 1) as latest_score,
    round(avg(final_score) filter (where recency_rank > 1), 3)
      as previous_average,
    sum(goals)::integer as total_goals,
    sum(victory) as total_victories
  from scored
  group by player_id
),
weighted as (
  select
    player_id,
    matches_played,
    career_average,
    latest_score,
    total_goals,
    total_victories,
    case
      when matches_played = 1 then latest_score
      else round(0.5 * previous_average + 0.5 * latest_score, 3)
    end as weighted_performance_score
  from per_player
),
-- The fallback for a player with no matches is the mean market value of
-- players who do have matches, which cannot be expressed per-row and so is
-- computed once per league here.
league_fallback as (
  select
    p.league_id,
    avg(w.weighted_performance_score) as fallback_score
  from weighted w
  join public.players p on p.id = w.player_id
  group by p.league_id
),
-- The population the card rating is measured against: every player in the
-- league who has a most recent score. Population rather than sample standard
-- deviation, because this is the whole league and not an estimate drawn from
-- it — and it yields 0 rather than null for a one-player league, which
-- to_card_rating already handles.
league_form as (
  select
    p.league_id,
    avg(w.latest_score) as mean_latest_score,
    stddev_pop(w.latest_score) as spread_latest_score
  from weighted w
  join public.players p on p.id = w.player_id
  group by p.league_id
)
select
  p.league_id,
  p.id as player_id,
  coalesce(w.matches_played, 0) as matches_played,
  w.career_average,
  w.latest_score,
  round(coalesce(w.weighted_performance_score, f.fallback_score, 0), 3)
    as weighted_performance_score,
  round(
    coalesce(w.weighted_performance_score, f.fallback_score, 0)
      * l.market_constant_gbp,
    2
  ) as market_value_gbp,
  public.to_card_rating(
    w.latest_score, lf.mean_latest_score, lf.spread_latest_score
  ) as card_rating,
  coalesce(w.total_goals, 0) as total_goals,
  coalesce(w.total_victories, 0) as total_victories
from public.players p
join public.leagues l on l.id = p.league_id
left join weighted w on w.player_id = p.id
left join league_fallback f on f.league_id = p.league_id
left join league_form lf on lf.league_id = p.league_id;

comment on view public.player_market_values is
  'Matches played, averages, weighted performance score, market value in GBP, '
  'goal and victory totals, and the 0-99 card rating per player. Nothing here '
  'is stored.';

-- ---------------------------------------------------------------------------
-- player_cards carries the two new totals through
-- ---------------------------------------------------------------------------

create or replace view public.player_cards
with (security_invoker = true) as
with metric_stats as (
  select
    player_id,
    jsonb_object_agg(metric_code, card_stat order by display_order)
      as metric_card_stats,
    jsonb_object_agg(metric_code, career_average order by display_order)
      as metric_averages
  from public.player_metric_averages
  group by player_id
),
attribute_counts as (
  select
    counted.player_id,
    jsonb_object_agg(a.code, counted.total) as attribute_counts,
    sum(counted.total)::integer as attribute_total
  from (
    select s.player_id, sa.league_attribute_id, count(*)::integer as total
    from public.player_match_score_attributes sa
    join public.player_match_scores s on s.id = sa.player_match_score_id
    join public.matches m on m.id = s.match_id and m.status = 'scored'
    group by s.player_id, sa.league_attribute_id
  ) as counted
  join public.league_attributes a on a.id = counted.league_attribute_id
  group by counted.player_id
)
select
  p.id,
  p.league_id,
  p.player_code,
  p.first_name,
  p.last_name,
  p.nickname,
  -- One display name so every card, table and dropdown agrees.
  coalesce(nullif(btrim(p.nickname), ''), p.first_name || ' ' || p.last_name)
    as display_name,
  p.preferred_position,
  p.avatar_path,
  p.is_active,
  mv.matches_played,
  mv.career_average,
  mv.latest_score,
  mv.weighted_performance_score,
  mv.market_value_gbp,
  mv.card_rating,
  coalesce(ms.metric_card_stats, '{}'::jsonb) as metric_card_stats,
  coalesce(ms.metric_averages, '{}'::jsonb) as metric_averages,
  coalesce(ac.attribute_counts, '{}'::jsonb) as attribute_counts,
  coalesce(ac.attribute_total, 0) as attribute_total,
  p.created_at,
  p.updated_at,
  p.user_id,
  mv.total_goals,
  mv.total_victories
from public.players p
join public.player_market_values mv on mv.player_id = p.id
left join metric_stats ms on ms.player_id = p.id
left join attribute_counts ac on ac.player_id = p.id;

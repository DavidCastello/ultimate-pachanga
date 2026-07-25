-- ============================================================================
-- 004 — Derived player statistics
--
-- Market values and card ratings are never stored. They are recomputed from
-- player_match_scores on every read, so correcting a match immediately and
-- consistently corrects every derived figure.
--
-- security_invoker = true on every view is essential. Without it a view runs
-- with its owner's privileges and silently bypasses RLS on its base tables —
-- which, given the browser queries these views directly with the publishable
-- key, would expose every league's data to every authenticated user.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Rounds a raw 0–10 average onto the 0–99 scale used on the cards.
--
-- Presentation only; nothing authoritative is derived from it.
-- ---------------------------------------------------------------------------

create function public.to_card_stat(p_average numeric) returns integer
  language sql immutable
  set search_path = ''
as $$
  select case
    when p_average is null then null
    else least(99, greatest(0, round(p_average * 10)))::integer
  end;
$$;

comment on function public.to_card_stat is
  'Converts a 0-10 average into the 0-99 display scale, clamped.';

grant execute on function public.to_card_stat(numeric) to authenticated;

-- ---------------------------------------------------------------------------
-- player_metric_averages
--
-- Long format rather than one column per metric, because metrics are
-- configurable per league. Callers that need a wide shape pivot in
-- player_cards below.
-- ---------------------------------------------------------------------------

create view public.player_metric_averages
with (security_invoker = true) as
select
  p.league_id,
  p.id as player_id,
  m.code as metric_code,
  m.label as metric_label,
  m.display_order,
  round(avg((s.metric_scores ->> m.code)::numeric), 3) as career_average,
  public.to_card_stat(avg((s.metric_scores ->> m.code)::numeric))
    as card_stat,
  count(*) as scored_count
from public.players p
join public.league_metrics m
  on m.league_id = p.league_id
 and m.is_active
join public.player_match_scores s
  on s.player_id = p.id
join public.matches mt
  on mt.id = s.match_id
 and mt.status = 'scored'
-- A metric added after some matches were scored has no value in those older
-- rows; excluding them keeps the average honest rather than treating the gap
-- as a zero.
where s.metric_scores ? m.code
  and jsonb_typeof(s.metric_scores -> m.code) = 'number'
group by p.league_id, p.id, m.code, m.label, m.display_order;

comment on view public.player_metric_averages is
  'Career average and 0-99 card stat per player per active metric.';

-- ---------------------------------------------------------------------------
-- player_market_values
--
-- The weighting deliberately gives the most recent match the same weight as
-- the entire earlier career, so form moves a valuation quickly:
--
--   no matches   -> the average market value across players who have played
--   one match    -> latest_final_score            x market_constant_gbp
--   two or more  -> (0.5 x previous_average
--                    + 0.5 x latest_final_score)  x market_constant_gbp
--
-- With nobody in the league scored yet, every value is 0.
-- ---------------------------------------------------------------------------

create view public.player_market_values
with (security_invoker = true) as
with scored as (
  select
    s.player_id,
    s.final_score,
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
      as previous_average
  from scored
  group by player_id
),
weighted as (
  select
    player_id,
    matches_played,
    career_average,
    latest_score,
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
  public.to_card_stat(
    coalesce(w.weighted_performance_score, f.fallback_score, 0)
  ) as card_rating
from public.players p
join public.leagues l on l.id = p.league_id
left join weighted w on w.player_id = p.id
left join league_fallback f on f.league_id = p.league_id;

comment on view public.player_market_values is
  'Matches played, averages, weighted performance score, market value in GBP '
  'and 0-99 card rating per player. Nothing here is stored.';

-- ---------------------------------------------------------------------------
-- player_cards
--
-- Everything a football card, ranking row or dashboard tile needs, in one
-- row per player, so a page needs a single query. Metric stats and attribute
-- counts are returned as JSONB because both are league-configurable.
-- ---------------------------------------------------------------------------

create view public.player_cards
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
  p.updated_at
from public.players p
join public.player_market_values mv on mv.player_id = p.id
left join metric_stats ms on ms.player_id = p.id
left join attribute_counts ac on ac.player_id = p.id;

comment on view public.player_cards is
  'One row per player with everything needed to render a card, ranking row or '
  'dashboard tile.';

-- Supabase's default privileges grant the anon role a set of (on a view,
-- inert) privileges at creation time. Revoked so that "anon holds nothing in
-- public" stays a true and checkable invariant — see supabase/tests.
revoke all on public.player_metric_averages from anon;
revoke all on public.player_market_values from anon;
revoke all on public.player_cards from anon;

grant select on public.player_metric_averages to authenticated;
grant select on public.player_market_values to authenticated;
grant select on public.player_cards to authenticated;

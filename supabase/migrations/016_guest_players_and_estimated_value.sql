-- ============================================================================
-- 016 — Guest players and the estimated market value
--
-- Two independent facts an administrator knows about a player that the league's
-- own history cannot tell it.
--
--   1. Some people are guests. They turn up once, play a real match and are
--      scored like anyone else, but they are not part of the league: sitting
--      them in the standings next to somebody who has played every week says
--      something untrue about both of them.
--
--   2. A brand-new player is priced at the league mean, because that is the
--      only honest guess a database can make with no matches to go on. An
--      administrator who has watched the person play knows better, and today
--      has no way to say so — which is exactly when it matters, because the
--      first team split is made off that guess.
--
-- Neither replaces anything derived. The estimate is read only while nobody has
-- scored the player; the moment a real result exists it is history that decides
-- the price, and the estimate stays only as a record of what was thought.
-- ============================================================================

alter table public.players
  add column is_guest boolean not null default false,
  add column estimated_market_value_gbp numeric(14, 2)
    check (estimated_market_value_gbp is null
           or estimated_market_value_gbp >= 0);

comment on column public.players.is_guest is
  'Counted in matches, not in the league. A guest is scored, valued and picked '
  'like anybody else, and is left out of the standings and the statistics.';

comment on column public.players.estimated_market_value_gbp is
  'What an administrator reckons a player is worth before anyone has scored '
  'them. Read only while they have no matches; ignored, but kept, afterwards.';

-- ---------------------------------------------------------------------------
-- player_market_values learns about the estimate
--
-- One change to the definition in 009: the estimate joins the chain of
-- fallbacks, ahead of the league mean and behind any real result.
--
-- It enters as a *score* rather than as a value, by dividing out the same
-- constant the value is later multiplied by. Storing the administrator's figure
-- in pounds is right — pounds are what they are thinking in — but
-- weighted_performance_score and market_value_gbp have to keep meaning the same
-- thing, and the card reads both. Converting once here is what keeps them
-- agreeing.
--
-- The two league-wide CTEs are deliberately left alone. A guest's score still
-- counts towards the mean and the spread every other player's rating is
-- measured against: they played the match, and pretending otherwise would
-- rewrite everybody else's afternoon.
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
-- The fallback for a player with no matches and no estimate is the mean market
-- value of players who do have matches, which cannot be expressed per-row and
-- so is computed once per league here.
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
),
-- Named once so the two columns below cannot drift apart. Left unrounded here
-- and rounded at each use, which is what 009 did and what keeps the existing
-- valuations to the penny. nullif guards a league whose constant is zero,
-- which would otherwise divide by it.
priced as (
  select
    p.id as player_id,
    coalesce(
      w.weighted_performance_score,
      p.estimated_market_value_gbp / nullif(l.market_constant_gbp, 0),
      f.fallback_score,
      0
    ) as performance_score
  from public.players p
  join public.leagues l on l.id = p.league_id
  left join weighted w on w.player_id = p.id
  left join league_fallback f on f.league_id = p.league_id
)
select
  p.league_id,
  p.id as player_id,
  coalesce(w.matches_played, 0) as matches_played,
  w.career_average,
  w.latest_score,
  round(pr.performance_score, 3) as weighted_performance_score,
  round(pr.performance_score * l.market_constant_gbp, 2) as market_value_gbp,
  public.to_card_rating(
    w.latest_score, lf.mean_latest_score, lf.spread_latest_score
  ) as card_rating,
  coalesce(w.total_goals, 0) as total_goals,
  coalesce(w.total_victories, 0) as total_victories
from public.players p
join public.leagues l on l.id = p.league_id
join priced pr on pr.player_id = p.id
left join weighted w on w.player_id = p.id
left join league_form lf on lf.league_id = p.league_id;

comment on view public.player_market_values is
  'Matches played, averages, weighted performance score, market value in GBP, '
  'goal and victory totals, and the 0-99 card rating per player. Nothing here '
  'is stored. A player with no matches is priced at the administrator''s '
  'estimate if there is one, and at the league mean otherwise.';

-- ---------------------------------------------------------------------------
-- player_cards carries both new columns through
--
-- Appended at the end of the select list: a replaced view may gain columns
-- only at the tail.
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
  mv.total_victories,
  p.is_guest,
  p.estimated_market_value_gbp
from public.players p
join public.player_market_values mv on mv.player_id = p.id
left join metric_stats ms on ms.player_id = p.id
left join attribute_counts ac on ac.player_id = p.id;

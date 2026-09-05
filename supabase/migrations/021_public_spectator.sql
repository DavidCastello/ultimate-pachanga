-- Public, read-only snapshot for the spectator experience.
--
-- The browser receives only league-facing data. Account ids, member emails,
-- player claim codes and every write path remain behind authentication and RLS.

alter table public.leagues
  add column if not exists is_public boolean not null default false;

comment on column public.leagues.is_public is
  'Whether this league can be viewed through the anonymous spectator snapshot.';

-- This deployment hosts one active friends league and intentionally publishes it.
update public.leagues
set is_public = true
where status = 'active';

create or replace function public.get_public_league_snapshot()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with chosen_league as (
    select l.*
    from public.leagues l
    where l.is_public
      and l.status = 'active'
    order by l.created_at
    limit 1
  )
  select jsonb_build_object(
    'league', coalesce(
      (
        select to_jsonb(l)
        from chosen_league l
      ),
      'null'::jsonb
    ),
    'metrics', coalesce(
      (
        select jsonb_agg(to_jsonb(metric) order by metric.display_order)
        from public.league_metrics metric
        join chosen_league l on l.id = metric.league_id
        where metric.is_active
      ),
      '[]'::jsonb
    ),
    'attributes', coalesce(
      (
        select jsonb_agg(to_jsonb(attribute) order by attribute.points desc, attribute.label)
        from public.league_attributes attribute
        join chosen_league l on l.id = attribute.league_id
        where attribute.is_active
      ),
      '[]'::jsonb
    ),
    'players', coalesce(
      (
        select jsonb_agg(
          to_jsonb(card) - 'user_id' - 'player_code'
          order by card.card_rating desc
        )
        from public.player_cards card
        join chosen_league l on l.id = card.league_id
      ),
      '[]'::jsonb
    ),
    'matches', coalesce(
      (
        select jsonb_agg(to_jsonb(match_row) order by match_row.played_at desc)
        from public.matches match_row
        join chosen_league l on l.id = match_row.league_id
        where match_row.status <> 'draft'
      ),
      '[]'::jsonb
    ),
    'squads', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'match_id', squad.match_id,
            'player_id', player.id,
            'first_name', player.first_name,
            'last_name', player.last_name,
            'nickname', player.nickname,
            'preferred_position', player.preferred_position,
            'team_side', squad.team_side,
            'pitch_slot', squad.pitch_slot,
            'market_value_gbp', squad.market_value_gbp
          )
          order by coalesce(nullif(btrim(player.nickname), ''), player.first_name || ' ' || player.last_name)
        )
        from public.match_players squad
        join public.matches match_row on match_row.id = squad.match_id
        join chosen_league l on l.id = match_row.league_id
        join public.players player on player.id = squad.player_id
        where match_row.status <> 'draft'
      ),
      '[]'::jsonb
    ),
    'scores', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'match_id', score.match_id,
            'player_id', player.id,
            'display_name', coalesce(
              nullif(btrim(player.nickname), ''),
              player.first_name || ' ' || player.last_name
            ),
            'metric_scores', score.metric_scores,
            'goals', score.goals,
            'victory', score.victory,
            'base_score', score.base_score,
            'attribute_points', score.attribute_points,
            'final_score', score.final_score,
            'attributes', coalesce(
              (
                select jsonb_agg(
                  jsonb_build_object(
                    'code', attribute.code,
                    'label', attribute.label,
                    'points', attribute.points
                  )
                  order by attribute.points desc, attribute.label
                )
                from public.player_match_score_attributes score_attribute
                join public.league_attributes attribute
                  on attribute.id = score_attribute.league_attribute_id
                where score_attribute.player_match_score_id = score.id
              ),
              '[]'::jsonb
            )
          )
          order by match_row.played_at desc, score.final_score desc
        )
        from public.player_match_scores score
        join public.matches match_row on match_row.id = score.match_id
        join chosen_league l on l.id = match_row.league_id
        join public.players player on player.id = score.player_id
        where match_row.status = 'scored'
      ),
      '[]'::jsonb
    )
  );
$$;

revoke all on function public.get_public_league_snapshot() from public;
grant execute on function public.get_public_league_snapshot() to anon, authenticated;

comment on function public.get_public_league_snapshot() is
  'Curated read-only data for the public spectator experience.';

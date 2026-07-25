import { supabase } from '@/lib/supabase'

export const statsKeys = {
  timeline: (leagueId: string) => ['stats', 'timeline', leagueId] as const,
}

/** A scored match, as the x axis of an evolution chart sees it. */
export interface TimelineMatch {
  id: string
  title: string
  playedAt: string
}

export interface TimelineScore {
  matchId: string
  playerId: string
  finalScore: number
  /** Keyed by metric code, on the raw 0–10 scale. */
  metricScores: Record<string, number>
}

export interface ScoreTimeline {
  /** Scored matches, oldest first. */
  matches: TimelineMatch[]
  scores: TimelineScore[]
}

/**
 * Every score the league has recorded, oldest match first.
 *
 * One round trip for the whole history: a season is a few dozen matches of a
 * dozen players, so this is far smaller than a request per jornada, and the
 * evolution chart needs all of it at once anyway — a rating is relative, so a
 * player's number at jornada five depends on everybody else's.
 */
export async function fetchScoreTimeline(
  leagueId: string,
): Promise<ScoreTimeline> {
  const { data, error } = await supabase
    .from('player_match_scores')
    .select(
      `player_id,
       final_score,
       metric_scores,
       matches!inner (id, title, played_at, league_id, status)`,
    )
    .eq('matches.league_id', leagueId)
    .eq('matches.status', 'scored')
    .order('played_at', { ascending: true, referencedTable: 'matches' })

  if (error) throw error

  // A Map keyed by id, because the rows arrive one per player and in match
  // order — so its insertion order is already the chronological match order.
  const matches = new Map<string, TimelineMatch>()

  const scores = data.map((row): TimelineScore => {
    matches.set(row.matches.id, {
      id: row.matches.id,
      title: row.matches.title,
      playedAt: row.matches.played_at,
    })

    return {
      matchId: row.matches.id,
      playerId: row.player_id,
      finalScore: row.final_score,
      metricScores: (row.metric_scores ?? {}) as Record<string, number>,
    }
  })

  return { matches: [...matches.values()], scores }
}

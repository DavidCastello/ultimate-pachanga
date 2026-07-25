import { calculateMean, calculateSpread, toCardRating } from '@/lib/scoring'
import type { ScoreTimeline, TimelineScore } from '@/features/stats/api'

/**
 * Per-jornada series for the evolution chart.
 *
 * Two rules make a jagged history readable as a line:
 *
 *   - A player who misses a jornada keeps the value they had. The alternative —
 *     a gap — would break every line in the chart on most jornadas, since a
 *     seven-a-side league rarely fields the whole squad.
 *   - A player has no value at all until their first appearance, so a signing
 *     starts mid-chart rather than flat-lining from jornada one.
 */

/** The series that plots the 0–99 card rating rather than a raw metric. */
export const RATING_SERIES_CODE = 'rating'

export interface EvolutionRow {
  matchId: string
  /** Short x-axis tick: J1, J2, … */
  label: string
  matchTitle: string
  playedAt: string
  /** Value per player id; null before that player's first appearance. */
  values: Record<string, number | null>
}

function groupByMatch(
  scores: readonly TimelineScore[],
): Map<string, TimelineScore[]> {
  const grouped = new Map<string, TimelineScore[]>()

  for (const score of scores) {
    const existing = grouped.get(score.matchId)
    if (existing) existing.push(score)
    else grouped.set(score.matchId, [score])
  }

  return grouped
}

/**
 * Every player who appears anywhere in the timeline.
 *
 * Rows carry a value for all of them rather than only the ones on screen, so
 * changing the selection re-reads the same rows instead of rebuilding them.
 */
export function listTimelinePlayerIds(timeline: ScoreTimeline): string[] {
  return [...new Set(timeline.scores.map((score) => score.playerId))]
}

/**
 * The chart's rows for one series, oldest jornada first.
 *
 * `seriesCode` is either RATING_SERIES_CODE or a metric code. The rating is
 * recomputed jornada by jornada — it is relative, so it cannot be read off the
 * stored score — from the same distribution the database uses: the mean and
 * population spread of every player's *latest* score at that point. A player
 * who did not play keeps their previous rating even though the distribution
 * around them moved; the line is a record of what each player did, and nobody
 * expects their number to change on a weekend they sat out.
 */
export function buildEvolutionRows(
  timeline: ScoreTimeline,
  seriesCode: string,
): EvolutionRow[] {
  const scoresByMatch = groupByMatch(timeline.scores)
  const playerIds = listTimelinePlayerIds(timeline)

  /** Each player's most recent final score — the rating's population. */
  const latestScores = new Map<string, number>()
  /** Each player's value as last plotted, carried across missed jornadas. */
  const plotted = new Map<string, number>()

  return timeline.matches.map((match, index) => {
    const played = scoresByMatch.get(match.id) ?? []

    for (const score of played) {
      latestScores.set(score.playerId, score.finalScore)
    }

    if (seriesCode === RATING_SERIES_CODE) {
      const population = [...latestScores.values()]
      const mean = calculateMean(population)
      const spread = calculateSpread(population)

      for (const score of played) {
        plotted.set(
          score.playerId,
          toCardRating(score.finalScore, mean, spread),
        )
      }
    } else {
      for (const score of played) {
        const value = score.metricScores[seriesCode]
        if (typeof value === 'number') plotted.set(score.playerId, value)
      }
    }

    return {
      matchId: match.id,
      label: `J${index + 1}`,
      matchTitle: match.title,
      playedAt: match.playedAt,
      values: Object.fromEntries(
        playerIds.map((playerId) => [playerId, plotted.get(playerId) ?? null]),
      ),
    }
  })
}

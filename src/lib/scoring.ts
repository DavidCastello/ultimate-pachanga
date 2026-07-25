/**
 * Scoring arithmetic, mirroring the formulas enforced in PostgreSQL.
 *
 * The database is the source of truth: `import_match_scores` recomputes every
 * figure server-side and rejects anything it disagrees with. These functions
 * exist so the CSV upload dialog can show a preview *before* importing, and so
 * card stats can be derived without an extra round trip.
 *
 * If a formula changes here it must change in the migrations too, and vice
 * versa. The tests in scoring.test.ts pin both to the worked examples in the
 * specification.
 */

/** Upper bound of the display scale used on cards. */
const CARD_STAT_MAX = 99

export interface MetricDefinition {
  code: string
  label: string
  minimumScore: number
  maximumScore: number
}

export interface AttributeDefinition {
  code: string
  label: string
  points: number
}

export interface ScoreBreakdown {
  baseScore: number
  attributePoints: number
  finalScore: number
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value))
}

/**
 * Rounds half away from zero, matching PostgreSQL's `round(numeric)`.
 *
 * JavaScript's `Math.round` rounds half *up*, so it disagrees with the
 * database on negative halves (-2.5 becomes -2 rather than -3). Card stats are
 * clamped at zero and never see that case, but relying on the coincidence
 * would be a trap for whoever reuses this next.
 */
function roundHalfAwayFromZero(value: number): number {
  return Math.sign(value) * Math.round(Math.abs(value))
}

/**
 * The mean of the supplied metric scores.
 *
 * Callers must pass a value for every active metric; a missing metric is a
 * validation error upstream, not something to silently average around.
 */
export function calculateBaseScore(metricScores: readonly number[]): number {
  if (metricScores.length === 0) {
    throw new Error('A base score needs at least one metric score')
  }

  const total = metricScores.reduce((sum, score) => sum + score, 0)
  return total / metricScores.length
}

export function calculateAttributePoints(
  attributes: readonly AttributeDefinition[],
): number {
  return attributes.reduce((sum, attribute) => sum + attribute.points, 0)
}

/**
 * Base score plus attribute points.
 *
 * Deliberately unclamped: a Puskás and an MVP on top of a strong performance
 * can exceed the metric maximum, and an injury can push a score below zero.
 * Both are intended.
 */
export function calculateScoreBreakdown(
  metricScores: readonly number[],
  attributes: readonly AttributeDefinition[],
): ScoreBreakdown {
  const baseScore = calculateBaseScore(metricScores)
  const attributePoints = calculateAttributePoints(attributes)

  return {
    baseScore,
    attributePoints,
    finalScore: baseScore + attributePoints,
  }
}

/**
 * Converts a 0–10 average onto the 0–99 scale shown on cards.
 *
 * Presentation only — nothing authoritative is derived from a card stat.
 */
export function toCardStat(average: number | null | undefined): number | null {
  if (average === null || average === undefined || Number.isNaN(average)) {
    return null
  }

  return clamp(roundHalfAwayFromZero(average * 10), 0, CARD_STAT_MAX)
}

export type CardTier = 'gold' | 'silver' | 'bronze'

/**
 * Card tier from a 0–99 rating.
 *
 * The thresholds are a visual choice, not league rules, so they live in the
 * frontend rather than the database.
 */
export function toCardTier(rating: number | null | undefined): CardTier {
  if (rating === null || rating === undefined) return 'bronze'
  if (rating >= 75) return 'gold'
  if (rating >= 60) return 'silver'
  return 'bronze'
}

/**
 * Whether a metric score is acceptable for its definition.
 *
 * Mirrors the range check inside `import_match_scores` so the upload preview
 * can flag a bad cell before anything is sent.
 */
export function isMetricScoreInRange(
  score: number,
  metric: MetricDefinition,
): boolean {
  return (
    Number.isFinite(score) &&
    score >= metric.minimumScore &&
    score <= metric.maximumScore
  )
}

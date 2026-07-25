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

/** Bounds and shape of the card rating. Mirrors `public.to_card_rating`. */
const CARD_RATING_CENTRE = 70
const CARD_RATING_POINTS_PER_DEVIATION = 12
const CARD_RATING_MIN = 45
const CARD_RATING_MAX = 99

/**
 * What a full victory adds to a final score.
 *
 * Mirrors `app.victory_points()`. Unlike metrics and attributes this is not
 * configurable per league — it is part of the definition of the score.
 */
export const VICTORY_POINTS = 2

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
  victoryPoints: number
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
 * The sum of the supplied metric scores.
 *
 * A sum rather than a mean, so that being good at everything beats being good
 * at one thing. With the four default metrics this puts the base score on a
 * 0–40 scale.
 *
 * Callers must pass a value for every active metric; a missing metric is a
 * validation error upstream, not something to silently total around.
 */
export function calculateBaseScore(metricScores: readonly number[]): number {
  if (metricScores.length === 0) {
    throw new Error('A base score needs at least one metric score')
  }

  return metricScores.reduce((sum, score) => sum + score, 0)
}

export function calculateAttributePoints(
  attributes: readonly AttributeDefinition[],
): number {
  return attributes.reduce((sum, attribute) => sum + attribute.points, 0)
}

/**
 * Whether a victory share is one the database will accept.
 *
 * A share rather than a flag: 1 won, 0 lost, 0.5 drawn, and anything between
 * for the games that end in an arrangement.
 */
export function isVictoryShareValid(victory: number): boolean {
  return Number.isFinite(victory) && victory >= 0 && victory <= 1
}

/** Whether a goal count is one the database will accept. */
export function isGoalCountValid(goals: number): boolean {
  return Number.isInteger(goals) && goals >= 0
}

/**
 * Metrics, plus attribute points, plus two points for a win.
 *
 * Deliberately unclamped: a Puskás and an MVP on top of a strong performance
 * can exceed the metric total, and an injury can push a score below zero.
 * Both are intended.
 *
 * Goals are not here on purpose — they are recorded and displayed but do not
 * score.
 */
export function calculateScoreBreakdown(
  metricScores: readonly number[],
  attributes: readonly AttributeDefinition[],
  victory: number,
): ScoreBreakdown {
  const baseScore = calculateBaseScore(metricScores)
  const attributePoints = calculateAttributePoints(attributes)
  const victoryPoints = victory * VICTORY_POINTS

  return {
    baseScore,
    attributePoints,
    victoryPoints,
    finalScore: baseScore + attributePoints + victoryPoints,
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

/**
 * Where a score sits among its peers, on the 45–99 card scale.
 *
 * Mirrors `public.to_card_rating`: the latest score placed on a normal
 * distribution of every player's latest score, centred on 70 with twelve points
 * per standard deviation. The database computes this for the current standings;
 * this exists so the evolution chart can compute what the rating *was* after
 * each past match, which nothing stores.
 *
 * With no spread to place anyone within — nobody has played, or everyone scored
 * identically — every player sits at the centre.
 */
export function toCardRating(
  latestScore: number | null | undefined,
  leagueMean: number | null | undefined,
  leagueSpread: number | null | undefined,
): number {
  if (
    latestScore === null ||
    latestScore === undefined ||
    leagueMean === null ||
    leagueMean === undefined ||
    !leagueSpread
  ) {
    return CARD_RATING_CENTRE
  }

  return clamp(
    roundHalfAwayFromZero(
      CARD_RATING_CENTRE +
        CARD_RATING_POINTS_PER_DEVIATION *
          ((latestScore - leagueMean) / leagueSpread),
    ),
    CARD_RATING_MIN,
    CARD_RATING_MAX,
  )
}

/**
 * Population standard deviation, as `stddev_pop` computes it.
 *
 * Population rather than sample, because a league is the whole population and
 * not an estimate drawn from one — and it yields 0 for a single player, which
 * toCardRating already handles.
 */
export function calculateSpread(values: readonly number[]): number {
  if (values.length === 0) return 0

  const mean = values.reduce((sum, value) => sum + value, 0) / values.length
  const variance =
    values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length

  return Math.sqrt(variance)
}

export function calculateMean(values: readonly number[]): number | null {
  if (values.length === 0) return null
  return values.reduce((sum, value) => sum + value, 0) / values.length
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

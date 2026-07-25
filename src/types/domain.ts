import type { Database } from '@/types/database'

/**
 * Application-facing types.
 *
 * PostgreSQL cannot express NOT NULL on a view column, so every field of
 * `player_cards` arrives typed as nullable even though most can never be null
 * in practice. Rather than sprinkle non-null assertions across the UI, view
 * rows are normalised once at the query boundary into the shapes below.
 */

export type PlayerPosition = Database['public']['Enums']['player_position']
export type MatchStatus = Database['public']['Enums']['match_status']
export type MemberRole = Database['public']['Enums']['member_role']
export type LeagueStatus = Database['public']['Enums']['league_status']
export type TeamSide = Database['public']['Enums']['team_side']
export type AttendanceStatus = Database['public']['Enums']['attendance_status']

export type PlayerRow = Database['public']['Tables']['players']['Row']
export type MatchRow = Database['public']['Tables']['matches']['Row']
export type LeagueRow = Database['public']['Tables']['leagues']['Row']
export type LeagueMetricRow =
  Database['public']['Tables']['league_metrics']['Row']
export type LeagueAttributeRow =
  Database['public']['Tables']['league_attributes']['Row']

export const PLAYER_POSITIONS = [
  'GK',
  'CB',
  'LB',
  'RB',
  'CDM',
  'CM',
  'CAM',
  'LW',
  'RW',
  'ST',
  'UT',
] as const satisfies readonly PlayerPosition[]

/** One row of `player_cards`, with nullability narrowed to reality. */
export interface PlayerCardData {
  id: string
  leagueId: string
  playerCode: string
  firstName: string
  lastName: string
  nickname: string | null
  displayName: string
  preferredPosition: PlayerPosition
  avatarPath: string | null
  isActive: boolean
  /** The account that plays as this player, or null while unclaimed. */
  userId: string | null
  matchesPlayed: number
  /** Null until the player has been scored at least once. */
  careerAverage: number | null
  latestScore: number | null
  weightedPerformanceScore: number
  marketValueGbp: number
  cardRating: number
  /** Keyed by metric code, values on the 0–99 scale. */
  metricCardStats: Record<string, number>
  /** Keyed by metric code, values on the raw 0–10 scale. */
  metricAverages: Record<string, number>
  /** Keyed by attribute code, how many times the player has received it. */
  attributeCounts: Record<string, number>
  attributeTotal: number
  totalGoals: number
  /** Victories accumulated. A decimal, because a draw is half a win. */
  totalVictories: number
}

type PlayerCardRow = Database['public']['Views']['player_cards']['Row']

function toNumberRecord(value: unknown): Record<string, number> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return {}
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .map(([key, raw]) => [key, Number(raw)] as const)
      .filter(([, parsed]) => Number.isFinite(parsed)),
  )
}

/**
 * Normalises a `player_cards` row.
 *
 * Returns null for a row missing the identifiers it cannot be rendered
 * without, so a malformed row is skipped rather than crashing a whole grid.
 */
export function toPlayerCardData(row: PlayerCardRow): PlayerCardData | null {
  if (!row.id || !row.league_id || !row.preferred_position) return null

  return {
    id: row.id,
    leagueId: row.league_id,
    playerCode: row.player_code ?? '',
    firstName: row.first_name ?? '',
    lastName: row.last_name ?? '',
    nickname: row.nickname,
    displayName:
      row.display_name ??
      `${row.first_name ?? ''} ${row.last_name ?? ''}`.trim(),
    preferredPosition: row.preferred_position,
    avatarPath: row.avatar_path,
    isActive: row.is_active ?? true,
    userId: row.user_id,
    matchesPlayed: row.matches_played ?? 0,
    careerAverage: row.career_average,
    latestScore: row.latest_score,
    weightedPerformanceScore: row.weighted_performance_score ?? 0,
    marketValueGbp: row.market_value_gbp ?? 0,
    cardRating: row.card_rating ?? 0,
    metricCardStats: toNumberRecord(row.metric_card_stats),
    metricAverages: toNumberRecord(row.metric_averages),
    attributeCounts: toNumberRecord(row.attribute_counts),
    attributeTotal: row.attribute_total ?? 0,
    totalGoals: row.total_goals ?? 0,
    totalVictories: Number(row.total_victories ?? 0),
  }
}

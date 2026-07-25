import type { LeagueMetricRow, PlayerCardData } from '@/types/domain'

/**
 * Test fixtures. Overrides are shallow-merged so a test states only the fields
 * it actually cares about.
 */

export const TEST_LEAGUE_ID = '11111111-1111-4111-8111-111111111111'

export function buildMetric(
  overrides: Partial<LeagueMetricRow> = {},
): LeagueMetricRow {
  return {
    id: 'metric-attack',
    league_id: TEST_LEAGUE_ID,
    code: 'attack',
    label: 'Ataque',
    display_order: 1,
    minimum_score: 0,
    maximum_score: 10,
    is_active: true,
    ...overrides,
  }
}

export const TEST_METRICS: LeagueMetricRow[] = [
  buildMetric(),
  buildMetric({
    id: 'metric-defence',
    code: 'defence',
    label: 'Defensa',
    display_order: 2,
  }),
  buildMetric({
    id: 'metric-tactics',
    code: 'tactics',
    label: 'Táctica',
    display_order: 3,
  }),
  buildMetric({
    id: 'metric-physical',
    code: 'physical',
    label: 'Físico',
    display_order: 4,
  }),
]

export function buildPlayerCard(
  overrides: Partial<PlayerCardData> = {},
): PlayerCardData {
  return {
    id: 'player-1',
    leagueId: TEST_LEAGUE_ID,
    playerCode: 'PLR-A7K2',
    firstName: 'David',
    lastName: 'Castelló',
    nickname: null,
    displayName: 'David Castelló',
    preferredPosition: 'CM',
    avatarPath: null,
    isActive: true,
    matchesPlayed: 2,
    careerAverage: 9.625,
    latestScore: 9.75,
    weightedPerformanceScore: 9.625,
    marketValueGbp: 9_625_000,
    cardRating: 96,
    metricCardStats: { attack: 65, defence: 85, tactics: 85, physical: 70 },
    metricAverages: { attack: 6.5, defence: 8.5, tactics: 8.5, physical: 7 },
    attributeCounts: { zamora: 1, mvp: 2 },
    attributeTotal: 3,
    ...overrides,
  }
}

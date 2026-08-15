import { describe, expect, it } from 'vitest'
import { toPlayerCardData } from '@/types/domain'
import type { Database } from '@/types/database'

type PlayerCardRow = Database['public']['Views']['player_cards']['Row']

/**
 * The minimum a row needs to be renderable. Everything else is deliberately
 * absent so each test states only the column it is about.
 */
function buildRow(overrides: Partial<PlayerCardRow> = {}): PlayerCardRow {
  return {
    id: 'player-1',
    league_id: 'league-1',
    preferred_position: 'CM',
    ...overrides,
  } as PlayerCardRow
}

describe('toPlayerCardData', () => {
  it('skips a row missing the identifiers it cannot be drawn without', () => {
    expect(toPlayerCardData(buildRow({ id: null }))).toBeNull()
    expect(toPlayerCardData(buildRow({ league_id: null }))).toBeNull()
    expect(toPlayerCardData(buildRow({ preferred_position: null }))).toBeNull()
  })

  /**
   * A deployed database one migration behind the bundle returns rows without
   * the new columns at all — `select('*')` asks for whatever exists. Undefined
   * has to land as the same "nobody said" the schema expresses as null, or it
   * reaches the edit form as the string "undefined" and is rejected as an
   * invalid amount.
   */
  describe('a row from a database that is a migration behind', () => {
    const stale = toPlayerCardData(
      buildRow({
        is_guest: undefined,
        estimated_market_value_gbp: undefined,
      } as Partial<PlayerCardRow>),
    )

    it('reads a missing estimate as no estimate', () => {
      expect(stale?.estimatedMarketValueGbp).toBeNull()
    })

    it('reads a missing guest flag as not a guest', () => {
      expect(stale?.isGuest).toBe(false)
    })
  })

  it('carries both through when the columns are there', () => {
    const card = toPlayerCardData(
      buildRow({ is_guest: true, estimated_market_value_gbp: 8_000_000 }),
    )

    expect(card?.isGuest).toBe(true)
    expect(card?.estimatedMarketValueGbp).toBe(8_000_000)
  })

  it('keeps a real null distinct from zero', () => {
    const unpriced = toPlayerCardData(
      buildRow({ estimated_market_value_gbp: null }),
    )
    const free = toPlayerCardData(buildRow({ estimated_market_value_gbp: 0 }))

    expect(unpriced?.estimatedMarketValueGbp).toBeNull()
    expect(free?.estimatedMarketValueGbp).toBe(0)
  })
})

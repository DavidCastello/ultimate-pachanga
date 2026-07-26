import { describe, expect, it } from 'vitest'
import { balanceTeams, type BalanceCandidate } from '@/lib/teamBalance'
import { DEFAULT_SQUAD_SIZE, type SquadSize } from '@/lib/formations'

/**
 * The split itself does not depend on how many fit on the pitch, so these tests
 * state a size only when that is what they are about.
 */
function balance(
  candidates: readonly BalanceCandidate[],
  squadSize: SquadSize = DEFAULT_SQUAD_SIZE,
) {
  return balanceTeams(candidates, squadSize)
}

function candidate(
  playerId: string,
  marketValueGbp: number,
  isGoalkeeper = false,
): BalanceCandidate {
  return { playerId, marketValueGbp, isGoalkeeper }
}

/** A roster of `count` players priced 1_000_000, 2_000_000, … and no keeper. */
function roster(count: number): BalanceCandidate[] {
  return Array.from({ length: count }, (_, index) =>
    candidate(`p${index + 1}`, (index + 1) * 1_000_000),
  )
}

function sideOf(result: ReturnType<typeof balance>, playerId: string): string {
  const assignment = result.assignments.find(
    (entry) => entry.playerId === playerId,
  )
  if (!assignment) throw new Error(`${playerId} was not assigned`)
  return assignment.teamSide
}

/**
 * The smallest gap any equal-sized split can achieve, by enumerating every
 * subset.
 *
 * Deliberately a second, dumber implementation: it is the only way to assert
 * that the branch-and-bound search actually returns the optimum rather than
 * something merely plausible.
 */
function minimumGapByBruteForce(values: readonly number[]): number {
  const total = values.length
  const homeCapacity = Math.ceil(total / 2)
  let best = Number.POSITIVE_INFINITY

  for (let mask = 0; mask < 1 << total; mask += 1) {
    let count = 0
    let gap = 0

    for (let index = 0; index < total; index += 1) {
      if (mask & (1 << index)) {
        count += 1
        gap += values[index]
      } else {
        gap -= values[index]
      }
    }

    if (count === homeCapacity) best = Math.min(best, Math.abs(gap))
  }

  return best
}

describe('balanceTeams', () => {
  it('splits an even convocatoria into two equal squads', () => {
    const result = balance(roster(14))

    const home = result.assignments.filter((entry) => entry.teamSide === 'home')
    const away = result.assignments.filter((entry) => entry.teamSide === 'away')

    expect(home).toHaveLength(7)
    expect(away).toHaveLength(7)
  })

  it('gives the odd player to the home side', () => {
    const result = balance(roster(13))

    expect(
      result.assignments.filter((entry) => entry.teamSide === 'home'),
    ).toHaveLength(7)
    expect(
      result.assignments.filter((entry) => entry.teamSide === 'away'),
    ).toHaveLength(6)
  })

  it('finds a perfect split when one exists', () => {
    // 10 + 7 = 9 + 8, which greedy also finds; the point is that the reported
    // difference is zero and both totals are stated.
    const result = balance([
      candidate('a', 10_000_000),
      candidate('b', 9_000_000),
      candidate('c', 8_000_000),
      candidate('d', 7_000_000),
    ])

    expect(result.difference).toBe(0)
    expect(result.homeValue).toBe(17_000_000)
    expect(result.awayValue).toBe(17_000_000)
    expect(sideOf(result, 'a')).toBe(sideOf(result, 'd'))
    expect(sideOf(result, 'b')).toBe(sideOf(result, 'c'))
  })

  it('beats the greedy split when descending assignment is not optimal', () => {
    // Three a side. Greedy — each player to the lighter side — ends with
    // 20+8+4 against 12+9+6, a gap of 5. The optimum is 20+6+4 against
    // 12+9+8: a gap of 1.
    const values = [20, 12, 9, 8, 6, 4].map((value) => value * 100_000)
    const result = balance(
      values.map((value, index) => candidate(`p${index}`, value)),
    )

    expect(result.difference).toBe(minimumGapByBruteForce(values))
  })

  it('matches an exhaustive search on awkward rosters', () => {
    // Values chosen so that no split is perfect and near-ties abound, which is
    // where a heuristic quietly settles for second best.
    const cases = [
      [7, 7, 6, 5, 4, 3, 3, 1],
      [99, 51, 50, 49, 48, 2, 1, 1, 1, 1],
      [13, 11, 7, 5, 3, 2],
      [1, 1, 1, 1, 1, 1, 1],
      [40, 39, 38, 20, 19, 18, 3, 2],
    ]

    for (const values of cases) {
      const scaled = values.map((value) => value * 10_000)
      const result = balance(
        scaled.map((value, index) => candidate(`p${index}`, value)),
      )

      expect(result.difference).toBe(minimumGapByBruteForce(scaled))
    }
  })

  it('is deterministic when several players are worth the same', () => {
    const identical = Array.from({ length: 10 }, (_, index) =>
      candidate(`p${index}`, 5_000_000),
    )

    const first = balance(identical)
    const second = balance([...identical].reverse())

    expect(first.assignments).toEqual(second.assignments)
    expect(first.difference).toBe(0)
  })

  it('puts a goalkeeper in goal on each side', () => {
    // The only split with a zero gap — 10 + 7 against 9 + 8 — is the one that
    // separates the two keepers, so this asserts placement rather than luck.
    const result = balance([
      candidate('gk-a', 10_000_000, true),
      candidate('out-a', 9_000_000),
      candidate('gk-b', 8_000_000, true),
      candidate('out-b', 7_000_000),
    ])

    const keepers = result.assignments.filter((entry) => entry.pitchSlot === 0)

    expect(keepers.map((entry) => entry.playerId).sort()).toEqual([
      'gk-a',
      'gk-b',
    ])
    expect(new Set(keepers.map((entry) => entry.teamSide)).size).toBe(2)
  })

  it('sends the cheapest player of a side without a keeper into goal', () => {
    const result = balance([
      candidate('rich', 9_000_000),
      candidate('poor', 1_000_000),
    ])

    const inGoal = result.assignments.filter((entry) => entry.pitchSlot === 0)

    expect(inGoal.map((entry) => entry.playerId).sort()).toEqual([
      'poor',
      'rich',
    ])
  })

  it('benches whoever does not fit on the pitch', () => {
    const result = balance(roster(18))

    const benched = result.assignments.filter(
      (entry) => entry.pitchSlot === null,
    )

    expect(benched).toHaveLength(4)

    for (const side of ['home', 'away'] as const) {
      const placed = result.assignments.filter(
        (entry) => entry.teamSide === side && entry.pitchSlot !== null,
      )

      expect(placed).toHaveLength(DEFAULT_SQUAD_SIZE)
      expect(new Set(placed.map((entry) => entry.pitchSlot)).size).toBe(
        DEFAULT_SQUAD_SIZE,
      )
    }
  })

  it.each([5, 6, 7, 8] as const)(
    'fills a pitch of %i a side and benches the rest',
    (squadSize) => {
      const result = balance(roster(18), squadSize)

      for (const side of ['home', 'away'] as const) {
        const ofSide = result.assignments.filter(
          (entry) => entry.teamSide === side,
        )
        const placed = ofSide.filter((entry) => entry.pitchSlot !== null)

        expect(placed).toHaveLength(squadSize)
        // Slots 0 to squadSize - 1, each used once.
        expect(placed.map((entry) => entry.pitchSlot).sort()).toEqual(
          Array.from({ length: squadSize }, (_, index) => index),
        )
        expect(ofSide).toHaveLength(9)
      }
    },
  )

  it('places everyone when the squad is smaller than the pitch', () => {
    const result = balance(roster(8), 8)

    expect(
      result.assignments.filter((entry) => entry.pitchSlot === null),
    ).toHaveLength(0)
  })

  it('benches the cheapest players rather than the best', () => {
    const squad = roster(18)
    const valueOf = new Map(
      squad.map((member) => [member.playerId, member.marketValueGbp]),
    )
    const result = balance(squad)

    for (const side of ['home', 'away'] as const) {
      const ofSide = result.assignments.filter(
        (entry) => entry.teamSide === side,
      )
      const outfieldValues = ofSide
        .filter((entry) => entry.pitchSlot !== null && entry.pitchSlot > 0)
        .map((entry) => valueOf.get(entry.playerId)!)
      const benchedValues = ofSide
        .filter((entry) => entry.pitchSlot === null)
        .map((entry) => valueOf.get(entry.playerId)!)

      expect(Math.max(...benchedValues)).toBeLessThan(
        Math.min(...outfieldValues),
      )
    }
  })

  it('handles a convocatoria of one', () => {
    const result = balance([candidate('alone', 3_000_000)])

    expect(result.assignments).toEqual([
      { playerId: 'alone', teamSide: 'home', pitchSlot: 0 },
    ])
    expect(result.difference).toBe(3_000_000)
  })

  it('handles an empty convocatoria', () => {
    expect(balance([])).toEqual({
      assignments: [],
      homeValue: 0,
      awayValue: 0,
      difference: 0,
    })
  })
})

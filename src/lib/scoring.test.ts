import { describe, expect, it } from 'vitest'
import {
  calculateAttributePoints,
  calculateBaseScore,
  calculateScoreBreakdown,
  isMetricScoreInRange,
  toCardStat,
  toCardTier,
  type AttributeDefinition,
} from './scoring'

const MVP: AttributeDefinition = { code: 'mvp', label: 'MVP', points: 2 }
const PUSKAS: AttributeDefinition = {
  code: 'puskas',
  label: 'Puskas',
  points: 2,
}
const ZAMORA: AttributeDefinition = {
  code: 'zamora',
  label: 'Zamora',
  points: 2,
}
const INJURY: AttributeDefinition = {
  code: 'injury',
  label: 'Lesión',
  points: -2,
}

describe('calculateBaseScore', () => {
  // The worked example from the specification.
  it('averages the metric scores', () => {
    expect(calculateBaseScore([6, 9, 8, 7])).toBe(7.5)
  })

  it('handles a single metric', () => {
    expect(calculateBaseScore([8])).toBe(8)
  })

  it('refuses to average nothing', () => {
    expect(() => calculateBaseScore([])).toThrow(/at least one metric/i)
  })
})

describe('calculateAttributePoints', () => {
  it('is zero when no attributes were awarded', () => {
    expect(calculateAttributePoints([])).toBe(0)
  })

  it('sums multiple positive attributes', () => {
    expect(calculateAttributePoints([MVP, PUSKAS])).toBe(4)
  })

  it('subtracts negative attributes', () => {
    expect(calculateAttributePoints([INJURY])).toBe(-2)
  })

  it('nets positive and negative attributes against each other', () => {
    expect(calculateAttributePoints([MVP, INJURY])).toBe(0)
  })
})

describe('calculateScoreBreakdown', () => {
  it('matches the specification example: 7.5 base plus Zamora is 9.5', () => {
    expect(calculateScoreBreakdown([6, 9, 8, 7], [ZAMORA])).toEqual({
      baseScore: 7.5,
      attributePoints: 2,
      finalScore: 9.5,
    })
  })

  it('lets a final score exceed the metric maximum', () => {
    expect(calculateScoreBreakdown([8, 8, 9, 7], [MVP, PUSKAS])).toEqual({
      baseScore: 8,
      attributePoints: 4,
      finalScore: 12,
    })
  })

  it('lets a final score fall below zero', () => {
    expect(
      calculateScoreBreakdown([1, 0, 0, 1], [INJURY, INJURY]).finalScore,
    ).toBe(-3.5)
  })
})

describe('toCardStat', () => {
  it('scales a 0-10 average onto 0-99', () => {
    expect(toCardStat(7.5)).toBe(75)
  })

  it('clamps above 99', () => {
    // A final score of 12.0 would scale to 120.
    expect(toCardStat(12)).toBe(99)
  })

  it('clamps below 0', () => {
    expect(toCardStat(-3)).toBe(0)
  })

  it('rounds to the nearest whole stat', () => {
    expect(toCardStat(8.25)).toBe(83)
    expect(toCardStat(9.875)).toBe(99)
    expect(toCardStat(7.749)).toBe(77)
  })

  // PostgreSQL rounds halves away from zero; Math.round rounds them up.
  it('rounds halves away from zero, as PostgreSQL does', () => {
    expect(toCardStat(8.25)).toBe(83)
    expect(toCardStat(0.25)).toBe(3)
  })

  it('has no value for a player with no average', () => {
    expect(toCardStat(null)).toBeNull()
    expect(toCardStat(undefined)).toBeNull()
  })
})

describe('toCardTier', () => {
  it('awards gold from 75', () => {
    expect(toCardTier(99)).toBe('gold')
    expect(toCardTier(75)).toBe('gold')
  })

  it('awards silver from 60', () => {
    expect(toCardTier(74)).toBe('silver')
    expect(toCardTier(60)).toBe('silver')
  })

  it('awards bronze below 60', () => {
    expect(toCardTier(59)).toBe('bronze')
    expect(toCardTier(0)).toBe('bronze')
  })

  it('falls back to bronze for an unrated player', () => {
    expect(toCardTier(null)).toBe('bronze')
  })
})

describe('isMetricScoreInRange', () => {
  const attack = {
    code: 'attack',
    label: 'Ataque',
    minimumScore: 0,
    maximumScore: 10,
  }

  it('accepts the boundaries', () => {
    expect(isMetricScoreInRange(0, attack)).toBe(true)
    expect(isMetricScoreInRange(10, attack)).toBe(true)
  })

  it('rejects values outside the range', () => {
    expect(isMetricScoreInRange(-1, attack)).toBe(false)
    expect(isMetricScoreInRange(11, attack)).toBe(false)
  })

  it('rejects values that are not finite numbers', () => {
    expect(isMetricScoreInRange(Number.NaN, attack)).toBe(false)
    expect(isMetricScoreInRange(Number.POSITIVE_INFINITY, attack)).toBe(false)
  })
})

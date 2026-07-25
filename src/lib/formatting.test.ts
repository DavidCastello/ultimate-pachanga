import { describe, expect, it } from 'vitest'
import {
  formatAttributePoints,
  formatMarketValue,
  formatMarketValueExact,
  formatPosition,
  formatScore,
  toInitials,
} from './formatting'

/**
 * Intl separates a number from its currency symbol with a non-breaking space,
 * and which whitespace it picks has changed between ICU versions. Comparing
 * with ordinary spaces keeps these assertions about the format, not the
 * runtime's choice of separator.
 */
function normalizeSpaces(value: string): string {
  return value.replace(/\s/g, ' ')
}

describe('formatMarketValue', () => {
  it('abbreviates millions with two decimals', () => {
    expect(formatMarketValue(8_250_000)).toBe('£8,25 M')
    expect(formatMarketValue(1_000_000)).toBe('£1,00 M')
  })

  // Beyond ten million the decimals stop earning their space.
  it('drops the decimals past ten million', () => {
    expect(formatMarketValue(40_000_000)).toBe('£40 M')
  })

  it('abbreviates thousands', () => {
    expect(formatMarketValue(750_000)).toBe('£750 K')
  })

  it('shows small values exactly', () => {
    expect(normalizeSpaces(formatMarketValue(0))).toBe('0 £')
  })

  it('has no value for an unpriced player', () => {
    expect(formatMarketValue(null)).toBe('—')
    expect(formatMarketValue(undefined)).toBe('—')
  })
})

describe('formatMarketValueExact', () => {
  it('shows the full figure', () => {
    expect(normalizeSpaces(formatMarketValueExact(8_250_000))).toBe(
      '8.250.000 £',
    )
  })
})

describe('formatScore', () => {
  it('always shows at least one decimal', () => {
    expect(formatScore(7)).toBe('7,0')
    expect(formatScore(7.5)).toBe('7,5')
  })

  it('keeps two decimals when they exist', () => {
    expect(formatScore(9.63)).toBe('9,63')
  })

  it('has no value for an unscored player', () => {
    expect(formatScore(null)).toBe('—')
  })
})

describe('formatAttributePoints', () => {
  it('signs positive points', () => {
    expect(formatAttributePoints(2)).toBe('+2')
  })

  // A typographic minus, not a hyphen.
  it('signs negative points', () => {
    expect(formatAttributePoints(-2)).toBe('−2')
  })

  it('leaves zero unsigned', () => {
    expect(formatAttributePoints(0)).toBe('0')
  })
})

describe('toInitials', () => {
  it('takes the first letter of each name', () => {
    expect(toInitials('David', 'Castelló')).toBe('DC')
  })

  it('uppercases them', () => {
    expect(toInitials('david', 'castelló')).toBe('DC')
  })

  it('copes with a single name', () => {
    expect(toInitials('David', null)).toBe('D')
  })

  it('falls back to the display name', () => {
    expect(toInitials(null, null, 'Juanito')).toBe('J')
  })

  it('never renders blank', () => {
    expect(toInitials(null, null)).toBe('?')
    expect(toInitials('', '', '')).toBe('?')
  })
})

describe('formatPosition', () => {
  it('translates known positions', () => {
    expect(formatPosition('GK')).toBe('Portero')
    expect(formatPosition('UT')).toBe('Polivalente')
  })

  it('passes through an unknown code rather than hiding it', () => {
    expect(formatPosition('XYZ')).toBe('XYZ')
  })

  it('has no value for a missing position', () => {
    expect(formatPosition(null)).toBe('—')
  })
})

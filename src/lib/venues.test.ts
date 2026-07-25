import { describe, expect, it } from 'vitest'
import { getVenueImage } from './venues'

describe('getVenueImage', () => {
  it('recognises UIB however the location was typed', () => {
    expect(getVenueImage('UIB')).toBe('/venues/uib.webp')
    expect(getVenueImage('Campus uib, campo 2')).toBe('/venues/uib.webp')
    expect(getVenueImage('Universitat de les Illes Balears')).toBe(
      '/venues/uib.webp',
    )
  })

  it('still returns a pitch for an unknown location', () => {
    expect(getVenueImage('Polideportivo Roco')).toBe('/venues/uib.webp')
  })
})

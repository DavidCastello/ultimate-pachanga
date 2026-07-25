import { describe, expect, it } from 'vitest'
import {
  CARD_HEIGHT_PERCENT,
  CARD_WIDTH_PERCENT,
  DEFAULT_FORMATION,
  FORMATIONS,
  GOALKEEPER_SLOT,
  SQUAD_SIZE,
  describeSlot,
  getPitchSlots,
  type Formation,
} from './formations'

describe('formations', () => {
  it('offers exactly the four supported layouts', () => {
    expect(FORMATIONS).toEqual(['2-3-1', '3-3', '3-2-1', '1-3-2'])
  })

  it('defaults to 2-3-1', () => {
    expect(DEFAULT_FORMATION).toBe('2-3-1')
  })

  it.each(FORMATIONS)('%s fields a full squad of seven', (formation) => {
    expect(getPitchSlots(formation)).toHaveLength(SQUAD_SIZE)
  })

  it.each(FORMATIONS)('%s numbers slots 0 to 6 without gaps', (formation) => {
    const slots = getPitchSlots(formation).map((entry) => entry.slot)
    expect(slots).toEqual([0, 1, 2, 3, 4, 5, 6])
  })

  it.each(FORMATIONS)(
    '%s puts exactly one goalkeeper on slot 0, at the bottom',
    (formation) => {
      const slots = getPitchSlots(formation)
      const keepers = slots.filter((entry) => entry.isGoalkeeper)

      expect(keepers).toHaveLength(1)
      expect(keepers[0].slot).toBe(GOALKEEPER_SLOT)
      expect(keepers[0].x).toBe(50)
      // Deeper than every outfielder.
      const deepestOutfielder = Math.max(
        ...slots.filter((entry) => !entry.isGoalkeeper).map((entry) => entry.y),
      )
      expect(keepers[0].y).toBeGreaterThan(deepestOutfielder)
    },
  )

  it.each(FORMATIONS)('%s keeps every slot inside the pitch', (formation) => {
    for (const slot of getPitchSlots(formation)) {
      expect(slot.x).toBeGreaterThanOrEqual(0)
      expect(slot.x).toBeLessThanOrEqual(100)
      expect(slot.y).toBeGreaterThanOrEqual(0)
      expect(slot.y).toBeLessThanOrEqual(100)
    }
  })

  describe('line composition', () => {
    function lineSizes(formation: Formation): number[] {
      const outfield = getPitchSlots(formation).filter(
        (slot) => !slot.isGoalkeeper,
      )
      const byLine = new Map<number, number>()
      for (const slot of outfield) {
        byLine.set(slot.lineIndex, (byLine.get(slot.lineIndex) ?? 0) + 1)
      }
      return [...byLine.entries()]
        .sort(([left], [right]) => left - right)
        .map(([, count]) => count)
    }

    it('reads 2-3-1 as two defenders, three midfielders, one forward', () => {
      expect(lineSizes('2-3-1')).toEqual([2, 3, 1])
    })

    it('reads 3-3 as two lines of three', () => {
      expect(lineSizes('3-3')).toEqual([3, 3])
    })

    it('reads 3-2-1 as three, two, one', () => {
      expect(lineSizes('3-2-1')).toEqual([3, 2, 1])
    })

    it('reads 1-3-2 as one, three, two', () => {
      expect(lineSizes('1-3-2')).toEqual([1, 3, 2])
    })
  })

  it.each(FORMATIONS)(
    '%s places the defensive line behind the attacking line',
    (formation) => {
      const outfield = getPitchSlots(formation).filter(
        (slot) => !slot.isGoalkeeper,
      )
      const defence = outfield.filter((slot) => slot.lineIndex === 0)
      const furthestForward = Math.min(...outfield.map((slot) => slot.y))

      // Larger y is further back, so the defence must sit below the attack.
      expect(defence[0].y).toBeGreaterThan(furthestForward)
    },
  )

  it('centres a lone player in their line', () => {
    // The single striker in 2-3-1 and the single sweeper in 1-3-2.
    const striker = getPitchSlots('2-3-1').find((slot) => slot.lineIndex === 2)
    expect(striker?.x).toBe(50)

    const sweeper = getPitchSlots('1-3-2').find((slot) => slot.lineIndex === 0)
    expect(sweeper?.x).toBe(50)
  })

  it('spreads a line symmetrically about the centre', () => {
    const midfield = getPitchSlots('2-3-1').filter(
      (slot) => slot.lineIndex === 1,
    )

    expect(midfield).toHaveLength(3)
    expect(midfield[1].x).toBe(50)
    expect(midfield[0].x + midfield[2].x).toBe(100)
  })

  it('orders a line left to right', () => {
    const defence = getPitchSlots('3-3').filter((slot) => slot.lineIndex === 0)
    const xs = defence.map((slot) => slot.x)

    expect(xs).toEqual([...xs].sort((left, right) => left - right))
  })

  it.each(FORMATIONS)('%s gives every slot a distinct spot', (formation) => {
    const spots = getPitchSlots(formation).map((slot) => `${slot.x},${slot.y}`)
    expect(new Set(spots).size).toBe(spots.length)
  })
})

/**
 * The card is portrait and four rows of them have to share the pitch, so the
 * sizes and the line depths only work as a set. Enlarging the card once pushed
 * the goalkeeper straight through the bottom edge; these assertions are here so
 * that fails a test rather than shipping.
 */
describe('cards fit the pitch', () => {
  const halfHeight = CARD_HEIGHT_PERCENT / 2
  const halfWidth = CARD_WIDTH_PERCENT / 2

  it('is a portrait card', () => {
    expect(CARD_HEIGHT_PERCENT).toBeGreaterThan(CARD_WIDTH_PERCENT)
  })

  it.each(FORMATIONS)('%s never clips a card off the pitch', (formation) => {
    for (const slot of getPitchSlots(formation)) {
      expect(slot.y - halfHeight).toBeGreaterThanOrEqual(0)
      expect(slot.y + halfHeight).toBeLessThanOrEqual(100)
      expect(slot.x - halfWidth).toBeGreaterThanOrEqual(0)
      expect(slot.x + halfWidth).toBeLessThanOrEqual(100)
    }
  })

  it.each(FORMATIONS)('%s keeps clear space between rows', (formation) => {
    const depths = [
      ...new Set(getPitchSlots(formation).map((slot) => slot.y)),
    ].sort((left, right) => left - right)

    for (let index = 1; index < depths.length; index += 1) {
      const gap = depths[index] - depths[index - 1]
      expect(gap).toBeGreaterThan(CARD_HEIGHT_PERCENT)
    }
  })

  it.each(FORMATIONS)('%s keeps clear space within a row', (formation) => {
    const slots = getPitchSlots(formation)
    const byDepth = new Map<number, number[]>()

    for (const slot of slots) {
      byDepth.set(slot.y, [...(byDepth.get(slot.y) ?? []), slot.x])
    }

    for (const positions of byDepth.values()) {
      const sorted = [...positions].sort((left, right) => left - right)
      for (let index = 1; index < sorted.length; index += 1) {
        expect(sorted[index] - sorted[index - 1]).toBeGreaterThan(
          CARD_WIDTH_PERCENT,
        )
      }
    }
  })

  it.each(FORMATIONS)(
    '%s leaves the goalkeeper clear of the defence',
    (formation) => {
      const slots = getPitchSlots(formation)
      const keeper = slots.find((slot) => slot.isGoalkeeper)!
      const deepestOutfielder = Math.max(
        ...slots.filter((slot) => !slot.isGoalkeeper).map((slot) => slot.y),
      )

      expect(keeper.y - halfHeight).toBeGreaterThan(
        deepestOutfielder + halfHeight,
      )
    },
  )
})

describe('describeSlot', () => {
  it('names the goalkeeper slot', () => {
    expect(describeSlot('2-3-1', 0)).toBe('Portería')
  })

  it('names a position within its line', () => {
    expect(describeSlot('2-3-1', 3)).toBe('Centro del campo, posición 1 de 3')
  })

  it('omits the position when a line holds one player', () => {
    expect(describeSlot('2-3-1', 6)).toBe('Ataque')
  })

  // With two lines the second one is the attack, not the midfield.
  it('calls the second line of a two-line formation the attack', () => {
    expect(describeSlot('3-3', 4)).toBe('Ataque, posición 1 de 3')
  })

  it('describes the defence', () => {
    expect(describeSlot('2-3-1', 1)).toBe('Defensa, posición 1 de 2')
  })
})

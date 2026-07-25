import type { Database } from '@/types/database'

/**
 * Pitch formations for Fútbol 7.
 *
 * Seven a side: one goalkeeper and six outfielders. The goalkeeper is not part
 * of the formation name — they are always slot 0, always at the bottom of their
 * own half — so `2-3-1` describes the six outfielders as two defenders, three
 * midfielders and one forward.
 *
 * Coordinates are percentages of the pitch image, measured from its top-left.
 * Each team's pitch is drawn with their own goal at the bottom, so a larger `y`
 * is further back.
 */

export type Formation = Database['public']['Enums']['pitch_formation']

export const DEFAULT_FORMATION: Formation = '2-3-1'

/** Outfield players per line, from the defensive line forwards. */
const FORMATION_LINES: Record<Formation, readonly number[]> = {
  '2-3-1': [2, 3, 1],
  '3-3': [3, 3],
  '3-2-1': [3, 2, 1],
  '1-3-2': [1, 3, 2],
}

export const FORMATIONS = Object.keys(FORMATION_LINES) as Formation[]

/** Total players per side, goalkeeper included. */
export const SQUAD_SIZE = 7

/** Slot the goalkeeper always occupies. */
export const GOALKEEPER_SLOT = 0

/**
 * Vertical band the outfield lines are spread across, as percentages.
 *
 * Stops short of both ends: the goalkeeper needs the space behind, and a card
 * sitting on the very top edge would be clipped.
 */
const OUTFIELD_TOP = 20
const OUTFIELD_BOTTOM = 68

/** The goalkeeper sits between the outfielders and their own goal line. */
const GOALKEEPER_Y = 87

/** Horizontal band a line of players is spread across. */
const LINE_LEFT = 20
const LINE_RIGHT = 80

export interface PitchSlot {
  /** 0 for the goalkeeper, then 1..6 forwards along each line. */
  slot: number
  /** Percentage from the left edge. */
  x: number
  /** Percentage from the top edge. */
  y: number
  isGoalkeeper: boolean
  /** 0 is the defensive line; the goalkeeper is -1. */
  lineIndex: number
}

/**
 * Spreads `count` players evenly across the pitch width.
 *
 * A lone player takes the middle rather than one edge of the band, which is
 * what a single striker or sweeper should look like.
 */
function spreadAcross(count: number): number[] {
  if (count <= 0) return []
  if (count === 1) return [50]

  const step = (LINE_RIGHT - LINE_LEFT) / (count - 1)
  return Array.from({ length: count }, (_, index) => LINE_LEFT + index * step)
}

/** Line count the outfield band is sized for; fewer lines use less of it. */
const REFERENCE_LINE_COUNT = 3

/**
 * Distributes the lines between the back and front of the outfield band.
 *
 * The band contracts around its centre when a formation has fewer lines. At the
 * full width a two-line shape like 3-3 would push its defence and attack to the
 * extremes and leave the middle third of the pitch conspicuously empty, which
 * reads as a rendering fault rather than as a formation.
 */
function lineDepths(lineCount: number): number[] {
  if (lineCount <= 0) return []

  const centre = (OUTFIELD_TOP + OUTFIELD_BOTTOM) / 2
  if (lineCount === 1) return [centre]

  const fullSpan = OUTFIELD_BOTTOM - OUTFIELD_TOP
  const span = fullSpan * Math.min(1, lineCount / REFERENCE_LINE_COUNT)

  const back = centre + span / 2
  const step = span / (lineCount - 1)

  // Descending, so index 0 is the deepest line: the defence.
  return Array.from({ length: lineCount }, (_, index) => back - index * step)
}

/**
 * Every slot of a formation, goalkeeper first, then outfielders numbered from
 * the back line forwards and left to right within each line.
 */
export function getPitchSlots(formation: Formation): PitchSlot[] {
  const lines = FORMATION_LINES[formation]
  const depths = lineDepths(lines.length)

  const slots: PitchSlot[] = [
    {
      slot: GOALKEEPER_SLOT,
      x: 50,
      y: GOALKEEPER_Y,
      isGoalkeeper: true,
      lineIndex: -1,
    },
  ]

  let slot = GOALKEEPER_SLOT + 1
  lines.forEach((playersInLine, lineIndex) => {
    for (const x of spreadAcross(playersInLine)) {
      slots.push({
        slot,
        x,
        y: depths[lineIndex],
        isGoalkeeper: false,
        lineIndex,
      })
      slot += 1
    }
  })

  return slots
}

/** How a formation reads to a user: the goalkeeper is implied, not shown. */
export function formatFormation(formation: Formation): string {
  return formation
}

/** Line labels, used to describe a slot for screen readers. */
const LINE_LABELS = ['Defensa', 'Centro del campo', 'Ataque']

/**
 * Describes a slot in words, e.g. "Portería" or "Defensa, posición 2 de 3".
 *
 * Drag-and-drop is unusable without this: a screen reader otherwise announces
 * seven identical buttons.
 */
export function describeSlot(formation: Formation, slot: number): string {
  if (slot === GOALKEEPER_SLOT) return 'Portería'

  const slots = getPitchSlots(formation)
  const target = slots.find((candidate) => candidate.slot === slot)
  if (!target) return `Posición ${slot}`

  const lines = FORMATION_LINES[formation]
  const sameLine = slots.filter(
    (candidate) => candidate.lineIndex === target.lineIndex,
  )
  const positionInLine =
    sameLine.findIndex((candidate) => candidate.slot === slot) + 1

  // With two outfield lines the second is the attack, not the midfield.
  const label =
    lines.length === 2 && target.lineIndex === 1
      ? 'Ataque'
      : (LINE_LABELS[target.lineIndex] ?? `Línea ${target.lineIndex + 1}`)

  return sameLine.length === 1
    ? label
    : `${label}, posición ${positionInLine} de ${sameLine.length}`
}

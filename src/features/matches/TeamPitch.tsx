import { PlayerCard } from '@/components/PlayerCard'
import { cn } from '@/lib/utils'
import {
  CARD_WIDTH_PERCENT,
  describeSlot,
  getPitchSlots,
  type Formation,
} from '@/lib/formations'
import type { LeagueMetricRow, PlayerCardData } from '@/types/domain'

/**
 * One team laid out on a pitch.
 *
 * The pitch is drawn with the team's own goal at the bottom, so the goalkeeper
 * sits at the foot of the image and the attack points upwards — the way anyone
 * reading a formation expects to see it.
 *
 * Cards are placed by percentage over the image, so the whole thing scales with
 * its container and needs no breakpoint-specific coordinates.
 */

export interface PitchAssignment {
  slot: number
  player: PlayerCardData | null
}

interface TeamPitchProps {
  /** Rendered by the parent, above the formation control. */
  formation: Formation
  assignments: readonly PitchAssignment[]
  metrics: readonly LeagueMetricRow[]
  /** Stable key for a slot, shared with the swapping hook. */
  slotKey: (slot: number) => string
  selectedKey: string | null
  draggingKey: string | null
  overKey: string | null
  interactive: boolean
  getHandlers: (key: string) => {
    onPointerDown: (event: React.PointerEvent) => void
    onClick: (event: React.MouseEvent) => void
    onKeyDown: (event: React.KeyboardEvent) => void
  }
}

export function TeamPitch({
  formation,
  assignments,
  metrics,
  slotKey,
  selectedKey,
  draggingKey,
  overKey,
  interactive,
  getHandlers,
}: TeamPitchProps) {
  const slots = getPitchSlots(formation)
  const bySlot = new Map(
    assignments.map((assignment) => [assignment.slot, assignment.player]),
  )

  return (
    <div
      className="relative w-full overflow-hidden rounded-xl border"
      // Matches the pitch image, so the percentage coordinates below land where
      // they should at any width.
      style={{ aspectRatio: '1000 / 1250' }}
    >
      {/* Eager, not lazy: this is the main visual of the page, both pitches
          share the one request, and deferring it leaves the line-up floating
          over a blank rectangle. */}
      <img
        src={`${import.meta.env.BASE_URL}pitch.webp`}
        alt=""
        className="absolute inset-0 size-full object-cover"
        draggable={false}
      />

      {slots.map((slot) => {
        const player = bySlot.get(slot.slot) ?? null
        const key = slotKey(slot.slot)
        const isSelected = selectedKey === key
        const isCandidate =
          interactive && selectedKey !== null && selectedKey !== key
        const isDragging = draggingKey === key
        const isOver = overKey === key && draggingKey !== key
        const label = describeSlot(formation, slot.slot)

        return (
          <div
            key={slot.slot}
            data-testid="pitch-slot"
            data-slot={slot.slot}
            data-slot-key={key}
            data-occupied={player ? 'true' : 'false'}
            className="absolute"
            style={{
              left: `${slot.x}%`,
              top: `${slot.y}%`,
              width: `max(${CARD_WIDTH_PERCENT}%, 4rem)`,
              transform: 'translate(-50%, -50%)',
            }}
          >
            {player ? (
              <div
                role={interactive ? 'button' : undefined}
                tabIndex={interactive ? 0 : undefined}
                aria-label={
                  interactive
                    ? `${player.displayName}, ${label}. Pulsa para seleccionar e intercambiar.`
                    : `${player.displayName}, ${label}`
                }
                aria-pressed={interactive ? isSelected : undefined}
                className={cn(
                  'rounded-lg drop-shadow-[0_10px_14px_rgb(234_175_53/0.2)] outline-none',
                  interactive && 'cursor-grab touch-none select-none',
                  interactive &&
                    'focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1',
                  isSelected && 'ring-2 ring-primary ring-offset-2',
                  // Everything else becomes a visible target, so the second tap
                  // is an obvious move rather than a guess.
                  isCandidate && 'ring-1 ring-primary/50',
                  // The original stays put but recedes while dragging, so the
                  // pitch never looks like it lost a player.
                  isDragging && 'opacity-30',
                  isOver && 'ring-2 ring-tier-gold ring-offset-1',
                )}
                {...(interactive ? getHandlers(key) : {})}
              >
                <PlayerCard player={player} metrics={metrics} compact />
              </div>
            ) : (
              <div
                role={interactive ? 'button' : undefined}
                tabIndex={interactive ? 0 : undefined}
                aria-label={
                  interactive
                    ? `${label}: vacío. Pulsa para colocar al jugador seleccionado.`
                    : `${label}: vacío`
                }
                className={cn(
                  // Same footprint as a card, so an empty position reads as a
                  // gap in the formation rather than a smaller thing.
                  'flex aspect-[4/5] items-center justify-center rounded-lg border border-dashed border-white/30 bg-black/40 text-center text-[0.5625rem] leading-tight font-medium text-white/70',
                  interactive && 'cursor-pointer touch-none select-none',
                  interactive &&
                    'focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none',
                  isCandidate && 'border-primary/70 bg-primary/25 text-white',
                  isOver && 'ring-2 ring-tier-gold',
                )}
                {...(interactive ? getHandlers(key) : {})}
              >
                {slot.isGoalkeeper ? 'Portería' : 'Libre'}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

import { useCallback, useMemo, useRef, useState } from 'react'
import { Info, MousePointerClick } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { MarketValue } from '@/components/MarketValue'
import { PlayerCard } from '@/components/PlayerCard'
import { TeamPitch, type PitchAssignment } from '@/features/matches/TeamPitch'
import { useSlotSwapping } from '@/features/matches/useSlotSwapping'
import { cn } from '@/lib/utils'
import {
  formationsFor,
  getPitchSlots,
  squadSizeOf,
  type Formation,
} from '@/lib/formations'
import type { LeagueMetricRow, PlayerCardData, TeamSide } from '@/types/domain'

/**
 * Both line-ups, one pitch per team, plus the bench.
 *
 * Shown for every match whatever its status: before kickoff it is the plan,
 * afterwards it is the record of who played where.
 *
 * A slot key is `${side}:${slot}`, and a bench key is `bench:${playerId}`.
 * Encoding the side means one swapping hook covers both pitches and the bench,
 * so a player can be dragged from one team to the other, or on and off.
 */

export interface LineupEntry {
  playerId: string
  teamSide: TeamSide
  pitchSlot: number | null
  player: PlayerCardData
  /**
   * What this player counts for towards their side's total: the value frozen
   * when the match was scored, or their current one while it is still to be
   * played. Resolved by the caller, which is the only place that knows which.
   */
  marketValueGbp: number
}

/** A slot's occupant, or a bench player, addressed by key. */
type Placement = Map<string, string | null>

const SLOT_PREFIX = { home: 'home', away: 'away' } as const

function slotKeyFor(side: 'home' | 'away', slot: number): string {
  return `${SLOT_PREFIX[side]}:${slot}`
}

function benchKeyFor(playerId: string): string {
  return `bench:${playerId}`
}

export interface LineupChange {
  playerId: string
  teamSide: TeamSide
  pitchSlot: number | null
}

interface PitchLineupsProps {
  entries: readonly LineupEntry[]
  metrics: readonly LeagueMetricRow[]
  homeTeamName: string
  awayTeamName: string
  homeFormation: Formation
  awayFormation: Formation
  /**
   * Whether players can be moved around.
   *
   * True for any member while the match is still to be played, and for
   * administrators always — see isUpcomingMatch.
   */
  interactive: boolean
  /**
   * Whether the shape itself can be changed.
   *
   * Narrower than `interactive` on purpose: the formation lives on `matches`,
   * which only an administrator may write, so offering the control to a member
   * arranging an upcoming line-up would just produce a failed request.
   */
  canChangeFormation: boolean
  onFormationChange: (side: 'home' | 'away', formation: Formation) => void
  /** Called with only the players whose side or slot actually changed. */
  onLineupChange: (changes: LineupChange[]) => void
  /**
   * Whether the values being summed are the ones frozen at kickoff or today's.
   *
   * Only decides the wording. Which figure each player contributes was settled
   * before it got here, in `LineupEntry.marketValueGbp`.
   */
  valuation: 'frozen' | 'live'
}

export function PitchLineups({
  entries,
  metrics,
  homeTeamName,
  awayTeamName,
  homeFormation,
  awayFormation,
  interactive,
  canChangeFormation,
  onFormationChange,
  onLineupChange,
  valuation,
}: PitchLineupsProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  // The arrangement is applied optimistically so a drag feels instant, then
  // reconciled from the server once the write lands.
  const [pendingPlacement, setPendingPlacement] = useState<Placement>()

  const serverPlacement = useMemo<Placement>(() => {
    const placement: Placement = new Map()

    for (const side of ['home', 'away'] as const) {
      const formation = side === 'home' ? homeFormation : awayFormation
      for (const slot of getPitchSlots(formation)) {
        placement.set(slotKeyFor(side, slot.slot), null)
      }
    }

    for (const entry of entries) {
      const slotKey =
        entry.pitchSlot !== null &&
        (entry.teamSide === 'home' || entry.teamSide === 'away')
          ? slotKeyFor(entry.teamSide, entry.pitchSlot)
          : null

      // Every slot of both formations was seeded above, so a key that is missing
      // is a slot this shape does not have — a player left over from a larger
      // match. The database benches them (migration 015) and the refetch says
      // so, but until it lands they belong on the bench here too: showing them
      // nowhere would read as a player who had been dropped.
      if (slotKey !== null && placement.has(slotKey)) {
        placement.set(slotKey, entry.playerId)
      } else {
        placement.set(benchKeyFor(entry.playerId), entry.playerId)
      }
    }

    return placement
  }, [entries, homeFormation, awayFormation])

  const placement = pendingPlacement ?? serverPlacement

  const playersById = useMemo(
    () => new Map(entries.map((entry) => [entry.playerId, entry.player])),
    [entries],
  )

  const valueByPlayerId = useMemo(
    () =>
      new Map(entries.map((entry) => [entry.playerId, entry.marketValueGbp])),
    [entries],
  )

  /**
   * What each side on the pitch is worth.
   *
   * Read off `placement` rather than off `entries` so it answers while a drag
   * is still optimistic: moving somebody across and watching the two figures
   * converge is the whole point of showing them.
   *
   * The bench does not count. Eleven players cannot be on at once, and a team
   * carrying an expensive substitute is not fielding a stronger side than the
   * scoreline says.
   */
  const teamValues = useMemo(() => {
    const total = (side: 'home' | 'away') =>
      getPitchSlots(side === 'home' ? homeFormation : awayFormation).reduce(
        (sum, slot) => {
          const playerId = placement.get(slotKeyFor(side, slot.slot))
          return sum + (playerId ? (valueByPlayerId.get(playerId) ?? 0) : 0)
        },
        0,
      )

    return { home: total('home'), away: total('away') }
  }, [placement, homeFormation, awayFormation, valueByPlayerId])

  const valueGap = Math.abs(teamValues.home - teamValues.away)

  /**
   * Finds the drop target under a point.
   *
   * Uses the rendered geometry rather than `document.elementFromPoint`, because
   * the drag preview follows the pointer and would otherwise be the topmost
   * element at every position.
   */
  const resolveKeyAt = useCallback((x: number, y: number): string | null => {
    const container = containerRef.current
    if (!container) return null

    const targets = container.querySelectorAll<HTMLElement>('[data-slot-key]')
    for (const target of targets) {
      const box = target.getBoundingClientRect()
      if (x >= box.left && x <= box.right && y >= box.top && y <= box.bottom) {
        return target.dataset.slotKey ?? null
      }
    }
    return null
  }, [])

  const handleSwap = useCallback(
    (fromKey: string, toKey: string) => {
      const next = new Map(placement)
      const fromPlayer = next.get(fromKey) ?? null
      const toPlayer = next.get(toKey) ?? null

      if (fromPlayer === null && toPlayer === null) return

      // Bench keys are per player, so a bench slot cannot simply receive
      // someone else's id — the emptied one is dropped and a new one added.
      function place(key: string, playerId: string | null) {
        if (key.startsWith('bench:')) {
          next.delete(key)
          if (playerId !== null) next.set(benchKeyFor(playerId), playerId)
          return
        }
        next.set(key, playerId)
      }

      place(fromKey, toPlayer)
      place(toKey, fromPlayer)

      setPendingPlacement(next)
      onLineupChange(toChanges(next, entries))
    },
    [placement, entries, onLineupChange],
  )

  const swapping = useSlotSwapping({
    onSwap: handleSwap,
    enabled: interactive,
    resolveKeyAt,
  })

  const assignmentsFor = (side: 'home' | 'away'): PitchAssignment[] => {
    const formation = side === 'home' ? homeFormation : awayFormation
    return getPitchSlots(formation).map((slot) => {
      const playerId = placement.get(slotKeyFor(side, slot.slot)) ?? null
      return {
        slot: slot.slot,
        player: playerId ? (playersById.get(playerId) ?? null) : null,
      }
    })
  }

  const benchPlayers = [...placement.entries()]
    .filter(([key, playerId]) => key.startsWith('bench:') && playerId !== null)
    .map(([, playerId]) => playersById.get(playerId!))
    .filter((player): player is PlayerCardData => Boolean(player))
    .sort((left, right) =>
      left.displayName.localeCompare(right.displayName, 'es'),
    )

  const draggedPlayer = swapping.drag.key
    ? playersById.get(placement.get(swapping.drag.key) ?? '')
    : undefined

  const selectedPlayer = swapping.selectedKey
    ? playersById.get(placement.get(swapping.selectedKey) ?? '')
    : undefined

  return (
    <div ref={containerRef} className="flex flex-col gap-4">
      {interactive ? (
        // While something is selected this replaces the instructions with what
        // to do next. Tapping twice is the whole interaction, and saying so at
        // the moment it matters beats a tip nobody reads up front.
        swapping.selectedKey ? (
          <div
            role="status"
            className="flex flex-wrap items-center gap-2 rounded-lg border border-primary/40 bg-primary/10 p-2 text-xs"
          >
            <MousePointerClick className="size-4 shrink-0" aria-hidden="true" />
            <span>
              {selectedPlayer ? (
                <>
                  <strong>{selectedPlayer.displayName}</strong> seleccionado.
                </>
              ) : (
                <>Posición vacía seleccionada.</>
              )}{' '}
              Toca otro jugador o una posición libre para intercambiar.
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="ml-auto h-7"
              onClick={swapping.clearSelection}
            >
              Cancelar
            </Button>
          </div>
        ) : (
          <p className="flex items-start gap-2 text-xs text-muted-foreground">
            <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            Toca un jugador y luego otro para intercambiarlos, o arrástralo
            encima. Funciona entre equipos y con el banquillo.
          </p>
        )
      ) : null}

      {/* The audit, in one line: what the two sides on the pitch are worth and
          how far apart that leaves them. */}
      <p className="text-xs text-muted-foreground" data-testid="team-value-gap">
        Diferencia <MarketValue value={valueGap} className="text-foreground" />{' '}
        ·{' '}
        {valuation === 'frozen'
          ? 'valor al inicio del partido'
          : 'valor actual, banquillo aparte'}
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        {(['home', 'away'] as const).map((side) => {
          const formation = side === 'home' ? homeFormation : awayFormation
          const teamName = side === 'home' ? homeTeamName : awayTeamName

          return (
            <div key={side} className="flex flex-col gap-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="truncate text-sm font-bold" title={teamName}>
                    {teamName}
                  </h3>
                  <MarketValue
                    value={teamValues[side]}
                    className="text-xs text-muted-foreground"
                  />
                </div>

                {canChangeFormation ? (
                  <Select
                    value={formation}
                    onValueChange={(value) =>
                      onFormationChange(side, value as Formation)
                    }
                  >
                    <SelectTrigger
                      size="sm"
                      className="w-24 shrink-0"
                      aria-label={`Formación de ${teamName}`}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {/* The size is read off the shape being shown rather than
                          passed in: a formation names its own squad size, so the
                          menu cannot offer a shape the match has no room for. */}
                      {formationsFor(squadSizeOf(formation)).map((option) => (
                        <SelectItem key={option} value={option}>
                          {option}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Badge variant="secondary" className="shrink-0">
                    {formation}
                  </Badge>
                )}
              </div>

              <TeamPitch
                formation={formation}
                assignments={assignmentsFor(side)}
                metrics={metrics}
                slotKey={(slot) => slotKeyFor(side, slot)}
                selectedKey={swapping.selectedKey}
                draggingKey={swapping.drag.key}
                overKey={swapping.drag.overKey}
                interactive={interactive}
                getHandlers={swapping.getHandlers}
              />
            </div>
          )
        })}
      </div>

      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
          Banquillo{' '}
          <span className="numeric font-normal">({benchPlayers.length})</span>
        </h3>

        {benchPlayers.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Todos los convocados están en el campo.
          </p>
        ) : (
          <ul className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-7">
            {benchPlayers.map((player) => {
              const key = benchKeyFor(player.id)
              const isSelected = swapping.selectedKey === key
              const isDragging = swapping.drag.key === key
              const isOver =
                swapping.drag.overKey === key && swapping.drag.key !== key

              return (
                <li key={player.id} data-slot-key={key}>
                  <div
                    role={interactive ? 'button' : undefined}
                    tabIndex={interactive ? 0 : undefined}
                    aria-label={
                      interactive
                        ? `${player.displayName}, en el banquillo. Pulsa para seleccionar e intercambiar.`
                        : `${player.displayName}, en el banquillo`
                    }
                    aria-pressed={interactive ? isSelected : undefined}
                    className={cn(
                      'rounded-lg outline-none',
                      interactive && 'cursor-grab touch-none select-none',
                      interactive &&
                        'focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1',
                      isSelected && 'ring-2 ring-primary ring-offset-2',
                      isDragging && 'opacity-30',
                      isOver && 'ring-2 ring-tier-gold ring-offset-1',
                    )}
                    {...(interactive ? swapping.getHandlers(key) : {})}
                  >
                    <PlayerCard player={player} metrics={metrics} compact />
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {/* Follows the pointer during a drag. Fixed and non-interactive so it
          never becomes its own drop target. */}
      {draggedPlayer ? (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed z-50 w-24 -translate-x-1/2 -translate-y-1/2 opacity-90"
          style={{ left: swapping.drag.x, top: swapping.drag.y }}
        >
          <PlayerCard player={draggedPlayer} metrics={metrics} compact />
        </div>
      ) : null}
    </div>
  )
}

/**
 * Reduces a placement to the players whose side or slot differs from what the
 * server holds, so a swap writes two rows rather than fourteen.
 */
function toChanges(
  placement: Placement,
  entries: readonly LineupEntry[],
): LineupChange[] {
  const desired = new Map<
    string,
    { teamSide: TeamSide; pitchSlot: number | null }
  >()

  for (const [key, playerId] of placement) {
    if (playerId === null) continue

    if (key.startsWith('bench:')) {
      // A benched player keeps whichever side they were called up for; only
      // their slot is cleared.
      const existing = entries.find((entry) => entry.playerId === playerId)
      desired.set(playerId, {
        teamSide: existing?.teamSide ?? 'unassigned',
        pitchSlot: null,
      })
      continue
    }

    const [side, slot] = key.split(':')
    desired.set(playerId, {
      teamSide: side as TeamSide,
      pitchSlot: Number(slot),
    })
  }

  const changes: LineupChange[] = []
  for (const entry of entries) {
    const target = desired.get(entry.playerId)
    if (!target) continue

    if (
      target.teamSide !== entry.teamSide ||
      target.pitchSlot !== entry.pitchSlot
    ) {
      changes.push({
        playerId: entry.playerId,
        teamSide: target.teamSide,
        pitchSlot: target.pitchSlot,
      })
    }
  }

  return changes
}

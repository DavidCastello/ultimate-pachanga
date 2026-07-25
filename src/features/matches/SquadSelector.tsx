import { useMemo, useState } from 'react'
import { Check, ChevronsUpDown, UserPlus, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { MarketValue } from '@/components/MarketValue'
import { formatPosition } from '@/lib/formatting'
import { cn } from '@/lib/utils'
import type { PlayerCardData, TeamSide } from '@/types/domain'

/**
 * Who was called up, and which side they play for.
 *
 * That is the whole of a convocatoria — a name on the list and a team. There is
 * no attendance flag: whether somebody turned out is answered by their score,
 * and somebody who drops out is taken off the list (see migration 012).
 *
 * Calling people up and arranging them are deliberately separate jobs. Here an
 * administrator says who is coming, in bulk, without deciding anything about
 * the teams: everyone arrives unassigned, on the bench. The teams themselves
 * are settled on the pitch — by hand, or in one press of "Equilibrar equipos".
 *
 * A player already carrying a score cannot be removed, because their result
 * hangs off this row.
 */

/** Player id to the side they take; absent means not called up. */
export type SquadDraft = ReadonlyMap<string, TeamSide>

const TEAM_SIDE_LABELS: Record<TeamSide, string> = {
  home: 'Local',
  away: 'Visitante',
  unassigned: 'Sin asignar',
}

/** How a player joins a squad before anybody decides where they play. */
const UNASSIGNED: TeamSide = 'unassigned'

function byDisplayName(left: PlayerCardData, right: PlayerCardData): number {
  return left.displayName.localeCompare(right.displayName, 'es')
}

/**
 * Calls up several players at once.
 *
 * A dropdown with a running selection rather than one checkbox per player in
 * the page: a twenty-two player roster is a long scroll, and the job is nearly
 * always "everyone who answered the group chat" — a handful of names, ticked and
 * added in one go.
 */
function CallUpPicker({
  candidates,
  onAdd,
  disabled,
}: {
  candidates: readonly PlayerCardData[]
  onAdd: (playerIds: readonly string[]) => void
  disabled?: boolean
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [pickedIds, setPickedIds] = useState<readonly string[]>([])

  function toggle(playerId: string) {
    setPickedIds((current) =>
      current.includes(playerId)
        ? current.filter((id) => id !== playerId)
        : [...current, playerId],
    )
  }

  function confirm() {
    onAdd(pickedIds)
    setPickedIds([])
    setIsOpen(false)
  }

  return (
    <Popover
      open={isOpen}
      onOpenChange={(open) => {
        setIsOpen(open)
        // Closing without confirming discards the ticks, so a reopened list
        // never carries somebody else's abandoned selection.
        if (!open) setPickedIds([])
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled || candidates.length === 0}
          aria-expanded={isOpen}
          data-testid="call-up-picker"
        >
          <UserPlus className="size-4" aria-hidden="true" />
          Añadir jugadores
          <ChevronsUpDown className="size-4 opacity-60" aria-hidden="true" />
        </Button>
      </PopoverTrigger>

      <PopoverContent align="start" className="w-72 p-0">
        <Command>
          <CommandInput placeholder="Buscar jugador" />
          <CommandList>
            <CommandEmpty>Ningún jugador coincide.</CommandEmpty>
            <CommandGroup>
              {candidates.map((player) => {
                const isPicked = pickedIds.includes(player.id)

                return (
                  <CommandItem
                    key={player.id}
                    value={player.displayName}
                    onSelect={() => toggle(player.id)}
                    data-testid={`call-up-option-${player.id}`}
                  >
                    <Check
                      className={cn('size-4', !isPicked && 'opacity-0')}
                      aria-hidden="true"
                    />
                    <span className="min-w-0 flex-1 truncate">
                      {player.displayName}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {player.preferredPosition}
                    </span>
                  </CommandItem>
                )
              })}
            </CommandGroup>
          </CommandList>
        </Command>

        <div className="flex items-center justify-between gap-2 border-t p-2">
          <span className="numeric text-xs text-muted-foreground">
            {pickedIds.length} seleccionados
          </span>
          <Button
            type="button"
            size="sm"
            disabled={pickedIds.length === 0}
            onClick={confirm}
            data-testid="call-up-confirm"
          >
            Convocar
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}

interface SquadSelectorProps {
  players: readonly PlayerCardData[]
  draft: SquadDraft
  onChange: (draft: SquadDraft) => void
  homeTeamName: string
  awayTeamName: string
  /** Players who already have a score and so cannot be removed. */
  lockedPlayerIds?: ReadonlySet<string>
  disabled?: boolean
}

export function SquadSelector({
  players,
  draft,
  onChange,
  homeTeamName,
  awayTeamName,
  lockedPlayerIds,
  disabled,
}: SquadSelectorProps) {
  const calledUp = useMemo(
    () => players.filter((player) => draft.has(player.id)).sort(byDisplayName),
    [players, draft],
  )

  // An inactive player who is somehow already in the squad stays visible above;
  // they are just never offered again.
  const candidates = useMemo(
    () =>
      players
        .filter((player) => player.isActive && !draft.has(player.id))
        .sort(byDisplayName),
    [players, draft],
  )

  const counts = useMemo(() => {
    let home = 0
    let away = 0
    for (const side of draft.values()) {
      if (side === 'home') home += 1
      if (side === 'away') away += 1
    }
    return { home, away, total: draft.size }
  }, [draft])

  function setSide(playerId: string, side: TeamSide) {
    const next = new Map(draft)
    next.set(playerId, side)
    onChange(next)
  }

  function remove(playerId: string) {
    const next = new Map(draft)
    next.delete(playerId)
    onChange(next)
  }

  function addAll(playerIds: readonly string[]) {
    const next = new Map(draft)
    for (const playerId of playerIds) {
      if (!next.has(playerId)) next.set(playerId, UNASSIGNED)
    }
    onChange(next)
  }

  function callUpEveryone() {
    addAll(candidates.map((player) => player.id))
  }

  function clearAll() {
    const next = new Map<string, TeamSide>()
    // Scored players stay: removing them would orphan their result.
    for (const [playerId, side] of draft) {
      if (lockedPlayerIds?.has(playerId)) next.set(playerId, side)
    }
    onChange(next)
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary">{counts.total} convocados</Badge>
        <Badge variant="outline">
          {homeTeamName || 'Local'}: {counts.home}
        </Badge>
        <Badge variant="outline">
          {awayTeamName || 'Visitante'}: {counts.away}
        </Badge>
        <div className="ml-auto flex flex-wrap gap-2">
          <CallUpPicker
            candidates={candidates}
            onAdd={addAll}
            disabled={disabled}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={callUpEveryone}
            disabled={disabled || candidates.length === 0}
          >
            Convocar a todos
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={clearAll}
            disabled={disabled || counts.total === 0}
          >
            Vaciar
          </Button>
        </div>
      </div>

      {calledUp.length === 0 ? (
        <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
          Nadie convocado todavía. Añade jugadores y reparte los equipos con
          «Equilibrar equipos».
        </p>
      ) : (
        <ul className="divide-y divide-border/60 rounded-xl border">
          {calledUp.map((player) => {
            const side = draft.get(player.id)
            if (!side) return null

            const isLocked = lockedPlayerIds?.has(player.id) ?? false

            return (
              <li
                key={player.id}
                className="flex flex-wrap items-center gap-3 px-3 py-2"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    {player.displayName}
                  </span>
                  <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    {formatPosition(player.preferredPosition)}
                    {!player.isActive ? ' · inactivo' : ''}
                    <MarketValue
                      value={player.marketValueGbp}
                      className="text-xs font-normal"
                    />
                  </span>
                </span>

                <div className="flex gap-2">
                  <Select
                    value={side}
                    onValueChange={(value) =>
                      setSide(player.id, value as TeamSide)
                    }
                    disabled={disabled}
                  >
                    <SelectTrigger
                      className="w-32"
                      aria-label={`Equipo de ${player.displayName}`}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="home">
                        {homeTeamName || TEAM_SIDE_LABELS.home}
                      </SelectItem>
                      <SelectItem value="away">
                        {awayTeamName || TEAM_SIDE_LABELS.away}
                      </SelectItem>
                      <SelectItem value="unassigned">
                        {TEAM_SIDE_LABELS.unassigned}
                      </SelectItem>
                    </SelectContent>
                  </Select>

                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    disabled={disabled || isLocked}
                    onClick={() => remove(player.id)}
                    aria-label={`Quitar a ${player.displayName} de la convocatoria`}
                    title={
                      isLocked
                        ? 'Ya tiene puntuación en este partido'
                        : undefined
                    }
                  >
                    <X className="size-4" aria-hidden="true" />
                  </Button>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

import { useMemo } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { formatPosition } from '@/lib/formatting'
import { cn } from '@/lib/utils'
import type { AttendanceStatus, PlayerCardData, TeamSide } from '@/types/domain'

/**
 * Squad selection: who was called up, which side they played for and whether
 * they turned up.
 *
 * Kept as one flat list rather than three columns, because on a phone a
 * drag-and-drop team builder would be miserable and this is a twenty-player
 * league.
 */

export interface SquadDraftEntry {
  teamSide: TeamSide
  attendanceStatus: AttendanceStatus
}

/** Player id to selection; absent means not called up. */
export type SquadDraft = ReadonlyMap<string, SquadDraftEntry>

const TEAM_SIDE_LABELS: Record<TeamSide, string> = {
  home: 'Local',
  away: 'Visitante',
  unassigned: 'Sin asignar',
}

const ATTENDANCE_LABELS: Record<AttendanceStatus, string> = {
  called_up: 'Convocado',
  confirmed: 'Confirmado',
  played: 'Jugó',
  absent: 'No asistió',
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
  const selectablePlayers = useMemo(
    () =>
      [...players]
        .filter((player) => player.isActive || draft.has(player.id))
        .sort((left, right) =>
          left.displayName.localeCompare(right.displayName, 'es'),
        ),
    [players, draft],
  )

  const counts = useMemo(() => {
    let home = 0
    let away = 0
    for (const entry of draft.values()) {
      if (entry.teamSide === 'home') home += 1
      if (entry.teamSide === 'away') away += 1
    }
    return { home, away, total: draft.size }
  }, [draft])

  function update(playerId: string, entry: SquadDraftEntry | null) {
    const next = new Map(draft)
    if (entry === null) {
      next.delete(playerId)
    } else {
      next.set(playerId, entry)
    }
    onChange(next)
  }

  function toggle(player: PlayerCardData) {
    if (draft.has(player.id)) {
      update(player.id, null)
    } else {
      update(player.id, {
        teamSide: 'unassigned',
        attendanceStatus: 'called_up',
      })
    }
  }

  function selectAllActive() {
    const next = new Map(draft)
    for (const player of players) {
      if (player.isActive && !next.has(player.id)) {
        next.set(player.id, {
          teamSide: 'unassigned',
          attendanceStatus: 'called_up',
        })
      }
    }
    onChange(next)
  }

  function clearAll() {
    const next = new Map<string, SquadDraftEntry>()
    // Scored players stay: removing them would orphan their result.
    for (const [playerId, entry] of draft) {
      if (lockedPlayerIds?.has(playerId)) next.set(playerId, entry)
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
        <div className="ml-auto flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={selectAllActive}
            disabled={disabled}
          >
            Convocar a todos
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={clearAll}
            disabled={disabled}
          >
            Vaciar
          </Button>
        </div>
      </div>

      <ul className="divide-y divide-border/60 rounded-xl border">
        {selectablePlayers.map((player) => {
          const entry = draft.get(player.id)
          const isSelected = Boolean(entry)
          const isLocked = lockedPlayerIds?.has(player.id) ?? false

          return (
            <li
              key={player.id}
              className={cn(
                'flex flex-wrap items-center gap-3 px-3 py-2',
                isSelected && 'bg-accent/30',
              )}
            >
              <label className="flex min-w-0 flex-1 items-center gap-3">
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => toggle(player)}
                  disabled={disabled || isLocked}
                  className="size-4 shrink-0 accent-primary"
                  aria-label={`Convocar a ${player.displayName}`}
                />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">
                    {player.displayName}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {player.preferredPosition} ·{' '}
                    {formatPosition(player.preferredPosition)}
                    {!player.isActive ? ' · inactivo' : ''}
                  </span>
                </span>
              </label>

              {isSelected && entry ? (
                <div className="flex gap-2">
                  <Select
                    value={entry.teamSide}
                    onValueChange={(value) =>
                      update(player.id, {
                        ...entry,
                        teamSide: value as TeamSide,
                      })
                    }
                    disabled={disabled}
                  >
                    <SelectTrigger
                      className="w-36"
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

                  <Select
                    value={entry.attendanceStatus}
                    onValueChange={(value) =>
                      update(player.id, {
                        ...entry,
                        attendanceStatus: value as AttendanceStatus,
                      })
                    }
                    disabled={disabled}
                  >
                    <SelectTrigger
                      className="w-36"
                      aria-label={`Asistencia de ${player.displayName}`}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(ATTENDANCE_LABELS).map(
                        ([value, label]) => (
                          <SelectItem key={value} value={value}>
                            {label}
                          </SelectItem>
                        ),
                      )}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

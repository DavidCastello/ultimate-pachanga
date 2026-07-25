import { useState } from 'react'
import { Check, ChevronsUpDown } from 'lucide-react'
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
import { cn } from '@/lib/utils'
import type { PlayerCardData } from '@/types/domain'

interface PlayerSeriesPickerProps {
  players: readonly PlayerCardData[]
  selectedIds: readonly string[]
  /** The colour the chart draws this player in, so the list matches the lines. */
  colorOf: (playerId: string) => string | undefined
  onToggle: (playerId: string) => void
  /** Replaces the whole selection with this one player. */
  onOnly: (playerId: string) => void
  maximumSelected: number
}

/**
 * Chooses which players the evolution chart draws.
 *
 * Three gestures, because comparing a squad needs all three: tick to add or
 * remove, "Solo" to drop everyone else and study one line, and the count in the
 * trigger to see how close the chart is to its limit. Selection is capped
 * because past eight lines no two colours stay reliably distinguishable — and a
 * chart nobody can read is not a filter problem.
 */
export function PlayerSeriesPicker({
  players,
  selectedIds,
  colorOf,
  onToggle,
  onOnly,
  maximumSelected,
}: PlayerSeriesPickerProps) {
  const [isOpen, setIsOpen] = useState(false)
  const isFull = selectedIds.length >= maximumSelected

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          data-testid="evolution-player-picker"
          aria-expanded={isOpen}
        >
          Jugadores
          <span className="numeric text-muted-foreground">
            {selectedIds.length}/{maximumSelected}
          </span>
          <ChevronsUpDown className="size-4 opacity-60" aria-hidden="true" />
        </Button>
      </PopoverTrigger>

      <PopoverContent align="start" className="w-72 p-0">
        <Command>
          <CommandInput placeholder="Buscar jugador" />
          <CommandList>
            <CommandEmpty>Ningún jugador coincide.</CommandEmpty>
            <CommandGroup>
              {players.map((player) => {
                const isSelected = selectedIds.includes(player.id)
                const color = colorOf(player.id)

                return (
                  <CommandItem
                    key={player.id}
                    value={player.displayName}
                    disabled={!isSelected && isFull}
                    onSelect={() => onToggle(player.id)}
                    data-testid={`evolution-player-option-${player.id}`}
                  >
                    <Check
                      className={cn('size-4', !isSelected && 'opacity-0')}
                      aria-hidden="true"
                    />
                    <span
                      aria-hidden="true"
                      className="size-2.5 shrink-0 rounded-full"
                      style={{
                        backgroundColor: color ?? 'var(--color-muted)',
                      }}
                    />
                    <span className="min-w-0 flex-1 truncate">
                      {player.displayName}
                    </span>
                    {/* Stops the click reaching the item, whose own handler
                        would toggle instead of isolating. */}
                    <button
                      type="button"
                      className="rounded px-1.5 py-0.5 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                      onClick={(event) => {
                        event.stopPropagation()
                        onOnly(player.id)
                        setIsOpen(false)
                      }}
                    >
                      Solo
                    </button>
                  </CommandItem>
                )
              })}
            </CommandGroup>
          </CommandList>
        </Command>
        {isFull ? (
          <p className="border-t px-3 py-2 text-xs text-muted-foreground">
            Máximo {maximumSelected} jugadores a la vez. Quita uno para añadir
            otro.
          </p>
        ) : null}
      </PopoverContent>
    </Popover>
  )
}

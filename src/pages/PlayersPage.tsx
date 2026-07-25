import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Search, UserRound } from 'lucide-react'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { EmptyState } from '@/components/EmptyState'
import {
  PlayerCardGrid,
  PlayerCardGridSkeleton,
} from '@/components/PlayerCardGrid'
import { fetchPlayerCards, playerKeys } from '@/features/players/api'
import {
  useIsAdmin,
  useLeagueMetrics,
  useMembership,
} from '@/features/league/useLeague'
import { formatPosition } from '@/lib/formatting'
import { PLAYER_POSITIONS, type PlayerCardData } from '@/types/domain'

const SORT_OPTIONS = {
  rating: 'Valoración',
  value: 'Valor de mercado',
  matches: 'Partidos jugados',
  name: 'Nombre',
} as const

type SortKey = keyof typeof SORT_OPTIONS

const ALL_POSITIONS = 'all'

function comparePlayers(sortBy: SortKey) {
  return (left: PlayerCardData, right: PlayerCardData): number => {
    switch (sortBy) {
      case 'rating':
        return right.cardRating - left.cardRating
      case 'value':
        return right.marketValueGbp - left.marketValueGbp
      case 'matches':
        return right.matchesPlayed - left.matchesPlayed
      case 'name':
        return left.displayName.localeCompare(right.displayName, 'es')
    }
  }
}

export function PlayersPage() {
  const { data: membership } = useMembership()
  const { data: metrics = [] } = useLeagueMetrics()
  const isAdmin = useIsAdmin()

  const [search, setSearch] = useState('')
  const [position, setPosition] = useState<string>(ALL_POSITIONS)
  const [sortBy, setSortBy] = useState<SortKey>('rating')
  const [showInactive, setShowInactive] = useState(false)

  const { data: players, isPending } = useQuery({
    queryKey: playerKeys.cards(membership?.leagueId ?? ''),
    enabled: Boolean(membership),
    queryFn: () => fetchPlayerCards(membership!.leagueId),
  })

  const visiblePlayers = useMemo(() => {
    if (!players) return []

    const needle = search.trim().toLowerCase()

    return players
      .filter((player) => {
        // Members only ever see the active roster; admins can opt in.
        if (!player.isActive && !(isAdmin && showInactive)) return false
        if (position !== ALL_POSITIONS && player.preferredPosition !== position)
          return false
        if (!needle) return true

        return (
          player.displayName.toLowerCase().includes(needle) ||
          `${player.firstName} ${player.lastName}`
            .toLowerCase()
            .includes(needle) ||
          player.playerCode.toLowerCase().includes(needle)
        )
      })
      .sort(comparePlayers(sortBy))
  }, [players, search, position, sortBy, showInactive, isAdmin])

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-bold">Jugadores</h1>
        <p className="text-sm text-muted-foreground">
          {isPending
            ? 'Cargando plantilla…'
            : `${visiblePlayers.length} de ${players?.length ?? 0} jugadores`}
        </p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1">
          <Label htmlFor="player-search" className="sr-only">
            Buscar jugador
          </Label>
          <div className="relative">
            <Search
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              id="player-search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar por nombre, apodo o código"
              className="pl-9"
            />
          </div>
        </div>

        <div className="flex gap-3">
          <div className="flex-1 sm:w-44">
            <Label htmlFor="position-filter" className="sr-only">
              Filtrar por posición
            </Label>
            <Select value={position} onValueChange={setPosition}>
              <SelectTrigger id="position-filter" className="w-full">
                <SelectValue placeholder="Posición" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_POSITIONS}>Todas</SelectItem>
                {PLAYER_POSITIONS.map((code) => (
                  <SelectItem key={code} value={code}>
                    {code} · {formatPosition(code)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex-1 sm:w-48">
            <Label htmlFor="sort-by" className="sr-only">
              Ordenar por
            </Label>
            <Select
              value={sortBy}
              onValueChange={(value) => setSortBy(value as SortKey)}
            >
              <SelectTrigger id="sort-by" className="w-full">
                <SelectValue placeholder="Ordenar" />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(SORT_OPTIONS).map(([key, label]) => (
                  <SelectItem key={key} value={key}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {isAdmin ? (
        <label className="flex w-fit items-center gap-2 text-sm text-muted-foreground">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(event) => setShowInactive(event.target.checked)}
            className="size-4 accent-primary"
          />
          Mostrar jugadores inactivos
        </label>
      ) : null}

      {isPending ? (
        <PlayerCardGridSkeleton />
      ) : visiblePlayers.length === 0 ? (
        <EmptyState
          icon={UserRound}
          title="Ningún jugador coincide"
          description="Prueba con otro nombre o quita los filtros."
        />
      ) : (
        <PlayerCardGrid players={visiblePlayers} metrics={metrics} />
      )}
    </div>
  )
}

import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { LayoutGrid, List, Search, UserRound } from 'lucide-react'
import { Link } from 'react-router'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { MarketValue } from '@/components/MarketValue'
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
import { ErrorState } from '@/components/ErrorState'
import {
  PlayerCardGrid,
  PlayerCardGridSkeleton,
} from '@/components/PlayerCardGrid'
import { fetchPlayerCards, playerKeys } from '@/features/players/api'
import {
  useIsAdmin,
  useLeague,
  useLeagueMetrics,
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
  const { data: league } = useLeague()
  const { data: metrics = [] } = useLeagueMetrics()
  const isAdmin = useIsAdmin()

  const [search, setSearch] = useState('')
  const [position, setPosition] = useState<string>(ALL_POSITIONS)
  const [sortBy, setSortBy] = useState<SortKey>('rating')
  const [showInactive, setShowInactive] = useState(false)
  const [view, setView] = useState<'cards' | 'table'>('cards')

  const {
    data: players,
    isPending,
    error,
    refetch,
  } = useQuery({
    queryKey: playerKeys.cards(league?.id ?? ''),
    enabled: Boolean(league),
    queryFn: () => fetchPlayerCards(league!.id),
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
  const hasActiveFilters = Boolean(search.trim()) || position !== ALL_POSITIONS
  const totalPlayers = (players ?? []).filter(
    (player) => player.isActive || (isAdmin && showInactive),
  ).length

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="page-title">Jugadores</h1>
          <p className="mt-3 text-lg text-muted-foreground">
            {isPending
              ? 'Cargando plantilla…'
              : hasActiveFilters
                ? `${visiblePlayers.length} resultados de ${totalPlayers}`
                : `${totalPlayers} jugadores`}
          </p>
        </div>
        <div
          className="flex gap-1"
          role="group"
          aria-label="Vista de jugadores"
        >
          <Button
            type="button"
            variant={view === 'cards' ? 'default' : 'outline'}
            size="icon"
            title="Ver cromos"
            aria-label="Ver cromos"
            aria-pressed={view === 'cards'}
            onClick={() => setView('cards')}
          >
            <LayoutGrid className="size-4" />
          </Button>
          <Button
            type="button"
            variant={view === 'table' ? 'default' : 'outline'}
            size="icon"
            title="Comparar en tabla"
            aria-label="Comparar en tabla"
            aria-pressed={view === 'table'}
            onClick={() => setView('table')}
          >
            <List className="size-4" />
          </Button>
        </div>
      </div>

      <div className="roster-toolbar">
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
              className="h-10 pl-10 text-base"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:flex">
          <div className="flex-1 sm:w-44">
            <Label htmlFor="position-filter" className="sr-only">
              Filtrar por posición
            </Label>
            <Select value={position} onValueChange={setPosition}>
              <SelectTrigger
                id="position-filter"
                className="h-12 w-full text-base"
              >
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
              <SelectTrigger id="sort-by" className="h-12 w-full text-base">
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
      ) : error ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : visiblePlayers.length === 0 ? (
        <EmptyState
          icon={UserRound}
          title="Ningún jugador coincide"
          description="Prueba con otro nombre o quita los filtros."
        />
      ) : view === 'table' ? (
        <Table className="roster-table">
          <TableHeader>
            <TableRow>
              <TableHead>Jugador</TableHead>
              <TableHead className="text-right">VAL</TableHead>
              {metrics.map((metric) => (
                <TableHead
                  key={metric.code}
                  className="text-right"
                  title={metric.label}
                >
                  {metric.label.slice(0, 3)}
                </TableHead>
              ))}
              <TableHead className="text-right">Valor</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visiblePlayers.map((player) => (
              <TableRow key={player.id}>
                <TableCell>
                  <Link
                    className="flex min-h-8 max-w-24 flex-col justify-center hover:text-primary sm:max-w-48"
                    to={`/players/${player.id}`}
                  >
                    <span
                      className="truncate font-semibold"
                      title={player.displayName}
                    >
                      {player.displayName}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {player.preferredPosition} · {player.matchesPlayed} PJ
                    </span>
                  </Link>
                </TableCell>
                <TableCell className="numeric text-right font-bold text-primary">
                  {player.cardRating}
                </TableCell>
                {metrics.map((metric) => (
                  <TableCell key={metric.code} className="numeric text-right">
                    {player.metricCardStats[metric.code] ?? '—'}
                  </TableCell>
                ))}
                <TableCell className="text-right">
                  <MarketValue value={player.marketValueGbp} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : (
        <PlayerCardGrid players={visiblePlayers} metrics={metrics} />
      )}
    </div>
  )
}

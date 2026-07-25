import { Link } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { BarChart3, TrendingUp, Trophy, Users } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/EmptyState'
import { MarketValue } from '@/components/MarketValue'
import { fetchPlayerCards, playerKeys } from '@/features/players/api'
import { useLeague, useMembership } from '@/features/league/useLeague'
import { formatScore } from '@/lib/formatting'
import type { PlayerCardData } from '@/types/domain'

const LEADERBOARD_SIZE = 5

function LeaderboardCard({
  title,
  icon: Icon,
  players,
  renderValue,
}: {
  title: string
  icon: typeof Trophy
  players: readonly PlayerCardData[]
  renderValue: (player: PlayerCardData) => React.ReactNode
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Icon className="size-4 text-primary" aria-hidden="true" />
          <h2>{title}</h2>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-1">
        {players.map((player, index) => (
          <Link
            key={player.id}
            to={`/players/${player.id}`}
            className="flex items-center gap-3 rounded-md px-2 py-1.5 hover:bg-accent/50"
          >
            <span className="numeric w-4 text-sm text-muted-foreground">
              {index + 1}
            </span>
            <span className="flex-1 truncate text-sm font-medium">
              {player.displayName}
            </span>
            {renderValue(player)}
          </Link>
        ))}
      </CardContent>
    </Card>
  )
}

export function LeaguePage() {
  const { data: membership } = useMembership()
  const { data: league } = useLeague()

  const { data: players, isPending } = useQuery({
    queryKey: playerKeys.cards(membership?.leagueId ?? ''),
    enabled: Boolean(membership),
    queryFn: () => fetchPlayerCards(membership!.leagueId),
  })

  const activePlayers = (players ?? []).filter((player) => player.isActive)

  const topByValue = [...activePlayers]
    .sort((left, right) => right.marketValueGbp - left.marketValueGbp)
    .slice(0, LEADERBOARD_SIZE)

  const topByRating = [...activePlayers]
    .sort((left, right) => right.cardRating - left.cardRating)
    .slice(0, LEADERBOARD_SIZE)

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold">{league?.title ?? 'Liga'}</h1>
        {league ? (
          <Badge variant={league.status === 'active' ? 'default' : 'secondary'}>
            {league.status === 'active' ? 'Activa' : 'Inactiva'}
          </Badge>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card className="gap-1 p-4">
          <p className="text-xs text-muted-foreground">Jugadores activos</p>
          <p className="numeric text-2xl font-bold">
            {isPending ? '—' : activePlayers.length}
          </p>
        </Card>
        <Card className="gap-1 p-4">
          <p className="text-xs text-muted-foreground">Partidos puntuados</p>
          <p className="numeric text-2xl font-bold">
            {isPending
              ? '—'
              : Math.max(
                  0,
                  ...activePlayers.map((player) => player.matchesPlayed),
                )}
          </p>
        </Card>
        <Card className="gap-1 p-4">
          <p className="text-xs text-muted-foreground">Valor total</p>
          <p className="text-2xl font-bold">
            {isPending ? (
              '—'
            ) : (
              <MarketValue
                value={activePlayers.reduce(
                  (total, player) => total + player.marketValueGbp,
                  0,
                )}
              />
            )}
          </p>
        </Card>
        <Card className="gap-1 p-4">
          <p className="text-xs text-muted-foreground">Tu rol</p>
          <p className="text-2xl font-bold capitalize">
            {membership?.role === 'admin' ? 'Admin' : 'Miembro'}
          </p>
        </Card>
      </div>

      {isPending ? (
        <div className="grid gap-4 md:grid-cols-2">
          <Skeleton className="h-56 rounded-xl" />
          <Skeleton className="h-56 rounded-xl" />
        </div>
      ) : activePlayers.length === 0 ? (
        <EmptyState
          icon={Users}
          title="Todavía no hay jugadores"
          description="Añade la plantilla desde la sección de gestión para empezar."
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          <LeaderboardCard
            title="Mayor valor de mercado"
            icon={TrendingUp}
            players={topByValue}
            renderValue={(player) => (
              <MarketValue value={player.marketValueGbp} className="text-sm" />
            )}
          />
          <LeaderboardCard
            title="Mejor valorados"
            icon={Trophy}
            players={topByRating}
            renderValue={(player) => (
              <span className="numeric text-sm font-semibold">
                {player.cardRating}
                <span className="ml-2 font-normal text-muted-foreground">
                  {formatScore(player.careerAverage)}
                </span>
              </span>
            )}
          />
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Button asChild variant="outline">
          <Link to="/players">
            <Users className="size-4" aria-hidden="true" />
            Ver jugadores
          </Link>
        </Button>
        <Button asChild variant="outline" disabled>
          <Link to="/players">
            <BarChart3 className="size-4" aria-hidden="true" />
            Clasificaciones (próximamente)
          </Link>
        </Button>
      </div>
    </div>
  )
}

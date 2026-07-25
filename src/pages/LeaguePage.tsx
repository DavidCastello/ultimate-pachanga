import { Link } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import {
  Award,
  BarChart3,
  CalendarDays,
  TrendingUp,
  Trophy,
  Users,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { AttributeBadge } from '@/components/AttributeBadge'
import { EmptyState } from '@/components/EmptyState'
import { MarketValue } from '@/components/MarketValue'
import { MatchCard } from '@/components/MatchCard'
import { fetchPlayerCards, playerKeys } from '@/features/players/api'
import { fetchMatches, matchKeys } from '@/features/matches/api'
import {
  useLeague,
  useLeagueAttributes,
  useMembership,
} from '@/features/league/useLeague'
import { formatScore } from '@/lib/formatting'
import type { MatchRow, PlayerCardData } from '@/types/domain'

const LEADERBOARD_SIZE = 5

function StatTile({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <Card className="gap-1 p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-2xl font-bold">{children}</p>
    </Card>
  )
}

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
  const { data: attributes = [] } = useLeagueAttributes()

  const { data: players, isPending: arePlayersPending } = useQuery({
    queryKey: playerKeys.cards(membership?.leagueId ?? ''),
    enabled: Boolean(membership),
    queryFn: () => fetchPlayerCards(membership!.leagueId),
  })

  const { data: matches, isPending: areMatchesPending } = useQuery({
    queryKey: matchKeys.list(membership?.leagueId ?? ''),
    enabled: Boolean(membership),
    queryFn: () => fetchMatches(membership!.leagueId),
  })

  const activePlayers = (players ?? []).filter((player) => player.isActive)
  const rankedPlayers = activePlayers.filter(
    (player) => player.matchesPlayed > 0,
  )

  const topByValue = [...rankedPlayers]
    .sort((left, right) => right.marketValueGbp - left.marketValueGbp)
    .slice(0, LEADERBOARD_SIZE)

  const topByRating = [...rankedPlayers]
    .sort((left, right) => right.cardRating - left.cardRating)
    .slice(0, LEADERBOARD_SIZE)

  // `matches` arrives newest-first, so the latest scored match is the first
  // scored entry and the next fixture is the last upcoming one.
  const latestMatch: MatchRow | undefined = (matches ?? []).find(
    (match) => match.status === 'scored',
  )

  const nextMatch: MatchRow | undefined = (matches ?? [])
    .filter((match) => match.status === 'scheduled' || match.status === 'draft')
    .at(-1)

  const scoredMatchCount = (matches ?? []).filter(
    (match) => match.status === 'scored',
  ).length

  // Award holders, most-decorated first, so the dashboard shows who is actually
  // collecting them rather than an arbitrary slice of the roster.
  const awardHolders = attributes
    .filter((attribute) => attribute.points > 0)
    .map((attribute) => ({
      attribute,
      holders: rankedPlayers
        .filter((player) => (player.attributeCounts[attribute.code] ?? 0) > 0)
        .sort(
          (left, right) =>
            (right.attributeCounts[attribute.code] ?? 0) -
            (left.attributeCounts[attribute.code] ?? 0),
        )
        .slice(0, 3),
    }))
    .filter((entry) => entry.holders.length > 0)

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold">{league?.title ?? 'Liga'}</h1>
        {league ? (
          <Badge variant={league.status === 'active' ? 'default' : 'secondary'}>
            {league.status === 'active' ? 'Activa' : 'Inactiva'}
          </Badge>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Jugadores activos">
          <span className="numeric">
            {arePlayersPending ? '—' : activePlayers.length}
          </span>
        </StatTile>
        <StatTile label="Partidos puntuados">
          <span className="numeric">
            {areMatchesPending ? '—' : scoredMatchCount}
          </span>
        </StatTile>
        <StatTile label="Valor total">
          {arePlayersPending ? (
            '—'
          ) : (
            <MarketValue
              value={activePlayers.reduce(
                (total, player) => total + player.marketValueGbp,
                0,
              )}
            />
          )}
        </StatTile>
        <StatTile label="Tu rol">
          {membership?.role === 'admin' ? 'Admin' : 'Miembro'}
        </StatTile>
      </div>

      {areMatchesPending ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <Skeleton className="h-40 rounded-xl" />
          <Skeleton className="h-40 rounded-xl" />
        </div>
      ) : latestMatch || nextMatch ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {latestMatch ? (
            <section className="flex flex-col gap-2">
              <h2 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
                Último partido
              </h2>
              <MatchCard match={latestMatch} />
            </section>
          ) : null}
          {nextMatch ? (
            <section className="flex flex-col gap-2">
              <h2 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
                Próximo partido
              </h2>
              <MatchCard match={nextMatch} />
            </section>
          ) : null}
        </div>
      ) : null}

      {arePlayersPending ? (
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
      ) : rankedPlayers.length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          title="Ningún partido puntuado todavía"
          description="Las clasificaciones y los valores de mercado aparecerán tras el primer partido."
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

      {awardHolders.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Award className="size-4 text-primary" aria-hidden="true" />
              <h2>Palmarés</h2>
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {awardHolders.map(({ attribute, holders }) => (
              <div
                key={attribute.code}
                className="flex flex-wrap items-center gap-2"
              >
                <AttributeBadge
                  label={attribute.label}
                  points={attribute.points}
                />
                {holders.map((player) => (
                  <Link
                    key={player.id}
                    to={`/players/${player.id}`}
                    className="text-sm hover:underline"
                  >
                    {player.displayName}
                    <span className="numeric text-muted-foreground">
                      {' '}
                      ×{player.attributeCounts[attribute.code]}
                    </span>
                  </Link>
                ))}
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button asChild variant="outline">
          <Link to="/players">
            <Users className="size-4" aria-hidden="true" />
            Jugadores
          </Link>
        </Button>
        <Button asChild variant="outline">
          <Link to="/matches">
            <CalendarDays className="size-4" aria-hidden="true" />
            Partidos
          </Link>
        </Button>
        <Button asChild variant="outline">
          <Link to="/rankings">
            <BarChart3 className="size-4" aria-hidden="true" />
            Clasificaciones
          </Link>
        </Button>
      </div>
    </div>
  )
}

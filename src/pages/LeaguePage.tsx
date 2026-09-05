import { Link } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { Award, CalendarDays, TrendingUp, Trophy, Users } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/EmptyState'
import { ErrorState } from '@/components/ErrorState'
import { MarketValue } from '@/components/MarketValue'
import { MatchCard } from '@/components/MatchCard'
import {
  fetchLatestAwardWinners,
  fetchPlayerCards,
  playerKeys,
} from '@/features/players/api'
import { fetchMatches, fetchSquad, matchKeys } from '@/features/matches/api'
import { useLeague, useLeagueAttributes } from '@/features/league/useLeague'
import { formatVictories, toInitials } from '@/lib/formatting'
import { isUpcomingMatch } from '@/lib/matchLifecycle'
import { getAvatarUrl } from '@/lib/supabase'
import { BRAND_NAME } from '@/lib/brand'
import type {
  LeagueAttributeRow,
  MatchRow,
  PlayerCardData,
} from '@/types/domain'

const LEADERBOARD_SIZE = 5

interface AwardEntry {
  attribute: LeagueAttributeRow
  holders: PlayerCardData[]
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
    <Card className="leaderboard-panel">
      <CardHeader className="border-b border-border">
        <CardTitle className="flex items-center gap-2 uppercase">
          <span className="text-primary">
            <Icon className="size-4" aria-hidden="true" />
          </span>
          <h2>{title}</h2>
        </CardTitle>
      </CardHeader>
      <CardContent className="leaderboard-rows">
        {players.map((player, index) => {
          const avatarUrl = getAvatarUrl(player.avatarPath)
          const initials = toInitials(
            player.firstName,
            player.lastName,
            player.displayName,
          )

          return (
            <Link
              key={player.id}
              to={`/players/${player.id}`}
              className="leaderboard-row group"
            >
              <span className="numeric w-4 text-xs text-primary">
                {index + 1}
              </span>
              <Avatar className="size-7 shrink-0 rounded-sm border border-border">
                {avatarUrl ? <AvatarImage src={avatarUrl} alt="" /> : null}
                <AvatarFallback className="bg-primary/15 font-heading text-base text-primary">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <span className="min-w-0 flex-1 truncate text-xs font-medium">
                {player.displayName}
              </span>
              {renderValue(player)}
            </Link>
          )
        })}
      </CardContent>
    </Card>
  )
}

function AwardSpotlight({ entry }: { entry: AwardEntry }) {
  const player = entry.holders[0]
  const avatarUrl = getAvatarUrl(player.avatarPath)
  const initials = toInitials(
    player.firstName,
    player.lastName,
    player.displayName,
  )

  return (
    <Link to={`/players/${player.id}`} className="award-sticker motion-card">
      <Avatar className="award-photo rounded-none">
        {avatarUrl ? <AvatarImage src={avatarUrl} alt="" /> : null}
        <AvatarFallback className="bg-primary/15 font-heading text-3xl text-primary">
          {initials}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0">
        <p className="technical text-xs text-primary">
          {entry.attribute.label}
        </p>
        <p className="truncate font-heading text-lg font-bold uppercase">
          {player.displayName}
        </p>
        <p className="technical text-[0.625rem] text-muted-foreground uppercase">
          {player.attributeCounts[entry.attribute.code]} en total
        </p>
      </div>
    </Link>
  )
}

export function LeaguePage() {
  const { data: league } = useLeague()
  const { data: attributes = [] } = useLeagueAttributes()

  const {
    data: players,
    isPending: arePlayersPending,
    error: playersError,
    refetch: refetchPlayers,
  } = useQuery({
    queryKey: playerKeys.cards(league?.id ?? ''),
    enabled: Boolean(league),
    queryFn: () => fetchPlayerCards(league!.id),
  })

  const { data: matches, isPending: areMatchesPending } = useQuery({
    queryKey: matchKeys.list(league?.id ?? ''),
    enabled: Boolean(league),
    queryFn: () => fetchMatches(league!.id),
  })

  const activePlayers = (players ?? []).filter(
    (player) => player.isActive && !player.isGuest,
  )
  const rankedPlayers = activePlayers.filter(
    (player) => player.matchesPlayed > 0,
  )
  const topByValue = [...rankedPlayers]
    .sort((left, right) => right.marketValueGbp - left.marketValueGbp)
    .slice(0, LEADERBOARD_SIZE)
  const topByVictories = [...rankedPlayers]
    .sort(
      (left, right) =>
        right.totalVictories - left.totalVictories ||
        right.matchesPlayed - left.matchesPlayed,
    )
    .slice(0, LEADERBOARD_SIZE)
  const honoursCount = (player: PlayerCardData) =>
    attributes
      .filter((attribute) => attribute.points > 0)
      .reduce(
        (total, attribute) =>
          total + (player.attributeCounts[attribute.code] ?? 0),
        0,
      )
  const topByHonours = [...rankedPlayers]
    .sort(
      (left, right) =>
        honoursCount(right) - honoursCount(left) ||
        right.cardRating - left.cardRating,
    )
    .slice(0, LEADERBOARD_SIZE)
  const nextMatch: MatchRow | undefined = (matches ?? [])
    .filter((match) => isUpcomingMatch(match.status))
    .at(-1)
  const { data: nextSquad = [] } = useQuery({
    queryKey: matchKeys.squad(nextMatch?.id ?? ''),
    enabled: Boolean(nextMatch),
    queryFn: () => fetchSquad(nextMatch!.id),
  })
  const { data: latestAwardWinners = [] } = useQuery({
    queryKey: playerKeys.latestAwards(league?.id ?? ''),
    enabled: Boolean(league),
    queryFn: () => fetchLatestAwardWinners(league!.id),
  })
  const nextSquadPlayers = nextSquad
    .map((member) =>
      (players ?? []).find((player) => player.id === member.playerId),
    )
    .filter((player): player is PlayerCardData => Boolean(player))
  const recentMatches = (matches ?? [])
    .filter((match) => match.status === 'scored')
    .slice(0, 3)
  const latestAwardEntries: AwardEntry[] = attributes
    .filter((attribute) => attribute.points > 0)
    .map((attribute) => {
      const winner = latestAwardWinners.find(
        (entry) => entry.attributeCode === attribute.code,
      )
      const player = winner
        ? rankedPlayers.find((entry) => entry.id === winner.playerId)
        : undefined

      return { attribute, holders: player ? [player] : [] }
    })
    .filter((entry) => entry.holders.length > 0)

  return (
    <div className="league-dashboard motion-page">
      <header className="league-masthead">
        <div>
          <p className="section-kicker">La liga entre amigos</p>
          <h1 className="page-title">{BRAND_NAME}</h1>
        </div>
        <span className="technical text-xs text-primary">
          FÚTBOL / AMIGOS / PIQUE
        </span>
      </header>
      <div className="league-overview">
        <span>
          <strong className="numeric">
            {arePlayersPending ? '—' : activePlayers.length}
          </strong>{' '}
          Jugadores
        </span>
        <span>
          <strong className="numeric">
            {areMatchesPending
              ? '—'
              : (matches ?? []).filter((match) => match.status === 'scored')
                  .length}
          </strong>{' '}
          Jornadas puntuadas
        </span>
        <Link to="/stats">
          Clasificaciones <span aria-hidden="true">↗</span>
        </Link>
      </div>
      <div className="league-fixtures">
        {areMatchesPending ? (
          <Skeleton className="h-48" />
        ) : nextMatch ? (
          <section className="motion-enter flex min-w-0 flex-col gap-2">
            <h2 className="section-kicker">Próxima jornada</h2>
            <div className="w-full max-w-[1280px]">
              <MatchCard
                match={nextMatch}
                featured
                participants={nextSquadPlayers}
              />
            </div>
          </section>
        ) : null}

        {recentMatches.length > 0 ? (
          <section className="motion-enter flex min-w-0 flex-col gap-2">
            <div className="flex items-end justify-between gap-4">
              <h2 className="section-kicker">Últimas jornadas</h2>
              <Link
                to="/matches"
                className="technical text-xs font-semibold text-primary uppercase hover:underline"
              >
                Ver calendario
              </Link>
            </div>
            <div className="recent-fixtures grid gap-1.5">
              {recentMatches.map((match) => (
                <MatchCard key={match.id} match={match} />
              ))}
            </div>
          </section>
        ) : null}
      </div>

      {arePlayersPending ? (
        <div className="grid gap-5 xl:grid-cols-2">
          <Skeleton className="h-72 rounded-xl" />
          <Skeleton className="h-72 rounded-xl" />
        </div>
      ) : playersError ? (
        <ErrorState
          error={playersError}
          onRetry={() => void refetchPlayers()}
        />
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
          description="Las estadísticas y los valores de mercado aparecerán tras el primer partido."
        />
      ) : (
        <section className="motion-enter flex flex-col gap-2">
          <div>
            <h2 className="section-title">Clasificación individual</h2>
          </div>
          <div className="grid gap-2 md:grid-cols-3">
            <LeaderboardCard
              title="Valor de mercado"
              icon={TrendingUp}
              players={topByValue}
              renderValue={(player) => (
                <MarketValue
                  value={player.marketValueGbp}
                  className="text-xs"
                />
              )}
            />
            <LeaderboardCard
              title="Más victoriosos"
              icon={Trophy}
              players={topByVictories}
              renderValue={(player) => (
                <span className="numeric text-xs font-semibold">
                  {formatVictories(player.totalVictories)} victorias
                </span>
              )}
            />
            <LeaderboardCard
              title="Palmarés"
              icon={Award}
              players={topByHonours}
              renderValue={(player) => (
                <span className="numeric text-xs font-semibold">
                  {honoursCount(player)}{' '}
                  <span className="font-normal text-muted-foreground">
                    {honoursCount(player) === 1 ? 'distinción' : 'distinciones'}
                  </span>
                </span>
              )}
            />
          </div>
        </section>
      )}

      {latestAwardEntries.length > 0 ? (
        <section className="motion-enter flex flex-col gap-2">
          <div>
            <h2 className="section-title">Reconocimientos</h2>
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            {latestAwardEntries.slice(0, 3).map((entry) => (
              <AwardSpotlight key={entry.attribute.code} entry={entry} />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  )
}

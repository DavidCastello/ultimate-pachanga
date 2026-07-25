import { Link, useParams } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, History } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { AttributeBadge } from '@/components/AttributeBadge'
import { EmptyState } from '@/components/EmptyState'
import { MarketValue } from '@/components/MarketValue'
import { MetricRadarChart } from '@/components/MetricRadarChart'
import { PlayerCard } from '@/components/PlayerCard'
import {
  fetchPlayerCard,
  fetchPlayerHistory,
  playerKeys,
} from '@/features/players/api'
import {
  useLeagueAttributes,
  useLeagueMetrics,
} from '@/features/league/useLeague'
import {
  formatMatchDate,
  formatPosition,
  formatScore,
  formatVictories,
  formatWinRate,
} from '@/lib/formatting'

function SummaryRow({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="font-semibold">{children}</dd>
    </div>
  )
}

export function PlayerDetailPage() {
  const { playerId = '' } = useParams()
  const { data: metrics = [] } = useLeagueMetrics()
  const { data: attributes = [] } = useLeagueAttributes()

  const {
    data: player,
    isPending,
    error,
  } = useQuery({
    queryKey: playerKeys.card(playerId),
    enabled: Boolean(playerId),
    queryFn: () => fetchPlayerCard(playerId),
  })

  const { data: history = [], isPending: isHistoryPending } = useQuery({
    queryKey: playerKeys.history(playerId),
    enabled: Boolean(playerId),
    queryFn: () => fetchPlayerHistory(playerId),
  })

  if (isPending) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-8 w-40" />
        <div className="grid gap-4 md:grid-cols-[18rem_1fr]">
          <Skeleton className="h-72 rounded-xl" />
          <Skeleton className="h-72 rounded-xl" />
        </div>
      </div>
    )
  }

  if (error || !player) {
    return (
      <EmptyState
        title="No se encontró el jugador"
        description="Puede que se haya eliminado o que el enlace sea incorrecto."
        action={
          <Button asChild variant="outline">
            <Link to="/players">Volver a jugadores</Link>
          </Button>
        }
      />
    )
  }

  const earnedAttributes = attributes.filter(
    (attribute) => (player.attributeCounts[attribute.code] ?? 0) > 0,
  )

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="sm">
          <Link to="/players">
            <ArrowLeft className="size-4" aria-hidden="true" />
            Jugadores
          </Link>
        </Button>
      </div>

      <h1 className="text-2xl font-bold">{player.displayName}</h1>

      <div className="grid gap-4 md:grid-cols-[18rem_1fr]">
        <PlayerCard player={player} metrics={metrics} className="h-fit" />

        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle>
                <h2>Resumen</h2>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="divide-y divide-border/50">
                <SummaryRow label="Valor de mercado">
                  <MarketValue value={player.marketValueGbp} exact />
                </SummaryRow>
                <SummaryRow label="Valoración">
                  <span className="numeric">{player.cardRating}</span>
                </SummaryRow>
                <SummaryRow label="Posición">
                  {player.preferredPosition} ·{' '}
                  {formatPosition(player.preferredPosition)}
                </SummaryRow>
                <SummaryRow label="Partidos jugados">
                  <span className="numeric">{player.matchesPlayed}</span>
                </SummaryRow>
                <SummaryRow label="Victorias">
                  <span className="numeric">
                    {formatWinRate(player.totalVictories, player.matchesPlayed)}
                    <span className="ml-2 font-normal text-muted-foreground">
                      {formatVictories(player.totalVictories)}/
                      {player.matchesPlayed}
                    </span>
                  </span>
                </SummaryRow>
                <SummaryRow label="Goles">
                  <span className="numeric">{player.totalGoals}</span>
                </SummaryRow>
                <SummaryRow label="Media histórica">
                  <span className="numeric">
                    {formatScore(player.careerAverage)}
                  </span>
                </SummaryRow>
                <SummaryRow label="Última puntuación">
                  <span className="numeric">
                    {formatScore(player.latestScore)}
                  </span>
                </SummaryRow>
                <SummaryRow label="Código">
                  <span className="numeric text-sm text-muted-foreground">
                    {player.playerCode}
                  </span>
                </SummaryRow>
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>
                <h2>Medias por métrica</h2>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <MetricRadarChart player={player} metrics={metrics} />
            </CardContent>
          </Card>

          {earnedAttributes.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>
                  <h2>Atributos</h2>
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                {earnedAttributes.map((attribute) => (
                  <AttributeBadge
                    key={attribute.code}
                    label={attribute.label}
                    points={attribute.points}
                    count={player.attributeCounts[attribute.code]}
                  />
                ))}
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            <h2>Historial de partidos</h2>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isHistoryPending ? (
            <Skeleton className="h-24" />
          ) : history.length === 0 ? (
            <EmptyState
              icon={History}
              title="Sin partidos puntuados"
              description="Las puntuaciones aparecerán aquí cuando se importe un partido."
              className="border-0 py-6"
            />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Partido</TableHead>
                    <TableHead>Fecha</TableHead>
                    {metrics.map((metric) => (
                      <TableHead key={metric.code} className="text-right">
                        {metric.label}
                      </TableHead>
                    ))}
                    <TableHead className="text-right">Goles</TableHead>
                    <TableHead className="text-right">Victoria</TableHead>
                    <TableHead className="text-right">Base</TableHead>
                    <TableHead>Atributos</TableHead>
                    <TableHead className="text-right">Final</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {history.map((entry) => (
                    <TableRow key={entry.matchId}>
                      <TableCell className="font-medium">
                        {entry.matchTitle}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground">
                        {formatMatchDate(entry.playedAt)}
                      </TableCell>
                      {metrics.map((metric) => (
                        <TableCell
                          key={metric.code}
                          className="numeric text-right"
                        >
                          {formatScore(entry.metricScores[metric.code] ?? null)}
                        </TableCell>
                      ))}
                      <TableCell className="numeric text-right">
                        {entry.goals}
                      </TableCell>
                      <TableCell className="numeric text-right">
                        {formatVictories(entry.victory)}
                      </TableCell>
                      <TableCell className="numeric text-right">
                        {formatScore(entry.baseScore)}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {entry.attributes.map((attribute) => (
                            <AttributeBadge
                              key={attribute.code}
                              label={attribute.label}
                              points={attribute.points}
                            />
                          ))}
                        </div>
                      </TableCell>
                      <TableCell className="numeric text-right font-bold">
                        {formatScore(entry.finalScore)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

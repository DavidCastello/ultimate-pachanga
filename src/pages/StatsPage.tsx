import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Trophy } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { EmptyState } from '@/components/EmptyState'
import { ErrorState } from '@/components/ErrorState'
import { MarketValue } from '@/components/MarketValue'
import { PodiumList } from '@/components/PodiumList'
import { RankingTable } from '@/components/RankingTable'
import { fetchPlayerCards, playerKeys } from '@/features/players/api'
import { EvolutionSection } from '@/features/stats/EvolutionSection'
import {
  useLeagueAttributes,
  useLeague,
  useLeagueMetrics,
} from '@/features/league/useLeague'
import type { LeagueMetricRow, PlayerCardData } from '@/types/domain'

/**
 * Statistics.
 *
 * Only players with at least one scored match are counted. Including the rest
 * would list everyone who has never played on a shared fallback value, which
 * reads as a genuine ranking and is not one.
 */

const PODIUM_SIZE = 5

/**
 * The metric the defensive podium is built from.
 *
 * Metrics are per-league reference data, so this is a lookup rather than an
 * assumption: a league without a `defence` metric simply does not get the card.
 */
const DEFENSIVE_METRIC_CODE = 'defence'

function PodiumCard({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children: React.ReactNode
}) {
  return (
    <Card className="motion-card overflow-hidden border-border bg-[linear-gradient(145deg,#181818_0%,#0d0d0d_100%)] transition-transform hover:-translate-y-0.5">
      <CardHeader className="border-b border-border/80">
        <CardTitle className="card-title">
          <h2>{title}</h2>
        </CardTitle>
        <p className="body-copy text-muted-foreground">{description}</p>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  )
}

/** The best five by one figure, ignoring everyone the figure says nothing about. */
function topBy(
  players: readonly PlayerCardData[],
  selector: (player: PlayerCardData) => number | null | undefined,
): PlayerCardData[] {
  return players
    .filter((player) => {
      const value = selector(player)
      return value !== null && value !== undefined && value > 0
    })
    .sort((left, right) => (selector(right) ?? 0) - (selector(left) ?? 0))
    .slice(0, PODIUM_SIZE)
}

function GeneralTab({
  players,
  metrics,
}: {
  players: readonly PlayerCardData[]
  metrics: readonly LeagueMetricRow[]
}) {
  const defensiveMetric = metrics.find(
    (metric) => metric.code === DEFENSIVE_METRIC_CODE,
  )

  return (
    <div className="stats-grid">
      <PodiumCard
        title="Valor de mercado"
        description="Valor de mercado calculado a partir de las puntuaciones"
      >
        <PodiumList
          players={topBy(players, (player) => player.marketValueGbp)}
          renderValue={(player) => (
            <MarketValue value={player.marketValueGbp} />
          )}
          emptyMessage="Todavía no hay valoraciones."
        />
      </PodiumCard>

      <PodiumCard
        title="Goleadores"
        description="Goles marcados en partidos puntuados"
      >
        <PodiumList
          players={topBy(players, (player) => player.totalGoals)}
          renderValue={(player) => player.totalGoals}
          emptyMessage="Nadie ha marcado todavía."
        />
      </PodiumCard>

      <PodiumCard
        title="Estado de forma"
        description="Quién llega más fuerte a la próxima jornada"
      >
        <PodiumList
          players={topBy(players, (player) => player.cardRating)}
          renderValue={(player) => player.cardRating}
          emptyMessage="Todavía no hay valoraciones."
        />
      </PodiumCard>

      {defensiveMetric ? (
        <PodiumCard
          title="Defensa"
          description={`Media de ${defensiveMetric.label} en la escala 0-99`}
        >
          <PodiumList
            players={topBy(
              players,
              (player) => player.metricCardStats[defensiveMetric.code],
            )}
            renderValue={(player) =>
              player.metricCardStats[defensiveMetric.code]
            }
            emptyMessage="Todavía no hay puntuaciones defensivas."
          />
        </PodiumCard>
      ) : null}
    </div>
  )
}

export function StatsPage() {
  const { data: league } = useLeague()
  const { data: metrics = [] } = useLeagueMetrics()
  const { data: attributes = [] } = useLeagueAttributes()
  const [tab, setTab] = useState('general')

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

  // Guests are left out of every tab, the evolution chart included: `ranked` is
  // also the list its series are picked from. Their scores still count towards
  // the league mean each rating is measured against, here as in the database —
  // they played the match, and taking them out would restate everybody else's.
  const ranked = useMemo(
    () =>
      (players ?? []).filter(
        (player) =>
          player.isActive && !player.isGuest && player.matchesPlayed > 0,
      ),
    [players],
  )

  const byAttribute = (code: string) =>
    ranked
      .filter((player) => (player.attributeCounts[code] ?? 0) > 0)
      .sort(
        (left, right) =>
          (right.attributeCounts[code] ?? 0) -
          (left.attributeCounts[code] ?? 0),
      )

  if (isPending) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-96 rounded-xl" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col gap-5">
        <h1 className="page-title">Estadísticas</h1>
        <ErrorState error={error} onRetry={() => void refetch()} />
      </div>
    )
  }

  if (ranked.length === 0) {
    return (
      <div className="flex flex-col gap-5">
        <h1 className="page-title">Estadísticas</h1>
        <EmptyState
          icon={Trophy}
          title="Todavía no hay partidos puntuados"
          description="Las estadísticas aparecerán cuando se importe el primer partido."
        />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-9">
      <div>
        <h1 className="page-title">Estadísticas</h1>
        <p className="mt-3 text-lg text-muted-foreground">
          {ranked.length} jugadores con partidos puntuados
        </p>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="grid h-auto min-h-15 w-full grid-cols-3 gap-1 overflow-visible p-1">
          <TabsTrigger
            value="general"
            className="h-auto min-h-14 px-2 py-1 font-heading text-lg leading-none font-semibold uppercase sm:text-xl"
          >
            General
          </TabsTrigger>
          <TabsTrigger
            value="palmares"
            className="h-auto min-h-14 px-2 py-1 font-heading text-lg leading-none font-semibold uppercase sm:text-xl"
          >
            Palmarés
          </TabsTrigger>
          <TabsTrigger
            value="evolution"
            className="h-auto min-h-14 px-2 py-1 font-heading text-lg leading-none font-semibold uppercase sm:text-xl"
          >
            Evolución
          </TabsTrigger>
        </TabsList>

        <TabsContent value="general" className="mt-6">
          <GeneralTab players={ranked} metrics={metrics} />
        </TabsContent>

        <TabsContent value="palmares" className="mt-6">
          <div className="stats-grid">
            {attributes.map((attribute) => {
              const holders = byAttribute(attribute.code)

              return (
                <section key={attribute.code} className="flex flex-col gap-2">
                  <h2 className="font-heading text-3xl leading-none font-semibold uppercase">
                    {attribute.label}
                  </h2>
                  {holders.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      Nadie lo ha recibido todavía.
                    </p>
                  ) : (
                    <RankingTable
                      players={holders}
                      valueLabel="Veces"
                      renderValue={(player) =>
                        player.attributeCounts[attribute.code]
                      }
                    />
                  )}
                </section>
              )
            })}
          </div>
        </TabsContent>

        <TabsContent value="evolution" className="mt-6">
          {league ? (
            <EvolutionSection
              leagueId={league.id}
              players={ranked}
              metrics={metrics}
            />
          ) : null}
        </TabsContent>
      </Tabs>
    </div>
  )
}

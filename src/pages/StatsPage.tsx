import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Trophy } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { EmptyState } from '@/components/EmptyState'
import { MarketValue } from '@/components/MarketValue'
import { PodiumList } from '@/components/PodiumList'
import { RankingTable } from '@/components/RankingTable'
import { fetchPlayerCards, playerKeys } from '@/features/players/api'
import { EvolutionSection } from '@/features/stats/EvolutionSection'
import {
  useLeagueAttributes,
  useLeagueMetrics,
  useMembership,
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
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>{title}</h2>
        </CardTitle>
        <p className="text-sm text-muted-foreground">{description}</p>
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
    <div className="grid gap-4 md:grid-cols-2">
      <PodiumCard
        title="Jugadores más valorados"
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
        title="Jugadores más goleadores"
        description="Goles marcados en partidos puntuados"
      >
        <PodiumList
          players={topBy(players, (player) => player.totalGoals)}
          renderValue={(player) => player.totalGoals}
          emptyMessage="Nadie ha marcado todavía."
        />
      </PodiumCard>

      <PodiumCard
        title="Mejor estado de forma actual"
        description="Valoración 0-100, medida sobre el último partido de cada jugador"
      >
        <PodiumList
          players={topBy(players, (player) => player.cardRating)}
          renderValue={(player) => player.cardRating}
          emptyMessage="Todavía no hay valoraciones."
        />
      </PodiumCard>

      {defensiveMetric ? (
        <PodiumCard
          title="Top jugadores defensivos"
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
  const { data: membership } = useMembership()
  const { data: metrics = [] } = useLeagueMetrics()
  const { data: attributes = [] } = useLeagueAttributes()
  const [tab, setTab] = useState('general')

  const { data: players, isPending } = useQuery({
    queryKey: playerKeys.cards(membership?.leagueId ?? ''),
    enabled: Boolean(membership),
    queryFn: () => fetchPlayerCards(membership!.leagueId),
  })

  const ranked = useMemo(
    () =>
      (players ?? []).filter(
        (player) => player.isActive && player.matchesPlayed > 0,
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

  if (ranked.length === 0) {
    return (
      <div className="flex flex-col gap-5">
        <h1 className="text-2xl font-bold">Estadísticas</h1>
        <EmptyState
          icon={Trophy}
          title="Todavía no hay partidos puntuados"
          description="Las estadísticas aparecerán cuando se importe el primer partido."
        />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-bold">Estadísticas</h1>
        <p className="text-sm text-muted-foreground">
          {ranked.length} jugadores con partidos puntuados
        </p>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        {/* Scrolls sideways on a phone rather than wrapping into a tall block. */}
        <TabsList className="flex w-full justify-start overflow-x-auto">
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="palmares">Palmarés</TabsTrigger>
          <TabsTrigger value="evolution">Evolución</TabsTrigger>
        </TabsList>

        <TabsContent value="general" className="mt-4">
          <GeneralTab players={ranked} metrics={metrics} />
        </TabsContent>

        <TabsContent value="palmares" className="mt-4">
          <div className="flex flex-col gap-6">
            {attributes.map((attribute) => {
              const holders = byAttribute(attribute.code)

              return (
                <section key={attribute.code} className="flex flex-col gap-2">
                  <h2 className="text-sm font-semibold">{attribute.label}</h2>
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

        <TabsContent value="evolution" className="mt-4">
          {membership ? (
            <EvolutionSection
              leagueId={membership.leagueId}
              players={ranked}
              metrics={metrics}
            />
          ) : null}
        </TabsContent>
      </Tabs>
    </div>
  )
}

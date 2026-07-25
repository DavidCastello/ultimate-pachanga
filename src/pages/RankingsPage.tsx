import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Trophy } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { EmptyState } from '@/components/EmptyState'
import { MarketValue } from '@/components/MarketValue'
import { RankingTable } from '@/components/RankingTable'
import { fetchPlayerCards, playerKeys } from '@/features/players/api'
import {
  useLeagueAttributes,
  useLeagueMetrics,
  useMembership,
} from '@/features/league/useLeague'
import { formatScore } from '@/lib/formatting'
import type { PlayerCardData } from '@/types/domain'

/**
 * Rankings.
 *
 * Only players with at least one scored match are ranked. Including the rest
 * would list everyone who has never played on a shared fallback value, which
 * reads as a genuine ranking and is not one.
 */
export function RankingsPage() {
  const { data: membership } = useMembership()
  const { data: metrics = [] } = useLeagueMetrics()
  const { data: attributes = [] } = useLeagueAttributes()
  const [tab, setTab] = useState('value')

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

  function sortedBy(
    selector: (player: PlayerCardData) => number,
  ): PlayerCardData[] {
    return [...ranked].sort((left, right) => selector(right) - selector(left))
  }

  const byMetric = (code: string) =>
    sortedBy((player) => player.metricCardStats[code] ?? 0).filter(
      (player) => player.metricCardStats[code] !== undefined,
    )

  const byAttribute = (code: string) =>
    sortedBy((player) => player.attributeCounts[code] ?? 0).filter(
      (player) => (player.attributeCounts[code] ?? 0) > 0,
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
        <h1 className="text-2xl font-bold">Clasificaciones</h1>
        <EmptyState
          icon={Trophy}
          title="Todavía no hay partidos puntuados"
          description="Las clasificaciones aparecerán cuando se importe el primer partido."
        />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-bold">Clasificaciones</h1>
        <p className="text-sm text-muted-foreground">
          {ranked.length} jugadores con partidos puntuados
        </p>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        {/* Scrolls sideways on a phone rather than wrapping into a tall block. */}
        <TabsList className="flex w-full justify-start overflow-x-auto">
          <TabsTrigger value="value">Valor</TabsTrigger>
          <TabsTrigger value="rating">Valoración</TabsTrigger>
          {metrics.map((metric) => (
            <TabsTrigger key={metric.code} value={`metric-${metric.code}`}>
              {metric.label}
            </TabsTrigger>
          ))}
          <TabsTrigger value="attributes">Atributos</TabsTrigger>
        </TabsList>

        <TabsContent value="value" className="mt-4">
          <RankingTable
            players={sortedBy((player) => player.marketValueGbp)}
            valueLabel="Valor de mercado"
            renderValue={(player) => (
              <MarketValue value={player.marketValueGbp} />
            )}
            contextLabel="Partidos"
            renderContext={(player) => player.matchesPlayed}
          />
        </TabsContent>

        <TabsContent value="rating" className="mt-4">
          <RankingTable
            players={sortedBy((player) => player.cardRating)}
            valueLabel="Valoración"
            renderValue={(player) => player.cardRating}
            contextLabel="Media"
            renderContext={(player) => formatScore(player.careerAverage)}
          />
        </TabsContent>

        {metrics.map((metric) => (
          <TabsContent
            key={metric.code}
            value={`metric-${metric.code}`}
            className="mt-4"
          >
            <RankingTable
              players={byMetric(metric.code)}
              valueLabel={metric.label}
              renderValue={(player) => player.metricCardStats[metric.code]}
              contextLabel="Media"
              renderContext={(player) =>
                formatScore(player.metricAverages[metric.code] ?? null)
              }
            />
          </TabsContent>
        ))}

        <TabsContent value="attributes" className="mt-4">
          <div className="flex flex-col gap-6">
            {attributes.map((attribute) => {
              const holders = byAttribute(attribute.code)

              return (
                <section key={attribute.code} className="flex flex-col gap-2">
                  <h2 className="text-sm font-semibold">
                    {attribute.label}{' '}
                    <span className="font-normal text-muted-foreground">
                      ({attribute.points > 0 ? '+' : ''}
                      {attribute.points})
                    </span>
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
      </Tabs>
    </div>
  )
}

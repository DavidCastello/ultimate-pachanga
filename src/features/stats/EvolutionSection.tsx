import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { LineChart } from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/EmptyState'
import { EvolutionChart } from '@/features/stats/EvolutionChart'
import { PlayerSeriesPicker } from '@/features/stats/PlayerSeriesPicker'
import { fetchScoreTimeline, statsKeys } from '@/features/stats/api'
import {
  buildEvolutionRows,
  RATING_SERIES_CODE,
} from '@/features/stats/evolution'
import { formatScore } from '@/lib/formatting'
import type { LeagueMetricRow, PlayerCardData } from '@/types/domain'

/**
 * The eight series colours, in slot order.
 *
 * A player keeps the slot they were given until they leave the chart, so
 * removing a line never repaints the ones that stay — a reader who learned which
 * colour is theirs does not have to learn it again after every filter change.
 */
const SERIES_COLORS = [
  'var(--color-chart-1)',
  'var(--color-chart-2)',
  'var(--color-chart-3)',
  'var(--color-chart-4)',
  'var(--color-chart-5)',
  'var(--color-chart-6)',
  'var(--color-chart-7)',
  'var(--color-chart-8)',
]

const MAXIMUM_SERIES = SERIES_COLORS.length
const DEFAULT_SERIES = 7

/** The rating is bounded at 45 and 99; the axis gives it a little air. */
const RATING_DOMAIN: [number, number] = [40, 100]

interface SeriesSlot {
  playerId: string
  slot: number
}

function byMarketValue(
  players: readonly PlayerCardData[],
): readonly PlayerCardData[] {
  return [...players].sort(
    (left, right) => right.marketValueGbp - left.marketValueGbp,
  )
}

function lowestFreeSlot(selection: readonly SeriesSlot[]): number {
  const taken = new Set(selection.map((entry) => entry.slot))

  for (let slot = 0; slot < MAXIMUM_SERIES; slot += 1) {
    if (!taken.has(slot)) return slot
  }

  return 0
}

interface EvolutionSectionProps {
  leagueId: string
  /** Players eligible to be charted: active, with at least one scored match. */
  players: readonly PlayerCardData[]
  metrics: readonly LeagueMetricRow[]
}

/**
 * How the squad's numbers moved over the season.
 *
 * Opens on the seven most valuable players, because a chart of the whole league
 * is a hairball and the expensive players are the ones a reader recognises.
 */
export function EvolutionSection({
  leagueId,
  players,
  metrics,
}: EvolutionSectionProps) {
  const rankedPlayers = useMemo(() => byMarketValue(players), [players])
  const [seriesCode, setSeriesCode] = useState(RATING_SERIES_CODE)

  const [selection, setSelection] = useState<SeriesSlot[]>(() =>
    byMarketValue(players)
      .slice(0, DEFAULT_SERIES)
      .map((player, slot) => ({ playerId: player.id, slot })),
  )

  const { data: timeline, isPending } = useQuery({
    queryKey: statsKeys.timeline(leagueId),
    queryFn: () => fetchScoreTimeline(leagueId),
  })

  const rows = useMemo(
    () => (timeline ? buildEvolutionRows(timeline, seriesCode) : []),
    [timeline, seriesCode],
  )

  const selectedMetric = metrics.find((metric) => metric.code === seriesCode)

  const series = useMemo(
    () =>
      selection.flatMap((entry) => {
        const player = rankedPlayers.find(
          (candidate) => candidate.id === entry.playerId,
        )

        if (!player) return []

        return [
          {
            playerId: player.id,
            name: player.displayName,
            color: SERIES_COLORS[entry.slot],
          },
        ]
      }),
    [selection, rankedPlayers],
  )

  function toggle(playerId: string) {
    setSelection((current) => {
      if (current.some((entry) => entry.playerId === playerId)) {
        return current.filter((entry) => entry.playerId !== playerId)
      }

      if (current.length >= MAXIMUM_SERIES) return current

      return [...current, { playerId, slot: lowestFreeSlot(current) }]
    })
  }

  function selectOnly(playerId: string) {
    setSelection((current) => [
      {
        playerId,
        slot: current.find((entry) => entry.playerId === playerId)?.slot ?? 0,
      },
    ])
  }

  function colorOf(playerId: string): string | undefined {
    const entry = selection.find((candidate) => candidate.playerId === playerId)
    return entry ? SERIES_COLORS[entry.slot] : undefined
  }

  if (isPending) return <Skeleton className="h-96 rounded-xl" />

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={LineChart}
        title="Todavía no hay jornadas puntuadas"
        description="La evolución aparecerá cuando se importe el primer partido."
      />
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Both filters in one row above the chart: what is measured, and whose
          lines are drawn. */}
      <div className="flex flex-wrap items-center gap-2">
        <Select value={seriesCode} onValueChange={setSeriesCode}>
          <SelectTrigger
            size="sm"
            className="w-48"
            data-testid="evolution-series-select"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={RATING_SERIES_CODE}>
              Valoración (0-100)
            </SelectItem>
            {metrics.map((metric) => (
              <SelectItem key={metric.code} value={metric.code}>
                {metric.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <PlayerSeriesPicker
          players={rankedPlayers}
          selectedIds={selection.map((entry) => entry.playerId)}
          colorOf={colorOf}
          onToggle={toggle}
          onOnly={selectOnly}
          maximumSelected={MAXIMUM_SERIES}
        />
      </div>

      {series.length === 0 ? (
        <EmptyState
          icon={LineChart}
          title="Ningún jugador seleccionado"
          description="Elige jugadores para dibujar su evolución."
          className="border-0"
        />
      ) : (
        <EvolutionChart
          rows={rows}
          series={series}
          valueLabel={selectedMetric?.label ?? 'Valoración'}
          domain={
            selectedMetric
              ? [selectedMetric.minimum_score, selectedMetric.maximum_score]
              : RATING_DOMAIN
          }
          formatValue={
            selectedMetric ? formatScore : (value: number) => String(value)
          }
          onRemove={toggle}
        />
      )}

      <p className="text-xs text-muted-foreground">
        {selectedMetric
          ? 'Puntuación de cada jornada. Quien no juega mantiene la de la jornada anterior.'
          : 'Valoración de la carta tras cada jornada. Quien no juega mantiene la de la jornada anterior.'}
      </p>
    </div>
  )
}

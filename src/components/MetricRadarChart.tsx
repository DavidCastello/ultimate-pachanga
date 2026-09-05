import {
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
  type BaseTickContentProps,
} from 'recharts'
import { formatScore } from '@/lib/formatting'
import { cn } from '@/lib/utils'
import type { LeagueMetricRow, PlayerCardData } from '@/types/domain'

/** Upper bound of the card scale the metric stats are drawn on. */
const CARD_STAT_MAX = 99

interface MetricPoint {
  label: string
  /** 0–99 card stat; 0 when the player has never been scored on this metric. */
  stat: number
  /** Raw average on the metric's own scale, for the tooltip. */
  average: number | null
  maximum: number
  hasStat: boolean
}

function toMetricPoints(
  player: PlayerCardData,
  metrics: readonly LeagueMetricRow[],
): MetricPoint[] {
  return metrics.map((metric) => {
    const stat = player.metricCardStats[metric.code]

    return {
      label: metric.label,
      // A radar needs a number at every vertex or the shape breaks open, so an
      // unscored metric is drawn at the origin and marked as absent for the
      // labels, which show an em dash rather than a misleading zero.
      stat: stat ?? 0,
      average: player.metricAverages[metric.code] ?? null,
      maximum: metric.maximum_score,
      hasStat: stat !== undefined,
    }
  })
}

/**
 * Each vertex is labelled with its own figure.
 *
 * A radar shows shape well and magnitude poorly — two players with the same
 * silhouette can be ten points apart on every axis — so the numbers stay on the
 * chart rather than hiding in a tooltip.
 */
function toAngleTick(points: readonly MetricPoint[]) {
  return function AngleTick({
    x,
    y,
    textAnchor,
    payload,
  }: BaseTickContentProps) {
    const label = String(payload.value)
    const point = points.find((candidate) => candidate.label === label)

    // The tick's own angle says which half of the chart it sits in, so a label
    // in the upper half stacks its figure above the name rather than writing it
    // back through the shape.
    const isAboveCentre = Math.sin((payload.coordinate * Math.PI) / 180) > 0.05
    const labelOffset = isAboveCentre ? -6 : 4
    const valueOffset = isAboveCentre ? -19 : 19

    return (
      <g>
        <text
          x={x}
          y={Number(y) + labelOffset}
          textAnchor={textAnchor}
          className="fill-muted-foreground text-[0.6875rem]"
        >
          {label}
        </text>
        <text
          x={x}
          y={Number(y) + valueOffset}
          textAnchor={textAnchor}
          className="numeric fill-foreground text-sm font-bold"
        >
          {point?.hasStat ? point.stat : '—'}
        </text>
      </g>
    )
  }
}

interface MetricRadarChartProps {
  player: PlayerCardData
  metrics: readonly LeagueMetricRow[]
  className?: string
}

export function MetricRadarChart({
  player,
  metrics,
  className,
}: MetricRadarChartProps) {
  const points = toMetricPoints(player, metrics)

  // Three vertices is the least a radar can enclose; below that it is a line.
  if (points.length < 3) return null

  return (
    <div
      className={cn('h-72 w-full', className)}
      data-testid="metric-radar-chart"
    >
      <ResponsiveContainer width="100%" height="100%">
        <RadarChart data={points} outerRadius="68%">
          <PolarGrid stroke="var(--color-border)" />
          <PolarAngleAxis dataKey="label" tick={toAngleTick(points)} />
          <PolarRadiusAxis
            domain={[0, CARD_STAT_MAX]}
            tick={false}
            axisLine={false}
          />
          <Radar
            name={player.displayName}
            dataKey="stat"
            stroke="var(--color-chart-1)"
            fill="var(--color-chart-1)"
            fillOpacity={0.3}
            strokeWidth={2}
            isAnimationActive={false}
          />
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null

              const point = payload[0].payload as MetricPoint

              return (
                <div className="rounded-lg border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md">
                  <p className="font-semibold">{point.label}</p>
                  <p className="numeric">
                    {point.hasStat ? point.stat : '—'} / {CARD_STAT_MAX}
                  </p>
                  <p className="numeric text-muted-foreground">
                    Media {formatScore(point.average)} /{' '}
                    {formatScore(point.maximum)}
                  </p>
                </div>
              )
            }}
          />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  )
}

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { X } from 'lucide-react'
import type { EvolutionRow } from '@/features/stats/evolution'

export interface EvolutionSeries {
  playerId: string
  name: string
  /** A CSS colour, kept with the player rather than with their position. */
  color: string
}

interface EvolutionChartProps {
  rows: readonly EvolutionRow[]
  series: readonly EvolutionSeries[]
  /** What the y axis measures, e.g. "Valoración". */
  valueLabel: string
  domain: [number, number]
  formatValue: (value: number) => string
  onRemove: (playerId: string) => void
}

interface ChartRow extends Record<string, number | string | null> {
  label: string
  matchTitle: string
}

function toChartRows(
  rows: readonly EvolutionRow[],
  series: readonly EvolutionSeries[],
): ChartRow[] {
  return rows.map((row) => {
    const chartRow: ChartRow = { label: row.label, matchTitle: row.matchTitle }

    for (const { playerId } of series) {
      chartRow[playerId] = row.values[playerId] ?? null
    }

    return chartRow
  })
}

/** The last value each line reaches, shown in the legend. */
function toLatestValue(
  rows: readonly EvolutionRow[],
  playerId: string,
): number | null {
  for (let index = rows.length - 1; index >= 0; index -= 1) {
    const value = rows[index].values[playerId]
    if (value !== null && value !== undefined) return value
  }

  return null
}

/**
 * The evolution of a chosen measure across the season's jornadas.
 *
 * The legend is not decoration: three of the light-mode series colours sit below
 * the 3:1 contrast ratio a mark needs to be read by colour alone, so every line
 * is also named and carries its latest figure in words. It doubles as the
 * remove control, which is where a reader looks when a line is in the way.
 */
export function EvolutionChart({
  rows,
  series,
  valueLabel,
  domain,
  formatValue,
  onRemove,
}: EvolutionChartProps) {
  const chartRows = toChartRows(rows, series)

  return (
    <div className="flex flex-col gap-3">
      <div className="h-80 w-full" data-testid="evolution-chart">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={chartRows}
            margin={{ top: 8, right: 12, bottom: 4, left: 0 }}
          >
            <CartesianGrid
              stroke="var(--color-border)"
              strokeDasharray="3 3"
              vertical={false}
            />
            <XAxis
              dataKey="label"
              stroke="var(--color-border)"
              tick={{ fill: 'var(--color-muted-foreground)', fontSize: 12 }}
              tickMargin={8}
            />
            <YAxis
              domain={domain}
              stroke="var(--color-border)"
              tick={{ fill: 'var(--color-muted-foreground)', fontSize: 12 }}
              tickMargin={4}
              width={40}
            />
            <Tooltip
              cursor={{ stroke: 'var(--color-muted-foreground)' }}
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null

                const row = chartRows.find((entry) => entry.label === label)
                const named = payload
                  .map((entry) => ({
                    name:
                      series.find(
                        (candidate) => candidate.playerId === entry.dataKey,
                      )?.name ?? '',
                    color: String(entry.color ?? ''),
                    value: typeof entry.value === 'number' ? entry.value : null,
                  }))
                  .filter((entry) => entry.value !== null)
                  .sort((left, right) => (right.value ?? 0) - (left.value ?? 0))

                return (
                  <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-md">
                    <p className="mb-1 font-semibold text-popover-foreground">
                      {row?.matchTitle ?? label}
                    </p>
                    <ul className="flex flex-col gap-0.5">
                      {named.map((entry) => (
                        <li
                          key={entry.name}
                          className="flex items-center gap-2 text-popover-foreground"
                        >
                          <span
                            aria-hidden="true"
                            className="size-2 shrink-0 rounded-full"
                            style={{ backgroundColor: entry.color }}
                          />
                          <span className="flex-1 truncate">{entry.name}</span>
                          <span className="numeric font-semibold">
                            {formatValue(entry.value as number)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )
              }}
            />
            {series.map((entry) => (
              <Line
                key={entry.playerId}
                type="monotone"
                dataKey={entry.playerId}
                name={entry.name}
                stroke={entry.color}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
                // A missed jornada carries the previous value, so the only gaps
                // left are the ones before a player's debut. Bridging those
                // would draw a line for matches they were not in.
                connectNulls={false}
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      <ul className="flex flex-wrap gap-2" aria-label={`Series: ${valueLabel}`}>
        {series.map((entry) => {
          const latest = toLatestValue(rows, entry.playerId)

          return (
            <li key={entry.playerId}>
              <button
                type="button"
                onClick={() => onRemove(entry.playerId)}
                data-testid={`evolution-legend-${entry.playerId}`}
                title={`Quitar ${entry.name}`}
                className="flex items-center gap-1.5 rounded-4xl border px-2 py-1 text-xs hover:bg-accent hover:text-accent-foreground"
              >
                <span
                  aria-hidden="true"
                  className="size-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: entry.color }}
                />
                <span className="max-w-32 truncate font-medium">
                  {entry.name}
                </span>
                <span className="numeric text-muted-foreground">
                  {latest === null ? '—' : formatValue(latest)}
                </span>
                <X className="size-3 opacity-60" aria-hidden="true" />
                <span className="sr-only">Quitar de la gráfica</span>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

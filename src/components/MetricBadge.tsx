import { cn } from '@/lib/utils'

interface MetricBadgeProps {
  label: string
  /** 0–99 display stat, or null when the player has never been scored. */
  value: number | null
  className?: string
}

/**
 * A single metric on a player card: three-letter label above a 0–99 stat,
 * the way football cards present them.
 */
export function MetricBadge({ label, value, className }: MetricBadgeProps) {
  return (
    <div className={cn('flex flex-col items-center leading-none', className)}>
      <span className="text-[0.625rem] font-medium tracking-wider uppercase opacity-70">
        {label}
      </span>
      <span className="numeric text-lg font-bold">{value ?? '—'}</span>
    </div>
  )
}

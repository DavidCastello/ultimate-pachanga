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
      <span className="text-[0.5625rem] font-medium tracking-wider uppercase opacity-70">
        {label}
      </span>
      {/* Kept compact so the photograph above gets the card's space. */}
      <span className="numeric mt-0.5 text-sm font-bold">{value ?? '—'}</span>
    </div>
  )
}

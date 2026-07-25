import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { formatAttributePoints } from '@/lib/formatting'

interface AttributeBadgeProps {
  label: string
  points: number
  /** Shown as "x3" when a player has earned the same award several times. */
  count?: number
  /**
   * Whether to show what the award is worth.
   *
   * Off by default: what an award is worth is the database's arithmetic, and
   * repeating it beside every chip is noise. The import preview turns it back
   * on, because checking that arithmetic is the entire point of that screen.
   */
  showPoints?: boolean
  className?: string
}

/**
 * An award or penalty. Colour follows the sign of the points, so a Lesión never
 * reads as an achievement.
 */
export function AttributeBadge({
  label,
  points,
  count,
  showPoints = false,
  className,
}: AttributeBadgeProps) {
  const isPenalty = points < 0

  return (
    <Badge
      variant="outline"
      className={cn(
        'gap-1 border-current/30 font-medium',
        isPenalty
          ? 'bg-attribute-negative/10 text-attribute-negative'
          : 'bg-attribute-positive/10 text-attribute-positive',
        className,
      )}
    >
      <span>{label}</span>
      {count !== undefined && count > 1 ? (
        <span className="numeric opacity-70">×{count}</span>
      ) : null}
      {showPoints ? (
        <span className="numeric opacity-70">
          {formatAttributePoints(points)}
        </span>
      ) : null}
    </Badge>
  )
}

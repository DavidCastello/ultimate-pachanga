import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { formatAttributePoints } from '@/lib/formatting'

interface AttributeBadgeProps {
  label: string
  points: number
  /** Shown as "x3" when a player has earned the same award several times. */
  count?: number
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
      <span className="numeric opacity-70">
        {formatAttributePoints(points)}
      </span>
    </Badge>
  )
}

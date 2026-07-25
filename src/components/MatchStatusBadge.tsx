import { Badge } from '@/components/ui/badge'
import { formatMatchStatus } from '@/lib/formatting'
import type { MatchStatus } from '@/types/domain'

/**
 * Colour carries the meaning at a glance: scored is done, cancelled is
 * inert, scheduled is upcoming.
 */
const STATUS_CLASSES: Record<MatchStatus, string> = {
  draft: 'bg-muted text-muted-foreground',
  scheduled: 'bg-primary/15 text-primary border-primary/30',
  played: 'bg-tier-silver/20 text-tier-silver border-tier-silver/40',
  scored:
    'bg-attribute-positive/15 text-attribute-positive border-attribute-positive/30',
  cancelled: 'bg-destructive/10 text-destructive border-destructive/30',
}

export function MatchStatusBadge({ status }: { status: MatchStatus }) {
  return (
    <Badge variant="outline" className={STATUS_CLASSES[status]}>
      {formatMatchStatus(status)}
    </Badge>
  )
}

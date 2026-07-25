import { Link } from 'react-router'
import { CalendarDays, MapPin } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { MatchStatusBadge } from '@/components/MatchStatusBadge'
import { formatMatchDateTime, formatMatchRelative } from '@/lib/formatting'
import type { MatchRow } from '@/types/domain'

export function MatchCard({ match }: { match: MatchRow }) {
  return (
    <Link
      to={`/matches/${match.id}`}
      className="rounded-xl focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none"
    >
      <Card className="gap-3 p-4 transition-colors hover:border-primary/40">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h3 className="font-bold">{match.title}</h3>
          <MatchStatusBadge status={match.status} />
        </div>

        <p className="flex flex-wrap items-baseline gap-x-2 text-sm font-medium">
          <span>{match.home_team_name}</span>
          <span className="text-muted-foreground">vs</span>
          <span>{match.away_team_name}</span>
        </p>

        <dl className="flex flex-col gap-1 text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <dt className="sr-only">Fecha</dt>
            <CalendarDays className="size-3.5 shrink-0" aria-hidden="true" />
            <dd>
              {formatMatchDateTime(match.played_at)} ·{' '}
              {formatMatchRelative(match.played_at)}
            </dd>
          </div>
          <div className="flex items-center gap-1.5">
            <dt className="sr-only">Lugar</dt>
            <MapPin className="size-3.5 shrink-0" aria-hidden="true" />
            <dd className="truncate">{match.location}</dd>
          </div>
        </dl>
      </Card>
    </Link>
  )
}

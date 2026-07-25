import { CalendarDays, MapPin } from 'lucide-react'
import { MatchStatusBadge } from '@/components/MatchStatusBadge'
import { VenuePhoto } from '@/components/VenuePhoto'
import { formatMatchDateTime, formatMatchRelative } from '@/lib/formatting'
import type { MatchRow } from '@/types/domain'

/**
 * The head of a match page: the venue photograph on the left and the fixture on
 * the right.
 *
 * On narrow screens the photograph becomes a band across the top, where a
 * side-by-side split would leave neither half enough room.
 */
export function MatchHero({ match }: { match: MatchRow }) {
  return (
    <header className="grid overflow-hidden rounded-xl bg-card text-card-foreground ring-1 ring-foreground/10 sm:grid-cols-[42%_1fr]">
      <VenuePhoto
        location={match.location}
        className="h-32 sm:h-auto sm:min-h-40"
        overlayClassName="bg-gradient-to-b from-transparent to-card sm:bg-gradient-to-r sm:from-transparent sm:via-card/40 sm:to-card"
      />

      <div className="flex flex-col gap-2 p-5">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold">{match.title}</h1>
          <MatchStatusBadge status={match.status} />
        </div>
        <p className="text-lg leading-tight font-bold">
          {match.home_team_name}{' '}
          <span className="font-normal text-muted-foreground">vs</span>{' '}
          {match.away_team_name}
        </p>
        <dl className="mt-auto flex flex-col gap-1 pt-1 text-sm text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <dt className="sr-only">Fecha</dt>
            <CalendarDays className="size-4 shrink-0" aria-hidden="true" />
            <dd>
              {formatMatchDateTime(match.played_at)} ·{' '}
              {formatMatchRelative(match.played_at)}
            </dd>
          </div>
          <div className="flex items-center gap-1.5">
            <dt className="sr-only">Lugar</dt>
            <MapPin className="size-4 shrink-0" aria-hidden="true" />
            <dd>{match.location}</dd>
          </div>
        </dl>
      </div>
    </header>
  )
}

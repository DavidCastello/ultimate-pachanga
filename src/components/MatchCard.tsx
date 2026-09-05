import { Link } from 'react-router'
import { CalendarDays, MapPin } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Card } from '@/components/ui/card'
import { MatchStatusBadge } from '@/components/MatchStatusBadge'
import { VenuePhoto } from '@/components/VenuePhoto'
import {
  formatMatchDateTime,
  formatMatchRelative,
  toInitials,
} from '@/lib/formatting'
import { getAvatarUrl } from '@/lib/supabase'
import type { MatchRow, PlayerCardData } from '@/types/domain'

export function MatchCard({
  match,
  featured = false,
  participants = [],
}: {
  match: MatchRow
  featured?: boolean
  /** The featured fixture can preview the players already called up. */
  participants?: readonly PlayerCardData[]
}) {
  return (
    <Link
      to={`/matches/${match.id}`}
      className="motion-card block rounded-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none"
    >
      <Card className={`fixture-card ${featured ? 'fixture-featured' : ''}`}>
        <VenuePhoto
          match={match}
          className="motion-card-photo"
          overlayClassName={
            featured
              ? 'bg-gradient-to-b from-transparent via-card/25 to-card lg:bg-gradient-to-r'
              : undefined
          }
        />

        <div className="fixture-content">
          <div className="flex items-start justify-between gap-2">
            <h3
              className={
                featured
                  ? 'technical text-xs font-semibold text-primary uppercase'
                  : 'technical text-[0.625rem] font-semibold text-muted-foreground uppercase'
              }
            >
              {match.title}
            </h3>
            <MatchStatusBadge status={match.status} />
          </div>

          <p className="fixture-teams motion-card-title">
            <span className="truncate" title={match.home_team_name}>
              {match.home_team_name}
            </span>
            <span className="truncate" title={match.away_team_name}>
              <span className="font-normal text-muted-foreground">vs </span>
              {match.away_team_name}
            </span>
          </p>

          {featured && participants.length > 0 ? (
            <div
              className="fixture-squad border-t border-primary/20 pt-2"
              role="group"
              aria-label={`Convocados: ${participants.map((player) => player.displayName).join(', ')}`}
            >
              <div className="flex items-center gap-2 overflow-hidden">
                {participants.slice(0, 6).map((player) => {
                  const avatarUrl = getAvatarUrl(player.avatarPath)

                  return (
                    <Avatar
                      key={player.id}
                      title={player.displayName}
                      className="size-6 shrink-0 rounded-sm border border-primary/40"
                    >
                      {avatarUrl ? (
                        <AvatarImage src={avatarUrl} alt="" />
                      ) : null}
                      <AvatarFallback className="bg-primary/15 font-heading text-sm text-primary">
                        {toInitials(
                          player.firstName,
                          player.lastName,
                          player.displayName,
                        )}
                      </AvatarFallback>
                    </Avatar>
                  )
                })}
                {participants.length > 6 ? (
                  <span className="numeric flex size-6 shrink-0 items-center justify-center border border-primary/45 text-xs text-primary">
                    +{participants.length - 6}
                  </span>
                ) : null}
              </div>
            </div>
          ) : null}

          <dl className="fixture-meta">
            <div className="flex items-center gap-1.5">
              <dt className="sr-only">Fecha</dt>
              <CalendarDays
                className={
                  featured
                    ? 'size-5 shrink-0 text-primary'
                    : 'size-3.5 shrink-0'
                }
                aria-hidden="true"
              />
              <dd className="truncate">
                {formatMatchDateTime(match.played_at)} ·{' '}
                {formatMatchRelative(match.played_at)}
              </dd>
            </div>
            <div className="flex items-center gap-1.5">
              <dt className="sr-only">Lugar</dt>
              <MapPin
                className={
                  featured
                    ? 'size-5 shrink-0 text-primary'
                    : 'size-3.5 shrink-0'
                }
                aria-hidden="true"
              />
              <dd className="truncate">{match.location}</dd>
            </div>
          </dl>
        </div>
      </Card>
    </Link>
  )
}

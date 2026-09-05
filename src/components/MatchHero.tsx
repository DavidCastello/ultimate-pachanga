import { CalendarDays, MapPin, Maximize2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogClose,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { MatchStatusBadge } from '@/components/MatchStatusBadge'
import { VenuePhoto } from '@/components/VenuePhoto'
import { formatMatchDateTime, formatMatchRelative } from '@/lib/formatting'
import { getMatchPhotoUrl } from '@/lib/supabase'
import { getVenueImage } from '@/lib/venues'
import type { MatchRow } from '@/types/domain'

function getHeroImageUrl(match: MatchRow): string {
  const matchPhotoUrl = getMatchPhotoUrl(match.photo_path)

  return matchPhotoUrl
    ? `${matchPhotoUrl}?v=${Date.parse(match.updated_at)}`
    : getVenueImage(match.location)
}

/** The head of a match page: its artwork, fixture and all essential context. */
export function MatchHero({ match }: { match: MatchRow }) {
  const imageUrl = getHeroImageUrl(match)
  const imageLabel = match.photo_path
    ? `Imagen de ${match.title}`
    : `Imagen del recinto ${match.location}`

  return (
    <header className="match-hero motion-enter">
      <div className="match-hero-art">
        <VenuePhoto
          match={match}
          className="absolute inset-0"
          overlayClassName="bg-gradient-to-b from-transparent via-card/20 to-card sm:bg-gradient-to-r sm:from-transparent sm:via-card/35 sm:to-card"
        />
      </div>

      <div className="match-hero-body">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="technical min-w-0 text-xs font-semibold text-primary uppercase">
            {match.title}
          </p>
          <div className="flex shrink-0 items-center gap-2">
            <MatchStatusBadge status={match.status} />
            <Dialog>
              <DialogTrigger asChild>
                <Button
                  variant="secondary"
                  aria-label="Ver imagen en grande"
                  className="border border-primary/45 bg-black/70 px-3 text-foreground backdrop-blur hover:bg-primary hover:text-primary-foreground"
                >
                  <Maximize2 className="size-4" aria-hidden="true" />
                  <span className="hidden sm:inline">Ver imagen</span>
                </Button>
              </DialogTrigger>
              <DialogContent
                showCloseButton={false}
                className="liquid-viewer inset-0 top-0 left-0 h-svh w-screen max-w-none translate-x-0 translate-y-0 place-items-center overflow-hidden rounded-none border-0 p-4 ring-0 sm:max-w-none"
              >
                <DialogHeader className="sr-only">
                  <DialogTitle>{imageLabel}</DialogTitle>
                  <DialogDescription>
                    Imagen asociada a la jornada.
                  </DialogDescription>
                </DialogHeader>
                <DialogClose asChild>
                  <Button
                    variant="secondary"
                    size="icon"
                    className="absolute top-4 right-4 z-10 border border-white/20 bg-black/65 text-white backdrop-blur-xl hover:border-primary hover:bg-primary hover:text-black"
                    aria-label="Cerrar imagen"
                  >
                    <X className="size-5" aria-hidden="true" />
                  </Button>
                </DialogClose>
                <img
                  src={imageUrl}
                  alt={imageLabel}
                  className="block h-auto max-h-[calc(100svh-2rem)] w-auto max-w-[calc(100vw-2rem)] object-contain"
                />
              </DialogContent>
            </Dialog>
          </div>
        </div>
        <h1 className="flex min-w-0 flex-col font-heading text-4xl leading-[0.88] font-bold uppercase sm:text-5xl">
          <span className="break-words">{match.home_team_name}</span>
          <span className="text-muted-foreground">vs</span>
          <span className="break-words">{match.away_team_name}</span>
        </h1>
        <dl className="mt-auto flex flex-col gap-2 border-t border-primary/20 pt-5 text-base text-muted-foreground">
          <div className="flex items-center gap-2">
            <dt className="sr-only">Fecha</dt>
            <CalendarDays
              className="size-5 shrink-0 text-primary"
              aria-hidden="true"
            />
            <dd>
              {formatMatchDateTime(match.played_at)} ·{' '}
              {formatMatchRelative(match.played_at)}
            </dd>
          </div>
          <div className="flex items-center gap-2">
            <dt className="sr-only">Lugar</dt>
            <MapPin
              className="size-5 shrink-0 text-primary"
              aria-hidden="true"
            />
            <dd>{match.location}</dd>
          </div>
        </dl>
      </div>
    </header>
  )
}

import { cn } from '@/lib/utils'
import { getMatchPhotoUrl } from '@/lib/supabase'
import { getVenueImage } from '@/lib/venues'
import type { MatchRow } from '@/types/domain'

/**
 * The venue photograph that backs a match, veiled by a gradient that fades it
 * into the card so the text beside it stays readable without a scrim of its
 * own.
 *
 * A match given its own photograph shows it; the rest fall back to the picture
 * bundled for their location, so a fixture created without uploading anything
 * still looks like somewhere.
 *
 * The photograph is decorative: the venue is always written out next to it.
 */

/** Fades to the right, for a photograph sitting to the left of the text. */
const HORIZONTAL_FADE = 'bg-gradient-to-r from-transparent via-card/45 to-card'

interface VenuePhotoProps {
  match: MatchRow
  className?: string
  /** Replaces the fade, for photographs the text does not sit beside. */
  overlayClassName?: string
}

/**
 * Replacing a photograph reuses its path, so the URL alone would keep serving
 * the old image from cache — for an hour, to whoever just corrected it. The
 * match's own timestamp moves on every edit and settles the question.
 */
function toPhotoUrl(match: MatchRow): string | null {
  const url = getMatchPhotoUrl(match.photo_path)

  return url && `${url}?v=${Date.parse(match.updated_at)}`
}

export function VenuePhoto({
  match,
  className,
  overlayClassName,
}: VenuePhotoProps) {
  return (
    <div className={cn('relative overflow-hidden bg-pitch', className)}>
      <img
        src={toPhotoUrl(match) ?? getVenueImage(match.location)}
        alt=""
        // Absolute rather than sized: the photograph fills whatever box the
        // parent grid gives it, which is the height of the text beside it.
        className="absolute inset-0 size-full object-cover object-[30%_60%]"
        draggable={false}
      />
      <div
        className={cn('absolute inset-0', overlayClassName ?? HORIZONTAL_FADE)}
      />
    </div>
  )
}

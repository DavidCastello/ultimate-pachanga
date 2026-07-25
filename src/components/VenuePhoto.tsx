import { cn } from '@/lib/utils'
import { getVenueImage } from '@/lib/venues'

/**
 * The venue photograph that backs a match, veiled by a gradient that fades it
 * into the card so the text beside it stays readable without a scrim of its
 * own.
 *
 * The photograph is decorative: the venue is always written out next to it.
 */

/** Fades to the right, for a photograph sitting to the left of the text. */
const HORIZONTAL_FADE = 'bg-gradient-to-r from-transparent via-card/45 to-card'

interface VenuePhotoProps {
  location: string
  className?: string
  /** Replaces the fade, for photographs the text does not sit beside. */
  overlayClassName?: string
}

export function VenuePhoto({
  location,
  className,
  overlayClassName,
}: VenuePhotoProps) {
  return (
    <div className={cn('relative overflow-hidden bg-pitch', className)}>
      <img
        src={getVenueImage(location)}
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

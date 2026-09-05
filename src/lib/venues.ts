/**
 * Photographs of the places the league plays at.
 *
 * A match stores its venue as free text, so the picture is resolved by matching
 * that text rather than by an identifier we do not have. Every match is played
 * at UIB today, which is why an unrecognised location still gets that
 * photograph: a card with no pitch behind it looks broken, not neutral. Adding
 * a venue means dropping its image in `public/venues` and listing it here.
 */

interface VenuePhotograph {
  readonly keywords: readonly string[]
  readonly image: string
}

const UIB_IMAGE = `${import.meta.env.BASE_URL}venues/uib.webp`

const VENUES: readonly VenuePhotograph[] = [
  { keywords: ['uib', 'universitat'], image: UIB_IMAGE },
]

const FALLBACK_IMAGE = UIB_IMAGE

function toComparable(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
}

export function getVenueImage(location: string): string {
  const comparable = toComparable(location)
  const venue = VENUES.find((candidate) =>
    candidate.keywords.some((keyword) => comparable.includes(keyword)),
  )

  return venue?.image ?? FALLBACK_IMAGE
}

import { format, formatDistanceToNowStrict, isPast } from 'date-fns'
import { es } from 'date-fns/locale'

/**
 * Display helpers. The league is Spanish, so dates and names are formatted for
 * a Spanish reader; market values stay in pounds because that is what the
 * database stores (`market_constant_gbp`).
 */

const MILLION = 1_000_000
const THOUSAND = 1_000

// narrowSymbol, because es-ES renders GBP as the literal text "GBP" by
// default, which would disagree with the abbreviated "£8,25 M" form below.
const GBP_EXACT = new Intl.NumberFormat('es-ES', {
  style: 'currency',
  currency: 'GBP',
  currencyDisplay: 'narrowSymbol',
  maximumFractionDigits: 0,
})

/**
 * Abbreviates a market value for card and table use: £8,25 M, £750 K, £0.
 *
 * Values are compared at a glance down a column, so an abbreviated form beats
 * eleven digits of precision. Use `formatMarketValueExact` where the precise
 * figure matters.
 */
export function formatMarketValue(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—'

  const absolute = Math.abs(value)

  if (absolute >= MILLION) {
    const millions = value / MILLION
    // 8.25 reads better as "8,25 M" than "8 M"; 40 as "40 M" than "40,00 M".
    const decimals = absolute >= 10 * MILLION ? 0 : 2
    return `£${millions.toLocaleString('es-ES', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    })} M`
  }

  if (absolute >= THOUSAND) {
    return `£${Math.round(value / THOUSAND).toLocaleString('es-ES')} K`
  }

  return GBP_EXACT.format(value)
}

export function formatMarketValueExact(
  value: number | null | undefined,
): string {
  if (value === null || value === undefined) return '—'
  return GBP_EXACT.format(value)
}

/** A score, or an em dash when the player has never been scored. */
export function formatScore(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—'
  return value.toLocaleString('es-ES', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 2,
  })
}

/**
 * A victory total.
 *
 * Draws are half wins, so the total is often fractional — but "3" reads better
 * than "3,0", and only the halves need the decimal.
 */
export function formatVictories(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—'
  return value.toLocaleString('es-ES', { maximumFractionDigits: 1 })
}

/**
 * Victory points as a share of matches played.
 *
 * Two wins and two draws in six games is 50 %. A rate says more than a total
 * once players have turned out a different number of times — but only in
 * company: 100 % off one match is not the same achievement as 80 % off ten, so
 * every caller shows the match count beside it.
 */
export function formatWinRate(
  victories: number,
  matchesPlayed: number,
): string {
  if (matchesPlayed <= 0) return '—'

  return (victories / matchesPlayed).toLocaleString('es-ES', {
    style: 'percent',
    maximumFractionDigits: 0,
  })
}

/** Signed attribute points, so a penalty reads as "−2" rather than "-2". */
export function formatAttributePoints(points: number): string {
  if (points > 0) return `+${points}`
  if (points < 0) return `−${Math.abs(points)}`
  return '0'
}

export function formatMatchDate(isoDate: string): string {
  return format(new Date(isoDate), "d 'de' MMMM 'de' yyyy", { locale: es })
}

export function formatMatchDateTime(isoDate: string): string {
  return format(new Date(isoDate), 'd MMM yyyy, HH:mm', { locale: es })
}

/** "hace 3 días" / "en 5 días", for fixture lists and dashboards. */
export function formatMatchRelative(isoDate: string): string {
  const date = new Date(isoDate)
  const distance = formatDistanceToNowStrict(date, { locale: es })
  return isPast(date) ? `hace ${distance}` : `en ${distance}`
}

/**
 * Up to two initials, used when a player has no photograph.
 *
 * Falls back through nickname and name so a card is never blank.
 */
export function toInitials(
  firstName: string | null | undefined,
  lastName: string | null | undefined,
  fallback?: string | null,
): string {
  const initials = [firstName, lastName]
    .map((part) => part?.trim()?.[0])
    .filter((initial): initial is string => Boolean(initial))
    .join('')

  if (initials) return initials.toUpperCase()

  const fallbackInitial = fallback?.trim()?.[0]
  return fallbackInitial ? fallbackInitial.toUpperCase() : '?'
}

/** The name on the registration form, as opposed to the alias on the card. */
export function formatFullName(
  firstName: string | null | undefined,
  lastName: string | null | undefined,
): string {
  return [firstName?.trim(), lastName?.trim()].filter(Boolean).join(' ')
}

const POSITION_LABELS: Record<string, string> = {
  GK: 'Portero',
  CB: 'Central',
  LB: 'Lateral izquierdo',
  RB: 'Lateral derecho',
  CDM: 'Mediocentro defensivo',
  CM: 'Mediocentro',
  CAM: 'Mediapunta',
  LW: 'Extremo izquierdo',
  RW: 'Extremo derecho',
  ST: 'Delantero',
  UT: 'Polivalente',
}

/** The Spanish name of a position; the code itself if it is unrecognised. */
export function formatPosition(position: string | null | undefined): string {
  if (!position) return '—'
  return POSITION_LABELS[position] ?? position
}

const MATCH_STATUS_LABELS: Record<string, string> = {
  draft: 'Borrador',
  scheduled: 'Programado',
  played: 'Jugado',
  scored: 'Puntuado',
  cancelled: 'Cancelado',
}

export function formatMatchStatus(status: string | null | undefined): string {
  if (!status) return '—'
  return MATCH_STATUS_LABELS[status] ?? status
}

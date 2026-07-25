import { Link } from 'react-router'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { MarketValue } from '@/components/MarketValue'
import { MetricBadge } from '@/components/MetricBadge'
import { cn } from '@/lib/utils'
import { getAvatarUrl } from '@/lib/supabase'
import { formatPosition, toInitials } from '@/lib/formatting'
import { toCardTier, type CardTier } from '@/lib/scoring'
import type { LeagueMetricRow, PlayerCardData } from '@/types/domain'

/**
 * The player card, in two sizes.
 *
 * `full` is the grid and detail card; `compact` is the one that stands on the
 * pitch. They deliberately share one visual language — same tier face, same
 * edge, same rating-over-position block beside the photograph — so that the
 * pitch reads as the same game as the squad list. Compact simply drops the
 * metric row and the footer, which are illegible at seven-to-a-pitch.
 *
 * An original design in the spirit of football card games: no third-party
 * templates, crests or trademarks.
 */

/**
 * Card faces are opaque, never tinted alpha over whatever is behind.
 *
 * The compact card sits on a photograph of a floodlit pitch; letting that show
 * through turned the rating into noise.
 */
const TIER_FACES: Record<CardTier, string> = {
  gold: 'from-tier-gold-face to-tier-gold-face-deep',
  silver: 'from-tier-silver-face to-tier-silver-face-deep',
  bronze: 'from-tier-bronze-face to-tier-bronze-face-deep',
}

/** The bright metal edge that gives the card its contour. */
const TIER_EDGES: Record<CardTier, string> = {
  gold: 'border-tier-gold/70',
  silver: 'border-tier-silver/70',
  bronze: 'border-tier-bronze/70',
}

const TIER_ACCENTS: Record<CardTier, string> = {
  gold: 'text-tier-gold',
  silver: 'text-tier-silver',
  bronze: 'text-tier-bronze',
}

/** Hairlines separating the card's bands, in the tier's own metal. */
const TIER_RULES: Record<CardTier, string> = {
  gold: 'border-tier-gold/25',
  silver: 'border-tier-silver/25',
  bronze: 'border-tier-bronze/25',
}

/**
 * The contour: a bright inner hairline over a dark outer ring.
 *
 * Two edges rather than one thick border, which is what separates a card from
 * both a pale grid background and a dark pitch without needing a different
 * treatment for each.
 */
const CARD_EDGE =
  'border bg-gradient-to-b shadow-[inset_0_1px_0_oklch(1_0_0/0.22),inset_0_-1px_0_oklch(0_0_0/0.25),0_2px_10px_oklch(0_0_0/0.45)]'

/** Short labels: a card has no room for "Mediocentro defensivo". */
function toShortMetricLabel(metric: LeagueMetricRow): string {
  return metric.label.slice(0, 3)
}

interface PlayerCardProps {
  player: PlayerCardData
  metrics: readonly LeagueMetricRow[]
  /** Renders the whole card as a link to the player's detail page. */
  linkTo?: string
  /** The smaller card used on the pitch. */
  compact?: boolean
  className?: string
}

export function PlayerCard({
  player,
  metrics,
  linkTo,
  compact,
  className,
}: PlayerCardProps) {
  const tier = toCardTier(player.cardRating)
  const avatarUrl = getAvatarUrl(player.avatarPath)

  const initials = toInitials(
    player.firstName,
    player.lastName,
    player.displayName,
  )

  const card = (
    <article
      data-testid="player-card"
      data-tier={tier}
      data-compact={compact ? 'true' : undefined}
      className={cn(
        'relative flex flex-col overflow-hidden',
        CARD_EDGE,
        TIER_FACES[tier],
        TIER_EDGES[tier],
        // Portrait, like a printed card. The pitch card is sized by its slot,
        // so it needs the ratio declared; the grid card gets its height from
        // the metric and value bands below.
        compact ? 'aspect-[4/5] rounded-lg' : 'rounded-xl',
        !compact &&
          'transition-transform duration-200 motion-safe:hover:-translate-y-1',
        !player.isActive && 'opacity-60 saturate-50',
        className,
      )}
    >
      {/* Rating and position ride in the corner rather than taking a column of
          their own, which leaves the photograph the whole width. */}
      <div
        className={cn(
          'absolute z-10 flex flex-col items-center leading-none',
          compact ? 'top-1 left-1.5' : 'top-2.5 left-3',
        )}
      >
        <span
          className={cn(
            'numeric font-black',
            compact ? 'text-sm' : 'text-2xl',
            TIER_ACCENTS[tier],
          )}
        >
          {player.cardRating}
        </span>
        <span
          className={cn(
            'font-bold tracking-wider opacity-80',
            compact ? 'text-[0.5rem]' : 'text-[0.625rem]',
          )}
        >
          {player.preferredPosition}
        </span>
      </div>

      {/* The photograph, given as much room as the card can spare. Initials
          stand in until real faces are uploaded. */}
      <div
        className={cn(
          'flex flex-1 items-center justify-center',
          compact ? 'px-1 pt-1' : 'px-3 pt-3 pb-1',
        )}
      >
        <Avatar
          className={cn(
            'aspect-square h-auto border border-black/25',
            compact ? 'w-[62%]' : 'w-[64%] border-2',
          )}
        >
          {avatarUrl ? (
            <AvatarImage
              src={avatarUrl}
              alt=""
              className="object-cover"
              loading="lazy"
            />
          ) : null}
          <AvatarFallback
            className={cn(
              'bg-black/25 font-bold',
              compact ? 'text-xs' : 'text-2xl',
            )}
          >
            {initials}
          </AvatarFallback>
        </Avatar>
      </div>

      {/* The name band, ruled off the way a card prints it. */}
      <div
        className={cn(
          'border-t text-center',
          TIER_RULES[tier],
          compact ? 'px-1 py-0.5' : 'px-3 py-1.5',
        )}
      >
        <h3
          className={cn(
            'truncate font-bold',
            compact ? 'text-[0.625rem] leading-tight' : 'text-sm',
          )}
          title={player.displayName}
        >
          {player.displayName}
        </h3>
        {!compact ? (
          <p className="truncate text-[0.6875rem] opacity-70">
            {formatPosition(player.preferredPosition)}
          </p>
        ) : null}
      </div>

      {!compact ? (
        <>
          <div
            className={cn(
              'grid grid-cols-4 gap-1 border-t px-2 py-2',
              TIER_RULES[tier],
            )}
          >
            {metrics.map((metric) => (
              <MetricBadge
                key={metric.code}
                label={toShortMetricLabel(metric)}
                value={player.metricCardStats[metric.code] ?? null}
              />
            ))}
          </div>

          <div
            className={cn(
              'flex items-center justify-between border-t px-3 py-2 text-[0.6875rem]',
              TIER_RULES[tier],
            )}
          >
            <MarketValue value={player.marketValueGbp} className="text-xs" />
            <span className="numeric opacity-70">
              {player.matchesPlayed}{' '}
              {player.matchesPlayed === 1 ? 'partido' : 'partidos'}
            </span>
          </div>
        </>
      ) : null}

      {!player.isActive && !compact ? (
        <span className="absolute top-2 right-2 rounded bg-black/40 px-1.5 py-0.5 text-[0.625rem] font-semibold uppercase">
          Inactivo
        </span>
      ) : null}
    </article>
  )

  if (!linkTo) return card

  return (
    <Link
      to={linkTo}
      className="rounded-xl focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none"
      aria-label={`Ver ficha de ${player.displayName}`}
    >
      {card}
    </Link>
  )
}

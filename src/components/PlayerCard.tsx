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
 * Tier styling.
 *
 * An original design in the spirit of football card games — no third-party
 * templates, crests or trademarks. Gradients are built from the tier tokens in
 * index.css so light and dark both work.
 */
const TIER_STYLES: Record<CardTier, string> = {
  gold: 'from-tier-gold/25 via-tier-gold/10 to-tier-gold-dim/20 border-tier-gold/45',
  silver:
    'from-tier-silver/25 via-tier-silver/10 to-tier-silver-dim/20 border-tier-silver/45',
  bronze:
    'from-tier-bronze/25 via-tier-bronze/10 to-tier-bronze-dim/20 border-tier-bronze/45',
}

const TIER_ACCENTS: Record<CardTier, string> = {
  gold: 'text-tier-gold',
  silver: 'text-tier-silver',
  bronze: 'text-tier-bronze',
}

/** Short labels: a card has no room for "Mediocentro defensivo". */
function toShortMetricLabel(metric: LeagueMetricRow): string {
  return metric.label.slice(0, 3)
}

interface PlayerCardProps {
  player: PlayerCardData
  metrics: readonly LeagueMetricRow[]
  /** Renders the whole card as a link to the player's detail page. */
  linkTo?: string
  /**
   * Compact form for the pitch view, where seven cards share one pitch. Keeps
   * the rating, tier and face — what identifies a player at a glance — and drops
   * the metric grid and footer, which are unreadable at that size anyway.
   */
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

  const card = compact ? (
    <article
      data-testid="player-card"
      data-tier={tier}
      data-compact="true"
      className={cn(
        'relative flex w-full flex-col items-center gap-0.5 overflow-hidden rounded-lg border bg-card/90 bg-gradient-to-br px-1 pt-1 pb-1.5 text-center shadow-lg backdrop-blur-sm',
        TIER_STYLES[tier],
        !player.isActive && 'opacity-60 saturate-50',
        className,
      )}
    >
      <Avatar className="size-9 border border-background/50">
        {avatarUrl ? (
          <AvatarImage
            src={avatarUrl}
            alt=""
            className="object-cover"
            loading="lazy"
          />
        ) : null}
        <AvatarFallback className="bg-background/70 text-[0.625rem] font-bold">
          {toInitials(player.firstName, player.lastName, player.displayName)}
        </AvatarFallback>
      </Avatar>

      <span
        className={cn(
          'numeric text-sm leading-none font-black',
          TIER_ACCENTS[tier],
        )}
      >
        {player.cardRating}
      </span>

      <span
        className="w-full truncate text-[0.6875rem] leading-tight font-semibold"
        title={player.displayName}
      >
        {player.displayName}
      </span>

      <span className="text-[0.5625rem] leading-none font-bold tracking-wider text-muted-foreground">
        {player.preferredPosition}
      </span>
    </article>
  ) : (
    <article
      data-testid="player-card"
      data-tier={tier}
      className={cn(
        'group relative flex flex-col overflow-hidden rounded-xl border bg-card bg-gradient-to-br',
        'transition-transform duration-200 motion-safe:hover:-translate-y-1',
        TIER_STYLES[tier],
        !player.isActive && 'opacity-60 saturate-50',
        className,
      )}
    >
      <div className="flex items-start gap-3 p-4 pb-2">
        {/* Rating and position, the way cards stack them at top left. */}
        <div className="flex shrink-0 flex-col items-center leading-none">
          <span
            className={cn('numeric text-4xl font-black', TIER_ACCENTS[tier])}
          >
            {player.cardRating}
          </span>
          <span className="mt-1 text-xs font-bold tracking-widest text-muted-foreground">
            {player.preferredPosition}
          </span>
        </div>

        <Avatar className="size-16 shrink-0 border-2 border-background/50">
          {avatarUrl ? (
            <AvatarImage
              src={avatarUrl}
              alt=""
              className="object-cover"
              loading="lazy"
            />
          ) : null}
          <AvatarFallback className="bg-background/60 text-lg font-bold">
            {toInitials(player.firstName, player.lastName, player.displayName)}
          </AvatarFallback>
        </Avatar>
      </div>

      <div className="px-4">
        <h3 className="truncate text-base font-bold" title={player.displayName}>
          {player.displayName}
        </h3>
        <p className="truncate text-xs text-muted-foreground">
          {formatPosition(player.preferredPosition)}
        </p>
      </div>

      <div className="mt-3 grid grid-cols-4 gap-1 border-t border-border/40 px-2 py-3">
        {metrics.map((metric) => (
          <MetricBadge
            key={metric.code}
            label={toShortMetricLabel(metric)}
            value={player.metricCardStats[metric.code] ?? null}
          />
        ))}
      </div>

      <div className="flex items-center justify-between border-t border-border/40 px-4 py-2.5 text-xs">
        <MarketValue value={player.marketValueGbp} className="text-sm" />
        <span className="numeric text-muted-foreground">
          {player.matchesPlayed}{' '}
          {player.matchesPlayed === 1 ? 'partido' : 'partidos'}
        </span>
      </div>

      {!player.isActive ? (
        <span className="absolute top-2 right-2 rounded bg-muted px-1.5 py-0.5 text-[0.625rem] font-semibold text-muted-foreground uppercase">
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

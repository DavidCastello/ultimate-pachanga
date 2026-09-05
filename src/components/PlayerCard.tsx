import { Link } from 'react-router'
import { ArrowDown, ArrowUp, Flame, Snowflake } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { MarketValue } from '@/components/MarketValue'
import { MetricBadge } from '@/components/MetricBadge'
import { cn } from '@/lib/utils'
import { getAvatarUrl } from '@/lib/supabase'
import { formatFullName, toInitials } from '@/lib/formatting'
import { toCardTier, type CardTier } from '@/lib/scoring'
import type {
  LeagueMetricRow,
  PlayerCardData,
  PlayerFormState,
} from '@/types/domain'

/**
 * The player card, in two sizes.
 *
 * `full` is the grid and detail card; `compact` is the one that stands on the
 * pitch. They deliberately share one visual language — same tier face, same
 * edge, same alias over full name — so that the pitch reads as the same game as
 * the squad list. Compact drops the metric row and the footer, which are
 * illegible at seven-to-a-pitch, and moves the position beside the rating so
 * that nothing overlaps the photograph.
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
  'border bg-gradient-to-b shadow-[inset_0_1px_0_oklch(1_0_0/0.22),inset_0_-1px_0_oklch(0_0_0/0.25),0_10px_24px_oklch(0_0_0/0.4)]'

/** Short labels: a card has no room for "Mediocentro defensivo". */
function toShortMetricLabel(metric: LeagueMetricRow): string {
  return metric.label.slice(0, 3)
}

/**
 * Compact type and the face are a share of the card's own width (`cqi`), not a
 * fixed size.
 *
 * A pitch card is a percentage of the pitch, so on a phone it is barely wider
 * than the rating used to be tall — which is how the corner block ended up on
 * top of the photograph. Sizing everything from the card instead means the whole
 * face shrinks together. The clamps keep it legible at 320px and stop the same
 * card from turning into a poster on the roomier bench grid.
 */
const COMPACT_SIZES = {
  rating: 'text-[clamp(0.6875rem,22cqi,1.125rem)]',
  position: 'text-[clamp(0.5rem,12cqi,0.625rem)]',
  form: 'size-[clamp(0.5rem,10cqi,0.75rem)]',
  confidence: 'size-[clamp(0.5625rem,11cqi,0.8125rem)]',
  alias: 'text-[clamp(0.625rem,14cqi,0.8125rem)]',
  fullName: 'text-[clamp(0.5625rem,11cqi,0.6875rem)]',
  initials: 'text-[clamp(0.625rem,18cqi,1.125rem)]',
} as const

interface PlayerCardProps {
  player: PlayerCardData
  metrics: readonly LeagueMetricRow[]
  /** Renders the whole card as a link to the player's detail page. */
  linkTo?: string
  /** The smaller card used on the pitch. */
  compact?: boolean
  /** Enlarges the full-card composition for a profile or player detail view. */
  showcase?: boolean
  className?: string
}

export function PlayerCard({
  player,
  metrics,
  linkTo,
  compact,
  showcase = false,
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
      data-showcase={showcase ? 'true' : undefined}
      className={cn(
        'relative flex h-full flex-col overflow-hidden',
        CARD_EDGE,
        TIER_FACES[tier],
        TIER_EDGES[tier],
        "before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-[62%] before:bg-[radial-gradient(circle_at_50%_22%,rgb(234_175_53/0.24),transparent_64%)] before:content-['']",
        // Portrait, like a printed card. The pitch card is sized by its slot,
        // so it needs the ratio declared and becomes the query container its
        // own type is measured against; the grid card gets its height from the
        // metric and value bands below.
        compact
          ? '@container aspect-[4/5] rounded-sm'
          : 'player-sticker rounded-sm',
        !compact && 'motion-card transition-all duration-200',
        !player.isActive && 'opacity-60 saturate-50',
        className,
      )}
    >
      {compact ? (
        <CompactFace
          player={player}
          tier={tier}
          avatarUrl={avatarUrl}
          initials={initials}
        />
      ) : (
        <FullFace
          player={player}
          metrics={metrics}
          tier={tier}
          avatarUrl={avatarUrl}
          initials={initials}
          showcase={showcase}
        />
      )}
    </article>
  )

  if (!linkTo) return card

  return (
    <Link
      to={linkTo}
      className="block h-full rounded-xl focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none"
      aria-label={`Ver ficha de ${player.displayName}`}
    >
      {card}
    </Link>
  )
}

interface FaceProps {
  player: PlayerCardData
  tier: CardTier
  avatarUrl: string | null
  initials: string
}

/**
 * The pitch card: four pieces of type and a face, nothing overlapping.
 *
 * The rating and position stack on the left, while confidence and form stack on
 * the right so match cards keep their status signals in one corner.
 */
function CompactFace({ player, tier, avatarUrl, initials }: FaceProps) {
  const fullName = formatFullName(player.firstName, player.lastName)

  return (
    <>
      <div className="absolute inset-0 overflow-hidden bg-black/35">
        {avatarUrl ? (
          <img
            src={avatarUrl}
            alt=""
            className="size-full object-cover object-top saturate-[0.92]"
            loading="lazy"
          />
        ) : (
          <div
            className={cn(
              'flex size-full items-center justify-center bg-[radial-gradient(circle_at_50%_35%,rgb(234_175_53/0.18),transparent_62%)] font-heading font-bold text-white/75',
              COMPACT_SIZES.initials,
            )}
          >
            {initials}
          </div>
        )}
        <div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgb(0_0_0/0.18)_0%,transparent_35%,rgb(0_0_0/0.2)_52%,rgb(0_0_0/0.96)_100%)]" />
      </div>

      <ConfidenceDonut
        value={player.confidencePct}
        className={cn(
          'absolute top-[4cqi] right-[5cqi] z-10 shadow-[0_0_12px_rgb(234_175_53/0.4)]',
          COMPACT_SIZES.confidence,
        )}
      />
      <FormStateIcon
        state={player.formState}
        className={cn(
          'absolute top-[17cqi] right-[5cqi] z-10',
          COMPACT_SIZES.form,
        )}
      />

      <div className="absolute top-[4cqi] left-[5cqi] z-10 flex flex-col items-start gap-[1cqi] leading-none drop-shadow-[0_2px_4px_rgb(0_0_0/0.9)]">
        <span
          className={cn(
            'numeric font-black',
            COMPACT_SIZES.rating,
            TIER_ACCENTS[tier],
          )}
        >
          {player.cardRating}
        </span>
        <span
          className={cn(
            'font-bold tracking-wide opacity-80',
            COMPACT_SIZES.position,
          )}
        >
          {player.preferredPosition}
        </span>
      </div>

      <div
        className={cn(
          'absolute inset-x-0 bottom-0 z-10 border-t px-[5cqi] py-[4cqi] text-center leading-tight backdrop-blur-[1px]',
          TIER_RULES[tier],
        )}
      >
        <h3
          className={cn('truncate font-bold', COMPACT_SIZES.alias)}
          title={player.displayName}
        >
          {player.displayName}
        </h3>
        {/* Only when the alias is not already the name, which is the case for
            every player who never chose one. */}
        {fullName && fullName !== player.displayName ? (
          <p
            className={cn('truncate opacity-70', COMPACT_SIZES.fullName)}
            title={fullName}
          >
            {fullName}
          </p>
        ) : null}
      </div>
    </>
  )
}

interface FullFaceProps extends FaceProps {
  metrics: readonly LeagueMetricRow[]
  showcase: boolean
}

/** The squad and detail card: the compact face plus the stats it has room for. */
function FullFace({
  player,
  metrics,
  tier,
  avatarUrl,
  initials,
  showcase,
}: FullFaceProps) {
  const fullName = formatFullName(player.firstName, player.lastName)

  return (
    <>
      {/* Rating and position ride in the corner rather than taking a column of
          their own, which leaves the photograph the whole width. */}
      <div className="sticker-rating absolute top-2.5 left-3 z-10 flex flex-col items-center leading-none">
        <span
          className={cn(
            'numeric font-black',
            showcase ? 'text-4xl' : 'text-2xl',
            TIER_ACCENTS[tier],
          )}
        >
          {player.cardRating}
        </span>
        <span className="text-[0.625rem] font-bold tracking-wider opacity-80">
          {player.preferredPosition}
        </span>
      </div>

      <div className="absolute top-2.5 right-2.5 z-10 flex flex-col items-center gap-1">
        <ConfidenceDonut value={player.confidencePct} className="size-5" />
        <FormStateIcon state={player.formState} className="size-4" />
      </div>

      <div className="sticker-portrait relative z-1 flex items-center justify-center">
        <PlayerPhoto
          avatarUrl={avatarUrl}
          initials={initials}
          className={cn('sticker-photo h-auto w-full rounded-none border-0')}
          fallbackClassName={showcase ? 'text-4xl' : 'text-2xl'}
        />
      </div>

      {/* The name band, ruled off the way a card prints it. */}
      <div
        className={cn(
          'sticker-name flex min-h-10 flex-col justify-center border-t px-2 py-1 text-left',
          TIER_RULES[tier],
        )}
      >
        <h3
          className={cn('truncate font-bold', showcase ? 'text-xl' : 'text-sm')}
          title={player.displayName}
        >
          {player.displayName}
        </h3>
        {fullName && fullName !== player.displayName ? (
          <p
            className={cn(
              'truncate opacity-70',
              showcase ? 'text-sm' : 'text-[0.6875rem]',
            )}
            title={fullName}
          >
            {fullName}
          </p>
        ) : null}
      </div>

      <div
        className={cn(
          'sticker-metrics grid grid-cols-4 gap-1 border-t px-2 py-1.5',
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
          'sticker-footer flex flex-wrap items-center justify-between gap-1 border-t px-2 py-1.5 text-[0.6875rem]',
          TIER_RULES[tier],
        )}
      >
        <MarketValue value={player.marketValueGbp} className="text-xs" />
        <span className="numeric opacity-70">
          {player.matchesPlayed}{' '}
          {player.matchesPlayed === 1 ? 'partido' : 'partidos'}
        </span>
      </div>

      {!player.isActive ? (
        <span className="absolute top-2 right-2 rounded bg-black/40 px-1.5 py-0.5 text-[0.625rem] font-semibold uppercase">
          Inactivo
        </span>
      ) : null}
    </>
  )
}

function ConfidenceDonut({
  value,
  className,
}: {
  value: number
  className?: string
}) {
  const bounded = Math.min(100, Math.max(0, value))

  return (
    <span
      aria-label={`Confianza ${Math.round(bounded)}%`}
      title={`Confianza ${Math.round(bounded)}%`}
      className={cn(
        'block rounded-full border border-white/45 bg-black/25 p-[2px]',
        className,
      )}
    >
      <span
        aria-hidden="true"
        className="block size-full rounded-full"
        style={{
          background: `conic-gradient(var(--primary) ${bounded}%, rgb(0 0 0 / 0.72) 0)`,
        }}
      />
    </span>
  )
}

function FormStateIcon({
  state,
  className,
}: {
  state: PlayerFormState | null
  className?: string
}) {
  if (!state) return null

  const iconClassName = cn('drop-shadow-[0_1px_1px_rgb(0_0_0/0.65)]', className)

  if (state === 'fire') {
    return (
      <Flame
        aria-label="En racha"
        className={cn(iconClassName, 'text-red-400')}
      />
    )
  }
  if (state === 'ice') {
    return (
      <Snowflake
        aria-label="Enfriándose"
        className={cn(iconClassName, 'text-cyan-200')}
      />
    )
  }
  if (state === 'down') {
    return (
      <ArrowDown
        aria-label="Por debajo de su media"
        className={cn(iconClassName, 'text-rose-300')}
      />
    )
  }

  return (
    <ArrowUp
      aria-label="Por encima de su media"
      className={cn(iconClassName, 'text-emerald-300')}
    />
  )
}

interface PlayerPhotoProps {
  avatarUrl: string | null
  /** Stands in until a real face is uploaded. */
  initials: string
  className?: string
  fallbackClassName?: string
}

function PlayerPhoto({
  avatarUrl,
  initials,
  className,
  fallbackClassName,
}: PlayerPhotoProps) {
  return (
    <Avatar
      className={cn(
        'aspect-square border border-black/25 bg-black/20 shadow-[0_0_20px_rgb(234_175_53/0.22)]',
        className,
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
        className={cn('bg-black/25 font-bold', fallbackClassName)}
      >
        {initials}
      </AvatarFallback>
    </Avatar>
  )
}

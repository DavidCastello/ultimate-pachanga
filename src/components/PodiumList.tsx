import { Link } from 'react-router'
import { Medal } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { getAvatarUrl } from '@/lib/supabase'
import { formatPosition, toInitials } from '@/lib/formatting'
import { cn } from '@/lib/utils'
import type { PlayerCardData } from '@/types/domain'

/**
 * A short leaderboard: gold, silver and bronze for the podium, then plain
 * numbers.
 *
 * Where RankingTable lists a whole league in columns, this one is narrow enough
 * to stand four to a page — so a summary screen can show several different
 * podiums side by side.
 */

/** Medal colours in podium order; anyone below fourth gets a number. */
const MEDAL_CLASSES = ['text-tier-gold', 'text-tier-silver', 'text-tier-bronze']

const MEDAL_LABELS = ['Oro', 'Plata', 'Bronce']

function PodiumRank({ position }: { position: number }) {
  const medalClass = MEDAL_CLASSES[position]

  if (!medalClass) {
    return (
      <span className="numeric w-6 text-center text-sm font-bold text-muted-foreground">
        {position + 1}
      </span>
    )
  }

  return (
    <span className="flex w-6 justify-center" title={MEDAL_LABELS[position]}>
      <Medal className={cn('size-5', medalClass)} aria-hidden="true" />
      <span className="sr-only">{MEDAL_LABELS[position]}</span>
    </span>
  )
}

interface PodiumListProps {
  players: readonly PlayerCardData[]
  renderValue: (player: PlayerCardData) => React.ReactNode
  /** Shown when nobody qualifies yet. */
  emptyMessage: string
}

export function PodiumList({
  players,
  renderValue,
  emptyMessage,
}: PodiumListProps) {
  if (players.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyMessage}</p>
  }

  return (
    <ol className="competition-podium flex flex-col gap-1">
      {players.map((player, position) => {
        const avatarUrl = getAvatarUrl(player.avatarPath)

        return (
          <li
            key={player.id}
            data-testid={`podium-row-${position}`}
            className="group flex items-center rounded-sm transition-colors hover:bg-primary/10"
          >
            <Link
              to={`/players/${player.id}`}
              className="flex min-h-15 min-w-0 flex-1 items-center gap-3 border-l-2 border-transparent px-3 py-2 transition-colors group-hover:border-primary"
            >
              <PodiumRank position={position} />
              <Avatar className="size-11 shrink-0 border border-primary/55 shadow-[0_0_18px_rgb(234_175_53/0.22)] transition-transform group-hover:scale-105">
                {avatarUrl ? (
                  <AvatarImage
                    src={avatarUrl}
                    alt=""
                    className="object-cover"
                    loading="lazy"
                  />
                ) : null}
                <AvatarFallback className="text-[0.625rem]">
                  {toInitials(
                    player.firstName,
                    player.lastName,
                    player.displayName,
                  )}
                </AvatarFallback>
              </Avatar>
              <span className="min-w-0">
                <span className="block truncate text-lg font-medium">
                  {player.displayName}
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  {formatPosition(player.preferredPosition)}
                </span>
              </span>
            </Link>

            <span className="numeric mr-3 shrink-0 text-lg font-bold text-primary">
              {renderValue(player)}
            </span>
          </li>
        )
      })}
    </ol>
  )
}

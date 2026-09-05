import { PlayerCard } from '@/components/PlayerCard'
import { Skeleton } from '@/components/ui/skeleton'
import type { LeagueMetricRow, PlayerCardData } from '@/types/domain'

interface PlayerCardGridProps {
  players: readonly PlayerCardData[]
  metrics: readonly LeagueMetricRow[]
}

/**
 * Responsive card grid. Two columns on the narrowest phones, because a single
 * column of cards means a lot of scrolling for a twenty-player league.
 */
export function PlayerCardGrid({ players, metrics }: PlayerCardGridProps) {
  return (
    <div className="motion-grid grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
      {players.map((player) => (
        <PlayerCard
          key={player.id}
          player={player}
          metrics={metrics}
          linkTo={`/players/${player.id}`}
        />
      ))}
    </div>
  )
}

export function PlayerCardGridSkeleton({ count = 10 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
      {Array.from({ length: count }, (_, index) => (
        <Skeleton key={index} className="h-64 rounded-xl" />
      ))}
    </div>
  )
}

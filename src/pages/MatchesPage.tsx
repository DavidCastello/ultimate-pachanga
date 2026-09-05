import { Link } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { CalendarDays, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { AdminOnly } from '@/components/AdminOnly'
import { EmptyState } from '@/components/EmptyState'
import { ErrorState } from '@/components/ErrorState'
import { MatchCard } from '@/components/MatchCard'
import { fetchMatches, matchKeys } from '@/features/matches/api'
import { useLeague } from '@/features/league/useLeague'
import { isUpcomingMatch } from '@/lib/matchLifecycle'
import type { MatchRow } from '@/types/domain'

function MatchSection({
  title,
  matches,
}: {
  title: string
  matches: readonly MatchRow[]
}) {
  if (matches.length === 0) return null

  return (
    <section className="flex flex-col gap-2">
      <div>
        <h2 className="section-title">{title}</h2>
      </div>
      {/* Two columns at most: the cards are wide so the venue photograph reads
          as a place rather than a texture. */}
      <div className="grid gap-2 md:grid-cols-2">
        {matches.map((match) => (
          <MatchCard key={match.id} match={match} />
        ))}
      </div>
    </section>
  )
}

export function MatchesPage() {
  const { data: league } = useLeague()

  const {
    data: matches,
    isPending,
    error,
    refetch,
  } = useQuery({
    queryKey: matchKeys.list(league?.id ?? ''),
    enabled: Boolean(league),
    queryFn: () => fetchMatches(league!.id),
  })

  // Fixtures ahead read best soonest-first; results read best newest-first.
  const upcoming = (matches ?? [])
    .filter((match) => isUpcomingMatch(match.status))
    .sort(
      (left, right) =>
        new Date(left.played_at).getTime() -
        new Date(right.played_at).getTime(),
    )

  const past = (matches ?? []).filter((match) => !isUpcomingMatch(match.status))

  return (
    <div className="flex flex-col gap-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="page-title">Partidos</h1>
          <p className="mt-3 text-lg text-muted-foreground">
            {isPending
              ? 'Cargando partidos…'
              : `${upcoming.length} próximos · ${past.length} jugados`}
          </p>
        </div>
        <AdminOnly>
          <Button asChild size="lg">
            <Link to="/matches/new">
              <Plus className="size-4" aria-hidden="true" />
              Nuevo partido
            </Link>
          </Button>
        </AdminOnly>
      </div>

      {isPending ? (
        <div className="grid gap-4 xl:grid-cols-2 xl:gap-6">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className="h-32 rounded-xl" />
          ))}
        </div>
      ) : error ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : (matches ?? []).length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          title="Todavía no hay partidos"
          description="Crea el primero para empezar a convocar jugadores."
        />
      ) : (
        <>
          <MatchSection title="Próximos" matches={upcoming} />
          <MatchSection title="Jugados" matches={past} />
        </>
      )}
    </div>
  )
}

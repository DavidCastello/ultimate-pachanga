import { Link } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { CalendarDays, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { AdminOnly } from '@/components/AdminOnly'
import { EmptyState } from '@/components/EmptyState'
import { MatchCard } from '@/components/MatchCard'
import { fetchMatches, matchKeys } from '@/features/matches/api'
import { useMembership } from '@/features/league/useLeague'
import type { MatchRow } from '@/types/domain'

/** Anything not yet scored or cancelled is still ahead of the league. */
function isUpcoming(match: MatchRow): boolean {
  return match.status === 'draft' || match.status === 'scheduled'
}

function MatchSection({
  title,
  matches,
}: {
  title: string
  matches: readonly MatchRow[]
}) {
  if (matches.length === 0) return null

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
        {title}
      </h2>
      {/* Two columns at most: the cards are wide so the venue photograph reads
          as a place rather than a texture. */}
      <div className="grid gap-3 lg:grid-cols-2">
        {matches.map((match) => (
          <MatchCard key={match.id} match={match} />
        ))}
      </div>
    </section>
  )
}

export function MatchesPage() {
  const { data: membership } = useMembership()

  const { data: matches, isPending } = useQuery({
    queryKey: matchKeys.list(membership?.leagueId ?? ''),
    enabled: Boolean(membership),
    queryFn: () => fetchMatches(membership!.leagueId),
  })

  // Fixtures ahead read best soonest-first; results read best newest-first.
  const upcoming = (matches ?? [])
    .filter(isUpcoming)
    .sort(
      (left, right) =>
        new Date(left.played_at).getTime() -
        new Date(right.played_at).getTime(),
    )

  const past = (matches ?? []).filter((match) => !isUpcoming(match))

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Partidos</h1>
          <p className="text-sm text-muted-foreground">
            {isPending
              ? 'Cargando partidos…'
              : `${upcoming.length} próximos · ${past.length} jugados`}
          </p>
        </div>
        <AdminOnly>
          <Button asChild>
            <Link to="/matches/new">
              <Plus className="size-4" aria-hidden="true" />
              Nuevo partido
            </Link>
          </Button>
        </AdminOnly>
      </div>

      {isPending ? (
        <div className="grid gap-3 lg:grid-cols-2">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className="h-32 rounded-xl" />
          ))}
        </div>
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

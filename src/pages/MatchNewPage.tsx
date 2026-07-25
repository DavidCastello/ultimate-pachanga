import { Link, useNavigate } from 'react-router'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { MatchForm } from '@/features/matches/MatchForm'
import { createMatch, matchKeys, type MatchInput } from '@/features/matches/api'
import { useMembership } from '@/features/league/useLeague'

export function MatchNewPage() {
  const { data: membership } = useMembership()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const create = useMutation({
    mutationFn: (input: MatchInput) => createMatch(membership!.leagueId, input),
    onSuccess: async (matchId) => {
      await queryClient.invalidateQueries({ queryKey: matchKeys.all })
      toast.success('Partido creado. Ahora convoca a los jugadores.')
      navigate(`/matches/${matchId}`, { replace: true })
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : 'No se pudo crear el partido',
      )
    },
  })

  return (
    <div className="flex flex-col gap-5">
      <Button asChild variant="ghost" size="sm" className="w-fit">
        <Link to="/matches">
          <ArrowLeft className="size-4" aria-hidden="true" />
          Partidos
        </Link>
      </Button>

      <h1 className="text-2xl font-bold">Nuevo partido</h1>

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>
            <h2>Datos del partido</h2>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <MatchForm
            submitLabel="Crear partido"
            onCancel={() => navigate('/matches')}
            onSubmit={async (input) => {
              await create.mutateAsync(input)
            }}
          />
        </CardContent>
      </Card>
    </div>
  )
}

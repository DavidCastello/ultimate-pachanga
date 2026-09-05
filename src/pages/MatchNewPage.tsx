import { Link, useNavigate } from 'react-router'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { MatchForm, type MatchSubmission } from '@/features/matches/MatchForm'
import {
  createMatch,
  matchKeys,
  uploadMatchPhoto,
} from '@/features/matches/api'
import { useMembership } from '@/features/league/useLeague'

export function MatchNewPage() {
  const { data: membership } = useMembership()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  /**
   * Creates the fixture, then gives it its photograph.
   *
   * Two steps because the object is stored under the match's id, which does not
   * exist until the first one has run — and a photograph that fails to upload
   * must not look like a match that failed to be created, or the next attempt
   * makes a second one. The fixture stands and keeps the picture bundled for
   * its location; the photograph can be added again from the match itself.
   */
  const create = useMutation({
    mutationFn: async ({ match, photo }: MatchSubmission) => {
      const matchId = await createMatch(membership!.leagueId, match)

      if (photo) {
        try {
          await uploadMatchPhoto(membership!.leagueId, matchId, photo)
        } catch {
          toast.warning('Partido creado, pero la foto no se pudo subir')
        }
      }

      return matchId
    },
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

      <h1 className="page-title">Nuevo partido</h1>

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
            onSubmit={async (submission) => {
              await create.mutateAsync(submission)
            }}
          />
        </CardContent>
      </Card>
    </div>
  )
}

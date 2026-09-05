import { useRef, useState } from 'react'
import { Link } from 'react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ImagePlus, Pencil } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { ErrorState } from '@/components/ErrorState'
import { PlayerCard } from '@/components/PlayerCard'
import { PlayerFormDialog } from '@/features/players/PlayerFormDialog'
import {
  fetchPlayerCard,
  playerKeys,
  updateOwnPlayerProfile,
  uploadOwnPlayerAvatar,
  type PlayerInput,
} from '@/features/players/api'
import { useMyPlayerId } from '@/features/players/useMyPlayer'
import { useLeagueMetrics } from '@/features/league/useLeague'
import { formatPosition } from '@/lib/formatting'

/**
 * Your own card.
 *
 * The only place a member can change anything. Everything editable here goes
 * through the self-service functions in migration 008, which reach exactly
 * these fields and no others — an administrator editing the same player from
 * the admin screen uses the wider table policy instead.
 */

function toErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback
}

export function ProfilePage() {
  const queryClient = useQueryClient()
  const avatarInputRef = useRef<HTMLInputElement>(null)
  const [isFormOpen, setIsFormOpen] = useState(false)

  const { data: metrics = [] } = useLeagueMetrics()
  const { data: myPlayerId } = useMyPlayerId()

  const {
    data: player,
    isPending,
    error,
    refetch,
  } = useQuery({
    queryKey: playerKeys.card(myPlayerId ?? ''),
    enabled: Boolean(myPlayerId),
    queryFn: () => fetchPlayerCard(myPlayerId!),
  })

  function invalidatePlayers() {
    return queryClient.invalidateQueries({ queryKey: playerKeys.all })
  }

  const saveProfile = useMutation({
    mutationFn: (input: PlayerInput) =>
      updateOwnPlayerProfile(myPlayerId!, input),
    onSuccess: async () => {
      await invalidatePlayers()
      toast.success('Perfil actualizado')
    },
    onError: (error) => {
      toast.error(toErrorMessage(error, 'No se pudo guardar tu perfil'))
    },
  })

  const uploadAvatar = useMutation({
    mutationFn: (file: File) =>
      uploadOwnPlayerAvatar(player!.leagueId, myPlayerId!, file),
    onSuccess: async () => {
      await invalidatePlayers()
      toast.success('Foto actualizada')
    },
    onError: (error) => {
      toast.error(toErrorMessage(error, 'No se pudo subir la foto'))
    },
  })

  function handleAvatarSelected(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    // Reset so picking the same file twice still fires a change event.
    event.target.value = ''

    if (file) uploadAvatar.mutate(file)
  }

  // `error` is checked before the `!player` skeleton: a failed read leaves the
  // data undefined too, and a skeleton that never resolves is the least
  // diagnosable thing this page could show.
  if (error) {
    return <ErrorState error={error} onRetry={() => void refetch()} />
  }

  if (isPending || !player) {
    return (
      <div className="grid gap-6 lg:grid-cols-2">
        <Skeleton className="h-[28rem] rounded-xl lg:h-[34rem]" />
        <Skeleton className="h-[28rem] rounded-xl lg:h-[34rem]" />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="page-title">{player.displayName}</h1>
        <p className="body-copy mt-3 text-muted-foreground">
          Tu perfil de jugador. Tus puntuaciones y tu valor de mercado los
          calcula la liga; el resto lo decides tú.
        </p>
      </div>

      <div className="player-detail-top">
        <PlayerCard
          player={player}
          metrics={metrics}
          showcase
          className="h-full"
        />

        <Card className="border-primary/25">
          <CardHeader className="border-b border-primary/20">
            <p className="section-kicker text-primary">Tu ficha</p>
            <CardTitle className="mt-3 text-5xl leading-none uppercase">
              Tus datos
            </CardTitle>
            <CardDescription>
              {player.preferredPosition} ·{' '}
              {formatPosition(player.preferredPosition)}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex h-full flex-col items-start gap-3">
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => setIsFormOpen(true)}>
                <Pencil className="size-4" aria-hidden="true" />
                Editar mis datos
              </Button>
              <Button
                variant="outline"
                onClick={() => avatarInputRef.current?.click()}
                disabled={uploadAvatar.isPending}
              >
                <ImagePlus className="size-4" aria-hidden="true" />
                Cambiar mi foto
              </Button>
            </div>

            <div className="grid w-full grid-cols-2 gap-3 border-y border-border py-3">
              <div>
                <p className="technical text-[0.6875rem] text-muted-foreground uppercase">
                  Valoración actual
                </p>
                <p className="numeric mt-1 text-4xl leading-none text-primary">
                  {player.cardRating}
                </p>
              </div>
              <div>
                <p className="technical text-[0.6875rem] text-muted-foreground uppercase">
                  Partidos jugados
                </p>
                <p className="numeric mt-1 text-4xl leading-none">
                  {player.matchesPlayed}
                </p>
              </div>
            </div>

            <p className="text-base leading-relaxed text-muted-foreground">
              Puedes cambiar tu nombre, apodo, posición preferida y fotografía.
              Las convocatorias y puntuaciones las gestiona la liga.
            </p>

            <Button
              variant="link"
              className="mt-auto px-0 text-primary"
              asChild
            >
              <Link to={`/players/${player.id}`}>
                Ver mi historial de partidos
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      <input
        ref={avatarInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={handleAvatarSelected}
      />

      <PlayerFormDialog
        open={isFormOpen}
        onOpenChange={setIsFormOpen}
        scope="self"
        player={player}
        onSubmit={(input) => saveProfile.mutateAsync(input)}
      />
    </div>
  )
}

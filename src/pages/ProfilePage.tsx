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

  const { data: player, isPending } = useQuery({
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

  if (isPending || !player) {
    return (
      <div className="grid gap-4 md:grid-cols-[18rem_1fr]">
        <Skeleton className="h-96 rounded-xl" />
        <Skeleton className="h-48 rounded-xl" />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-bold">Mi perfil</h1>
        <p className="text-sm text-muted-foreground">
          Tu cuenta juega como {player.displayName}. Tus puntuaciones y tu valor
          de mercado los calcula la liga; el resto lo decides tú.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-[18rem_1fr]">
        <PlayerCard player={player} metrics={metrics} />

        <Card>
          <CardHeader>
            <CardTitle>Tus datos</CardTitle>
            <CardDescription>
              Código de importación {player.playerCode} · posición{' '}
              {formatPosition(player.preferredPosition)}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-start gap-3">
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

            <p className="text-sm text-muted-foreground">
              Puedes cambiar tu nombre, apellidos, apodo, posición preferida y
              foto. Para cualquier otra cosa —tu código, las convocatorias o las
              puntuaciones— habla con un administrador.
            </p>

            <Button variant="link" className="px-0" asChild>
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
        player={player}
        onSubmit={(input) => saveProfile.mutateAsync(input)}
      />
    </div>
  )
}

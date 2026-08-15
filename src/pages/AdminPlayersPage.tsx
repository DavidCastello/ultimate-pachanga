import { useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ImagePlus, Pencil, Plus, UserRound } from 'lucide-react'
import { toast } from 'sonner'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { EmptyState } from '@/components/EmptyState'
import { ErrorState } from '@/components/ErrorState'
import { PlayerFormDialog } from '@/features/players/PlayerFormDialog'
import {
  createPlayer,
  fetchPlayerCards,
  playerKeys,
  setPlayerActive,
  updatePlayer,
  uploadPlayerAvatar,
  type AdminPlayerInput,
} from '@/features/players/api'
import { useMembership } from '@/features/league/useLeague'
import { getAvatarUrl } from '@/lib/supabase'
import { formatPosition, toInitials } from '@/lib/formatting'
import type { PlayerCardData } from '@/types/domain'

function toErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback
}

export function AdminPlayersPage() {
  const { data: membership } = useMembership()
  const queryClient = useQueryClient()
  const avatarInputRef = useRef<HTMLInputElement>(null)

  const [isFormOpen, setIsFormOpen] = useState(false)
  const [editingPlayer, setEditingPlayer] = useState<PlayerCardData>()
  const [deactivationTarget, setDeactivationTarget] = useState<PlayerCardData>()
  const [avatarTargetId, setAvatarTargetId] = useState<string>()

  const leagueId = membership?.leagueId

  const {
    data: players,
    isPending,
    error,
    refetch,
  } = useQuery({
    queryKey: playerKeys.cards(leagueId ?? ''),
    enabled: Boolean(leagueId),
    queryFn: () => fetchPlayerCards(leagueId!),
  })

  function invalidatePlayers() {
    return queryClient.invalidateQueries({ queryKey: playerKeys.all })
  }

  const savePlayer = useMutation({
    mutationFn: async (input: AdminPlayerInput) => {
      if (editingPlayer) {
        await updatePlayer(editingPlayer.id, input)
      } else {
        await createPlayer(leagueId!, input)
      }
    },
    onSuccess: async () => {
      await invalidatePlayers()
      toast.success(editingPlayer ? 'Jugador actualizado' : 'Jugador creado')
    },
    onError: (error) => {
      toast.error(toErrorMessage(error, 'No se pudo guardar el jugador'))
    },
  })

  const toggleActive = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      setPlayerActive(id, isActive),
    onSuccess: async (_result, variables) => {
      await invalidatePlayers()
      toast.success(
        variables.isActive ? 'Jugador reactivado' : 'Jugador desactivado',
      )
    },
    onError: (error) => {
      toast.error(toErrorMessage(error, 'No se pudo cambiar el estado'))
    },
  })

  const uploadAvatar = useMutation({
    mutationFn: ({ playerId, file }: { playerId: string; file: File }) =>
      uploadPlayerAvatar(leagueId!, playerId, file),
    onSuccess: async () => {
      await invalidatePlayers()
      toast.success('Foto actualizada')
    },
    onError: (error) => {
      toast.error(toErrorMessage(error, 'No se pudo subir la foto'))
    },
  })

  function openAvatarPicker(playerId: string) {
    setAvatarTargetId(playerId)
    avatarInputRef.current?.click()
  }

  function handleAvatarSelected(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    // Reset so picking the same file twice still fires a change event.
    event.target.value = ''

    if (!file || !avatarTargetId) return
    uploadAvatar.mutate({ playerId: avatarTargetId, file })
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Gestión de jugadores</h1>
          <p className="text-sm text-muted-foreground">
            Los jugadores con historial se desactivan, nunca se eliminan.
          </p>
        </div>
        <Button
          onClick={() => {
            setEditingPlayer(undefined)
            setIsFormOpen(true)
          }}
        >
          <Plus className="size-4" aria-hidden="true" />
          Nuevo jugador
        </Button>
      </div>

      {isPending ? (
        <Skeleton className="h-64 rounded-xl" />
      ) : error ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : !players || players.length === 0 ? (
        <EmptyState
          icon={UserRound}
          title="Todavía no hay jugadores"
          description="Crea el primero para empezar a montar la plantilla."
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12" />
                <TableHead>Jugador</TableHead>
                <TableHead>Código</TableHead>
                <TableHead>Posición</TableHead>
                <TableHead className="text-right">Partidos</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {players.map((player) => {
                const avatarUrl = getAvatarUrl(player.avatarPath)

                return (
                  <TableRow key={player.id}>
                    <TableCell>
                      <Avatar className="size-8">
                        {avatarUrl ? (
                          <AvatarImage
                            src={avatarUrl}
                            alt=""
                            className="object-cover"
                          />
                        ) : null}
                        <AvatarFallback className="text-xs">
                          {toInitials(
                            player.firstName,
                            player.lastName,
                            player.displayName,
                          )}
                        </AvatarFallback>
                      </Avatar>
                    </TableCell>
                    <TableCell className="font-medium">
                      {player.firstName} {player.lastName}
                      {player.nickname ? (
                        <span className="text-muted-foreground">
                          {' '}
                          ({player.nickname})
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell className="numeric text-sm text-muted-foreground">
                      {player.playerCode}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {player.preferredPosition} ·{' '}
                      <span className="text-muted-foreground">
                        {formatPosition(player.preferredPosition)}
                      </span>
                    </TableCell>
                    <TableCell className="numeric text-right">
                      {player.matchesPlayed}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        <Badge
                          variant={player.isActive ? 'default' : 'secondary'}
                        >
                          {player.isActive ? 'Activo' : 'Inactivo'}
                        </Badge>
                        {/* Unclaimed players are the ones still offered to
                            whoever registers next. */}
                        {player.userId ? null : (
                          <Badge variant="outline">Sin cuenta</Badge>
                        )}
                        {player.isGuest ? (
                          <Badge variant="outline">Invitado</Badge>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Subir foto de ${player.displayName}`}
                          onClick={() => openAvatarPicker(player.id)}
                          disabled={uploadAvatar.isPending}
                        >
                          <ImagePlus className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Editar ${player.displayName}`}
                          onClick={() => {
                            setEditingPlayer(player)
                            setIsFormOpen(true)
                          }}
                        >
                          <Pencil className="size-4" />
                        </Button>
                        {player.isActive ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setDeactivationTarget(player)}
                          >
                            Desactivar
                          </Button>
                        ) : (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              toggleActive.mutate({
                                id: player.id,
                                isActive: true,
                              })
                            }
                          >
                            Reactivar
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* One hidden input serves every row, targeted by avatarTargetId. */}
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
        scope="admin"
        player={editingPlayer}
        onSubmit={(input) => savePlayer.mutateAsync(input)}
      />

      <AlertDialog
        open={Boolean(deactivationTarget)}
        onOpenChange={(open) => {
          if (!open) setDeactivationTarget(undefined)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              ¿Desactivar a {deactivationTarget?.displayName}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Dejará de aparecer en las convocatorias y en la plantilla, pero su
              historial de partidos y puntuaciones se conserva. Puedes
              reactivarlo cuando quieras.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!deactivationTarget) return
                toggleActive.mutate({
                  id: deactivationTarget.id,
                  isActive: false,
                })
                setDeactivationTarget(undefined)
              }}
            >
              Desactivar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

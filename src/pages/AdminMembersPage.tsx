import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ShieldCheck, UserRound } from 'lucide-react'
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
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
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
import {
  fetchLeagueMembers,
  removeMember,
  updateMemberRole,
  type LeagueMemberProfile,
} from '@/features/league/adminApi'
import { leagueKeys, useMembership } from '@/features/league/useLeague'
import { formatMatchDate } from '@/lib/formatting'
import type { MemberRole } from '@/types/domain'

function toErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback
}

export function AdminMembersPage() {
  const { data: membership } = useMembership()
  const queryClient = useQueryClient()
  const [removalTarget, setRemovalTarget] = useState<LeagueMemberProfile>()

  const leagueId = membership?.leagueId

  const {
    data: members,
    isPending,
    error,
    refetch,
  } = useQuery({
    queryKey: [...leagueKeys.members, leagueId],
    enabled: Boolean(leagueId),
    queryFn: () => fetchLeagueMembers(leagueId!),
  })

  function invalidate() {
    return queryClient.invalidateQueries({ queryKey: ['league'] })
  }

  const changeRole = useMutation({
    mutationFn: ({ memberId, role }: { memberId: string; role: MemberRole }) =>
      updateMemberRole(memberId, role),
    onSuccess: async (_result, variables) => {
      await invalidate()
      toast.success(
        variables.role === 'admin'
          ? 'Ahora es administrador'
          : 'Ahora es miembro',
      )
    },
    onError: (error) => {
      // The database refuses to leave a league without an administrator, and
      // that message is worth showing as-is.
      toast.error(toErrorMessage(error, 'No se pudo cambiar el rol'))
    },
  })

  const remove = useMutation({
    mutationFn: (memberId: string) => removeMember(memberId),
    onSuccess: async () => {
      await invalidate()
      toast.success('Miembro expulsado de la liga')
    },
    onError: (error) => {
      toast.error(toErrorMessage(error, 'No se pudo expulsar al miembro'))
    },
  })

  const adminCount = (members ?? []).filter(
    (member) => member.role === 'admin',
  ).length

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-bold">Miembros</h1>
        <p className="text-sm text-muted-foreground">
          Quien se registra entra como miembro. Aquí decides quién administra.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            <h2>Cuentas con acceso</h2>
          </CardTitle>
          <CardDescription>
            La primera cuenta registrada es administradora. Cuando estén todos
            dentro, desactiva el registro público en Supabase.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isPending ? (
            <Skeleton className="h-40" />
          ) : error ? (
            <ErrorState
              error={error}
              onRetry={() => void refetch()}
              className="border-0 py-6"
            />
          ) : !members || members.length === 0 ? (
            <EmptyState
              icon={UserRound}
              title="Todavía no hay miembros"
              className="border-0 py-6"
            />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Correo</TableHead>
                    <TableHead>Rol</TableHead>
                    <TableHead className="hidden sm:table-cell">
                      Desde
                    </TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {members.map((member) => {
                    const isLastAdmin =
                      member.role === 'admin' && adminCount === 1

                    return (
                      <TableRow key={member.memberId}>
                        <TableCell className="font-medium">
                          {member.email}
                          {member.isSelf ? (
                            <span className="text-muted-foreground"> (tú)</span>
                          ) : null}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              member.role === 'admin' ? 'default' : 'secondary'
                            }
                            className="gap-1"
                          >
                            {member.role === 'admin' ? (
                              <ShieldCheck
                                className="size-3"
                                aria-hidden="true"
                              />
                            ) : null}
                            {member.role === 'admin'
                              ? 'Administrador'
                              : 'Miembro'}
                          </Badge>
                        </TableCell>
                        <TableCell className="hidden text-sm text-muted-foreground sm:table-cell">
                          {formatMatchDate(member.joinedAt)}
                        </TableCell>
                        <TableCell>
                          <div className="flex justify-end gap-1">
                            {member.role === 'admin' ? (
                              <Button
                                variant="ghost"
                                size="sm"
                                disabled={isLastAdmin || changeRole.isPending}
                                title={
                                  isLastAdmin
                                    ? 'La liga necesita al menos un administrador'
                                    : undefined
                                }
                                onClick={() =>
                                  changeRole.mutate({
                                    memberId: member.memberId,
                                    role: 'member',
                                  })
                                }
                              >
                                Quitar admin
                              </Button>
                            ) : (
                              <Button
                                variant="ghost"
                                size="sm"
                                disabled={changeRole.isPending}
                                onClick={() =>
                                  changeRole.mutate({
                                    memberId: member.memberId,
                                    role: 'admin',
                                  })
                                }
                              >
                                Hacer admin
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-destructive"
                              disabled={isLastAdmin}
                              onClick={() => setRemovalTarget(member)}
                            >
                              Expulsar
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog
        open={Boolean(removalTarget)}
        onOpenChange={(open) => {
          if (!open) setRemovalTarget(undefined)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              ¿Expulsar a {removalTarget?.email}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Perderá el acceso a la liga. Su cuenta seguirá existiendo y podrás
              volver a añadirla, pero tendrá que registrarse de nuevo desde la
              aplicación.
              {removalTarget?.isSelf
                ? ' Estás a punto de expulsarte a ti mismo.'
                : ''}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!removalTarget) return
                remove.mutate(removalTarget.memberId)
                setRemovalTarget(undefined)
              }}
            >
              Expulsar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

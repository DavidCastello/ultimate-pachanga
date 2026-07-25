import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { ArrowLeft, Loader2, LogOut } from 'lucide-react'
import { toast } from 'sonner'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { signOut } from '@/features/auth/api'
import { leagueKeys, useMembership } from '@/features/league/useLeague'
import { playerKeys } from '@/features/players/api'
import { useMyPlayerId } from '@/features/players/useMyPlayer'
import {
  claimPlayer,
  createOwnPlayer,
  fetchJoinableLeagues,
  fetchUnclaimedPlayers,
  onboardingKeys,
  type JoinableLeague,
  type NewPlayerInput,
  type UnclaimedPlayer,
} from '@/features/onboarding/api'
import { getAvatarUrl } from '@/lib/supabase'
import { APP_NAME } from '@/lib/env'
import { formatPosition, toInitials } from '@/lib/formatting'
import { PLAYER_POSITIONS } from '@/types/domain'

/**
 * Finishing registration.
 *
 * An account arrives here with no league and no player, because signing up
 * grants neither. Two ways out: claim the player an administrator already put
 * on the roster, or — when nobody has — create one.
 *
 * The owner reaches this page too. They are an administrator from their first
 * sign-in but still have to say which player they are, so the league step is
 * skipped and only the roster is shown.
 */

function toErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback
}

interface StepState {
  isPending: boolean
  hasLeague: boolean
  isCreating: boolean
  hasRoster: boolean
}

/**
 * What the card says above the step.
 *
 * Takes the loading flag because an empty roster and a roster that has not
 * arrived yet look identical otherwise, and announcing "nobody left to claim"
 * over a skeleton is both wrong and alarming.
 */
function describeStep({
  isPending,
  hasLeague,
  isCreating,
  hasRoster,
}: StepState): string {
  if (isPending) return 'Un momento, estamos cargando la liga.'
  if (!hasLeague) return 'Elige la liga a la que te unes.'
  if (isCreating) return 'Rellena tus datos y te añadimos a la plantilla.'
  if (!hasRoster) {
    return 'No queda ningún jugador libre en la plantilla, así que crea el tuyo.'
  }

  return 'Dinos quién eres para vincular tu cuenta a tu jugador.'
}

// ---------------------------------------------------------------------------
// Step 1 — which league
// ---------------------------------------------------------------------------

function LeagueStep({
  leagues,
  onChoose,
}: {
  leagues: JoinableLeague[]
  onChoose: (leagueId: string) => void
}) {
  if (leagues.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No hay ninguna liga abierta ahora mismo. Pídele al administrador que
        active la suya y vuelve a entrar.
      </p>
    )
  }

  return (
    <ul className="flex flex-col gap-2">
      {leagues.map((league) => (
        <li key={league.leagueId}>
          <button
            type="button"
            onClick={() => onChoose(league.leagueId)}
            className="w-full rounded-lg border p-4 text-left transition-colors hover:bg-accent/50"
          >
            <span className="block font-medium">{league.title}</span>
            <span className="block text-sm text-muted-foreground">
              {league.unclaimedPlayerCount === 0
                ? 'Sin jugadores libres'
                : `${league.unclaimedPlayerCount} jugadores sin dueño`}
            </span>
          </button>
        </li>
      ))}
    </ul>
  )
}

// ---------------------------------------------------------------------------
// Step 2a — claim a player from the roster
// ---------------------------------------------------------------------------

function ClaimStep({
  players,
  isJoining,
  onClaim,
}: {
  players: UnclaimedPlayer[]
  isJoining: boolean
  onClaim: (playerId: string) => void
}) {
  const [selectedId, setSelectedId] = useState<string>()

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault()
        if (selectedId) onClaim(selectedId)
      }}
    >
      {/* Native radios rather than buttons: one choice out of many is exactly
          what a radio group is, and screen readers announce the count. */}
      <fieldset className="flex max-h-96 flex-col gap-2 overflow-y-auto">
        <legend className="sr-only">Elige tu jugador</legend>
        {players.map((player) => {
          const avatarUrl = getAvatarUrl(player.avatarPath)
          const inputId = `player-${player.playerId}`

          return (
            <div key={player.playerId}>
              <input
                type="radio"
                id={inputId}
                name="player"
                value={player.playerId}
                checked={selectedId === player.playerId}
                onChange={() => setSelectedId(player.playerId)}
                className="peer sr-only"
              />
              <label
                htmlFor={inputId}
                className="flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors peer-checked:border-primary peer-checked:bg-primary/5 peer-focus-visible:ring-2 peer-focus-visible:ring-ring hover:bg-accent/50"
              >
                <Avatar className="size-9">
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
                <span className="min-w-0">
                  <span className="block truncate font-medium">
                    {player.firstName} {player.lastName}
                  </span>
                  <span className="block text-sm text-muted-foreground">
                    {player.preferredPosition} ·{' '}
                    {formatPosition(player.preferredPosition)}
                  </span>
                </span>
              </label>
            </div>
          )
        })}
      </fieldset>

      <Button type="submit" disabled={!selectedId || isJoining}>
        {isJoining ? (
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        ) : null}
        Este soy yo
      </Button>
    </form>
  )
}

// ---------------------------------------------------------------------------
// Step 2b — create your own player
// ---------------------------------------------------------------------------

const newPlayerSchema = z.object({
  firstName: z.string().trim().min(1, 'El nombre es obligatorio').max(60),
  lastName: z.string().trim().min(1, 'Los apellidos son obligatorios').max(80),
  nickname: z.string().trim().max(40).optional(),
  preferredPosition: z.enum(PLAYER_POSITIONS, {
    message: 'Elige una posición',
  }),
})

type NewPlayerValues = z.infer<typeof newPlayerSchema>

function CreateStep({
  onCreate,
}: {
  onCreate: (input: NewPlayerInput) => Promise<void>
}) {
  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<NewPlayerValues>({
    resolver: zodResolver(newPlayerSchema),
    defaultValues: {
      firstName: '',
      lastName: '',
      nickname: '',
      preferredPosition: 'UT',
    },
  })

  async function submit(values: NewPlayerValues) {
    await onCreate({
      firstName: values.firstName,
      lastName: values.lastName,
      nickname: values.nickname?.trim() ? values.nickname.trim() : null,
      preferredPosition: values.preferredPosition,
    })
  }

  return (
    <form onSubmit={handleSubmit(submit)} className="flex flex-col gap-4">
      <Field data-invalid={Boolean(errors.firstName) || undefined}>
        <FieldLabel htmlFor="onboarding-first-name">Nombre</FieldLabel>
        <Input
          id="onboarding-first-name"
          autoComplete="given-name"
          aria-invalid={Boolean(errors.firstName)}
          {...register('firstName')}
        />
        {errors.firstName ? (
          <FieldError>{errors.firstName.message}</FieldError>
        ) : null}
      </Field>

      <Field data-invalid={Boolean(errors.lastName) || undefined}>
        <FieldLabel htmlFor="onboarding-last-name">Apellidos</FieldLabel>
        <Input
          id="onboarding-last-name"
          autoComplete="family-name"
          aria-invalid={Boolean(errors.lastName)}
          {...register('lastName')}
        />
        {errors.lastName ? (
          <FieldError>{errors.lastName.message}</FieldError>
        ) : null}
      </Field>

      <Field>
        <FieldLabel htmlFor="onboarding-nickname">Apodo (opcional)</FieldLabel>
        <Input id="onboarding-nickname" {...register('nickname')} />
      </Field>

      <Field data-invalid={Boolean(errors.preferredPosition) || undefined}>
        <FieldLabel htmlFor="onboarding-position">
          Posición preferida
        </FieldLabel>
        <Controller
          control={control}
          name="preferredPosition"
          render={({ field }) => (
            <Select value={field.value} onValueChange={field.onChange}>
              <SelectTrigger
                id="onboarding-position"
                className="w-full"
                onBlur={field.onBlur}
              >
                <SelectValue placeholder="Elige una posición" />
              </SelectTrigger>
              <SelectContent>
                {PLAYER_POSITIONS.map((code) => (
                  <SelectItem key={code} value={code}>
                    {code} · {formatPosition(code)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
        {errors.preferredPosition ? (
          <FieldError>{errors.preferredPosition.message}</FieldError>
        ) : null}
      </Field>

      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? (
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        ) : null}
        Crear mi jugador y entrar
      </Button>
    </form>
  )
}

// ---------------------------------------------------------------------------
// The page
// ---------------------------------------------------------------------------

export function OnboardingPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const { data: membership, isPending: isMembershipPending } = useMembership()
  const { data: myPlayerId, isPending: isPlayerPending } = useMyPlayerId()

  const [chosenLeagueId, setChosenLeagueId] = useState<string>()
  const [isCreating, setIsCreating] = useState(false)

  const { data: leagues, isPending: areLeaguesPending } = useQuery({
    queryKey: onboardingKeys.joinableLeagues,
    queryFn: fetchJoinableLeagues,
  })

  // A member already belongs somewhere; only the player is missing. With a
  // single league on offer there is nothing to choose either.
  const leagueId =
    membership?.leagueId ??
    chosenLeagueId ??
    (leagues?.length === 1 ? leagues[0].leagueId : undefined)

  const { data: unclaimedPlayers, isPending: arePlayersPending } = useQuery({
    queryKey: onboardingKeys.unclaimedPlayers(leagueId ?? ''),
    enabled: Boolean(leagueId),
    queryFn: () => fetchUnclaimedPlayers(leagueId!),
  })

  async function finish() {
    // Both guards read these, so they have to be fresh before navigating.
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: leagueKeys.membership }),
      queryClient.invalidateQueries({ queryKey: playerKeys.all }),
    ])
    navigate('/league', { replace: true })
  }

  const join = useMutation({
    mutationFn: (playerId: string) => claimPlayer(leagueId!, playerId),
    onSuccess: async () => {
      toast.success('¡Ya estás dentro!')
      await finish()
    },
    onError: (error) => {
      toast.error(
        toErrorMessage(
          error,
          'No se pudo elegir ese jugador. Puede que alguien se te haya adelantado.',
        ),
      )
      // Whoever took it is no longer on the list.
      void queryClient.invalidateQueries({
        queryKey: onboardingKeys.unclaimedPlayers(leagueId ?? ''),
      })
    },
  })

  const create = useMutation({
    mutationFn: (input: NewPlayerInput) => createOwnPlayer(leagueId!, input),
    onSuccess: async () => {
      toast.success('¡Ya estás dentro!')
      await finish()
    },
    onError: (error) => {
      toast.error(toErrorMessage(error, 'No se pudo crear tu jugador'))
    },
  })

  async function handleSignOut() {
    try {
      await signOut()
      navigate('/login', { replace: true })
    } catch (error) {
      toast.error(toErrorMessage(error, 'No se pudo cerrar sesión'))
    }
  }

  if (isMembershipPending) return null

  // Nothing left to do here.
  if (membership && !isPlayerPending && myPlayerId) {
    return <Navigate to="/league" replace />
  }

  const isPending =
    areLeaguesPending || (Boolean(leagueId) && arePlayersPending)
  const hasRoster = (unclaimedPlayers?.length ?? 0) > 0
  const showCreateForm = isCreating || !hasRoster

  return (
    <main className="flex min-h-svh items-center justify-center p-4">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle className="text-xl">
            <h1>{APP_NAME}</h1>
          </CardTitle>
          <CardDescription>
            {describeStep({
              isPending,
              hasLeague: Boolean(leagueId),
              isCreating,
              hasRoster,
            })}
          </CardDescription>
        </CardHeader>

        <CardContent className="flex flex-col gap-4">
          {isPending ? (
            <Skeleton className="h-48 rounded-lg" />
          ) : !leagueId ? (
            <LeagueStep leagues={leagues ?? []} onChoose={setChosenLeagueId} />
          ) : showCreateForm ? (
            <>
              <CreateStep
                onCreate={async (input) => {
                  await create.mutateAsync(input)
                }}
              />
              {hasRoster ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsCreating(false)}
                >
                  <ArrowLeft className="size-4" aria-hidden="true" />
                  Volver a la lista de jugadores
                </Button>
              ) : null}
            </>
          ) : (
            <>
              <ClaimStep
                players={unclaimedPlayers ?? []}
                isJoining={join.isPending}
                onClaim={(playerId) => join.mutate(playerId)}
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setIsCreating(true)}
              >
                No estoy en la lista, crear mi jugador
              </Button>
            </>
          )}
        </CardContent>

        <CardFooter>
          {/* Someone who signed up with the wrong address needs a way out. */}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-muted-foreground"
            onClick={handleSignOut}
          >
            <LogOut className="size-4" aria-hidden="true" />
            Salir
          </Button>
        </CardFooter>
      </Card>
    </main>
  )
}

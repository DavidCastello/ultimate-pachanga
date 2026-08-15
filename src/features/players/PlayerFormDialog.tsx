import { useEffect } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { formatMarketValueExact, formatPosition } from '@/lib/formatting'
import { PLAYER_POSITIONS, type PlayerCardData } from '@/types/domain'
import type { AdminPlayerInput } from '@/features/players/api'

/**
 * A market value as typed, which is to say possibly not one at all.
 *
 * Kept as a string through the form rather than coerced on the way in: an
 * empty box has to mean "no opinion" and reach the database as null, and a
 * number input that has been cleared coerces to NaN, which is a figure.
 */
const estimatedMarketValueSchema = z
  .string()
  .trim()
  // One rule rather than two, because NaN >= 0 is false: anything that is not
  // a number from zero upwards fails here, and there is only one thing to say
  // about it.
  .refine((value) => value === '' || Number(value) >= 0, {
    error: 'Introduce un importe de cero en adelante',
  })

const playerSchema = z.object({
  firstName: z.string().trim().min(1, 'El nombre es obligatorio').max(60),
  lastName: z.string().trim().min(1, 'Los apellidos son obligatorios').max(80),
  // Empty means "no nickname", which the database stores as null.
  nickname: z.string().trim().max(40).optional(),
  preferredPosition: z.enum(PLAYER_POSITIONS, {
    message: 'Elige una posición',
  }),
  isGuest: z.boolean(),
  estimatedMarketValue: estimatedMarketValueSchema,
})

type PlayerFormValues = z.infer<typeof playerSchema>

const EMPTY_PLAYER: PlayerFormValues = {
  firstName: '',
  lastName: '',
  nickname: '',
  preferredPosition: 'UT',
  isGuest: false,
  estimatedMarketValue: '',
}

/**
 * Who is filling the form in.
 *
 * The same dialog serves an administrator managing the roster and a member
 * editing their own card, and two of the fields are not a member's to set —
 * see `AdminPlayerInput`. A scope rather than a flag because the two callers
 * read as what they are at the call site.
 */
type PlayerFormScope = 'admin' | 'self'

interface PlayerFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  scope: PlayerFormScope
  /** Absent when creating a new player. */
  player?: PlayerCardData
  onSubmit: (input: AdminPlayerInput) => Promise<void>
}

export function PlayerFormDialog({
  open,
  onOpenChange,
  scope,
  player,
  onSubmit,
}: PlayerFormDialogProps) {
  const isEditing = Boolean(player)
  const canEditValuation = scope === 'admin'

  const form = useForm<PlayerFormValues>({
    resolver: zodResolver(playerSchema),
    defaultValues: EMPTY_PLAYER,
  })

  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = form

  // Six zeroes are hard to count. Echoing the figure back as the app writes it
  // everywhere else turns "did I mean three or thirty million?" into a glance.
  //
  // useWatch rather than form.watch: the latter returns a fresh function every
  // render, which stops the React Compiler memoizing this component at all.
  const typedValue = useWatch({ control, name: 'estimatedMarketValue' })
  const estimatedValuePreview =
    typedValue && Number.isFinite(Number(typedValue))
      ? formatMarketValueExact(Number(typedValue))
      : null

  // The dialog stays mounted between openings, so the form is reset each time
  // rather than relying on defaultValues.
  useEffect(() => {
    if (!open) return

    reset(
      player
        ? {
            firstName: player.firstName,
            lastName: player.lastName,
            nickname: player.nickname ?? '',
            preferredPosition: player.preferredPosition,
            isGuest: player.isGuest,
            // Anything nullish is an empty box. Comparing against null alone
            // would render undefined as the text "undefined", which then fails
            // validation and blames the administrator for it.
            estimatedMarketValue:
              player.estimatedMarketValueGbp == null
                ? ''
                : String(player.estimatedMarketValueGbp),
          }
        : EMPTY_PLAYER,
    )
  }, [open, player, reset])

  async function submit(values: PlayerFormValues) {
    await onSubmit({
      firstName: values.firstName,
      lastName: values.lastName,
      nickname: values.nickname?.trim() ? values.nickname.trim() : null,
      preferredPosition: values.preferredPosition,
      isGuest: values.isGuest,
      estimatedMarketValueGbp:
        values.estimatedMarketValue === ''
          ? null
          : Number(values.estimatedMarketValue),
    })
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? 'Editar jugador' : 'Nuevo jugador'}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? `Código de importación: ${player?.playerCode}`
              : 'Se generará un código de importación automáticamente.'}
          </DialogDescription>
        </DialogHeader>

        <form
          id="player-form"
          onSubmit={handleSubmit(submit)}
          className="flex flex-col gap-4"
        >
          <Field data-invalid={Boolean(errors.firstName) || undefined}>
            <FieldLabel htmlFor="player-first-name">Nombre</FieldLabel>
            <Input
              id="player-first-name"
              aria-invalid={Boolean(errors.firstName)}
              {...register('firstName')}
            />
            {errors.firstName ? (
              <FieldError>{errors.firstName.message}</FieldError>
            ) : null}
          </Field>

          <Field data-invalid={Boolean(errors.lastName) || undefined}>
            <FieldLabel htmlFor="player-last-name">Apellidos</FieldLabel>
            <Input
              id="player-last-name"
              aria-invalid={Boolean(errors.lastName)}
              {...register('lastName')}
            />
            {errors.lastName ? (
              <FieldError>{errors.lastName.message}</FieldError>
            ) : null}
          </Field>

          <Field>
            <FieldLabel htmlFor="player-nickname">Apodo (opcional)</FieldLabel>
            <Input id="player-nickname" {...register('nickname')} />
          </Field>

          <Field data-invalid={Boolean(errors.preferredPosition) || undefined}>
            <FieldLabel htmlFor="player-position">
              Posición preferida
            </FieldLabel>
            {/* Radix's Select is controlled, so it binds through Controller
                rather than register(). */}
            <Controller
              control={control}
              name="preferredPosition"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger
                    id="player-position"
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

          {canEditValuation ? (
            <>
              <Field>
                <label className="flex items-center gap-2 text-sm font-medium">
                  <input
                    type="checkbox"
                    className="size-4 accent-primary"
                    {...register('isGuest')}
                  />
                  Jugador invitado
                </label>
                <FieldDescription>
                  Juega, puntúa y cuenta para el valor de los equipos, pero no
                  aparece en la Liga ni en las Estadísticas.
                </FieldDescription>
              </Field>

              <Field
                data-invalid={Boolean(errors.estimatedMarketValue) || undefined}
              >
                <FieldLabel htmlFor="player-estimated-value">
                  Aproximación de valor de mercado (opcional)
                </FieldLabel>
                {/* Text rather than number. A spinner stepping through seven
                    figures is no use, and a number input silently discards what
                    it considers malformed — including the moment a minus sign
                    stands alone — so the schema below would never see what was
                    actually typed. inputMode still asks for a numeric keypad. */}
                <Input
                  id="player-estimated-value"
                  type="text"
                  inputMode="decimal"
                  placeholder="3000000"
                  aria-invalid={Boolean(errors.estimatedMarketValue)}
                  {...register('estimatedMarketValue')}
                />
                {errors.estimatedMarketValue ? (
                  <FieldError>{errors.estimatedMarketValue.message}</FieldError>
                ) : (
                  <FieldDescription>
                    {estimatedValuePreview
                      ? `${estimatedValuePreview}. Solo se usa hasta que dispute su primer partido; después manda su rendimiento.`
                      : 'Sin indicar, un jugador sin partidos vale la media de la liga.'}
                  </FieldDescription>
                )}
              </Field>
            </>
          ) : null}
        </form>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Cancelar
          </Button>
          <Button type="submit" form="player-form" disabled={isSubmitting}>
            {isSubmitting ? (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            ) : null}
            {isEditing ? 'Guardar' : 'Crear jugador'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

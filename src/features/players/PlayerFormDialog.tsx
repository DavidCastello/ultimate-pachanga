import { useEffect } from 'react'
import { Controller, useForm } from 'react-hook-form'
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
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { formatPosition } from '@/lib/formatting'
import { PLAYER_POSITIONS, type PlayerCardData } from '@/types/domain'
import type { PlayerInput } from '@/features/players/api'

const playerSchema = z.object({
  firstName: z.string().trim().min(1, 'El nombre es obligatorio').max(60),
  lastName: z.string().trim().min(1, 'Los apellidos son obligatorios').max(80),
  // Empty means "no nickname", which the database stores as null.
  nickname: z.string().trim().max(40).optional(),
  preferredPosition: z.enum(PLAYER_POSITIONS, {
    message: 'Elige una posición',
  }),
})

type PlayerFormValues = z.infer<typeof playerSchema>

const EMPTY_PLAYER: PlayerFormValues = {
  firstName: '',
  lastName: '',
  nickname: '',
  preferredPosition: 'UT',
}

interface PlayerFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Absent when creating a new player. */
  player?: PlayerCardData
  onSubmit: (input: PlayerInput) => Promise<void>
}

export function PlayerFormDialog({
  open,
  onOpenChange,
  player,
  onSubmit,
}: PlayerFormDialogProps) {
  const isEditing = Boolean(player)

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

import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { formatMatchStatus } from '@/lib/formatting'
import type { MatchInput } from '@/features/matches/api'
import type { MatchRow, MatchStatus } from '@/types/domain'

/**
 * Statuses an administrator may set by hand. `scored` is deliberately absent:
 * it is set by a successful import, never chosen.
 */
const SELECTABLE_STATUSES = [
  'draft',
  'scheduled',
  'played',
  'cancelled',
] as const satisfies readonly MatchStatus[]

const matchSchema = z.object({
  title: z.string().trim().min(1, 'El título es obligatorio').max(120),
  location: z.string().trim().min(1, 'El lugar es obligatorio').max(160),
  // datetime-local gives "YYYY-MM-DDTHH:mm" with no zone.
  playedAt: z.string().min(1, 'La fecha es obligatoria'),
  homeTeamName: z.string().trim().min(1, 'Falta el equipo local').max(80),
  awayTeamName: z.string().trim().min(1, 'Falta el equipo visitante').max(80),
  status: z.enum(SELECTABLE_STATUSES),
})

type MatchFormValues = z.infer<typeof matchSchema>

/** Converts a stored timestamp into the value a datetime-local input wants. */
function toLocalInputValue(isoDate: string): string {
  const date = new Date(isoDate)
  const offsetMinutes = date.getTimezoneOffset()
  const local = new Date(date.getTime() - offsetMinutes * 60_000)
  return local.toISOString().slice(0, 16)
}

function defaultKickoff(): string {
  const date = new Date()
  date.setDate(date.getDate() + 7)
  date.setHours(20, 0, 0, 0)
  return toLocalInputValue(date.toISOString())
}

interface MatchFormProps {
  match?: MatchRow
  onSubmit: (input: MatchInput) => Promise<void>
  onCancel: () => void
  submitLabel: string
}

export function MatchForm({
  match,
  onSubmit,
  onCancel,
  submitLabel,
}: MatchFormProps) {
  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<MatchFormValues>({
    resolver: zodResolver(matchSchema),
    defaultValues: match
      ? {
          title: match.title,
          location: match.location,
          playedAt: toLocalInputValue(match.played_at),
          homeTeamName: match.home_team_name,
          awayTeamName: match.away_team_name,
          // A scored match keeps its status; the select simply cannot show it.
          status: (SELECTABLE_STATUSES as readonly string[]).includes(
            match.status,
          )
            ? (match.status as MatchFormValues['status'])
            : 'played',
        }
      : {
          title: '',
          location: '',
          playedAt: defaultKickoff(),
          homeTeamName: 'Los Cracks',
          awayTeamName: 'Los Pachangueros',
          status: 'scheduled',
        },
  })

  async function submit(values: MatchFormValues) {
    await onSubmit({
      title: values.title,
      location: values.location,
      // The input is local time; the column is timestamptz.
      playedAt: new Date(values.playedAt).toISOString(),
      homeTeamName: values.homeTeamName,
      awayTeamName: values.awayTeamName,
      status: values.status,
    })
  }

  return (
    <form onSubmit={handleSubmit(submit)} className="flex flex-col gap-4">
      <Field data-invalid={Boolean(errors.title) || undefined}>
        <FieldLabel htmlFor="match-title">Título</FieldLabel>
        <Input
          id="match-title"
          placeholder="Jornada 4"
          aria-invalid={Boolean(errors.title)}
          {...register('title')}
        />
        {errors.title ? <FieldError>{errors.title.message}</FieldError> : null}
      </Field>

      <Field data-invalid={Boolean(errors.location) || undefined}>
        <FieldLabel htmlFor="match-location">Lugar</FieldLabel>
        <Input
          id="match-location"
          placeholder="Polideportivo Roco"
          aria-invalid={Boolean(errors.location)}
          {...register('location')}
        />
        {errors.location ? (
          <FieldError>{errors.location.message}</FieldError>
        ) : null}
      </Field>

      <Field data-invalid={Boolean(errors.playedAt) || undefined}>
        <FieldLabel htmlFor="match-played-at">Fecha y hora</FieldLabel>
        <Input
          id="match-played-at"
          type="datetime-local"
          aria-invalid={Boolean(errors.playedAt)}
          {...register('playedAt')}
        />
        {errors.playedAt ? (
          <FieldError>{errors.playedAt.message}</FieldError>
        ) : null}
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field data-invalid={Boolean(errors.homeTeamName) || undefined}>
          <FieldLabel htmlFor="match-home">Equipo local</FieldLabel>
          <Input
            id="match-home"
            aria-invalid={Boolean(errors.homeTeamName)}
            {...register('homeTeamName')}
          />
          {errors.homeTeamName ? (
            <FieldError>{errors.homeTeamName.message}</FieldError>
          ) : null}
        </Field>

        <Field data-invalid={Boolean(errors.awayTeamName) || undefined}>
          <FieldLabel htmlFor="match-away">Equipo visitante</FieldLabel>
          <Input
            id="match-away"
            aria-invalid={Boolean(errors.awayTeamName)}
            {...register('awayTeamName')}
          />
          {errors.awayTeamName ? (
            <FieldError>{errors.awayTeamName.message}</FieldError>
          ) : null}
        </Field>
      </div>

      <Field>
        <FieldLabel htmlFor="match-status">Estado</FieldLabel>
        <Controller
          control={control}
          name="status"
          render={({ field }) => (
            <Select value={field.value} onValueChange={field.onChange}>
              <SelectTrigger
                id="match-status"
                className="w-full"
                onBlur={field.onBlur}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SELECTABLE_STATUSES.map((status) => (
                  <SelectItem key={status} value={status}>
                    {formatMatchStatus(status)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
      </Field>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancelar
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          ) : null}
          {submitLabel}
        </Button>
      </div>
    </form>
  )
}

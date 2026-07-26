import { useEffect, useRef, useState } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { ImagePlus, Loader2 } from 'lucide-react'
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
import {
  DEFAULT_SQUAD_SIZE,
  SQUAD_SIZES,
  type SquadSize,
} from '@/lib/formations'
import { formatMatchStatus } from '@/lib/formatting'
import { toImageExtension } from '@/lib/images'
import { getMatchPhotoUrl } from '@/lib/supabase'
import { getVenueImage } from '@/lib/venues'
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

function isSelectableStatus(
  status: MatchStatus,
): status is (typeof SELECTABLE_STATUSES)[number] {
  return (SELECTABLE_STATUSES as readonly MatchStatus[]).includes(status)
}

const matchSchema = z.object({
  title: z.string().trim().min(1, 'El título es obligatorio').max(120),
  location: z.string().trim().min(1, 'El lugar es obligatorio').max(160),
  // datetime-local gives "YYYY-MM-DDTHH:mm" with no zone.
  playedAt: z.string().min(1, 'La fecha es obligatoria'),
  homeTeamName: z.string().trim().min(1, 'Falta el equipo local').max(80),
  awayTeamName: z.string().trim().min(1, 'Falta el equipo visitante').max(80),
  status: z.enum(SELECTABLE_STATUSES),
  // The select hands back a number, so no coercion: the field only ever holds
  // one of the sizes the pitch can draw.
  playersPerTeam: z.literal(SQUAD_SIZES),
})

type MatchFormValues = z.infer<typeof matchSchema>

/** Converts a stored timestamp into the value a datetime-local input wants. */
function toLocalInputValue(isoDate: string): string {
  const date = new Date(isoDate)
  const offsetMinutes = date.getTimezoneOffset()
  const local = new Date(date.getTime() - offsetMinutes * 60_000)
  return local.toISOString().slice(0, 16)
}

/** A photograph chosen but not yet uploaded, with the URL that previews it. */
interface ChosenPhoto {
  file: File
  previewUrl: string
}

function defaultKickoff(): string {
  const date = new Date()
  date.setDate(date.getDate() + 7)
  date.setHours(20, 0, 0, 0)
  return toLocalInputValue(date.toISOString())
}

/**
 * What the form hands back.
 *
 * The photograph travels beside the match rather than inside it because it
 * cannot be written in the same statement: the object is stored under the
 * match's own id, which a new fixture does not have until it has been created.
 */
export interface MatchSubmission {
  match: MatchInput
  /** A newly chosen photograph, or null to keep whatever the match has. */
  photo: File | null
}

interface MatchFormProps {
  match?: MatchRow
  onSubmit: (submission: MatchSubmission) => Promise<void>
  onCancel: () => void
  submitLabel: string
}

export function MatchForm({
  match,
  onSubmit,
  onCancel,
  submitLabel,
}: MatchFormProps) {
  const [photo, setPhoto] = useState<ChosenPhoto | null>(null)
  const [photoError, setPhotoError] = useState<string | null>(null)
  const photoInputRef = useRef<HTMLInputElement>(null)

  // A status the select cannot offer is carried through the form untouched.
  // Without this, editing a scored match — to correct its title, or only to
  // attach a photograph — would save whatever the select happened to show and
  // drop the match out of every derived statistic, which all filter on
  // `status = 'scored'`.
  const preservedStatus =
    match && !isSelectableStatus(match.status) ? match.status : null

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
          // Only ever reaches the select. A status the select cannot show is
          // preserved separately and never comes from here.
          status: isSelectableStatus(match.status) ? match.status : 'played',
          playersPerTeam: match.players_per_team as SquadSize,
        }
      : {
          title: '',
          location: '',
          playedAt: defaultKickoff(),
          homeTeamName: 'Los Cracks',
          awayTeamName: 'Los Pachangueros',
          status: 'scheduled',
          playersPerTeam: DEFAULT_SQUAD_SIZE,
        },
  })

  // Releases the blob URL once its photograph has been replaced or the form
  // has gone.
  useEffect(() => {
    if (!photo) return

    return () => URL.revokeObjectURL(photo.previewUrl)
  }, [photo])

  // Subscribed through useWatch rather than watch(): the preview follows the
  // location as it is typed, and only this field re-renders.
  const location = useWatch({ control, name: 'location' })

  const playersPerTeam = useWatch({ control, name: 'playersPerTeam' })
  const isShrinking = match ? playersPerTeam < match.players_per_team : false

  // What the match would look like if it were saved now: the photograph just
  // chosen, else the one it already has, else the picture bundled for whatever
  // location is currently typed.
  const previewUrl =
    photo?.previewUrl ??
    getMatchPhotoUrl(match?.photo_path) ??
    getVenueImage(location)

  function handlePhotoSelected(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    // Reset so picking the same file twice still fires a change event.
    event.target.value = ''

    if (!file) return

    try {
      // The same rules the bucket enforces, so a rejection arrives here rather
      // than as a failed upload after the match has already been saved.
      toImageExtension(file)
    } catch (error) {
      setPhoto(null)
      setPhotoError(
        error instanceof Error ? error.message : 'No se pudo usar la imagen',
      )
      return
    }

    setPhotoError(null)
    setPhoto({ file, previewUrl: URL.createObjectURL(file) })
  }

  async function submit(values: MatchFormValues) {
    await onSubmit({
      match: {
        title: values.title,
        location: values.location,
        // The input is local time; the column is timestamptz.
        playedAt: new Date(values.playedAt).toISOString(),
        homeTeamName: values.homeTeamName,
        awayTeamName: values.awayTeamName,
        status: preservedStatus ?? values.status,
        playersPerTeam: values.playersPerTeam,
      },
      photo: photo?.file ?? null,
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

      <Field data-invalid={Boolean(photoError) || undefined}>
        <FieldLabel htmlFor="match-photo">Foto del partido</FieldLabel>
        <div className="flex items-center gap-3">
          <img
            src={previewUrl}
            alt=""
            className="h-16 w-28 shrink-0 rounded-md object-cover ring-1 ring-foreground/10"
            data-testid="match-form-photo-preview"
          />
          <div className="flex flex-col gap-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-fit"
              onClick={() => photoInputRef.current?.click()}
              data-testid="match-form-photo-button"
            >
              <ImagePlus className="size-4" aria-hidden="true" />
              {photo ? 'Elegir otra' : 'Cambiar foto'}
            </Button>
            <p className="text-xs text-muted-foreground">
              {photo
                ? photo.file.name
                : 'Sin foto propia se usa la del lugar. JPEG, PNG o WebP, hasta 3 MB.'}
            </p>
          </div>
        </div>
        <input
          id="match-photo"
          ref={photoInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="sr-only"
          onChange={handlePhotoSelected}
          data-testid="match-form-photo-input"
        />
        {photoError ? <FieldError>{photoError}</FieldError> : null}
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

      <Field data-invalid={Boolean(errors.playersPerTeam) || undefined}>
        <FieldLabel htmlFor="match-players-per-team">
          Jugadores por equipo
        </FieldLabel>
        <Controller
          control={control}
          name="playersPerTeam"
          render={({ field }) => (
            <Select
              value={String(field.value)}
              onValueChange={(value) => field.onChange(Number(value))}
            >
              <SelectTrigger
                id="match-players-per-team"
                className="w-full"
                onBlur={field.onBlur}
                data-testid="match-form-players-per-team"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SQUAD_SIZES.map((size) => (
                  <SelectItem
                    key={size}
                    value={String(size)}
                    data-testid={`match-form-players-per-team-${size}`}
                  >
                    {size}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
        {/* Said only when it is about to happen, and said before saving rather
            than discovered afterwards on the pitch. */}
        {isShrinking ? (
          <p
            className="text-xs text-muted-foreground"
            data-testid="match-form-shrink-warning"
          >
            Al reducir el equipo, quien se quede sin posición pasa al banquillo.
            Nadie sale de la convocatoria y la formación vuelve a la de{' '}
            {playersPerTeam} por equipo.
          </p>
        ) : null}
      </Field>

      {/* A preserved status gets a statement rather than a control: offering a
          dropdown that silently discards what you pick is worse than showing
          none. Re-importing the results is what changes a scored match. */}
      {preservedStatus ? (
        <Field>
          <FieldLabel htmlFor="match-status">Estado</FieldLabel>
          <p id="match-status" className="text-sm text-muted-foreground">
            {formatMatchStatus(preservedStatus)} — lo fija la importación de
            resultados, no este formulario.
          </p>
        </Field>
      ) : (
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
      )}

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

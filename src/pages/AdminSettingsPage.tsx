import { Controller, useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
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
import { Skeleton } from '@/components/ui/skeleton'
import {
  updateLeagueSettings,
  type LeagueSettingsInput,
} from '@/features/league/adminApi'
import { leagueKeys, useLeague } from '@/features/league/useLeague'
import { playerKeys } from '@/features/players/api'
import { formatMarketValueExact } from '@/lib/formatting'

const settingsSchema = z.object({
  title: z.string().trim().min(1, 'El título es obligatorio').max(120),
  status: z.enum(['active', 'inactive']),
  // Registered with valueAsNumber, so this receives a number rather than the
  // input's string. z.coerce would make the schema's input type `unknown`,
  // which no longer matches the form's own value type.
  marketConstantGbp: z
    .number({ message: 'Introduce un número' })
    .min(0, 'No puede ser negativo')
    .max(1_000_000_000, 'Demasiado grande'),
})

type SettingsValues = z.infer<typeof settingsSchema>

export function AdminSettingsPage() {
  const { data: league, isPending } = useLeague()
  const queryClient = useQueryClient()

  const save = useMutation({
    mutationFn: (input: LeagueSettingsInput) =>
      updateLeagueSettings(league!.id, input),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: leagueKeys.league }),
        // The market constant scales every valuation, so cards are stale too.
        queryClient.invalidateQueries({ queryKey: playerKeys.all }),
      ])
      toast.success('Ajustes guardados')
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : 'No se pudieron guardar',
      )
    },
  })

  if (isPending || !league) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-72 max-w-2xl rounded-xl" />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-2xl font-bold">Ajustes de la liga</h1>

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>
            <h2>Configuración</h2>
          </CardTitle>
          <CardDescription>
            El valor de mercado se recalcula al instante a partir de estos
            ajustes; no hay nada que volver a importar.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SettingsForm
            key={league.id}
            defaults={{
              title: league.title,
              status: league.status,
              marketConstantGbp: league.market_constant_gbp,
            }}
            onSubmit={(input) => save.mutateAsync(input)}
          />
        </CardContent>
      </Card>
    </div>
  )
}

function SettingsForm({
  defaults,
  onSubmit,
}: {
  defaults: SettingsValues
  onSubmit: (input: LeagueSettingsInput) => Promise<void>
}) {
  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<SettingsValues>({
    resolver: zodResolver(settingsSchema),
    defaultValues: defaults,
  })

  // useWatch rather than watch(): watch() returns a function the React
  // Compiler cannot memoize, which makes it skip the whole component.
  const constant = useWatch({ control, name: 'marketConstantGbp' })

  return (
    <form
      onSubmit={handleSubmit((values) =>
        onSubmit({
          title: values.title,
          status: values.status,
          marketConstantGbp: values.marketConstantGbp,
        }),
      )}
      className="flex flex-col gap-4"
    >
      <Field data-invalid={Boolean(errors.title) || undefined}>
        <FieldLabel htmlFor="league-title">Título</FieldLabel>
        <Input
          id="league-title"
          aria-invalid={Boolean(errors.title)}
          {...register('title')}
        />
        {errors.title ? <FieldError>{errors.title.message}</FieldError> : null}
      </Field>

      <Field>
        <FieldLabel htmlFor="league-status">Estado</FieldLabel>
        <Controller
          control={control}
          name="status"
          render={({ field }) => (
            <Select value={field.value} onValueChange={field.onChange}>
              <SelectTrigger
                id="league-status"
                className="w-full"
                onBlur={field.onBlur}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Activa</SelectItem>
                <SelectItem value="inactive">Inactiva</SelectItem>
              </SelectContent>
            </Select>
          )}
        />
        <FieldDescription>
          Una liga inactiva no admite partidos nuevos.
        </FieldDescription>
      </Field>

      <Field data-invalid={Boolean(errors.marketConstantGbp) || undefined}>
        <FieldLabel htmlFor="league-constant">Constante de mercado</FieldLabel>
        <Input
          id="league-constant"
          type="number"
          min={0}
          step={100000}
          aria-invalid={Boolean(errors.marketConstantGbp)}
          {...register('marketConstantGbp', { valueAsNumber: true })}
        />
        {errors.marketConstantGbp ? (
          <FieldError>{errors.marketConstantGbp.message}</FieldError>
        ) : (
          <FieldDescription>
            Multiplica la puntuación ponderada. Una puntuación de 8,25 valdría{' '}
            {formatMarketValueExact(Number(constant) * 8.25 || 0)}.
          </FieldDescription>
        )}
      </Field>

      <div className="flex justify-end">
        <Button type="submit" disabled={isSubmitting || !isDirty}>
          {isSubmitting ? (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          ) : null}
          Guardar ajustes
        </Button>
      </div>
    </form>
  )
}

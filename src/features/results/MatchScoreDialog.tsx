import { useMemo } from 'react'
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
  calculateScoreBreakdown,
  isGoalCountValid,
  isMetricScoreInRange,
} from '@/lib/scoring'
import { formatAttributePoints, formatScore } from '@/lib/formatting'
import { cn } from '@/lib/utils'
import type { ImportRow } from '@/features/matches/api'
import type { LeagueAttributeRow, LeagueMetricRow } from '@/types/domain'

/**
 * Scoring one player by hand.
 *
 * The CSV import is still how a whole match arrives; this is for the corrections
 * that follow it — a metric typed one column across, a goal nobody counted, an
 * MVP awarded in the car park. Both write through the same database function, so
 * neither can produce a score the other would reject.
 */

/** The three results a player can have. A draw is half a win. */
const VICTORY_OPTIONS = [
  { value: '1', label: 'Victoria' },
  { value: '0.5', label: 'Empate' },
  { value: '0', label: 'Derrota' },
] as const

type VictoryValue = (typeof VICTORY_OPTIONS)[number]['value']

/**
 * The option a stored victory share belongs to.
 *
 * The column accepts anything from 0 to 1 and the CSV import will write it, but
 * the league settles games as won, drawn or lost — so an unusual share is shown
 * as the closest of the three rather than leaving the field blank.
 */
function toVictoryOption(victory: number): VictoryValue {
  return VICTORY_OPTIONS.reduce((closest, option) =>
    Math.abs(Number(option.value) - victory) <
    Math.abs(Number(closest.value) - victory)
      ? option
      : closest,
  ).value
}

/**
 * A typed figure, or null when the field is blank or nonsense.
 *
 * Null rather than zero: a blank Ataque must read as "you have not filled this
 * in", never as "he was terrible". A comma is accepted because a Spanish
 * keyboard offers one.
 */
function parseNumber(value: string): number | null {
  const normalized = value.trim().replace(',', '.')
  if (normalized === '') return null

  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : null
}

/**
 * The form's own validation, mirroring what `import_match_scores` enforces.
 *
 * Every field is a string, because that is what an input holds; the numbers are
 * parsed once, on submit. Metrics are per-league reference data, so the rules
 * are built from the league's own metric list rather than hardcoded.
 */
function buildSchema(metrics: readonly LeagueMetricRow[]) {
  return z
    .object({
      metricScores: z.record(z.string(), z.string()),
      goals: z.string(),
      victory: z.enum(['1', '0.5', '0']),
      attributeCodes: z.array(z.string()),
    })
    .superRefine((values, context) => {
      for (const metric of metrics) {
        const score = parseNumber(values.metricScores[metric.code] ?? '')

        if (score === null) {
          context.addIssue({
            code: 'custom',
            path: ['metricScores', metric.code],
            message: `Indica ${metric.label}`,
          })
          continue
        }

        const definition = {
          code: metric.code,
          label: metric.label,
          minimumScore: metric.minimum_score,
          maximumScore: metric.maximum_score,
        }

        if (!isMetricScoreInRange(score, definition)) {
          context.addIssue({
            code: 'custom',
            path: ['metricScores', metric.code],
            message: `De ${formatScore(metric.minimum_score)} a ${formatScore(
              metric.maximum_score,
            )}`,
          })
        }
      }

      const goals = parseNumber(values.goals)

      if (goals === null || !isGoalCountValid(goals)) {
        context.addIssue({
          code: 'custom',
          path: ['goals'],
          message: 'Un número entero, 0 o más',
        })
      }
    })
}

type ScoreFormValues = z.infer<ReturnType<typeof buildSchema>>

export interface ScoreTarget {
  playerCode: string
  displayName: string
  /** Absent when this player has not been scored in this match yet. */
  existing?: {
    metricScores: Record<string, number>
    goals: number
    victory: number
    attributeCodes: string[]
  }
}

interface MatchScoreDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  target: ScoreTarget | null
  metrics: readonly LeagueMetricRow[]
  attributes: readonly LeagueAttributeRow[]
  onSubmit: (row: ImportRow) => Promise<void>
}

export function MatchScoreDialog({
  open,
  onOpenChange,
  target,
  ...bodyProps
}: MatchScoreDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-lg">
        {/* Mounted only while open, so each edit starts from the player's
            current figures without an effect that resets the form. */}
        {open && target ? (
          <ScoreDialogBody
            onOpenChange={onOpenChange}
            target={target}
            {...bodyProps}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

type ScoreDialogBodyProps = Omit<MatchScoreDialogProps, 'open' | 'target'> & {
  target: ScoreTarget
}

function ScoreDialogBody({
  onOpenChange,
  target,
  metrics,
  attributes,
  onSubmit,
}: ScoreDialogBodyProps) {
  const schema = useMemo(() => buildSchema(metrics), [metrics])

  const form = useForm<ScoreFormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      metricScores: Object.fromEntries(
        metrics.map((metric) => {
          const score = target.existing?.metricScores[metric.code]
          return [metric.code, score === undefined ? '' : String(score)]
        }),
      ),
      goals: String(target.existing?.goals ?? 0),
      victory: toVictoryOption(target.existing?.victory ?? 0),
      attributeCodes: target.existing?.attributeCodes ?? [],
    },
  })

  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = form

  // useWatch rather than watch(): watch() returns a function the React compiler
  // cannot memoize, and it would opt this whole component out.
  const values = useWatch({ control })

  /** The same arithmetic the database will apply, shown before it is saved. */
  const breakdown = calculateScoreBreakdown(
    metrics.map(
      (metric) => parseNumber(values.metricScores?.[metric.code] ?? '') ?? 0,
    ),
    attributes.filter((attribute) =>
      (values.attributeCodes ?? []).includes(attribute.code),
    ),
    Number(values.victory ?? '0'),
  )

  async function submit(submitted: ScoreFormValues) {
    await onSubmit({
      player_code: target.playerCode,
      metric_scores: Object.fromEntries(
        metrics.map((metric) => [
          metric.code,
          parseNumber(submitted.metricScores[metric.code] ?? '') ?? 0,
        ]),
      ),
      attribute_codes: submitted.attributeCodes,
      goals: parseNumber(submitted.goals) ?? 0,
      victory: Number(submitted.victory),
    })
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{target.displayName}</DialogTitle>
        <DialogDescription>
          {target.existing
            ? 'Corrige la puntuación de este partido. Se guarda en la base de datos al instante.'
            : 'Puntúa a este jugador en este partido. Se guarda en la base de datos al instante.'}
        </DialogDescription>
      </DialogHeader>

      {/* noValidate so the form's own messages win. The min, max and step
          attributes below still shape the steppers and the mobile keypad, but
          left to itself the browser would block submission with a bubble in
          whatever language it was installed in. */}
      <form
        id="match-score-form"
        noValidate
        onSubmit={handleSubmit(submit)}
        className="flex flex-col gap-4"
      >
        <div className="grid grid-cols-2 gap-3">
          {metrics.map((metric) => {
            const error = errors.metricScores?.[metric.code]

            return (
              <Field
                key={metric.code}
                data-invalid={Boolean(error) || undefined}
              >
                <FieldLabel htmlFor={`score-${metric.code}`}>
                  {metric.label}
                </FieldLabel>
                <Input
                  id={`score-${metric.code}`}
                  data-testid={`score-metric-${metric.code}`}
                  type="number"
                  inputMode="decimal"
                  step="0.5"
                  min={metric.minimum_score}
                  max={metric.maximum_score}
                  aria-invalid={Boolean(error)}
                  {...register(`metricScores.${metric.code}`)}
                />
                {error ? <FieldError>{error.message}</FieldError> : null}
              </Field>
            )
          })}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field data-invalid={Boolean(errors.goals) || undefined}>
            <FieldLabel htmlFor="score-goals">Goles</FieldLabel>
            <Input
              id="score-goals"
              data-testid="score-goals"
              type="number"
              inputMode="numeric"
              step="1"
              min={0}
              aria-invalid={Boolean(errors.goals)}
              {...register('goals')}
            />
            {errors.goals ? (
              <FieldError>{errors.goals.message}</FieldError>
            ) : null}
          </Field>

          <Field>
            <FieldLabel htmlFor="score-victory">Resultado</FieldLabel>
            {/* Radix's Select is controlled, so it binds through Controller. */}
            <Controller
              control={control}
              name="victory"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger
                    id="score-victory"
                    className="w-full"
                    data-testid="score-victory"
                    onBlur={field.onBlur}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {VICTORY_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </Field>
        </div>

        <Field>
          <FieldLabel>Atributos</FieldLabel>
          <Controller
            control={control}
            name="attributeCodes"
            render={({ field }) => (
              <div className="flex flex-wrap gap-2">
                {attributes.map((attribute) => {
                  const isAwarded = field.value.includes(attribute.code)
                  const isPenalty = attribute.points < 0

                  return (
                    <button
                      key={attribute.code}
                      type="button"
                      aria-pressed={isAwarded}
                      data-testid={`score-attribute-${attribute.code}`}
                      onClick={() =>
                        field.onChange(
                          isAwarded
                            ? field.value.filter(
                                (code) => code !== attribute.code,
                              )
                            : [...field.value, attribute.code],
                        )
                      }
                      className={cn(
                        'flex items-center gap-1 rounded-4xl border px-2.5 py-1 text-xs font-medium transition-colors',
                        isAwarded
                          ? isPenalty
                            ? 'border-attribute-negative bg-attribute-negative/15 text-attribute-negative'
                            : 'border-attribute-positive bg-attribute-positive/15 text-attribute-positive'
                          : 'border-border text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                      )}
                    >
                      {attribute.label}
                      <span className="numeric opacity-70">
                        {formatAttributePoints(attribute.points)}
                      </span>
                    </button>
                  )
                })}
              </div>
            )}
          />
        </Field>

        {/* The arithmetic, live: an administrator correcting a score is usually
            aiming at a total, and the database's answer should not be a
            surprise. */}
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 rounded-lg border p-3 text-sm">
          <dt className="text-muted-foreground">Base (métricas)</dt>
          <dd className="numeric text-right font-medium">
            {formatScore(breakdown.baseScore)}
          </dd>
          <dt className="text-muted-foreground">Atributos</dt>
          <dd className="numeric text-right font-medium">
            {formatAttributePoints(breakdown.attributePoints)}
          </dd>
          <dt className="text-muted-foreground">Victoria</dt>
          <dd className="numeric text-right font-medium">
            {formatAttributePoints(breakdown.victoryPoints)}
          </dd>
          <dt className="font-semibold">Puntuación final</dt>
          <dd
            className="numeric text-right font-bold"
            data-testid="score-final-preview"
          >
            {formatScore(breakdown.finalScore)}
          </dd>
        </dl>
      </form>

      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          onClick={() => onOpenChange(false)}
        >
          Cancelar
        </Button>
        <Button
          type="submit"
          form="match-score-form"
          disabled={isSubmitting}
          data-testid="score-submit"
        >
          {isSubmitting ? (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          ) : null}
          Guardar puntuación
        </Button>
      </DialogFooter>
    </>
  )
}

import { AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toErrorDetail } from '@/lib/errors'
import { cn } from '@/lib/utils'

interface ErrorStateProps {
  title?: string
  error: unknown
  onRetry?: () => void
  className?: string
}

/**
 * Shown when a read fails.
 *
 * The counterpart to EmptyState, and the reason it exists: a failed query has
 * `data === undefined`, so a page that only checks `isPending` renders the same
 * "nothing here yet" as a genuinely empty league. That turned a match whose
 * status had been changed into "the league has no statistics", which is the one
 * thing a diagnosis must not do — it hides the fault and points at the data.
 *
 * The detail is shown verbatim — see `toErrorDetail`.
 */
export function ErrorState({
  title = 'No se pudieron cargar los datos',
  error,
  onRetry,
  className,
}: ErrorStateProps) {
  const detail = toErrorDetail(error)

  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-destructive/50 px-6 py-14 text-center',
        className,
      )}
    >
      <AlertTriangle className="size-8 text-destructive" aria-hidden="true" />
      <div className="space-y-1">
        <p className="font-heading text-2xl leading-none font-semibold uppercase">
          {title}
        </p>
        <p className="body-copy max-w-prose text-muted-foreground">
          La conexión no ha respondido como esperábamos. Puedes intentarlo de
          nuevo sin perder nada.
        </p>
        <details className="mt-3 max-w-prose text-left">
          <summary className="cursor-pointer text-xs text-muted-foreground">
            Ver detalles técnicos
          </summary>
          <p className="mt-2 font-mono text-xs break-words text-muted-foreground">
            {detail}
          </p>
        </details>
      </div>
      {onRetry ? (
        <Button variant="outline" size="sm" onClick={onRetry}>
          Reintentar
        </Button>
      ) : null}
    </div>
  )
}

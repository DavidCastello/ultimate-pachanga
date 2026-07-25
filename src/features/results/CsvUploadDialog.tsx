import { useRef, useState } from 'react'
import { Loader2, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { CsvValidationPreview } from '@/features/results/CsvValidationPreview'
import { parseScoreCsv, type ParseContext, type ParseResult } from '@/lib/csv'
import type { ImportRow } from '@/features/matches/api'
import type { LeagueAttributeRow, LeagueMetricRow } from '@/types/domain'

interface CsvUploadDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  context: ParseContext
  metrics: readonly LeagueMetricRow[]
  attributes: readonly LeagueAttributeRow[]
  /** True when this match already has results, so this would be a correction. */
  isReimport: boolean
  onImport: (rows: ImportRow[]) => Promise<void>
}

/**
 * Upload, validate, preview, import.
 *
 * The import button stays disabled until the file parses cleanly. The database
 * would reject a bad batch anyway, but showing every problem here means the
 * administrator fixes the spreadsheet once instead of discovering one error per
 * attempt.
 */
export function CsvUploadDialog({
  open,
  onOpenChange,
  ...bodyProps
}: CsvUploadDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-4xl">
        {/* Mounted only while open, so each upload starts from a clean slate
            without an effect that resets state. */}
        {open ? (
          <UploadDialogBody onOpenChange={onOpenChange} {...bodyProps} />
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

type UploadDialogBodyProps = Omit<CsvUploadDialogProps, 'open'>

function UploadDialogBody({
  onOpenChange,
  context,
  metrics,
  attributes,
  isReimport,
  onImport,
}: UploadDialogBodyProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [filename, setFilename] = useState<string>()
  const [result, setResult] = useState<ParseResult>()
  const [isImporting, setIsImporting] = useState(false)
  const [readError, setReadError] = useState<string>()

  async function handleFileSelected(
    event: React.ChangeEvent<HTMLInputElement>,
  ) {
    const file = event.target.files?.[0]
    // Reset so re-picking the same file after an edit still fires a change.
    event.target.value = ''
    if (!file) return

    setFilename(file.name)
    setReadError(undefined)

    try {
      const content = await file.text()
      setResult(parseScoreCsv(content, context))
    } catch (error) {
      setResult(undefined)
      setReadError(
        error instanceof Error ? error.message : 'No se pudo leer el archivo',
      )
    }
  }

  const canImport =
    result !== undefined &&
    result.rows.length > 0 &&
    result.problems.length === 0 &&
    result.fileProblems.length === 0

  async function handleImport() {
    if (!result || !canImport) return

    setIsImporting(true)
    try {
      await onImport(
        result.rows.map((row) => ({
          player_code: row.playerCode,
          metric_scores: row.metricScores,
          attribute_codes: row.attributeCodes,
        })),
      )
      onOpenChange(false)
    } finally {
      setIsImporting(false)
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>
          {isReimport ? 'Corregir resultados' : 'Subir resultados'}
        </DialogTitle>
        <DialogDescription>
          {isReimport
            ? 'Este partido ya tiene resultados. Al importar de nuevo se ' +
              'sustituyen las puntuaciones y los atributos de los jugadores ' +
              'incluidos en el archivo.'
            : 'Sube el CSV de la plantilla con las puntuaciones rellenadas.'}
        </DialogDescription>
      </DialogHeader>

      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="size-4" aria-hidden="true" />
            Elegir archivo
          </Button>
          <span className="truncate text-sm text-muted-foreground">
            {filename ?? 'Ningún archivo seleccionado'}
          </span>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={handleFileSelected}
          />
        </div>

        {readError ? (
          <p role="alert" className="text-sm text-destructive">
            {readError}
          </p>
        ) : null}

        {result ? (
          <CsvValidationPreview
            result={result}
            metrics={metrics}
            attributes={attributes}
          />
        ) : null}
      </div>

      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          onClick={() => onOpenChange(false)}
        >
          Cancelar
        </Button>
        <Button
          type="button"
          onClick={handleImport}
          disabled={!canImport || isImporting}
        >
          {isImporting ? (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          ) : null}
          {isReimport ? 'Confirmar corrección' : 'Importar resultados'}
        </Button>
      </DialogFooter>
    </>
  )
}

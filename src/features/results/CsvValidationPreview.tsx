import { AlertTriangle, CheckCircle2 } from 'lucide-react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { AttributeBadge } from '@/components/AttributeBadge'
import { formatAttributePoints, formatScore } from '@/lib/formatting'
import type { ParseResult } from '@/lib/csv'
import type { LeagueAttributeRow, LeagueMetricRow } from '@/types/domain'

interface CsvValidationPreviewProps {
  result: ParseResult
  metrics: readonly LeagueMetricRow[]
  attributes: readonly LeagueAttributeRow[]
}

/**
 * Shows what an import would do before it happens: the computed scores, and
 * every problem found, with the row number so the administrator can go and fix
 * the right line of the spreadsheet.
 */
export function CsvValidationPreview({
  result,
  metrics,
  attributes,
}: CsvValidationPreviewProps) {
  const { rows, problems, fileProblems } = result
  const hasProblems = problems.length > 0 || fileProblems.length > 0

  function pointsFor(code: string): number {
    return attributes.find((attribute) => attribute.code === code)?.points ?? 0
  }

  return (
    <div className="flex flex-col gap-4">
      {fileProblems.length > 0 ? (
        <div
          role="alert"
          className="flex flex-col gap-1 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm"
        >
          <p className="flex items-center gap-2 font-semibold">
            <AlertTriangle className="size-4 shrink-0" aria-hidden="true" />
            El archivo no se puede importar
          </p>
          <ul className="list-disc pl-6">
            {fileProblems.map((problem) => (
              <li key={problem}>{problem}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {problems.length > 0 ? (
        <div
          role="alert"
          className="flex flex-col gap-1 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm"
        >
          <p className="flex items-center gap-2 font-semibold">
            <AlertTriangle className="size-4 shrink-0" aria-hidden="true" />
            {problems.length} {problems.length === 1 ? 'error' : 'errores'} en
            el archivo
          </p>
          <ul className="list-disc pl-6">
            {problems.map((problem, index) => (
              <li key={`${problem.rowNumber}-${index}`}>
                Fila {problem.rowNumber}
                {problem.playerCode ? ` (${problem.playerCode})` : ''}:{' '}
                {problem.message}
              </li>
            ))}
          </ul>
          <p className="mt-1">
            Corrige el archivo y vuelve a subirlo. No se importará nada hasta
            que no haya errores.
          </p>
        </div>
      ) : null}

      {rows.length > 0 ? (
        <>
          {!hasProblems ? (
            <p className="flex items-center gap-2 text-sm font-medium text-attribute-positive">
              <CheckCircle2 className="size-4 shrink-0" aria-hidden="true" />
              {rows.length}{' '}
              {rows.length === 1 ? 'jugador listo' : 'jugadores listos'} para
              importar
            </p>
          ) : null}

          <div className="max-h-80 overflow-auto rounded-lg border">
            <Table>
              <TableHeader className="sticky top-0 bg-muted/50">
                <TableRow>
                  <TableHead>Jugador</TableHead>
                  {metrics.map((metric) => (
                    <TableHead key={metric.code} className="text-right">
                      {metric.label}
                    </TableHead>
                  ))}
                  <TableHead className="text-right">Goles</TableHead>
                  <TableHead className="text-right">Victoria</TableHead>
                  <TableHead className="text-right">Base</TableHead>
                  <TableHead>Atributos</TableHead>
                  <TableHead className="text-right">Final</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.playerCode}>
                    <TableCell className="font-medium">
                      {row.playerName}
                      <span className="numeric block text-xs text-muted-foreground">
                        {row.playerCode}
                      </span>
                    </TableCell>
                    {metrics.map((metric) => (
                      <TableCell
                        key={metric.code}
                        className="numeric text-right"
                      >
                        {formatScore(row.metricScores[metric.code] ?? null)}
                      </TableCell>
                    ))}
                    <TableCell className="numeric text-right">
                      {row.goals}
                    </TableCell>
                    <TableCell className="numeric text-right">
                      {formatScore(row.victory)}
                      <span className="ml-1 text-xs text-muted-foreground">
                        ({formatAttributePoints(row.victoryPoints)})
                      </span>
                    </TableCell>
                    <TableCell className="numeric text-right">
                      {formatScore(row.baseScore)}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {row.attributeCodes.map((code, index) => (
                          // The one place points belong on a chip: this
                          // screen exists so an administrator can check the
                          // arithmetic before committing to it.
                          <AttributeBadge
                            key={code}
                            label={row.attributeLabels[index]}
                            points={pointsFor(code)}
                            showPoints
                          />
                        ))}
                        {row.attributePoints !== 0 ? (
                          <span className="numeric self-center text-xs text-muted-foreground">
                            ({formatAttributePoints(row.attributePoints)})
                          </span>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell className="numeric text-right font-bold">
                      {formatScore(row.finalScore)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      ) : null}
    </div>
  )
}

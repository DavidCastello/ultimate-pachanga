import Papa from 'papaparse'
import { calculateBaseScore } from '@/lib/scoring'
import type { LeagueAttributeRow, LeagueMetricRow } from '@/types/domain'

/**
 * CSV template generation and result parsing.
 *
 * The workflow is deliberately spreadsheet-shaped: an administrator downloads a
 * template with the convocated squad already filled in, types scores on a
 * phone or laptop after the match, and uploads it. So this module has to be
 * forgiving about how spreadsheets mangle text, and strict about anything that
 * would corrupt a result.
 */

/** Fixed leading columns of the template, in order. */
export const CSV_PLAYER_CODE_HEADER = 'CodigoJugador'
export const CSV_FIRST_NAME_HEADER = 'Nombre'
export const CSV_LAST_NAME_HEADER = 'Apellidos'
export const CSV_ATTRIBUTES_HEADER = 'Atributos'

/** Separates several attributes in one cell, e.g. `MVP|Puskas`. */
export const ATTRIBUTE_SEPARATOR = '|'

/**
 * Folds a heading or attribute name to a comparison key.
 *
 * Accents are stripped because the spec's own example header reads
 * `Tactica,Fisico` while the metric labels are `Táctica,Físico` — and because
 * anyone typing on a phone keyboard will produce both. Case and surrounding
 * whitespace go the same way.
 */
export function normalizeKey(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
}

/**
 * Resolves a heading to a league metric by label, then by code.
 *
 * Matching on the code as well means a template edited by someone who replaced
 * the Spanish headings with the internal codes still imports.
 */
function findMetricForHeader(
  header: string,
  metrics: readonly LeagueMetricRow[],
): LeagueMetricRow | undefined {
  const key = normalizeKey(header)
  return metrics.find(
    (metric) =>
      normalizeKey(metric.label) === key || normalizeKey(metric.code) === key,
  )
}

function findAttributeByName(
  name: string,
  attributes: readonly LeagueAttributeRow[],
): LeagueAttributeRow | undefined {
  const key = normalizeKey(name)
  return attributes.find(
    (attribute) =>
      normalizeKey(attribute.label) === key ||
      normalizeKey(attribute.code) === key,
  )
}

export interface TemplatePlayer {
  playerCode: string
  firstName: string
  lastName: string
}

/**
 * Builds the score template for a match: one row per convocated player, with
 * the metric and attribute columns left blank.
 *
 * Prefixed with a UTF-8 byte order mark. Without it Excel on Windows reads the
 * file as the local codepage and turns "Castelló" into "CastellÃ³" — and those
 * mangled names come straight back on upload.
 */
export function buildScoreTemplate(
  players: readonly TemplatePlayer[],
  metrics: readonly LeagueMetricRow[],
): string {
  const headers = [
    CSV_PLAYER_CODE_HEADER,
    CSV_FIRST_NAME_HEADER,
    CSV_LAST_NAME_HEADER,
    ...metrics.map((metric) => metric.label),
    CSV_ATTRIBUTES_HEADER,
  ]

  const rows = players.map((player) => [
    player.playerCode,
    player.firstName,
    player.lastName,
    ...metrics.map(() => ''),
    '',
  ])

  return '﻿' + Papa.unparse([headers, ...rows], { newline: '\r\n' })
}

/** A row that passed validation and is ready for the import RPC. */
export interface ParsedScoreRow {
  playerCode: string
  playerName: string
  metricScores: Record<string, number>
  attributeCodes: string[]
  attributeLabels: string[]
  baseScore: number
  attributePoints: number
  finalScore: number
}

export interface RowProblem {
  /** 1-based row number as it appears in the spreadsheet, header excluded. */
  rowNumber: number
  playerCode: string | null
  message: string
}

export interface ParseResult {
  rows: ParsedScoreRow[]
  problems: RowProblem[]
  /** Problems with the file as a whole: missing columns, no data, bad shape. */
  fileProblems: string[]
}

export interface ParseContext {
  metrics: readonly LeagueMetricRow[]
  attributes: readonly LeagueAttributeRow[]
  /** Players convocated for this match, keyed by code. */
  squad: ReadonlyMap<string, { displayName: string }>
}

/**
 * Reads a score value.
 *
 * Accepts a decimal comma as well as a point, because a Spanish locale
 * spreadsheet writes 7,5 and rejecting that would be pointless pedantry.
 */
function parseScore(raw: string): number | null {
  const cleaned = raw.trim().replace(',', '.')
  if (cleaned === '') return null

  const value = Number(cleaned)
  return Number.isFinite(value) ? value : null
}

/**
 * Parses and fully validates an uploaded results file.
 *
 * Everything checked here is checked again by `import_match_scores`; this pass
 * exists to show the administrator a preview and point at the offending cell
 * instead of surfacing one database error at a time.
 */
export function parseScoreCsv(
  content: string,
  context: ParseContext,
): ParseResult {
  const { metrics, attributes, squad } = context
  const fileProblems: string[] = []
  const problems: RowProblem[] = []
  const rows: ParsedScoreRow[] = []

  const parsed = Papa.parse<Record<string, string>>(content, {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: (header) => header.trim(),
  })

  if (parsed.errors.length > 0) {
    // Papa reports per-row parse trouble; surface the first few rather than a
    // wall of noise.
    for (const error of parsed.errors.slice(0, 3)) {
      fileProblems.push(`No se pudo leer el archivo: ${error.message}`)
    }
  }

  const headers = parsed.meta.fields ?? []

  const codeHeader = headers.find(
    (header) => normalizeKey(header) === normalizeKey(CSV_PLAYER_CODE_HEADER),
  )
  if (!codeHeader) {
    fileProblems.push(`Falta la columna «${CSV_PLAYER_CODE_HEADER}»`)
  }

  // Map each active metric to the heading that represents it, so a missing
  // column is reported once for the file rather than once per row.
  const metricHeaders = new Map<string, string>()
  for (const metric of metrics) {
    const header = headers.find(
      (candidate) =>
        findMetricForHeader(candidate, metrics)?.code === metric.code,
    )
    if (header) {
      metricHeaders.set(metric.code, header)
    } else {
      fileProblems.push(`Falta la columna de «${metric.label}»`)
    }
  }

  const attributesHeader = headers.find(
    (header) => normalizeKey(header) === normalizeKey(CSV_ATTRIBUTES_HEADER),
  )

  if (parsed.data.length === 0) {
    fileProblems.push('El archivo no contiene ninguna fila de datos')
  }

  if (fileProblems.length > 0) {
    return { rows: [], problems: [], fileProblems }
  }

  const seenCodes = new Set<string>()

  parsed.data.forEach((record, index) => {
    const rowNumber = index + 1
    const playerCode = (record[codeHeader!] ?? '').trim().toUpperCase()

    function addProblem(message: string) {
      problems.push({ rowNumber, playerCode: playerCode || null, message })
    }

    if (!playerCode) {
      addProblem('Falta el código del jugador')
      return
    }

    const squadMember = squad.get(playerCode)
    if (!squadMember) {
      addProblem(`El jugador ${playerCode} no está convocado para este partido`)
      return
    }

    if (seenCodes.has(playerCode)) {
      addProblem(`El jugador ${playerCode} aparece más de una vez`)
      return
    }
    seenCodes.add(playerCode)

    // --- metrics ---
    const metricScores: Record<string, number> = {}
    let hasMetricProblem = false

    for (const metric of metrics) {
      const header = metricHeaders.get(metric.code)!
      const value = parseScore(record[header] ?? '')

      if (value === null) {
        addProblem(`«${metric.label}» está vacío o no es un número`)
        hasMetricProblem = true
        continue
      }

      if (value < metric.minimum_score || value > metric.maximum_score) {
        addProblem(
          `«${metric.label}» es ${value}; debe estar entre ` +
            `${metric.minimum_score} y ${metric.maximum_score}`,
        )
        hasMetricProblem = true
        continue
      }

      metricScores[metric.code] = value
    }

    // --- attributes ---
    const attributeCodes: string[] = []
    const attributeLabels: string[] = []
    let hasAttributeProblem = false

    const rawAttributes = attributesHeader
      ? (record[attributesHeader] ?? '')
      : ''

    const attributeNames = rawAttributes
      .split(ATTRIBUTE_SEPARATOR)
      .map((name) => name.trim())
      .filter((name) => name !== '')

    for (const name of attributeNames) {
      const attribute = findAttributeByName(name, attributes)

      if (!attribute) {
        addProblem(`«${name}» no es un atributo de esta liga`)
        hasAttributeProblem = true
        continue
      }

      if (attributeCodes.includes(attribute.code)) {
        addProblem(`«${attribute.label}» está repetido`)
        hasAttributeProblem = true
        continue
      }

      attributeCodes.push(attribute.code)
      attributeLabels.push(attribute.label)
    }

    if (hasMetricProblem || hasAttributeProblem) return

    const awarded = attributeCodes.map((code) =>
      attributes.find((attribute) => attribute.code === code)!,
    )
    const attributePoints = awarded.reduce(
      (sum, attribute) => sum + attribute.points,
      0,
    )
    const baseScore = calculateBaseScore(Object.values(metricScores))

    rows.push({
      playerCode,
      playerName: squadMember.displayName,
      metricScores,
      attributeCodes,
      attributeLabels,
      baseScore,
      attributePoints,
      finalScore: baseScore + attributePoints,
    })
  })

  // Anyone convocated but absent from the file is worth flagging: a partial
  // upload is far more likely to be an accident than a decision.
  const missing = [...squad.keys()].filter((code) => !seenCodes.has(code))
  if (missing.length > 0 && problems.length === 0) {
    fileProblems.push(
      `Faltan ${missing.length} jugadores convocados en el archivo: ` +
        missing.join(', '),
    )
  }

  return { rows, problems, fileProblems }
}

/** Triggers a browser download of generated CSV text. */
export function downloadCsv(filename: string, content: string): void {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)

  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()

  URL.revokeObjectURL(url)
}

/** A filesystem-safe filename for a match's template. */
export function toTemplateFilename(matchTitle: string): string {
  const slug = matchTitle
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()

  return `resultados-${slug || 'partido'}.csv`
}

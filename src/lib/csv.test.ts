import { describe, expect, it } from 'vitest'
import {
  buildScoreTemplate,
  normalizeKey,
  parseScoreCsv,
  toTemplateFilename,
  type ParseContext,
} from './csv'
import { TEST_METRICS } from '@/test/factories'
import type { LeagueAttributeRow } from '@/types/domain'

const ATTRIBUTES: LeagueAttributeRow[] = [
  {
    id: 'a1',
    league_id: 'l',
    code: 'mvp',
    label: 'MVP',
    points: 2,
    is_active: true,
  },
  {
    id: 'a2',
    league_id: 'l',
    code: 'revelation',
    label: 'Jugador revelación',
    points: 2,
    is_active: true,
  },
  {
    id: 'a3',
    league_id: 'l',
    code: 'zamora',
    label: 'Zamora',
    points: 2,
    is_active: true,
  },
  {
    id: 'a4',
    league_id: 'l',
    code: 'puskas',
    label: 'Puskas',
    points: 2,
    is_active: true,
  },
  {
    id: 'a5',
    league_id: 'l',
    code: 'injury',
    label: 'Lesión',
    points: -2,
    is_active: true,
  },
]

const SQUAD = new Map([
  ['PLR-A7K2', { displayName: 'David Castelló' }],
  ['PLR-B9F1', { displayName: 'Juanito' }],
])

const CONTEXT: ParseContext = {
  metrics: TEST_METRICS,
  attributes: ATTRIBUTES,
  squad: SQUAD,
}

/** The spec's header spelling, without accents. */
const HEADER =
  'CodigoJugador,Nombre,Apellidos,Ataque,Defensa,Tactica,Fisico,Atributos'

function csv(...rows: string[]): string {
  return [HEADER, ...rows].join('\n')
}

describe('normalizeKey', () => {
  it('strips accents so Tactica matches Táctica', () => {
    expect(normalizeKey('Táctica')).toBe(normalizeKey('Tactica'))
    expect(normalizeKey('Físico')).toBe(normalizeKey('Fisico'))
  })

  it('ignores case and surrounding whitespace', () => {
    expect(normalizeKey('  ATAQUE ')).toBe('ataque')
  })
})

describe('buildScoreTemplate', () => {
  const players = [
    { playerCode: 'PLR-A7K2', firstName: 'David', lastName: 'Castelló' },
    { playerCode: 'PLR-B9F1', firstName: 'Juan', lastName: 'García' },
  ]

  it('writes the specified header', () => {
    const template = buildScoreTemplate(players, TEST_METRICS)
    const [header] = template.replace('﻿', '').split('\r\n')

    expect(header).toBe(
      'CodigoJugador,Nombre,Apellidos,Ataque,Defensa,Táctica,Físico,Atributos',
    )
  })

  it('includes one blank row per convocated player', () => {
    const template = buildScoreTemplate(players, TEST_METRICS)
    const lines = template.replace('﻿', '').split('\r\n')

    expect(lines).toHaveLength(3)
    expect(lines[1]).toBe('PLR-A7K2,David,Castelló,,,,,')
    expect(lines[2]).toBe('PLR-B9F1,Juan,García,,,,,')
  })

  // Without the BOM, Excel on Windows renders "Castelló" as "CastellÃ³" and
  // hands the mangled text back on upload.
  it('starts with a UTF-8 byte order mark', () => {
    expect(buildScoreTemplate(players, TEST_METRICS).startsWith('﻿')).toBe(true)
  })

  it('adapts to the league metrics rather than hardcoding four', () => {
    const template = buildScoreTemplate(players, TEST_METRICS.slice(0, 2))
    const [header] = template.replace('﻿', '').split('\r\n')

    expect(header).toBe(
      'CodigoJugador,Nombre,Apellidos,Ataque,Defensa,Atributos',
    )
  })
})

describe('parseScoreCsv', () => {
  it('parses a complete file and computes the scores', () => {
    const result = parseScoreCsv(
      csv(
        'PLR-A7K2,David,Castelló,6,9,8,7,Zamora',
        'PLR-B9F1,Juan,García,2,8,7,6,',
      ),
      CONTEXT,
    )

    expect(result.fileProblems).toEqual([])
    expect(result.problems).toEqual([])
    expect(result.rows).toHaveLength(2)

    // The specification's worked example.
    expect(result.rows[0]).toMatchObject({
      playerCode: 'PLR-A7K2',
      playerName: 'David Castelló',
      baseScore: 7.5,
      attributePoints: 2,
      finalScore: 9.5,
      attributeCodes: ['zamora'],
      attributeLabels: ['Zamora'],
    })

    expect(result.rows[1]).toMatchObject({
      baseScore: 5.75,
      attributePoints: 0,
      finalScore: 5.75,
    })
  })

  it('reads the file when it carries a byte order mark', () => {
    const result = parseScoreCsv(
      '﻿' +
        csv(
          'PLR-A7K2,David,Castelló,6,9,8,7,',
          'PLR-B9F1,Juan,García,5,5,5,5,',
        ),
      CONTEXT,
    )

    expect(result.fileProblems).toEqual([])
    expect(result.rows).toHaveLength(2)
  })

  it('accepts accented headers too', () => {
    const result = parseScoreCsv(
      [
        'CodigoJugador,Nombre,Apellidos,Ataque,Defensa,Táctica,Físico,Atributos',
        'PLR-A7K2,David,Castelló,6,9,8,7,',
        'PLR-B9F1,Juan,García,5,5,5,5,',
      ].join('\n'),
      CONTEXT,
    )

    expect(result.fileProblems).toEqual([])
    expect(result.rows).toHaveLength(2)
  })

  it('splits several attributes on a pipe', () => {
    const result = parseScoreCsv(
      csv(
        'PLR-A7K2,David,Castelló,8,8,9,7,MVP|Puskas',
        'PLR-B9F1,Juan,García,5,5,5,5,',
      ),
      CONTEXT,
    )

    expect(result.rows[0].attributeCodes).toEqual(['mvp', 'puskas'])
    expect(result.rows[0].attributePoints).toBe(4)
    // Deliberately unclamped: 8.0 base plus 4 exceeds the metric maximum.
    expect(result.rows[0].finalScore).toBe(12)
  })

  it('subtracts a negative attribute', () => {
    const result = parseScoreCsv(
      csv(
        'PLR-A7K2,David,Castelló,5,5,5,5,Lesión',
        'PLR-B9F1,Juan,García,5,5,5,5,',
      ),
      CONTEXT,
    )

    expect(result.rows[0].finalScore).toBe(3)
  })

  it('matches an attribute written without its accent', () => {
    const result = parseScoreCsv(
      csv(
        'PLR-A7K2,David,Castelló,5,5,5,5,Lesion',
        'PLR-B9F1,Juan,García,5,5,5,5,',
      ),
      CONTEXT,
    )

    expect(result.problems).toEqual([])
    expect(result.rows[0].attributeCodes).toEqual(['injury'])
  })

  it('matches an attribute by its internal code', () => {
    const result = parseScoreCsv(
      csv(
        'PLR-A7K2,David,Castelló,5,5,5,5,zamora',
        'PLR-B9F1,Juan,García,5,5,5,5,',
      ),
      CONTEXT,
    )

    expect(result.rows[0].attributeCodes).toEqual(['zamora'])
  })

  // A Spanish-locale spreadsheet writes 7,5 rather than 7.5.
  it('accepts a decimal comma', () => {
    const result = parseScoreCsv(
      csv(
        '"PLR-A7K2",David,Castelló,"7,5",5,5,5,',
        'PLR-B9F1,Juan,García,5,5,5,5,',
      ),
      CONTEXT,
    )

    expect(result.problems).toEqual([])
    expect(result.rows[0].metricScores.attack).toBe(7.5)
  })

  it('is case-insensitive about player codes', () => {
    const result = parseScoreCsv(
      csv('plr-a7k2,David,Castelló,5,5,5,5,', 'PLR-B9F1,Juan,García,5,5,5,5,'),
      CONTEXT,
    )

    expect(result.problems).toEqual([])
    expect(result.rows[0].playerCode).toBe('PLR-A7K2')
  })

  describe('rejections', () => {
    it('reports a missing metric column once for the file', () => {
      const result = parseScoreCsv(
        [
          'CodigoJugador,Nombre,Apellidos,Ataque,Defensa,Tactica,Atributos',
          'PLR-A7K2,David,Castelló,6,9,8,',
        ].join('\n'),
        CONTEXT,
      )

      expect(result.fileProblems).toContain('Falta la columna de «Físico»')
      expect(result.rows).toEqual([])
    })

    it('reports a missing player code column', () => {
      const result = parseScoreCsv(
        [
          'Nombre,Apellidos,Ataque,Defensa,Tactica,Fisico',
          'David,C,5,5,5,5',
        ].join('\n'),
        CONTEXT,
      )

      expect(result.fileProblems.join(' ')).toMatch(/CodigoJugador/)
    })

    it('rejects a player who was not called up', () => {
      const result = parseScoreCsv(
        csv(
          'PLR-A7K2,David,Castelló,5,5,5,5,',
          'PLR-B9F1,Juan,García,5,5,5,5,',
          'PLR-ZZZZ,Otro,Jugador,5,5,5,5,',
        ),
        CONTEXT,
      )

      expect(result.problems).toHaveLength(1)
      expect(result.problems[0]).toMatchObject({
        rowNumber: 3,
        playerCode: 'PLR-ZZZZ',
      })
      expect(result.problems[0].message).toMatch(/no está convocado/)
    })

    it('rejects a duplicated player', () => {
      const result = parseScoreCsv(
        csv(
          'PLR-A7K2,David,Castelló,5,5,5,5,',
          'PLR-B9F1,Juan,García,5,5,5,5,',
          'PLR-A7K2,David,Castelló,6,6,6,6,',
        ),
        CONTEXT,
      )

      expect(result.problems[0].message).toMatch(/más de una vez/)
    })

    it('rejects a score above the metric maximum', () => {
      const result = parseScoreCsv(
        csv(
          'PLR-A7K2,David,Castelló,11,5,5,5,',
          'PLR-B9F1,Juan,García,5,5,5,5,',
        ),
        CONTEXT,
      )

      expect(result.problems).toHaveLength(1)
      expect(result.problems[0].message).toMatch(/debe estar entre 0 y 10/)
      // The offending row is withheld, the valid one is kept for the preview.
      expect(result.rows).toHaveLength(1)
    })

    it('rejects a negative score', () => {
      const result = parseScoreCsv(
        csv(
          'PLR-A7K2,David,Castelló,-1,5,5,5,',
          'PLR-B9F1,Juan,García,5,5,5,5,',
        ),
        CONTEXT,
      )

      expect(result.problems[0].message).toMatch(/debe estar entre/)
    })

    it('rejects an empty score cell', () => {
      const result = parseScoreCsv(
        csv('PLR-A7K2,David,Castelló,,5,5,5,', 'PLR-B9F1,Juan,García,5,5,5,5,'),
        CONTEXT,
      )

      expect(result.problems[0].message).toMatch(/vacío o no es un número/)
    })

    it('rejects a score that is not a number', () => {
      const result = parseScoreCsv(
        csv(
          'PLR-A7K2,David,Castelló,muy bueno,5,5,5,',
          'PLR-B9F1,Juan,García,5,5,5,5,',
        ),
        CONTEXT,
      )

      expect(result.problems[0].message).toMatch(/vacío o no es un número/)
    })

    it('rejects an unknown attribute', () => {
      const result = parseScoreCsv(
        csv(
          'PLR-A7K2,David,Castelló,5,5,5,5,Balón de Oro',
          'PLR-B9F1,Juan,García,5,5,5,5,',
        ),
        CONTEXT,
      )

      expect(result.problems[0].message).toMatch(/no es un atributo/)
    })

    it('rejects the same attribute twice on one player', () => {
      const result = parseScoreCsv(
        csv(
          'PLR-A7K2,David,Castelló,5,5,5,5,MVP|MVP',
          'PLR-B9F1,Juan,García,5,5,5,5,',
        ),
        CONTEXT,
      )

      expect(result.problems[0].message).toMatch(/repetido/)
    })

    it('reports rows missing from an otherwise valid file', () => {
      const result = parseScoreCsv(
        csv('PLR-A7K2,David,Castelló,5,5,5,5,'),
        CONTEXT,
      )

      expect(result.fileProblems.join(' ')).toMatch(/PLR-B9F1/)
    })

    it('reports an empty file', () => {
      const result = parseScoreCsv(HEADER, CONTEXT)

      expect(result.fileProblems).toContain(
        'El archivo no contiene ninguna fila de datos',
      )
    })

    it('numbers rows as the spreadsheet does, excluding the header', () => {
      const result = parseScoreCsv(
        csv(
          'PLR-A7K2,David,Castelló,5,5,5,5,',
          'PLR-B9F1,Juan,García,99,5,5,5,',
        ),
        CONTEXT,
      )

      expect(result.problems[0].rowNumber).toBe(2)
    })
  })

  it('round-trips a generated template', () => {
    const template = buildScoreTemplate(
      [
        { playerCode: 'PLR-A7K2', firstName: 'David', lastName: 'Castelló' },
        { playerCode: 'PLR-B9F1', firstName: 'Juan', lastName: 'García' },
      ],
      TEST_METRICS,
    )

    // Fill in the blank cells the way an administrator would.
    const filled = template
      .replace(
        'PLR-A7K2,David,Castelló,,,,,',
        'PLR-A7K2,David,Castelló,6,9,8,7,Zamora',
      )
      .replace('PLR-B9F1,Juan,García,,,,,', 'PLR-B9F1,Juan,García,2,8,7,6,')

    const result = parseScoreCsv(filled, CONTEXT)

    expect(result.fileProblems).toEqual([])
    expect(result.problems).toEqual([])
    expect(result.rows).toHaveLength(2)
    expect(result.rows[0].finalScore).toBe(9.5)
  })
})

describe('toTemplateFilename', () => {
  it('slugifies the match title', () => {
    expect(toTemplateFilename('Jornada 1')).toBe('resultados-jornada-1.csv')
  })

  it('strips accents and punctuation', () => {
    expect(toTemplateFilename('Final · Copa Roco')).toBe(
      'resultados-final-copa-roco.csv',
    )
  })

  it('falls back when the title has nothing usable', () => {
    expect(toTemplateFilename('···')).toBe('resultados-partido.csv')
  })
})

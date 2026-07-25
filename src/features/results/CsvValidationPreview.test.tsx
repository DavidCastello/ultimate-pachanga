import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import { CsvValidationPreview } from '@/features/results/CsvValidationPreview'
import { parseScoreCsv, type ParseContext } from '@/lib/csv'
import { renderWithProviders } from '@/test/render'
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
    code: 'zamora',
    label: 'Zamora',
    points: 2,
    is_active: true,
  },
  {
    id: 'a3',
    league_id: 'l',
    code: 'injury',
    label: 'Lesión',
    points: -2,
    is_active: true,
  },
]

const CONTEXT: ParseContext = {
  metrics: TEST_METRICS,
  attributes: ATTRIBUTES,
  squad: new Map([
    ['PLR-A7K2', { displayName: 'David Castelló' }],
    ['PLR-B9F1', { displayName: 'Juanito' }],
  ]),
}

const HEADER =
  'CodigoJugador,Nombre,Apellidos,Ataque,Defensa,Tactica,Fisico,' +
  'Goles,Victoria,Atributos'

function renderPreview(...rows: string[]) {
  const result = parseScoreCsv([HEADER, ...rows].join('\n'), CONTEXT)

  renderWithProviders(
    <CsvValidationPreview
      result={result}
      metrics={TEST_METRICS}
      attributes={ATTRIBUTES}
    />,
  )

  return result
}

describe('CsvValidationPreview', () => {
  it('shows the computed scores for a clean file', () => {
    renderPreview(
      'PLR-A7K2,David,Castelló,6,9,8,7,1,1,Zamora',
      'PLR-B9F1,Juan,García,2,8,7,6,1,1,',
    )

    expect(screen.getByText('David Castelló')).toBeInTheDocument()
    expect(screen.getByText('PLR-A7K2')).toBeInTheDocument()
    // 6+9+8+7 = 30 base, Zamora +2, a win +2 -> 34.
    expect(screen.getByText('30,0')).toBeInTheDocument()
    expect(screen.getByText('34,0')).toBeInTheDocument()
    expect(screen.getByText('Zamora')).toBeInTheDocument()
  })

  it('confirms how many players are ready when there are no problems', () => {
    renderPreview(
      'PLR-A7K2,David,Castelló,6,9,8,7,1,1,',
      'PLR-B9F1,Juan,García,5,5,5,5,1,1,',
    )

    expect(screen.getByText(/2 jugadores listos para importar/i)).toBeVisible()
  })

  it('reports an out-of-range score with its row number', () => {
    renderPreview(
      'PLR-A7K2,David,Castelló,11,9,8,7,1,1,',
      'PLR-B9F1,Juan,García,5,5,5,5,1,1,',
    )

    const alerts = screen.getAllByRole('alert')
    expect(alerts.length).toBeGreaterThan(0)
    expect(screen.getByText(/Fila 1 \(PLR-A7K2\)/)).toBeInTheDocument()
    expect(screen.getByText(/debe estar entre 0 y 10/)).toBeInTheDocument()
  })

  it('explains that nothing is imported while errors remain', () => {
    renderPreview(
      'PLR-A7K2,David,Castelló,11,9,8,7,1,1,',
      'PLR-B9F1,Juan,García,5,5,5,5,1,1,',
    )

    expect(
      screen.getByText(/No se importará nada hasta que no haya errores/i),
    ).toBeVisible()
  })

  it('still previews the rows that are valid', () => {
    renderPreview(
      'PLR-A7K2,David,Castelló,11,9,8,7,1,1,',
      'PLR-B9F1,Juan,García,5,5,5,5,1,1,',
    )

    expect(screen.getByText('Juanito')).toBeInTheDocument()
  })

  it('reports a missing column as a whole-file problem', () => {
    const result = parseScoreCsv(
      [
        'CodigoJugador,Nombre,Apellidos,Ataque,Defensa,Tactica,Atributos',
        'PLR-A7K2,David,Castelló,6,9,8,',
      ].join('\n'),
      CONTEXT,
    )

    renderWithProviders(
      <CsvValidationPreview
        result={result}
        metrics={TEST_METRICS}
        attributes={ATTRIBUTES}
      />,
    )

    expect(screen.getByText(/El archivo no se puede importar/i)).toBeVisible()
    expect(screen.getByText(/Falta la columna de «Físico»/)).toBeVisible()
  })

  it('reports an unknown attribute', () => {
    renderPreview(
      'PLR-A7K2,David,Castelló,5,5,5,5,1,1,Balón de Oro',
      'PLR-B9F1,Juan,García,5,5,5,5,1,1,',
    )

    expect(screen.getByText(/no es un atributo de esta liga/)).toBeVisible()
  })

  it('shows a penalty as a negative badge', () => {
    renderPreview(
      // A defeat, so the final score differs from the base and the assertion
      // below cannot match the wrong cell.
      'PLR-A7K2,David,Castelló,5,5,5,5,1,0,Lesión',
      'PLR-B9F1,Juan,García,5,5,5,5,1,1,',
    )

    expect(screen.getByText('Lesión')).toBeInTheDocument()
    expect(screen.getByText('−2')).toBeInTheDocument()
    // 5+5+5+5 = 20 base, less two for the injury, nothing for the defeat.
    expect(screen.getByText('18,0')).toBeInTheDocument()
  })
})

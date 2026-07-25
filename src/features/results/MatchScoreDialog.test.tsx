import { describe, expect, it, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  MatchScoreDialog,
  type ScoreTarget,
} from '@/features/results/MatchScoreDialog'
import { renderWithProviders } from '@/test/render'
import { TEST_METRICS } from '@/test/factories'
import type { LeagueAttributeRow } from '@/types/domain'

const ATTRIBUTES: LeagueAttributeRow[] = [
  {
    id: 'attribute-mvp',
    league_id: 'league-1',
    code: 'mvp',
    label: 'MVP',
    points: 2,
    is_active: true,
  },
  {
    id: 'attribute-injury',
    league_id: 'league-1',
    code: 'injury',
    label: 'Lesión',
    points: -2,
    is_active: true,
  },
]

const SCORED: ScoreTarget = {
  playerCode: 'PLR-A7K2',
  displayName: 'David Castelló',
  existing: {
    metricScores: { attack: 6, defence: 9, tactics: 8, physical: 7 },
    goals: 2,
    victory: 1,
    attributeCodes: ['mvp'],
  },
}

const UNSCORED: ScoreTarget = {
  playerCode: 'PLR-B2C3',
  displayName: 'Juanito',
}

function renderDialog(target: ScoreTarget, onSubmit = vi.fn()) {
  renderWithProviders(
    <MatchScoreDialog
      open
      onOpenChange={vi.fn()}
      target={target}
      metrics={TEST_METRICS}
      attributes={ATTRIBUTES}
      onSubmit={onSubmit}
    />,
  )

  return onSubmit
}

describe('MatchScoreDialog', () => {
  it("opens on the player's stored figures", () => {
    renderDialog(SCORED)

    expect(screen.getByTestId('score-metric-attack')).toHaveValue(6)
    expect(screen.getByTestId('score-metric-defence')).toHaveValue(9)
    expect(screen.getByTestId('score-goals')).toHaveValue(2)
    expect(screen.getByTestId('score-attribute-mvp')).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.getByTestId('score-attribute-injury')).toHaveAttribute(
      'aria-pressed',
      'false',
    )
  })

  // 6 + 9 + 8 + 7 = 30 metrics, +2 for the MVP, +2 for the win.
  it('previews the total the database will compute', () => {
    renderDialog(SCORED)

    expect(screen.getByTestId('score-final-preview')).toHaveTextContent('34')
  })

  it('submits the edited figures as an import row', async () => {
    const onSubmit = renderDialog(SCORED)

    const attack = screen.getByTestId('score-metric-attack')
    await userEvent.clear(attack)
    await userEvent.type(attack, '4')
    await userEvent.click(screen.getByTestId('score-submit'))

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    expect(onSubmit).toHaveBeenCalledWith({
      player_code: 'PLR-A7K2',
      metric_scores: { attack: 4, defence: 9, tactics: 8, physical: 7 },
      attribute_codes: ['mvp'],
      goals: 2,
      victory: 1,
    })
  })

  it('adds and removes attributes', async () => {
    const onSubmit = renderDialog(SCORED)

    await userEvent.click(screen.getByTestId('score-attribute-mvp'))
    await userEvent.click(screen.getByTestId('score-attribute-injury'))
    await userEvent.click(screen.getByTestId('score-submit'))

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    expect(onSubmit.mock.calls[0][0].attribute_codes).toEqual(['injury'])
  })

  it('refuses to save a metric left blank', async () => {
    const onSubmit = renderDialog(UNSCORED)

    await userEvent.click(screen.getByTestId('score-submit'))

    expect(await screen.findByText('Indica Ataque')).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('refuses to save a metric outside its range', async () => {
    const onSubmit = renderDialog(SCORED)

    const attack = screen.getByTestId('score-metric-attack')
    await userEvent.clear(attack)
    await userEvent.type(attack, '12')
    await userEvent.click(screen.getByTestId('score-submit'))

    expect(await screen.findByText('De 0,0 a 10,0')).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('refuses to save a fractional goal count', async () => {
    const onSubmit = renderDialog(SCORED)

    const goals = screen.getByTestId('score-goals')
    await userEvent.clear(goals)
    await userEvent.type(goals, '1.5')
    await userEvent.click(screen.getByTestId('score-submit'))

    expect(await screen.findByText('Un número entero, 0 o más')).toBeVisible()
    expect(onSubmit).not.toHaveBeenCalled()
  })
})

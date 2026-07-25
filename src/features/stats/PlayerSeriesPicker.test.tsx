import { describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PlayerSeriesPicker } from '@/features/stats/PlayerSeriesPicker'
import { renderWithProviders } from '@/test/render'
import { buildPlayerCard } from '@/test/factories'

const PLAYERS = [
  buildPlayerCard({ id: 'p1', displayName: 'Charly' }),
  buildPlayerCard({ id: 'p2', displayName: 'David Castelló' }),
  buildPlayerCard({ id: 'p3', displayName: 'Juanito' }),
]

const COLORS: Record<string, string> = {
  p1: 'var(--color-chart-1)',
  p2: 'var(--color-chart-2)',
}

interface PickerHandlers {
  onToggle?: (playerId: string) => void
  onOnly?: (playerId: string) => void
}

function renderPicker(
  selectedIds: string[],
  { onToggle = vi.fn(), onOnly = vi.fn() }: PickerHandlers = {},
  maximumSelected = 8,
) {
  renderWithProviders(
    <PlayerSeriesPicker
      players={PLAYERS}
      selectedIds={selectedIds}
      colorOf={(playerId) => COLORS[playerId]}
      onToggle={onToggle}
      onOnly={onOnly}
      maximumSelected={maximumSelected}
    />,
  )
}

async function openPicker() {
  await userEvent.click(screen.getByTestId('evolution-player-picker'))
}

describe('PlayerSeriesPicker', () => {
  it('counts the selection against the limit on the trigger', () => {
    renderPicker(['p1', 'p2'])

    expect(screen.getByTestId('evolution-player-picker')).toHaveTextContent(
      '2/8',
    )
  })

  it('adds a player that is not on the chart yet', async () => {
    const onToggle = vi.fn()
    renderPicker(['p1'], { onToggle })

    await openPicker()
    await userEvent.click(screen.getByText('Juanito'))

    expect(onToggle).toHaveBeenCalledWith('p3')
  })

  it('removes a player that is already on it', async () => {
    const onToggle = vi.fn()
    renderPicker(['p1'], { onToggle })

    await openPicker()
    await userEvent.click(screen.getByText('Charly'))

    expect(onToggle).toHaveBeenCalledWith('p1')
  })

  // "Solo" isolates a line; it must not read as a toggle of the row it sits in.
  it('isolates a player without toggling the row', async () => {
    const onOnly = vi.fn()
    const onToggle = vi.fn()
    renderPicker(['p1', 'p2'], { onOnly, onToggle })

    await openPicker()
    const row = screen.getByTestId('evolution-player-option-p2')
    await userEvent.click(row.querySelector('button')!)

    expect(onOnly).toHaveBeenCalledWith('p2')
    expect(onToggle).not.toHaveBeenCalled()
  })

  it('refuses to add past the limit but still lets a player be removed', async () => {
    renderPicker(['p1', 'p2'], {}, 2)

    await openPicker()

    expect(screen.getByTestId('evolution-player-option-p3')).toHaveAttribute(
      'aria-disabled',
      'true',
    )
    expect(
      screen.getByTestId('evolution-player-option-p1'),
    ).not.toHaveAttribute('aria-disabled', 'true')
    expect(screen.getByText(/Máximo 2 jugadores/)).toBeInTheDocument()
  })
})

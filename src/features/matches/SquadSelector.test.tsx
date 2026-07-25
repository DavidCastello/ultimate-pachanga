import { describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  SquadSelector,
  type SquadDraft,
} from '@/features/matches/SquadSelector'
import { renderWithProviders } from '@/test/render'
import { buildPlayerCard } from '@/test/factories'

const PLAYERS = [
  buildPlayerCard({ id: 'p1', displayName: 'Charly' }),
  buildPlayerCard({ id: 'p2', displayName: 'David Castelló' }),
  buildPlayerCard({ id: 'p3', displayName: 'Juanito' }),
  buildPlayerCard({ id: 'p4', displayName: 'Retirado', isActive: false }),
]

/** Called up, no side yet: how everybody enters a convocatoria. */
const UNASSIGNED = 'unassigned'

function renderSelector(
  draft: SquadDraft = new Map(),
  lockedPlayerIds?: ReadonlySet<string>,
) {
  const onChange = vi.fn<(next: SquadDraft) => void>()

  renderWithProviders(
    <SquadSelector
      players={PLAYERS}
      draft={draft}
      onChange={onChange}
      homeTeamName="Blanco"
      awayTeamName="Negro"
      lockedPlayerIds={lockedPlayerIds}
    />,
  )

  return { onChange }
}

async function openPicker() {
  await userEvent.click(screen.getByTestId('call-up-picker'))
}

describe('SquadSelector', () => {
  it('lists only the players who have been called up', () => {
    renderSelector(new Map([['p2', UNASSIGNED]]))

    expect(screen.getByText('David Castelló')).toBeInTheDocument()
    expect(screen.queryByText('Charly')).not.toBeInTheDocument()
    expect(screen.getByText('1 convocados')).toBeInTheDocument()
  })

  it('calls up several players in one go', async () => {
    const user = userEvent.setup()
    const { onChange } = renderSelector()

    await openPicker()
    await user.click(screen.getByTestId('call-up-option-p1'))
    await user.click(screen.getByTestId('call-up-option-p3'))
    await user.click(screen.getByTestId('call-up-confirm'))

    expect(onChange).toHaveBeenCalledTimes(1)
    const next = onChange.mock.calls[0][0]

    expect([...next.keys()]).toEqual(['p1', 'p3'])
    // Nobody is placed on the way in: the teams are settled on the pitch.
    expect(next.get('p1')).toBe(UNASSIGNED)
  })

  it('does not offer somebody who is already called up', async () => {
    renderSelector(new Map([['p1', UNASSIGNED]]))

    await openPicker()

    expect(screen.queryByTestId('call-up-option-p1')).not.toBeInTheDocument()
    expect(screen.getByTestId('call-up-option-p2')).toBeInTheDocument()
  })

  it('does not offer an inactive player either', async () => {
    renderSelector()

    await openPicker()

    expect(screen.queryByTestId('call-up-option-p4')).not.toBeInTheDocument()
  })

  it('removes a player from the convocatoria', async () => {
    const user = userEvent.setup()
    const { onChange } = renderSelector(
      new Map([
        ['p1', UNASSIGNED],
        ['p2', UNASSIGNED],
      ]),
    )

    await user.click(screen.getByLabelText(/Quitar a Charly/))

    expect([...onChange.mock.calls[0][0].keys()]).toEqual(['p2'])
  })

  it('refuses to remove a player who already has a score', () => {
    renderSelector(new Map([['p1', UNASSIGNED]]), new Set(['p1']))

    expect(screen.getByLabelText(/Quitar a Charly/)).toBeDisabled()
  })

  it('calls everyone up at once', async () => {
    const user = userEvent.setup()
    const { onChange } = renderSelector()

    await user.click(screen.getByRole('button', { name: 'Convocar a todos' }))

    // The inactive player is not swept in.
    expect([...onChange.mock.calls[0][0].keys()]).toEqual(['p1', 'p2', 'p3'])
  })

  it('empties the convocatoria but keeps whoever has been scored', async () => {
    const user = userEvent.setup()
    const { onChange } = renderSelector(
      new Map([
        ['p1', UNASSIGNED],
        ['p2', UNASSIGNED],
      ]),
      new Set(['p2']),
    )

    await user.click(screen.getByRole('button', { name: 'Vaciar' }))

    expect([...onChange.mock.calls[0][0].keys()]).toEqual(['p2'])
  })

  it('assigns a side by hand when somebody insists', async () => {
    const user = userEvent.setup()
    const { onChange } = renderSelector(new Map([['p1', UNASSIGNED]]))

    await user.click(screen.getByLabelText('Equipo de Charly'))
    await user.click(await screen.findByRole('option', { name: 'Blanco' }))

    expect(onChange.mock.calls[0][0].get('p1')).toBe('home')
  })
})

import { describe, expect, it, vi } from 'vitest'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PitchLineups, type LineupEntry } from '@/features/matches/PitchLineups'
import { renderWithProviders } from '@/test/render'
import { buildPlayerCard, TEST_METRICS } from '@/test/factories'
import type { TeamSide } from '@/types/domain'

vi.mock('@/lib/supabase', () => ({
  getAvatarUrl: (path: string | null) =>
    path ? `https://example.test/${path}` : null,
  supabase: {},
  PLAYER_AVATARS_BUCKET: 'player-avatars',
}))

function entry(
  id: string,
  name: string,
  teamSide: TeamSide,
  pitchSlot: number | null,
  marketValueGbp = 1_000_000,
): LineupEntry {
  return {
    playerId: id,
    teamSide,
    pitchSlot,
    marketValueGbp,
    player: buildPlayerCard({
      id,
      displayName: name,
      firstName: name,
      lastName: 'X',
    }),
  }
}

/**
 * A full home side, a full away side, and one player on the bench.
 *
 * Every value is a round million so the totals below can be read off the
 * line-up rather than computed: seven on at home, two away, and an
 * extravagant substitute who must not count for either.
 */
const ENTRIES: LineupEntry[] = [
  entry('h0', 'Portero Local', 'home', 0),
  entry('h1', 'Defensa Uno', 'home', 1),
  entry('h2', 'Defensa Dos', 'home', 2),
  entry('h3', 'Medio Uno', 'home', 3),
  entry('h4', 'Medio Dos', 'home', 4),
  entry('h5', 'Medio Tres', 'home', 5),
  entry('h6', 'Delantero Local', 'home', 6),
  entry('a0', 'Portero Visitante', 'away', 0),
  entry('a1', 'Visitante Uno', 'away', 1),
  entry('b1', 'Suplente', 'home', null, 50_000_000),
]

function renderLineups(
  overrides: Partial<Parameters<typeof PitchLineups>[0]> = {},
) {
  const onLineupChange = vi.fn()
  const onFormationChange = vi.fn()

  renderWithProviders(
    <PitchLineups
      entries={ENTRIES}
      metrics={TEST_METRICS}
      homeTeamName="Los Cracks"
      awayTeamName="Los Pachangueros"
      homeFormation="2-3-1"
      awayFormation="2-3-1"
      interactive
      canChangeFormation
      onFormationChange={onFormationChange}
      onLineupChange={onLineupChange}
      valuation="live"
      {...overrides}
    />,
  )

  return { onLineupChange, onFormationChange }
}

describe('PitchLineups', () => {
  it('draws a pitch for each team', () => {
    renderLineups()

    expect(screen.getByText('Los Cracks')).toBeInTheDocument()
    expect(screen.getByText('Los Pachangueros')).toBeInTheDocument()

    // The same pitch image is used twice, once per side.
    const pitches = screen
      .getAllByRole('presentation', { hidden: true })
      .filter((element) => element.getAttribute('src') === '/pitch.webp')
    expect(pitches).toHaveLength(2)
  })

  it('renders seven slots per team', () => {
    renderLineups()
    expect(screen.getAllByTestId('pitch-slot')).toHaveLength(14)
  })

  it('places each player in their slot', () => {
    renderLineups()

    const slots = screen.getAllByTestId('pitch-slot')
    const homeGoalkeeper = slots.find(
      (slot) => slot.dataset.slotKey === 'home:0',
    )!
    expect(
      within(homeGoalkeeper).getByText('Portero Local'),
    ).toBeInTheDocument()

    const homeStriker = slots.find((slot) => slot.dataset.slotKey === 'home:6')!
    expect(within(homeStriker).getByText('Delantero Local')).toBeInTheDocument()
  })

  it('marks empty slots as free', () => {
    renderLineups()

    const slots = screen.getAllByTestId('pitch-slot')
    const empty = slots.filter((slot) => slot.dataset.occupied === 'false')

    // The away side has only two players, so five of its slots are open.
    expect(empty).toHaveLength(5)
    expect(screen.getAllByLabelText(/vacío/i).length).toBeGreaterThan(0)
  })

  it('lists unplaced players on the bench', () => {
    renderLineups()

    expect(screen.getByText(/Banquillo/)).toBeInTheDocument()
    expect(screen.getByText('Suplente')).toBeInTheDocument()
  })

  it('labels the goalkeeper slot as the goal', () => {
    renderLineups()

    expect(screen.getByLabelText(/Portero Local, Portería/)).toBeInTheDocument()
  })

  describe('what each side is worth', () => {
    /**
     * The figure printed under a team's name.
     *
     * Scoped to the heading's own block rather than searched for globally: the
     * same amount can legitimately appear twice — a side's total and the gap
     * between the two sides — and a bare query would not say which it found.
     */
    function valueUnder(teamName: string): string | null {
      const header = screen.getByRole('heading', {
        name: teamName,
      }).parentElement!
      return within(header).getByTitle(/£/).textContent
    }

    function gap(): string | null {
      return within(screen.getByTestId('team-value-gap')).getByTitle(/£/)
        .textContent
    }

    it('sums only the players on the pitch', () => {
      renderLineups()

      // Seven at home and two away, at a million each. The £50 M substitute is
      // in neither figure, which is the point of the assertion.
      expect(valueUnder('Los Cracks')).toBe('£7,00 M')
      expect(valueUnder('Los Pachangueros')).toBe('£2,00 M')
    })

    it('shows how far apart the two sides are', () => {
      renderLineups()
      expect(gap()).toBe('£5,00 M')
    })

    it('says whether the figures are current or from the day', () => {
      renderLineups()
      expect(screen.getByText(/valor actual/)).toBeInTheDocument()
    })

    it('says so when the values were frozen at kickoff', () => {
      renderLineups({ valuation: 'frozen' })
      expect(
        screen.getByText(/valor al inicio del partido/),
      ).toBeInTheDocument()
    })

    it('follows a player moved to the other side straight away', async () => {
      const user = userEvent.setup()
      renderLineups()

      await user.click(screen.getByLabelText(/^Defensa Uno,/))
      const awaySlot = screen
        .getAllByTestId('pitch-slot')
        .find((slot) => slot.dataset.slotKey === 'away:6')!
      await user.click(within(awaySlot).getByRole('button'))

      // Six against three, without waiting for the write to come back.
      expect(valueUnder('Los Cracks')).toBe('£6,00 M')
      expect(valueUnder('Los Pachangueros')).toBe('£3,00 M')
      expect(gap()).toBe('£3,00 M')
    })

    it('leaves a bench player out however expensive they are', async () => {
      const user = userEvent.setup()
      renderLineups()

      // The £50 M substitute comes on for a £1 M striker.
      await user.click(screen.getByLabelText(/^Suplente, en el banquillo/))
      await user.click(screen.getByLabelText(/^Delantero Local,/))

      expect(valueUnder('Los Cracks')).toBe('£56 M')
    })
  })

  describe('swapping by click', () => {
    it('swaps two players on the same team', async () => {
      const user = userEvent.setup()
      const { onLineupChange } = renderLineups()

      await user.click(screen.getByLabelText(/^Defensa Uno,/))
      await user.click(screen.getByLabelText(/^Defensa Dos,/))

      expect(onLineupChange).toHaveBeenCalledTimes(1)
      const changes = onLineupChange.mock.calls[0][0]

      expect(changes).toHaveLength(2)
      expect(changes).toEqual(
        expect.arrayContaining([
          { playerId: 'h1', teamSide: 'home', pitchSlot: 2 },
          { playerId: 'h2', teamSide: 'home', pitchSlot: 1 },
        ]),
      )
    })

    it('moves a player across to the other team', async () => {
      const user = userEvent.setup()
      const { onLineupChange } = renderLineups()

      await user.click(screen.getByLabelText(/^Defensa Uno,/))
      // An empty away slot.
      const awaySlot = screen
        .getAllByTestId('pitch-slot')
        .find((slot) => slot.dataset.slotKey === 'away:6')!
      await user.click(within(awaySlot).getByRole('button'))

      const changes = onLineupChange.mock.calls[0][0]
      expect(changes).toEqual(
        expect.arrayContaining([
          { playerId: 'h1', teamSide: 'away', pitchSlot: 6 },
        ]),
      )
    })

    it('brings a bench player onto the pitch', async () => {
      const user = userEvent.setup()
      const { onLineupChange } = renderLineups()

      await user.click(screen.getByLabelText(/^Suplente, en el banquillo/))
      await user.click(screen.getByLabelText(/^Delantero Local,/))

      const changes = onLineupChange.mock.calls[0][0]
      expect(changes).toEqual(
        expect.arrayContaining([
          { playerId: 'b1', teamSide: 'home', pitchSlot: 6 },
          { playerId: 'h6', teamSide: 'home', pitchSlot: null },
        ]),
      )
    })

    it('clicking the same player twice cancels the selection', async () => {
      const user = userEvent.setup()
      const { onLineupChange } = renderLineups()

      const target = screen.getByLabelText(/^Defensa Uno,/)
      await user.click(target)
      expect(target).toHaveAttribute('aria-pressed', 'true')

      await user.click(target)
      expect(target).toHaveAttribute('aria-pressed', 'false')
      expect(onLineupChange).not.toHaveBeenCalled()
    })

    it('does nothing when two empty slots are picked', async () => {
      const user = userEvent.setup()
      const { onLineupChange } = renderLineups()

      const slots = screen.getAllByTestId('pitch-slot')
      const first = slots.find((slot) => slot.dataset.slotKey === 'away:5')!
      const second = slots.find((slot) => slot.dataset.slotKey === 'away:6')!

      await user.click(within(first).getByRole('button'))
      await user.click(within(second).getByRole('button'))

      expect(onLineupChange).not.toHaveBeenCalled()
    })
  })

  describe('guiding the selection', () => {
    it('explains what to do next once a player is picked', async () => {
      const user = userEvent.setup()
      renderLineups()

      expect(screen.getByText(/Toca un jugador y luego otro/)).toBeVisible()

      await user.click(screen.getByLabelText(/^Defensa Uno,/))

      const banner = screen.getByRole('status')
      expect(banner).toHaveTextContent('Defensa Uno')
      expect(banner).toHaveTextContent(/Toca otro jugador o una posición libre/)
    })

    it('offers a way out of a selection', async () => {
      const user = userEvent.setup()
      const { onLineupChange } = renderLineups()

      await user.click(screen.getByLabelText(/^Defensa Uno,/))
      await user.click(screen.getByRole('button', { name: 'Cancelar' }))

      expect(screen.queryByRole('status')).not.toBeInTheDocument()
      expect(screen.getByText(/Toca un jugador y luego otro/)).toBeVisible()
      expect(onLineupChange).not.toHaveBeenCalled()
    })

    it('marks the other positions as targets', async () => {
      const user = userEvent.setup()
      renderLineups()

      const other = screen.getByLabelText(/^Defensa Dos,/)
      expect(other.className).not.toContain('ring-primary/50')

      await user.click(screen.getByLabelText(/^Defensa Uno,/))

      expect(other.className).toContain('ring-primary/50')
      // The selected card is marked differently from the targets.
      expect(screen.getByLabelText(/^Defensa Uno,/).className).toContain(
        'ring-offset-2',
      )
    })

    it('says so when an empty position is the one selected', async () => {
      const user = userEvent.setup()
      renderLineups()

      const emptySlot = screen
        .getAllByTestId('pitch-slot')
        .find((slot) => slot.dataset.slotKey === 'away:6')!
      await user.click(within(emptySlot).getByRole('button'))

      expect(screen.getByRole('status')).toHaveTextContent(
        /Posición vacía seleccionada/,
      )
    })
  })

  describe('keyboard', () => {
    it('selects and swaps with Enter', async () => {
      const user = userEvent.setup()
      const { onLineupChange } = renderLineups()

      screen.getByLabelText(/^Defensa Uno,/).focus()
      await user.keyboard('{Enter}')
      screen.getByLabelText(/^Defensa Dos,/).focus()
      await user.keyboard('{Enter}')

      expect(onLineupChange).toHaveBeenCalledTimes(1)
    })

    it('cancels a selection with Escape', async () => {
      const user = userEvent.setup()
      const { onLineupChange } = renderLineups()

      const target = screen.getByLabelText(/^Defensa Uno,/)
      target.focus()
      await user.keyboard('{Enter}')
      await user.keyboard('{Escape}')

      expect(target).toHaveAttribute('aria-pressed', 'false')
      expect(onLineupChange).not.toHaveBeenCalled()
    })
  })

  describe('formation', () => {
    it('offers the four seven-a-side layouts to an administrator', async () => {
      const user = userEvent.setup()
      renderLineups()

      await user.click(screen.getByLabelText('Formación de Los Cracks'))

      for (const option of ['2-3-1', '3-3', '3-2-1', '1-3-2']) {
        expect(
          await screen.findByRole('option', { name: option }),
        ).toBeInTheDocument()
      }
    })

    // The menu is derived from the shape on show, so it cannot offer a layout
    // for a squad size this match does not play.
    it('offers only the layouts of its own squad size', async () => {
      const user = userEvent.setup()
      renderLineups({ homeFormation: '2-2' })

      await user.click(screen.getByLabelText('Formación de Los Cracks'))

      for (const option of ['2-2', '1-2-1', '3-1']) {
        expect(
          await screen.findByRole('option', { name: option }),
        ).toBeInTheDocument()
      }
      for (const option of ['2-3-1', '3-3-1']) {
        expect(
          screen.queryByRole('option', { name: option }),
        ).not.toBeInTheDocument()
      }
    })

    it('draws five positions for a five-a-side shape', () => {
      renderLineups({ homeFormation: '2-2' })

      const homeSlots = screen
        .getAllByTestId('pitch-slot')
        .filter((slot) => slot.dataset.slotKey?.startsWith('home:'))

      expect(homeSlots).toHaveLength(5)
    })

    // The state a shrunk match is in for as long as the refetch takes.
    it('benches a player whose slot the shape no longer has', () => {
      renderLineups({ homeFormation: '2-2' })

      const bench = screen.getByRole('list')

      // Slots 5 and 6 of the seven-a-side line-up do not exist at five a side.
      expect(within(bench).getByText('Medio Tres')).toBeVisible()
      expect(within(bench).getByText('Delantero Local')).toBeVisible()
      // And the one who was already benched is still there.
      expect(within(bench).getByText('Suplente')).toBeVisible()
    })

    it('draws eight positions for an eight-a-side shape', () => {
      renderLineups({ homeFormation: '2-4-1' })

      const homeSlots = screen
        .getAllByTestId('pitch-slot')
        .filter((slot) => slot.dataset.slotKey?.startsWith('home:'))

      expect(homeSlots).toHaveLength(8)
    })

    it('reports a formation change', async () => {
      const user = userEvent.setup()
      const { onFormationChange } = renderLineups()

      await user.click(screen.getByLabelText('Formación de Los Cracks'))
      await user.click(await screen.findByRole('option', { name: '3-3' }))

      expect(onFormationChange).toHaveBeenCalledWith('home', '3-3')
    })

    it('lays out 3-3 with six outfielders in two lines', () => {
      renderLineups({ homeFormation: '3-3' })

      const homeSlots = screen
        .getAllByTestId('pitch-slot')
        .filter((slot) => slot.dataset.slotKey?.startsWith('home:'))

      expect(homeSlots).toHaveLength(7)
    })
  })

  describe('a member arranging a match still to be played', () => {
    it('can move players but not change the shape', async () => {
      const user = userEvent.setup()
      const { onLineupChange, onFormationChange } = renderLineups({
        canChangeFormation: false,
      })

      expect(
        screen.queryByLabelText('Formación de Los Cracks'),
      ).not.toBeInTheDocument()

      await user.click(screen.getByLabelText(/^Defensa Uno,/))
      await user.click(screen.getByLabelText(/^Defensa Dos,/))

      expect(onLineupChange).toHaveBeenCalledTimes(1)
      expect(onFormationChange).not.toHaveBeenCalled()
    })
  })

  describe('read-only for members', () => {
    it('shows the formation without a selector', () => {
      renderLineups({ interactive: false, canChangeFormation: false })

      expect(
        screen.queryByLabelText('Formación de Los Cracks'),
      ).not.toBeInTheDocument()
      expect(screen.getAllByText('2-3-1').length).toBeGreaterThan(0)
    })

    it('makes no player interactive', () => {
      renderLineups({ interactive: false, canChangeFormation: false })

      expect(screen.queryAllByRole('button')).toHaveLength(0)
      expect(screen.getByText('Portero Local')).toBeInTheDocument()
    })

    it('ignores clicks', async () => {
      const user = userEvent.setup()
      const { onLineupChange } = renderLineups({
        interactive: false,
        canChangeFormation: false,
      })

      await user.click(screen.getByText('Defensa Uno'))
      await user.click(screen.getByText('Defensa Dos'))

      expect(onLineupChange).not.toHaveBeenCalled()
    })

    it('omits the drag instructions', () => {
      renderLineups({ interactive: false, canChangeFormation: false })
      expect(screen.queryByText(/Arrastra un jugador/)).not.toBeInTheDocument()
    })
  })
})

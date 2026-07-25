import { describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { PodiumList } from '@/components/PodiumList'
import { renderWithProviders } from '@/test/render'
import { buildPlayerCard } from '@/test/factories'

vi.mock('@/lib/supabase', () => ({
  getAvatarUrl: (path: string | null) =>
    path ? `https://example.test/${path}` : null,
  supabase: {},
  PLAYER_AVATARS_BUCKET: 'player-avatars',
}))

const PLAYERS = [
  buildPlayerCard({ id: 'p1', displayName: 'Charly', totalGoals: 9 }),
  buildPlayerCard({ id: 'p2', displayName: 'David Castelló', totalGoals: 6 }),
  buildPlayerCard({ id: 'p3', displayName: 'Juanito', totalGoals: 4 }),
  buildPlayerCard({ id: 'p4', displayName: 'Cuarto Jugador', totalGoals: 2 }),
]

function renderList(players = PLAYERS) {
  renderWithProviders(
    <PodiumList
      players={players}
      renderValue={(player) => player.totalGoals}
      emptyMessage="Nadie ha marcado todavía."
    />,
  )
}

describe('PodiumList', () => {
  it('lists the players in the order given, with their value', () => {
    renderList()

    const rows = screen.getAllByRole('listitem')
    expect(rows).toHaveLength(4)
    expect(rows[0]).toHaveTextContent('Charly')
    expect(rows[0]).toHaveTextContent('9')
  })

  // The medal is the rank for the podium, so the position has to be readable
  // without seeing the colour.
  it('names a medal for each of the top three', () => {
    renderList()

    expect(screen.getByText('Oro')).toBeInTheDocument()
    expect(screen.getByText('Plata')).toBeInTheDocument()
    expect(screen.getByText('Bronce')).toBeInTheDocument()
  })

  it('tints the three medals gold, silver and bronze', () => {
    renderList()

    const medalClasses = screen
      .getAllByRole('listitem')
      .slice(0, 3)
      .map((row) => row.querySelector('svg')?.getAttribute('class') ?? '')

    expect(medalClasses[0]).toContain('text-tier-gold')
    expect(medalClasses[1]).toContain('text-tier-silver')
    expect(medalClasses[2]).toContain('text-tier-bronze')
  })

  it('numbers everyone below the podium', () => {
    renderList()

    const fourth = screen.getAllByRole('listitem')[3]
    expect(fourth).toHaveTextContent('4')
    expect(fourth.querySelector('svg')).toBeNull()
  })

  it('links every player to their detail page', () => {
    renderList()

    expect(screen.getByRole('link', { name: /charly/i })).toHaveAttribute(
      'href',
      '/players/p1',
    )
  })

  it('explains itself when nobody qualifies yet', () => {
    renderList([])

    expect(screen.getByText('Nadie ha marcado todavía.')).toBeInTheDocument()
    expect(screen.queryAllByRole('listitem')).toHaveLength(0)
  })
})

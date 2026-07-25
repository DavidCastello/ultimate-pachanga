import { describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { RankingTable } from '@/components/RankingTable'
import { MarketValue } from '@/components/MarketValue'
import { renderWithProviders } from '@/test/render'
import { buildPlayerCard } from '@/test/factories'

vi.mock('@/lib/supabase', () => ({
  getAvatarUrl: (path: string | null) =>
    path ? `https://example.test/${path}` : null,
  supabase: {},
  PLAYER_AVATARS_BUCKET: 'player-avatars',
}))

const PLAYERS = [
  buildPlayerCard({
    id: 'p1',
    displayName: 'Charly',
    firstName: 'Carlos',
    lastName: 'Herrera',
    marketValueGbp: 9_875_000,
    cardRating: 99,
  }),
  buildPlayerCard({
    id: 'p2',
    displayName: 'David Castelló',
    marketValueGbp: 9_625_000,
    cardRating: 96,
  }),
  buildPlayerCard({
    id: 'p3',
    displayName: 'Juanito',
    firstName: 'Juan',
    lastName: 'García',
    marketValueGbp: 6_000_000,
    cardRating: 60,
  }),
  buildPlayerCard({
    id: 'p4',
    displayName: 'Cuarto Jugador',
    firstName: 'Cuarto',
    lastName: 'Jugador',
    marketValueGbp: 4_500_000,
    cardRating: 45,
  }),
]

function renderTable() {
  renderWithProviders(
    <RankingTable
      players={PLAYERS}
      valueLabel="Valor de mercado"
      renderValue={(player) => <MarketValue value={player.marketValueGbp} />}
      contextLabel="Partidos"
      renderContext={(player) => player.matchesPlayed}
    />,
  )
}

describe('RankingTable', () => {
  it('numbers the rows in the order given', () => {
    renderTable()

    const rows = screen.getAllByRole('row').slice(1)
    expect(rows).toHaveLength(4)
    expect(rows[0]).toHaveTextContent('1')
    expect(rows[0]).toHaveTextContent('Charly')
    expect(rows[3]).toHaveTextContent('4')
    expect(rows[3]).toHaveTextContent('Cuarto Jugador')
  })

  it('renders the ranked value and its heading', () => {
    renderTable()

    expect(
      screen.getByRole('columnheader', { name: 'Valor de mercado' }),
    ).toBeInTheDocument()
    expect(screen.getByText('£9,88 M')).toBeInTheDocument()
  })

  it('links every player to their detail page', () => {
    renderTable()

    expect(screen.getByRole('link', { name: /charly/i })).toHaveAttribute(
      'href',
      '/players/p1',
    )
  })

  it('shows the context column when one is provided', () => {
    renderTable()

    expect(
      screen.getByRole('columnheader', { name: 'Partidos' }),
    ).toBeInTheDocument()
  })

  it('omits the context column when it is not', () => {
    renderWithProviders(
      <RankingTable
        players={PLAYERS}
        valueLabel="Veces"
        renderValue={(player) => player.cardRating}
      />,
    )

    expect(
      screen.queryByRole('columnheader', { name: 'Partidos' }),
    ).not.toBeInTheDocument()
  })

  // Gold, silver and bronze for the podium; everyone else is plain.
  it('tints the top three positions', () => {
    renderTable()

    const rows = screen.getAllByRole('row').slice(1)
    const rankCell = (index: number) =>
      rows[index].querySelector('td')?.className ?? ''

    expect(rankCell(0)).toContain('text-tier-gold')
    expect(rankCell(1)).toContain('text-tier-silver')
    expect(rankCell(2)).toContain('text-tier-bronze')
    expect(rankCell(3)).toContain('text-muted-foreground')
  })

  it('falls back to initials when a player has no photograph', () => {
    renderTable()

    expect(screen.getByText('CH')).toBeInTheDocument()
    expect(screen.getByText('JG')).toBeInTheDocument()
  })
})

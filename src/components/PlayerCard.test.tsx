import { describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { PlayerCard } from '@/components/PlayerCard'
import { renderWithProviders } from '@/test/render'
import { buildPlayerCard, TEST_METRICS } from '@/test/factories'

// The card resolves avatar URLs through the Supabase storage client, which
// would otherwise require a configured environment just to render a card.
vi.mock('@/lib/supabase', () => ({
  getAvatarUrl: (path: string | null) =>
    path ? `https://example.test/${path}` : null,
  supabase: {},
  PLAYER_AVATARS_BUCKET: 'player-avatars',
}))

describe('PlayerCard', () => {
  it('shows the rating, name, position and market value', () => {
    renderWithProviders(
      <PlayerCard player={buildPlayerCard()} metrics={TEST_METRICS} />,
    )

    expect(screen.getByText('96')).toBeInTheDocument()
    expect(screen.getByText('David Castelló')).toBeInTheDocument()
    expect(screen.getByText('CM')).toBeInTheDocument()
    expect(screen.getByText('Mediocentro')).toBeInTheDocument()
    expect(screen.getByText('£9,63 M')).toBeInTheDocument()
  })

  it('shows a stat for every active metric', () => {
    renderWithProviders(
      <PlayerCard player={buildPlayerCard()} metrics={TEST_METRICS} />,
    )

    // Abbreviated to three characters to fit the card.
    for (const label of ['Ata', 'Def', 'Tác', 'Fís']) {
      expect(screen.getByText(label)).toBeInTheDocument()
    }
    expect(screen.getByText('65')).toBeInTheDocument()
    expect(screen.getByText('70')).toBeInTheDocument()
  })

  it('falls back to initials when the player has no photograph', () => {
    renderWithProviders(
      <PlayerCard
        player={buildPlayerCard({ avatarPath: null })}
        metrics={TEST_METRICS}
      />,
    )

    expect(screen.getByText('DC')).toBeInTheDocument()
  })

  it('renders an em dash for a metric the player has never been scored on', () => {
    renderWithProviders(
      <PlayerCard
        player={buildPlayerCard({ metricCardStats: {}, matchesPlayed: 0 })}
        metrics={TEST_METRICS}
      />,
    )

    expect(screen.getAllByText('—')).toHaveLength(TEST_METRICS.length)
  })

  it('pluralises the match count', () => {
    const { unmount } = renderWithProviders(
      <PlayerCard
        player={buildPlayerCard({ matchesPlayed: 1 })}
        metrics={TEST_METRICS}
      />,
    )
    expect(screen.getByText('1 partido')).toBeInTheDocument()
    unmount()

    renderWithProviders(
      <PlayerCard
        player={buildPlayerCard({ matchesPlayed: 4 })}
        metrics={TEST_METRICS}
      />,
    )
    expect(screen.getByText('4 partidos')).toBeInTheDocument()
  })

  describe('tiers', () => {
    it.each([
      { rating: 96, tier: 'gold' },
      { rating: 75, tier: 'gold' },
      { rating: 68, tier: 'silver' },
      { rating: 42, tier: 'bronze' },
    ])('renders $rating as $tier', ({ rating, tier }) => {
      renderWithProviders(
        <PlayerCard
          player={buildPlayerCard({ cardRating: rating })}
          metrics={TEST_METRICS}
        />,
      )

      expect(screen.getByTestId('player-card')).toHaveAttribute(
        'data-tier',
        tier,
      )
    })
  })

  it('marks an inactive player', () => {
    renderWithProviders(
      <PlayerCard
        player={buildPlayerCard({ isActive: false })}
        metrics={TEST_METRICS}
      />,
    )

    expect(screen.getByText('Inactivo')).toBeInTheDocument()
  })

  it('links to the player detail page when asked', () => {
    renderWithProviders(
      <PlayerCard
        player={buildPlayerCard()}
        metrics={TEST_METRICS}
        linkTo="/players/player-1"
      />,
    )

    expect(
      screen.getByRole('link', { name: /ver ficha de david castelló/i }),
    ).toHaveAttribute('href', '/players/player-1')
  })

  it('is not a link by default', () => {
    renderWithProviders(
      <PlayerCard player={buildPlayerCard()} metrics={TEST_METRICS} />,
    )

    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })
})

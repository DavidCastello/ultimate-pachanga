import { describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { MatchCard } from '@/components/MatchCard'
import { renderWithProviders } from '@/test/render'
import { buildMatch } from '@/test/factories'

// The photograph is resolved through the Supabase storage client, which would
// otherwise require a configured environment just to render a card.
vi.mock('@/lib/supabase', () => ({
  getMatchPhotoUrl: (path: string | null) =>
    path ? `https://example.test/match-photos/${path}` : null,
  supabase: {},
  MATCH_PHOTOS_BUCKET: 'match-photos',
}))

describe('MatchCard', () => {
  it('shows the fixture, when it is played and where', () => {
    renderWithProviders(<MatchCard match={buildMatch()} />)

    expect(screen.getByText('Jornada 3')).toBeInTheDocument()
    expect(screen.getByText('Los Cracks')).toBeInTheDocument()
    expect(screen.getByText(/Los Pachangueros/)).toBeInTheDocument()
    expect(screen.getByText('Polideportivo Roco')).toBeInTheDocument()
    expect(screen.getByText(/en /)).toBeInTheDocument()
  })

  it('links to the match', () => {
    renderWithProviders(<MatchCard match={buildMatch({ id: 'match-9' })} />)

    expect(screen.getByRole('link')).toHaveAttribute('href', '/matches/match-9')
  })

  it('prefers the photograph uploaded for this match', () => {
    const { container } = renderWithProviders(
      <MatchCard
        match={buildMatch({
          photo_path: 'league-1/match-1.webp',
          updated_at: '2026-07-02T10:00:00.000Z',
        })}
      />,
    )

    // Replacing a photograph reuses its path, so the timestamp is what stops
    // the browser showing the one it cached.
    expect(container.querySelector('img')).toHaveAttribute(
      'src',
      `https://example.test/match-photos/league-1/match-1.webp?v=${Date.parse('2026-07-02T10:00:00.000Z')}`,
    )
  })

  it('falls back to the venue photograph, without announcing it', () => {
    const { container } = renderWithProviders(
      <MatchCard match={buildMatch({ location: 'UIB' })} />,
    )

    const photo = container.querySelector('img')
    expect(photo).toHaveAttribute('src', '/venues/uib.webp')
    // Decorative: the venue is already written out beside it.
    expect(photo).toHaveAttribute('alt', '')
  })
})

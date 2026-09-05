import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { MatchCard } from '@/components/MatchCard'
import { renderWithProviders } from '@/test/render'
import { buildMatch, buildPlayerCard } from '@/test/factories'

// The photograph is resolved through the Supabase storage client, which would
// otherwise require a configured environment just to render a card.
vi.mock('@/lib/supabase', () => ({
  getMatchPhotoUrl: (path: string | null) =>
    path ? `https://example.test/match-photos/${path}` : null,
  getAvatarUrl: (path: string | null) =>
    path ? `https://example.test/avatars/${path}` : null,
  supabase: {},
  MATCH_PHOTOS_BUCKET: 'match-photos',
}))

/**
 * The card says how long until a match, so "now" has to be fixed or the test
 * expires. The fixture kicks off on 1 August 2026; three days before that puts
 * it in the future, which is the wording being asserted.
 *
 * Only Date is faked. Faking the timer functions too would leave React's
 * scheduler and Testing Library waiting on a clock nobody advances.
 */
beforeAll(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-07-29T18:00:00.000Z'))
})

afterAll(() => {
  vi.useRealTimers()
})

describe('MatchCard', () => {
  it('shows the fixture, when it is played and where', () => {
    renderWithProviders(<MatchCard match={buildMatch()} />)

    expect(screen.getByText('Jornada 3')).toBeInTheDocument()
    expect(screen.getByText('Los Cracks')).toBeInTheDocument()
    expect(screen.getByText(/Los Pachangueros/)).toBeInTheDocument()
    expect(screen.getByText('Polideportivo Roco')).toBeInTheDocument()
    expect(screen.getByText(/en 3 días/)).toBeInTheDocument()
  })

  it('counts back instead once the match has been played', () => {
    vi.setSystemTime(new Date('2026-08-04T18:00:00.000Z'))
    renderWithProviders(<MatchCard match={buildMatch()} />)
    vi.setSystemTime(new Date('2026-07-29T18:00:00.000Z'))

    expect(screen.getByText(/hace 3 días/)).toBeInTheDocument()
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

  it('keeps the featured squad as an avatar-only preview', () => {
    const players = [
      buildPlayerCard({
        id: 'player-1',
        displayName: 'Carlos Aznar',
      }),
      buildPlayerCard({
        id: 'player-2',
        displayName: 'Marc Vidal',
      }),
    ]

    renderWithProviders(
      <MatchCard match={buildMatch()} featured participants={players} />,
    )

    expect(screen.getByRole('group', { name: /convocados/i })).toBeVisible()
    expect(screen.getByTitle('Carlos Aznar')).toBeVisible()
    expect(screen.getByTitle('Marc Vidal')).toBeVisible()
    expect(screen.queryByText('Carlos Aznar')).not.toBeInTheDocument()
    expect(screen.queryByText('Marc Vidal')).not.toBeInTheDocument()
  })
})

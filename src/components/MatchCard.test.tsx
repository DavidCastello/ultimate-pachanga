import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import { MatchCard } from '@/components/MatchCard'
import { renderWithProviders } from '@/test/render'
import { buildMatch } from '@/test/factories'

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

  it('backs the card with the venue photograph, without announcing it', () => {
    const { container } = renderWithProviders(
      <MatchCard match={buildMatch({ location: 'UIB' })} />,
    )

    const photo = container.querySelector('img')
    expect(photo).toHaveAttribute('src', '/venues/uib.webp')
    // Decorative: the venue is already written out beside it.
    expect(photo).toHaveAttribute('alt', '')
  })
})

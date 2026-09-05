import { describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MatchHero } from '@/components/MatchHero'
import { renderWithProviders } from '@/test/render'
import { buildMatch } from '@/test/factories'

vi.mock('@/lib/supabase', () => ({
  getMatchPhotoUrl: (path: string | null) =>
    path ? `https://example.test/match-photos/${path}` : null,
  supabase: {},
  MATCH_PHOTOS_BUCKET: 'match-photos',
}))

describe('MatchHero', () => {
  it('opens the artwork in a full-screen viewer without distorting it', async () => {
    const user = userEvent.setup()
    const match = buildMatch({ photo_path: 'league-1/jornada-3.webp' })

    renderWithProviders(<MatchHero match={match} />)

    await user.click(screen.getByRole('button', { name: /ver imagen/i }))

    const image = screen.getByRole('img', { name: /imagen de jornada 3/i })
    expect(image).toHaveClass('h-auto', 'w-auto', 'object-contain')
    expect(image).toHaveClass(
      'max-h-[calc(100svh-2rem)]',
      'max-w-[calc(100vw-2rem)]',
    )
    expect(
      screen.getByRole('button', { name: /cerrar imagen/i }),
    ).toBeInTheDocument()
  })
})

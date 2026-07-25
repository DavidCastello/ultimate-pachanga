import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { Route, Routes } from 'react-router'
import { LeagueMemberRoute } from '@/app/guards'
import { renderWithProviders } from '@/test/render'

/**
 * The membership guard.
 *
 * It decides nothing about authorization — RLS does that — but it is what
 * stops a freshly registered account landing on a shell full of empty pages
 * with no way to finish joining.
 */

const useMembership = vi.hoisted(() => vi.fn())
const useMyPlayerId = vi.hoisted(() => vi.fn())

vi.mock('@/features/league/useLeague', () => ({ useMembership }))
vi.mock('@/features/players/useMyPlayer', () => ({ useMyPlayerId }))

function renderGuard() {
  return renderWithProviders(
    <Routes>
      <Route element={<LeagueMemberRoute />}>
        <Route path="/league" element={<p>La liga</p>} />
      </Route>
      <Route path="/onboarding" element={<p>Elige tu jugador</p>} />
    </Routes>,
    { route: '/league' },
  )
}

const MEMBERSHIP = { leagueId: 'league-1', role: 'member' as const }

describe('LeagueMemberRoute', () => {
  beforeEach(() => {
    useMembership.mockReset()
    useMyPlayerId.mockReset()
  })

  it('lets a member with a player through', () => {
    useMembership.mockReturnValue({ data: MEMBERSHIP, isPending: false })
    useMyPlayerId.mockReturnValue({ data: 'player-1', isPending: false })

    renderGuard()

    expect(screen.getByText('La liga')).toBeInTheDocument()
  })

  it('sends an account with no membership to finish joining', () => {
    useMembership.mockReturnValue({ data: null, isPending: false })
    useMyPlayerId.mockReturnValue({ data: undefined, isPending: true })

    renderGuard()

    expect(screen.getByText('Elige tu jugador')).toBeInTheDocument()
  })

  // The owner is an administrator from their first sign-in but still has to
  // say which player they are.
  it('sends a member who has not claimed a player to finish joining', () => {
    useMembership.mockReturnValue({ data: MEMBERSHIP, isPending: false })
    useMyPlayerId.mockReturnValue({ data: null, isPending: false })

    renderGuard()

    expect(screen.getByText('Elige tu jugador')).toBeInTheDocument()
  })

  it('waits rather than redirecting while membership is still loading', () => {
    useMembership.mockReturnValue({ data: undefined, isPending: true })
    useMyPlayerId.mockReturnValue({ data: undefined, isPending: true })

    renderGuard()

    expect(screen.getByRole('status')).toBeInTheDocument()
    expect(screen.queryByText('Elige tu jugador')).not.toBeInTheDocument()
  })
})

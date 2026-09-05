import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { Route, Routes } from 'react-router'
import { LeagueMemberRoute, LeagueViewerRoute } from '@/app/guards'
import { renderWithProviders } from '@/test/render'

/**
 * The membership guard.
 *
 * It decides nothing about authorization — RLS does that — but it is what
 * stops a freshly registered account landing on a shell full of empty pages
 * with no way to finish joining.
 */

const useMembership = vi.hoisted(() => vi.fn())
const useLeague = vi.hoisted(() => vi.fn())
const useMyPlayerId = vi.hoisted(() => vi.fn())
const useAuth = vi.hoisted(() => vi.fn())

vi.mock('@/features/league/useLeague', () => ({ useLeague, useMembership }))
vi.mock('@/features/players/useMyPlayer', () => ({ useMyPlayerId }))
vi.mock('@/features/auth/useAuth', () => ({ useAuth }))

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

function renderViewerGuard() {
  return renderWithProviders(
    <Routes>
      <Route element={<LeagueViewerRoute />}>
        <Route path="/league" element={<p>La liga pública</p>} />
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
    useAuth.mockReturnValue({ session: null, user: null, isLoading: false })
    useLeague.mockReturnValue({
      data: { id: 'league-1' },
      error: null,
      isPending: false,
      refetch: vi.fn(),
    })
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

describe('LeagueViewerRoute', () => {
  beforeEach(() => {
    useMembership.mockReset()
    useAuth.mockReset()
    useLeague.mockReturnValue({
      data: { id: 'league-1' },
      error: null,
      isPending: false,
      refetch: vi.fn(),
    })
  })

  it('lets an anonymous spectator through without asking for an account', () => {
    useAuth.mockReturnValue({ session: null, user: null, isLoading: false })
    useMembership.mockReturnValue({ data: undefined, isPending: false })

    renderViewerGuard()

    expect(screen.getByText('La liga pública')).toBeInTheDocument()
  })

  it('keeps signed-in members in the league', () => {
    useAuth.mockReturnValue({ session: {}, user: {}, isLoading: false })
    useMembership.mockReturnValue({ data: MEMBERSHIP, isPending: false })

    renderViewerGuard()

    expect(screen.getByText('La liga pública')).toBeInTheDocument()
  })

  it('sends a signed-in account without membership to onboarding', () => {
    useAuth.mockReturnValue({ session: {}, user: {}, isLoading: false })
    useMembership.mockReturnValue({ data: null, isPending: false })

    renderViewerGuard()

    expect(screen.getByText('Elige tu jugador')).toBeInTheDocument()
  })

  it('explains a public data failure instead of showing an empty page', () => {
    useAuth.mockReturnValue({ session: null, user: null, isLoading: false })
    useMembership.mockReturnValue({ data: undefined, isPending: false })
    useLeague.mockReturnValue({
      data: undefined,
      error: new Error('function does not exist'),
      isPending: false,
      refetch: vi.fn(),
    })

    renderViewerGuard()

    expect(
      screen.getByText('No hemos podido cargar la liga'),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Reintentar' }),
    ).toBeInTheDocument()
  })
})

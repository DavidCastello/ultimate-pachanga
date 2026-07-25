import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { OnboardingPage } from '@/pages/OnboardingPage'
import { renderWithProviders } from '@/test/render'

/**
 * Finishing registration.
 *
 * Both ways in are covered: claiming the player an administrator put on the
 * roster, and creating one when there is nothing left to claim.
 */

const useMembership = vi.hoisted(() => vi.fn())
const useMyPlayerId = vi.hoisted(() => vi.fn())
const fetchJoinableLeagues = vi.hoisted(() => vi.fn())
const fetchUnclaimedPlayers = vi.hoisted(() => vi.fn())
const claimPlayer = vi.hoisted(() => vi.fn())
const createOwnPlayer = vi.hoisted(() => vi.fn())

vi.mock('@/features/league/useLeague', () => ({
  useMembership,
  leagueKeys: { membership: ['league', 'membership'] },
}))
vi.mock('@/features/players/useMyPlayer', () => ({ useMyPlayerId }))
vi.mock('@/features/onboarding/api', () => ({
  fetchJoinableLeagues,
  fetchUnclaimedPlayers,
  claimPlayer,
  createOwnPlayer,
  onboardingKeys: {
    joinableLeagues: ['onboarding', 'leagues'],
    unclaimedPlayers: (leagueId: string) => ['onboarding', 'players', leagueId],
  },
}))
vi.mock('@/features/players/api', () => ({ playerKeys: { all: ['players'] } }))
vi.mock('@/features/auth/api', () => ({ signOut: vi.fn() }))
vi.mock('@/lib/env', () => ({ APP_NAME: 'Ultimate Pachanga' }))
vi.mock('@/lib/supabase', () => ({
  getAvatarUrl: () => null,
  supabase: {},
  PLAYER_AVATARS_BUCKET: 'player-avatars',
}))

const LEAGUE = {
  leagueId: 'league-1',
  title: 'Liga de verano roco',
  unclaimedPlayerCount: 2,
  isMember: false,
}

const ROSTER = [
  {
    playerId: 'player-1',
    playerCode: 'PLR-A7K2',
    firstName: 'David',
    lastName: 'Castelló',
    nickname: null,
    displayName: 'David Castelló',
    preferredPosition: 'CM' as const,
    avatarPath: null,
  },
  {
    playerId: 'player-2',
    playerCode: 'PLR-B9F1',
    firstName: 'Juan',
    lastName: 'García',
    nickname: 'Juanito',
    displayName: 'Juanito',
    preferredPosition: 'GK' as const,
    avatarPath: null,
  },
]

describe('OnboardingPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useMembership.mockReturnValue({ data: null, isPending: false })
    useMyPlayerId.mockReturnValue({ data: null, isPending: false })
    fetchJoinableLeagues.mockResolvedValue([LEAGUE])
    fetchUnclaimedPlayers.mockResolvedValue(ROSTER)
    claimPlayer.mockResolvedValue(undefined)
    createOwnPlayer.mockResolvedValue('player-3')
  })

  // With one league on offer there is nothing to choose, so the page opens on
  // the roster rather than making everyone click through a list of one.
  it('claims the player the newcomer picks', async () => {
    const user = userEvent.setup()
    renderWithProviders(<OnboardingPage />, { route: '/onboarding' })

    await user.click(await screen.findByLabelText(/Juan García/))
    await user.click(screen.getByRole('button', { name: 'Este soy yo' }))

    await waitFor(() => {
      expect(claimPlayer).toHaveBeenCalledWith('league-1', 'player-2')
    })
  })

  it('offers the roster before offering to create anyone', async () => {
    renderWithProviders(<OnboardingPage />, { route: '/onboarding' })

    expect(await screen.findByLabelText(/David Castelló/)).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Crear mi jugador y entrar' }),
    ).not.toBeInTheDocument()
  })

  it('goes straight to the form when there is nobody left to claim', async () => {
    fetchUnclaimedPlayers.mockResolvedValue([])

    renderWithProviders(<OnboardingPage />, { route: '/onboarding' })

    expect(
      await screen.findByText(/No queda ningún jugador libre/),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Crear mi jugador y entrar' }),
    ).toBeInTheDocument()
  })

  it('creates a player for someone who is not on the roster', async () => {
    fetchUnclaimedPlayers.mockResolvedValue([])
    const user = userEvent.setup()

    renderWithProviders(<OnboardingPage />, { route: '/onboarding' })

    await user.type(await screen.findByLabelText('Nombre'), 'Nuevo')
    await user.type(screen.getByLabelText('Apellidos'), 'Fichaje')
    await user.click(
      screen.getByRole('button', { name: 'Crear mi jugador y entrar' }),
    )

    await waitFor(() => {
      expect(createOwnPlayer).toHaveBeenCalledWith('league-1', {
        firstName: 'Nuevo',
        lastName: 'Fichaje',
        nickname: null,
        preferredPosition: 'UT',
      })
    })
  })

  // A member who has not claimed a player lands here too; they already have a
  // league, so the roster is all that is left to show.
  it('skips the league step for someone who is already a member', async () => {
    useMembership.mockReturnValue({
      data: { leagueId: 'league-1', role: 'admin' },
      isPending: false,
    })

    renderWithProviders(<OnboardingPage />, { route: '/onboarding' })

    expect(await screen.findByLabelText(/David Castelló/)).toBeInTheDocument()
    expect(fetchUnclaimedPlayers).toHaveBeenCalledWith('league-1')
  })
})

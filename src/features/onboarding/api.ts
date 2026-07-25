import { supabase } from '@/lib/supabase'
import type { PlayerPosition } from '@/types/domain'

/**
 * Joining a league.
 *
 * Every call here goes through an RPC rather than a table, because the caller
 * is by definition not a member yet: no RLS policy on `leagues` or `players`
 * can see the rows this flow needs. The functions do their own authorization —
 * see migration 008.
 */

export const onboardingKeys = {
  joinableLeagues: ['onboarding', 'leagues'] as const,
  unclaimedPlayers: (leagueId: string) =>
    ['onboarding', 'players', leagueId] as const,
}

export interface JoinableLeague {
  leagueId: string
  title: string
  unclaimedPlayerCount: number
  isMember: boolean
}

export async function fetchJoinableLeagues(): Promise<JoinableLeague[]> {
  const { data, error } = await supabase.rpc('list_joinable_leagues')

  if (error) throw error

  return data.map((row) => ({
    leagueId: row.league_id,
    title: row.title,
    unclaimedPlayerCount: row.unclaimed_player_count,
    isMember: row.is_member,
  }))
}

export interface UnclaimedPlayer {
  playerId: string
  playerCode: string
  firstName: string
  lastName: string
  nickname: string | null
  displayName: string
  preferredPosition: PlayerPosition
  avatarPath: string | null
}

export async function fetchUnclaimedPlayers(
  leagueId: string,
): Promise<UnclaimedPlayer[]> {
  const { data, error } = await supabase.rpc('list_unclaimed_players', {
    p_league_id: leagueId,
  })

  if (error) throw error

  return data.map((row) => ({
    playerId: row.player_id,
    playerCode: row.player_code,
    firstName: row.first_name,
    lastName: row.last_name,
    nickname: row.nickname,
    displayName: row.display_name,
    preferredPosition: row.preferred_position,
    avatarPath: row.avatar_path,
  }))
}

/** Links the signed-in account to a player already on the roster. */
export async function claimPlayer(
  leagueId: string,
  playerId: string,
): Promise<void> {
  const { error } = await supabase.rpc('join_league_as_player', {
    p_league_id: leagueId,
    p_player_id: playerId,
  })

  if (error) throw error
}

export interface NewPlayerInput {
  firstName: string
  lastName: string
  nickname: string | null
  preferredPosition: PlayerPosition
}

/**
 * Creates a player for the signed-in account and joins its league.
 *
 * For the arrival nobody put on the roster. The import code is generated in
 * the database, which is the only place uniqueness can be checked.
 */
export async function createOwnPlayer(
  leagueId: string,
  input: NewPlayerInput,
): Promise<string> {
  const { data, error } = await supabase.rpc('create_player_and_join', {
    p_league_id: leagueId,
    p_first_name: input.firstName,
    p_last_name: input.lastName,
    // The function folds blank to null, and PostgREST types every text
    // argument as non-nullable, so "no nickname" travels as an empty string.
    p_nickname: input.nickname ?? '',
    p_preferred_position: input.preferredPosition,
  })

  if (error) throw error
  // The function always returns the new id; PostgREST types it nullable
  // because plpgsql cannot promise that.
  if (!data) throw new Error('No se pudo crear tu jugador')

  return data
}

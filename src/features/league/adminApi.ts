import { supabase } from '@/lib/supabase'
import type { LeagueStatus, MemberRole } from '@/types/domain'

/** League settings and membership management. Administrators only, per RLS. */

export interface LeagueSettingsInput {
  title: string
  status: LeagueStatus
  marketConstantGbp: number
}

export async function updateLeagueSettings(
  leagueId: string,
  input: LeagueSettingsInput,
): Promise<void> {
  const { error } = await supabase
    .from('leagues')
    .update({
      title: input.title,
      status: input.status,
      market_constant_gbp: input.marketConstantGbp,
    })
    .eq('id', leagueId)

  if (error) throw error
}

export interface LeagueMemberProfile {
  memberId: string
  userId: string
  email: string
  role: MemberRole
  joinedAt: string
  /** True for the signed-in administrator's own row. */
  isSelf: boolean
}

/**
 * Members with their email addresses.
 *
 * Goes through an RPC because `auth.users` is deliberately not exposed to the
 * API; the function checks the caller is an administrator of the league.
 */
export async function fetchLeagueMembers(
  leagueId: string,
): Promise<LeagueMemberProfile[]> {
  const { data, error } = await supabase.rpc('list_league_members', {
    p_league_id: leagueId,
  })

  if (error) throw error

  return data.map((row) => ({
    memberId: row.member_id,
    userId: row.user_id,
    email: row.email,
    role: row.role,
    joinedAt: row.joined_at,
    isSelf: row.is_self,
  }))
}

export async function updateMemberRole(
  memberId: string,
  role: MemberRole,
): Promise<void> {
  const { error } = await supabase
    .from('league_members')
    .update({ role })
    .eq('id', memberId)

  if (error) throw error
}

export async function removeMember(memberId: string): Promise<void> {
  const { error } = await supabase
    .from('league_members')
    .delete()
    .eq('id', memberId)

  if (error) throw error
}

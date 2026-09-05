import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/features/auth/useAuth'
import {
  fetchPublicLeagueSnapshot,
  publicKeys,
} from '@/features/public/api'
import type {
  LeagueAttributeRow,
  LeagueMetricRow,
  LeagueRow,
  MemberRole,
} from '@/types/domain'

/**
 * League context for the signed-in user.
 *
 * The MVP interface shows one league, but nothing here assumes that: the
 * league is whichever one the user is a member of. RLS already restricts the
 * query to exactly that, so no league id needs to be hardcoded in the
 * frontend.
 */

export const leagueKeys = {
  membership: ['league', 'membership'] as const,
  league: ['league', 'current'] as const,
  metrics: ['league', 'metrics'] as const,
  attributes: ['league', 'attributes'] as const,
  members: ['league', 'members'] as const,
}

export interface Membership {
  leagueId: string
  role: MemberRole
}

export function useMembership() {
  const { user } = useAuth()

  return useQuery({
    queryKey: [...leagueKeys.membership, user?.id],
    enabled: Boolean(user),
    queryFn: async (): Promise<Membership | null> => {
      const { data, error } = await supabase
        .from('league_members')
        .select('league_id, role')
        .eq('user_id', user!.id)
        .maybeSingle()

      if (error) throw error
      if (!data) return null

      return { leagueId: data.league_id, role: data.role }
    },
  })
}

/**
 * Whether the current user administers their league.
 *
 * Used only to decide what to render. Every mutation is independently enforced
 * by RLS, so a wrong answer here is a cosmetic bug, not a security hole.
 */
export function useIsAdmin(): boolean {
  const { data } = useMembership()
  return data?.role === 'admin'
}

export function useLeague() {
  const { data: membership } = useMembership()
  const { user, isLoading: isAuthLoading } = useAuth()

  const memberQuery = useQuery({
    queryKey: [...leagueKeys.league, membership?.leagueId],
    enabled: Boolean(membership),
    queryFn: async (): Promise<LeagueRow> => {
      const { data, error } = await supabase
        .from('leagues')
        .select('*')
        .eq('id', membership!.leagueId)
        .single()

      if (error) throw error
      return data
    },
  })

  const publicQuery = useQuery({
    queryKey: publicKeys.snapshot,
    enabled: !isAuthLoading && !user,
    queryFn: fetchPublicLeagueSnapshot,
    refetchInterval: 60_000,
  })

  return user
    ? memberQuery
    : {
        ...publicQuery,
        data: publicQuery.data?.league ?? undefined,
        isPending: isAuthLoading || publicQuery.isPending,
      }
}

export function useLeagueMetrics() {
  const { data: membership } = useMembership()
  const { user, isLoading: isAuthLoading } = useAuth()

  const memberQuery = useQuery({
    queryKey: [...leagueKeys.metrics, membership?.leagueId],
    enabled: Boolean(membership),
    queryFn: async (): Promise<LeagueMetricRow[]> => {
      const { data, error } = await supabase
        .from('league_metrics')
        .select('*')
        .eq('league_id', membership!.leagueId)
        .eq('is_active', true)
        .order('display_order')

      if (error) throw error
      return data
    },
  })

  const publicQuery = useQuery({
    queryKey: publicKeys.snapshot,
    enabled: !isAuthLoading && !user,
    queryFn: fetchPublicLeagueSnapshot,
    refetchInterval: 60_000,
  })

  return user
    ? memberQuery
    : {
        ...publicQuery,
        data: publicQuery.data?.metrics,
        isPending: isAuthLoading || publicQuery.isPending,
      }
}

export function useLeagueAttributes() {
  const { data: membership } = useMembership()
  const { user, isLoading: isAuthLoading } = useAuth()

  const memberQuery = useQuery({
    queryKey: [...leagueKeys.attributes, membership?.leagueId],
    enabled: Boolean(membership),
    queryFn: async (): Promise<LeagueAttributeRow[]> => {
      const { data, error } = await supabase
        .from('league_attributes')
        .select('*')
        .eq('league_id', membership!.leagueId)
        .eq('is_active', true)
        .order('points', { ascending: false })
        .order('label')

      if (error) throw error
      return data
    },
  })

  const publicQuery = useQuery({
    queryKey: publicKeys.snapshot,
    enabled: !isAuthLoading && !user,
    queryFn: fetchPublicLeagueSnapshot,
    refetchInterval: 60_000,
  })

  return user
    ? memberQuery
    : {
        ...publicQuery,
        data: publicQuery.data?.attributes,
        isPending: isAuthLoading || publicQuery.isPending,
      }
}

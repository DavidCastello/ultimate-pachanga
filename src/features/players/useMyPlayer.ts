import { useQuery } from '@tanstack/react-query'
import { useAuth } from '@/features/auth/useAuth'
import { useMembership } from '@/features/league/useLeague'
import { fetchMyPlayerId, playerKeys } from '@/features/players/api'

/**
 * The player the signed-in account plays as.
 *
 * Gated on membership because RLS hides every player from an account that
 * belongs to no league: querying earlier would return null and be
 * indistinguishable from "has not claimed one yet".
 */
export function useMyPlayerId() {
  const { user } = useAuth()
  const { data: membership } = useMembership()

  return useQuery({
    queryKey: playerKeys.mine(user?.id ?? ''),
    enabled: Boolean(user && membership),
    queryFn: () => fetchMyPlayerId(user!.id),
  })
}

import { Navigate, Outlet, useLocation } from 'react-router'
import { Loader2 } from 'lucide-react'
import { useAuth } from '@/features/auth/useAuth'
import { useMembership } from '@/features/league/useLeague'
import { useMyPlayerId } from '@/features/players/useMyPlayer'

function FullPageSpinner({ label }: { label: string }) {
  return (
    <div
      className="flex min-h-svh items-center justify-center"
      role="status"
      aria-live="polite"
    >
      <Loader2 className="size-6 animate-spin text-muted-foreground" />
      <span className="sr-only">{label}</span>
    </div>
  )
}

/**
 * Requires a session.
 *
 * Waits for the initial session lookup before deciding, otherwise a hard
 * refresh bounces an authenticated user to the login page.
 */
export function ProtectedRoute() {
  const { session, isLoading } = useAuth()
  const location = useLocation()

  if (isLoading) return <FullPageSpinner label="Comprobando sesión" />

  if (!session) {
    // Remember where they were headed so login can return them there.
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  return <Outlet />
}

/**
 * Requires a league and a player.
 *
 * Registering grants nothing, so a fresh account has neither and every page
 * behind this guard would render empty. Someone can also hold a membership
 * without a player — the owner is an administrator from their first sign-in —
 * so both are checked, and both send you to the same place to finish joining.
 */
export function LeagueMemberRoute() {
  const { data: membership, isPending: isMembershipPending } = useMembership()
  const { data: playerId, isPending: isPlayerPending } = useMyPlayerId()

  if (isMembershipPending) return <FullPageSpinner label="Cargando tu liga" />

  if (!membership) return <Navigate to="/onboarding" replace />

  // Only reachable once membership resolved, which is what enables the query.
  if (isPlayerPending) return <FullPageSpinner label="Cargando tu jugador" />

  if (!playerId) return <Navigate to="/onboarding" replace />

  return <Outlet />
}

/**
 * Requires the admin role.
 *
 * Convenience only: the same restriction is enforced by RLS, so bypassing this
 * guard gets you a page whose every mutation fails.
 */
export function AdminRoute() {
  const { data: membership, isPending } = useMembership()

  if (isPending) return <FullPageSpinner label="Comprobando permisos" />

  if (membership?.role !== 'admin') {
    return <Navigate to="/league" replace />
  }

  return <Outlet />
}

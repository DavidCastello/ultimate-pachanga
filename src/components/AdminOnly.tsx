import { useIsAdmin } from '@/features/league/useLeague'

/**
 * Renders children only for league administrators.
 *
 * This is presentation, not security. Every mutation it hides is independently
 * enforced by an RLS policy, and the pgTAP suite proves a member cannot perform
 * them even by calling the API directly.
 */
export function AdminOnly({
  children,
  fallback = null,
}: {
  children: React.ReactNode
  fallback?: React.ReactNode
}) {
  return useIsAdmin() ? <>{children}</> : <>{fallback}</>
}

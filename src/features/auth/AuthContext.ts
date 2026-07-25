import { createContext } from 'react'
import type { Session, User } from '@supabase/supabase-js'

export interface AuthContextValue {
  session: Session | null
  user: User | null
  /** True until the initial session lookup resolves. */
  isLoading: boolean
}

/**
 * Kept in its own module so AuthProvider.tsx exports only a component, which
 * is what Fast Refresh needs to hot-reload it.
 */
export const AuthContext = createContext<AuthContextValue | undefined>(
  undefined,
)

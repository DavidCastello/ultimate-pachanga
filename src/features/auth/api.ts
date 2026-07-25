import { supabase } from '@/lib/supabase'

export interface Credentials {
  email: string
  password: string
}

/**
 * Auth operations.
 *
 * Supabase returns errors rather than throwing, which is easy to ignore by
 * accident; these wrappers throw so TanStack Query and the forms see failures.
 */

export async function signIn({ email, password }: Credentials): Promise<void> {
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw error
}

export async function signUp({ email, password }: Credentials): Promise<void> {
  const { error } = await supabase.auth.signUp({ email, password })
  if (error) throw error
}

export async function signOut(): Promise<void> {
  const { error } = await supabase.auth.signOut()
  if (error) throw error
}

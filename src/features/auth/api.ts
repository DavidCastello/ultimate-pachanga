import { supabase } from '@/lib/supabase'
import type { AuthError } from '@supabase/supabase-js'

export interface Credentials {
  email: string
  password: string
}

function friendlyAuthError(error: AuthError, fallback: string): Error {
  const messages: Record<string, string> = {
    invalid_credentials: 'El correo o la contraseña no son correctos.',
    email_not_confirmed: 'Confirma tu correo antes de iniciar sesión.',
    user_already_exists: 'Ya existe una cuenta con este correo.',
    email_exists: 'Ya existe una cuenta con este correo.',
    signup_disabled: 'El registro está cerrado temporalmente.',
    weak_password: 'La contraseña no cumple los requisitos de seguridad.',
    over_request_rate_limit:
      'Demasiados intentos seguidos. Espera un momento y vuelve a probar.',
    same_password: 'La nueva contraseña debe ser distinta de la actual.',
  }

  return new Error(messages[error.code ?? ''] ?? fallback)
}

/**
 * Auth operations.
 *
 * Supabase returns errors rather than throwing, which is easy to ignore by
 * accident; these wrappers throw so TanStack Query and the forms see failures.
 */

export async function signIn({ email, password }: Credentials): Promise<void> {
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw friendlyAuthError(error, 'No se pudo iniciar sesión.')
}

export async function signUp({ email, password }: Credentials): Promise<void> {
  const { error } = await supabase.auth.signUp({ email, password })
  if (error) throw friendlyAuthError(error, 'No se pudo crear la cuenta.')
}

export async function requestPasswordReset(email: string): Promise<void> {
  const resetPath = `${import.meta.env.BASE_URL}reset-password`.replace(
    /\/+/g,
    '/',
  )
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}${resetPath}`,
  })
  if (error) {
    throw friendlyAuthError(
      error,
      'No se pudo enviar el enlace. Inténtalo de nuevo.',
    )
  }
}

export async function updatePassword(newPassword: string): Promise<void> {
  const { error } = await supabase.auth.updateUser({ password: newPassword })
  if (error) {
    throw friendlyAuthError(error, 'No se pudo cambiar la contraseña.')
  }
}

export async function signOut(): Promise<void> {
  const { error } = await supabase.auth.signOut()
  if (error) throw friendlyAuthError(error, 'No se pudo cerrar la sesión.')
}

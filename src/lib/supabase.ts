import { createClient } from '@supabase/supabase-js'
import { env } from '@/lib/env'
import type { Database } from '@/types/database'

/**
 * The single Supabase client for the app.
 *
 * Typed with the generated `Database` so table, view and RPC names are checked
 * at compile time. Regenerate types with `npm run db:types` after any schema
 * change.
 *
 * This holds the publishable key, which ships to every visitor — that is
 * expected and safe *only* because every table has RLS enabled. A secret or
 * service-role key must never appear in a `VITE_` variable.
 */
export const supabase = createClient<Database>(
  env.VITE_SUPABASE_URL,
  env.VITE_SUPABASE_PUBLISHABLE_KEY,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  },
)

export const PLAYER_AVATARS_BUCKET = 'player-avatars'

export const MATCH_PHOTOS_BUCKET = 'match-photos'

/**
 * Public URL for a stored avatar, or null when the player has no photograph
 * and the card should fall back to initials.
 */
export function getAvatarUrl(path: string | null | undefined): string | null {
  if (!path) return null

  const { data } = supabase.storage
    .from(PLAYER_AVATARS_BUCKET)
    .getPublicUrl(path)

  return data.publicUrl
}

/**
 * Public URL for a match's own photograph, or null when nobody uploaded one and
 * the match should fall back to the picture bundled for its location.
 */
export function getMatchPhotoUrl(
  path: string | null | undefined,
): string | null {
  if (!path) return null

  const { data } = supabase.storage.from(MATCH_PHOTOS_BUCKET).getPublicUrl(path)

  return data.publicUrl
}

/**
 * Every shape a Supabase failure arrives in.
 *
 * `PostgrestError` is a plain object, not an `Error`, so `instanceof Error`
 * misses it and the useful text is in `message` beside a `code` worth showing —
 * PGRST116 and 42501 are each a different afternoon of debugging.
 *
 * Deliberately verbatim rather than friendly. Postgres and PostgREST say
 * exactly what went wrong ("permission denied for table players", "column
 * matches.photo_path does not exist"), and paraphrasing that into "algo ha ido
 * mal" throws away the only useful sentence in the whole failure.
 */
export function toErrorDetail(error: unknown): string {
  if (!error) return 'Error desconocido'

  if (typeof error === 'object' && 'message' in error) {
    const { message, code } = error as { message?: unknown; code?: unknown }
    const text = typeof message === 'string' ? message : String(error)

    return typeof code === 'string' && code ? `${code}: ${text}` : text
  }

  return String(error)
}

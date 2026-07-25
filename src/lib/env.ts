import { z } from 'zod'

/**
 * Environment configuration, validated once at startup.
 *
 * Failing loudly here beats a stack of "undefined is not a valid URL" errors
 * from deep inside the Supabase client when someone forgets `.env.local`.
 */

const environmentSchema = z.object({
  VITE_SUPABASE_URL: z
    .string()
    .min(1, 'VITE_SUPABASE_URL is required')
    .url('VITE_SUPABASE_URL must be a URL, e.g. http://127.0.0.1:54421'),
  VITE_SUPABASE_PUBLISHABLE_KEY: z
    .string()
    .min(1, 'VITE_SUPABASE_PUBLISHABLE_KEY is required'),
  VITE_APP_NAME: z.string().min(1).default('Roco Summer League'),
})

function readEnvironment() {
  const parsed = environmentSchema.safeParse(import.meta.env)

  if (!parsed.success) {
    const problems = parsed.error.issues
      .map((issue) => `  - ${issue.message}`)
      .join('\n')

    // Vite inlines VITE_* at build time, so a deployed page that reaches here
    // was built without them — the values are missing from the build, not from
    // the server. On Cloudflare that means the Worker's build variables rather
    // than its runtime ones, which is not where you look first.
    throw new Error(
      `Invalid environment configuration:\n${problems}\n\n` +
        'Locally: copy .env.example to .env.local and fill it in from ' +
        '`npm run db:status`.\n' +
        'Deployed: set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY as ' +
        'build variables and deploy again.',
    )
  }

  return parsed.data
}

export const env = readEnvironment()

export const APP_NAME = env.VITE_APP_NAME

import type { MatchStatus } from '@/types/domain'

/**
 * Whether a match is still ahead of the league.
 *
 * The convocatoria rules all hang off this one question, so it is asked in one
 * place: before a match is played anyone may add themselves and rearrange the
 * teams, and afterwards the squad is a historical record that only an
 * administrator may touch — and even they may no longer add or remove anyone.
 *
 * Mirrors `public.match_is_upcoming`, which is what actually enforces it (see
 * migration 011). If the set of statuses changes it changes in both places.
 */
export function isUpcomingMatch(
  status: MatchStatus | null | undefined,
): boolean {
  return status === 'draft' || status === 'scheduled'
}

import { supabase } from '@/lib/supabase'
import type { Formation } from '@/lib/formations'
import type { Json } from '@/types/database'
import type {
  AttendanceStatus,
  MatchRow,
  MatchStatus,
  PlayerPosition,
  TeamSide,
} from '@/types/domain'

export const matchKeys = {
  all: ['matches'] as const,
  list: (leagueId: string) => ['matches', 'list', leagueId] as const,
  detail: (matchId: string) => ['matches', 'detail', matchId] as const,
  squad: (matchId: string) => ['matches', 'squad', matchId] as const,
  scores: (matchId: string) => ['matches', 'scores', matchId] as const,
}

export async function fetchMatches(leagueId: string): Promise<MatchRow[]> {
  const { data, error } = await supabase
    .from('matches')
    .select('*')
    .eq('league_id', leagueId)
    .order('played_at', { ascending: false })

  if (error) throw error
  return data
}

export async function fetchMatch(matchId: string): Promise<MatchRow> {
  const { data, error } = await supabase
    .from('matches')
    .select('*')
    .eq('id', matchId)
    .single()

  if (error) throw error
  return data
}

export interface SquadMember {
  playerId: string
  playerCode: string
  firstName: string
  lastName: string
  displayName: string
  preferredPosition: PlayerPosition
  teamSide: TeamSide
  attendanceStatus: AttendanceStatus
  /** Null when the player is convocated but not placed on the pitch. */
  pitchSlot: number | null
}

export async function fetchSquad(matchId: string): Promise<SquadMember[]> {
  const { data, error } = await supabase
    .from('match_players')
    .select(
      `team_side,
       attendance_status,
       pitch_slot,
       players!inner (
         id, player_code, first_name, last_name, nickname, preferred_position
       )`,
    )
    .eq('match_id', matchId)

  if (error) throw error

  return data
    .map((row) => ({
      playerId: row.players.id,
      playerCode: row.players.player_code,
      firstName: row.players.first_name,
      lastName: row.players.last_name,
      displayName:
        row.players.nickname?.trim() ||
        `${row.players.first_name} ${row.players.last_name}`,
      preferredPosition: row.players.preferred_position,
      teamSide: row.team_side,
      attendanceStatus: row.attendance_status,
      pitchSlot: row.pitch_slot,
    }))
    .sort((left, right) =>
      left.displayName.localeCompare(right.displayName, 'es'),
    )
}

export interface MatchScoreEntry {
  playerId: string
  playerCode: string
  displayName: string
  metricScores: Record<string, number>
  goals: number
  /** 1 won, 0 lost, 0.5 drawn. */
  victory: number
  baseScore: number
  attributePoints: number
  finalScore: number
  attributes: { code: string; label: string; points: number }[]
}

export async function fetchMatchScores(
  matchId: string,
): Promise<MatchScoreEntry[]> {
  const { data, error } = await supabase
    .from('player_match_scores')
    .select(
      `base_score, attribute_points, final_score, metric_scores, goals, victory,
       players!inner (id, player_code, first_name, last_name, nickname),
       player_match_score_attributes (
         league_attributes (code, label, points)
       )`,
    )
    .eq('match_id', matchId)

  if (error) throw error

  return data
    .map((row) => ({
      playerId: row.players.id,
      playerCode: row.players.player_code,
      displayName:
        row.players.nickname?.trim() ||
        `${row.players.first_name} ${row.players.last_name}`,
      metricScores: (row.metric_scores ?? {}) as Record<string, number>,
      goals: row.goals,
      victory: Number(row.victory),
      baseScore: row.base_score,
      attributePoints: row.attribute_points,
      finalScore: row.final_score,
      attributes: row.player_match_score_attributes
        .map((link) => link.league_attributes)
        .filter((attribute): attribute is NonNullable<typeof attribute> =>
          Boolean(attribute),
        ),
    }))
    .sort((left, right) => right.finalScore - left.finalScore)
}

export interface MatchInput {
  title: string
  location: string
  playedAt: string
  homeTeamName: string
  awayTeamName: string
  status: MatchStatus
}

export async function createMatch(
  leagueId: string,
  input: MatchInput,
): Promise<string> {
  const { data, error } = await supabase
    .from('matches')
    .insert({
      league_id: leagueId,
      title: input.title,
      location: input.location,
      played_at: input.playedAt,
      home_team_name: input.homeTeamName,
      away_team_name: input.awayTeamName,
      status: input.status,
    })
    .select('id')
    .single()

  if (error) throw error
  return data.id
}

export async function updateMatch(
  matchId: string,
  input: MatchInput,
): Promise<void> {
  const { error } = await supabase
    .from('matches')
    .update({
      title: input.title,
      location: input.location,
      played_at: input.playedAt,
      home_team_name: input.homeTeamName,
      away_team_name: input.awayTeamName,
      status: input.status,
    })
    .eq('id', matchId)

  if (error) throw error
}

/**
 * Cancels a match.
 *
 * Matches are never deleted — a cancelled fixture is part of the season's
 * record, and deleting one would take its scores with it.
 */
export async function cancelMatch(matchId: string): Promise<void> {
  const { error } = await supabase
    .from('matches')
    .update({ status: 'cancelled' })
    .eq('id', matchId)

  if (error) throw error
}

export interface SquadSelection {
  playerId: string
  teamSide: TeamSide
  attendanceStatus: AttendanceStatus
}

/**
 * Replaces the squad for a match.
 *
 * Removals are deleted and the rest upserted, rather than clearing the table
 * and reinserting: a player who already has a score must keep their
 * match_players row, because deleting it would orphan that score.
 */
export async function saveSquad(
  matchId: string,
  selections: readonly SquadSelection[],
): Promise<void> {
  const { data: existing, error: existingError } = await supabase
    .from('match_players')
    .select('player_id')
    .eq('match_id', matchId)

  if (existingError) throw existingError

  const keptIds = new Set(selections.map((selection) => selection.playerId))
  const removedIds = existing
    .map((row) => row.player_id)
    .filter((playerId) => !keptIds.has(playerId))

  if (removedIds.length > 0) {
    const { error: deleteError } = await supabase
      .from('match_players')
      .delete()
      .eq('match_id', matchId)
      .in('player_id', removedIds)

    if (deleteError) throw deleteError
  }

  if (selections.length === 0) return

  const { error: upsertError } = await supabase.from('match_players').upsert(
    selections.map((selection) => ({
      match_id: matchId,
      player_id: selection.playerId,
      team_side: selection.teamSide,
      attendance_status: selection.attendanceStatus,
    })),
    { onConflict: 'match_id,player_id' },
  )

  if (upsertError) throw upsertError
}

/**
 * Moves players between slots, sides and the bench.
 *
 * A swap only ever touches the players involved, so this takes just those rows
 * rather than rewriting the whole squad.
 *
 * The slots are cleared before being reassigned: `(match_id, team_side,
 * pitch_slot)` is unique, so writing A into B's slot while B still holds it
 * would collide. Two statements rather than one transaction is acceptable here
 * because the worst case is a lineup that needs rearranging again, not a
 * corrupted result.
 */
export async function saveLineup(
  matchId: string,
  changes: readonly LineupChange[],
): Promise<void> {
  if (changes.length === 0) return

  const playerIds = changes.map((change) => change.playerId)

  const { error: clearError } = await supabase
    .from('match_players')
    .update({ pitch_slot: null })
    .eq('match_id', matchId)
    .in('player_id', playerIds)

  if (clearError) throw clearError

  // Sequential rather than parallel: concurrent writes to the same unique index
  // can deadlock, and seven rows is not worth the risk.
  for (const change of changes) {
    const { error } = await supabase
      .from('match_players')
      .update({ team_side: change.teamSide, pitch_slot: change.pitchSlot })
      .eq('match_id', matchId)
      .eq('player_id', change.playerId)

    if (error) throw error
  }
}

export interface LineupChange {
  playerId: string
  teamSide: TeamSide
  pitchSlot: number | null
}

export async function saveFormation(
  matchId: string,
  side: 'home' | 'away',
  formation: Formation,
): Promise<void> {
  const { error } = await supabase
    .from('matches')
    .update(
      side === 'home'
        ? { home_formation: formation }
        : { away_formation: formation },
    )
    .eq('id', matchId)

  if (error) throw error
}

export interface ImportRow {
  player_code: string
  metric_scores: Record<string, number>
  attribute_codes: string[]
  goals: number
  /** 1 won, 0 lost, 0.5 drawn. Worth two points. */
  victory: number
}

export interface ImportSummary {
  matchId: string
  importedCount: number
}

/**
 * Imports a full set of results through the transactional RPC.
 *
 * The database re-validates everything and rolls the whole batch back if any
 * row fails, so a rejected import can never leave half a match scored.
 */
export async function importMatchScores(
  matchId: string,
  rows: readonly ImportRow[],
): Promise<ImportSummary> {
  const { data, error } = await supabase.rpc('import_match_scores', {
    p_match_id: matchId,
    // The generated signature types this parameter as `Json`, which a readonly
    // array of interfaces does not structurally satisfy.
    p_rows: rows as unknown as Json,
  })

  if (error) throw error

  const summary = data as { match_id: string; imported_count: number }
  return {
    matchId: summary.match_id,
    importedCount: summary.imported_count,
  }
}

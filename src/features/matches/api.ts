import { supabase, MATCH_PHOTOS_BUCKET } from '@/lib/supabase'
import { toImageExtension } from '@/lib/images'
import { publicSnapshotForAnonymous } from '@/features/public/api'
import type { Formation, SquadSize } from '@/lib/formations'
import type { Json } from '@/types/database'
import type {
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
  const publicSnapshot = await publicSnapshotForAnonymous()
  if (publicSnapshot) {
    return publicSnapshot.matches.filter((match) => match.league_id === leagueId)
  }

  const { data, error } = await supabase
    .from('matches')
    .select('*')
    .eq('league_id', leagueId)
    .order('played_at', { ascending: false })

  if (error) throw error
  return data
}

export async function fetchMatch(matchId: string): Promise<MatchRow> {
  const publicSnapshot = await publicSnapshotForAnonymous()
  if (publicSnapshot) {
    const match = publicSnapshot.matches.find((entry) => entry.id === matchId)
    if (!match) throw new Error('No se encontró el partido')
    return match
  }

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
  /** Null when the player is convocated but not placed on the pitch. */
  pitchSlot: number | null
  /**
   * What the player was worth going into this match, frozen when it was
   * scored. Null while the match is still to be played, and on the fixtures
   * that were already in the books before the column existed — in both cases
   * the caller falls back to the player's current value.
   */
  marketValueGbp: number | null
}

export async function fetchSquad(matchId: string): Promise<SquadMember[]> {
  const publicSnapshot = await publicSnapshotForAnonymous()
  if (publicSnapshot) {
    return publicSnapshot.squads
      .filter((row) => row.match_id === matchId)
      .map((row) => ({
        playerId: row.player_id,
        playerCode: '',
        firstName: row.first_name,
        lastName: row.last_name,
        displayName:
          row.nickname?.trim() || `${row.first_name} ${row.last_name}`,
        preferredPosition: row.preferred_position,
        teamSide: row.team_side,
        pitchSlot: row.pitch_slot,
        marketValueGbp: row.market_value_gbp,
      }))
      .sort((left, right) =>
        left.displayName.localeCompare(right.displayName, 'es'),
      )
  }

  const { data, error } = await supabase
    .from('match_players')
    .select(
      `team_side,
       pitch_slot,
       market_value_gbp,
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
      pitchSlot: row.pitch_slot,
      marketValueGbp: row.market_value_gbp,
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
  const publicSnapshot = await publicSnapshotForAnonymous()
  if (publicSnapshot) {
    return publicSnapshot.scores
      .filter((row) => row.match_id === matchId)
      .map((row) => ({
        playerId: row.player_id,
        playerCode: '',
        displayName: row.display_name,
        metricScores: row.metric_scores,
        goals: row.goals,
        victory: Number(row.victory),
        baseScore: row.base_score,
        attributePoints: row.attribute_points,
        finalScore: row.final_score,
        attributes: row.attributes,
      }))
      .sort((left, right) => right.finalScore - left.finalScore)
  }

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
  /**
   * Players a side, goalkeeper included.
   *
   * The formations are not sent with it and never need to be: migration 015
   * replaces any shape that no longer fits with the default for the new size,
   * and benches whoever fell off the end of the pitch. So a change of size is
   * one field, and a formation chosen for a size that still fits survives an
   * unrelated edit to the title.
   */
  playersPerTeam: SquadSize
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
      players_per_team: input.playersPerTeam,
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
      players_per_team: input.playersPerTeam,
    })
    .eq('id', matchId)

  if (error) throw error
}

/**
 * Uploads a photograph of the place this match is played and points the match
 * at it.
 *
 * The object goes to `{leagueId}/{matchId}.{ext}`, the layout the storage
 * policies authorize against: the first segment identifies the league, so no
 * lookup table is needed to decide who may write it. Upsert replaces rather
 * than accumulating files, which is what correcting a photograph should do.
 *
 * Matches without one keep `photo_path` null and fall back to the picture
 * bundled for their location, so uploading is never required to create a
 * fixture.
 */
export async function uploadMatchPhoto(
  leagueId: string,
  matchId: string,
  file: File,
): Promise<string> {
  const extension = toImageExtension(file)
  const path = `${leagueId}/${matchId}.${extension}`

  const { error: uploadError } = await supabase.storage
    .from(MATCH_PHOTOS_BUCKET)
    .upload(path, file, { upsert: true, contentType: file.type })

  if (uploadError) throw uploadError

  const { error } = await supabase
    .from('matches')
    .update({ photo_path: path })
    .eq('id', matchId)

  if (error) throw error

  return path
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
    })),
    { onConflict: 'match_id,player_id' },
  )

  if (upsertError) throw upsertError
}

/**
 * Signs the caller's own player up for a match.
 *
 * A plain insert rather than an RPC: the `match_players_join_self` policy in
 * migration 011 already expresses the whole rule — your own player, and a match
 * still to be played — and PostgREST refuses anything else with a 42501. They
 * arrive on the bench with no side, and place themselves by tapping a free
 * position.
 */
export async function joinMatch(
  matchId: string,
  playerId: string,
): Promise<void> {
  const { error } = await supabase.from('match_players').insert({
    match_id: matchId,
    player_id: playerId,
    team_side: 'unassigned',
  })

  if (error) throw error
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
/**
 * Writes one player's result, from the UI rather than from a spreadsheet.
 *
 * Deliberately the same RPC as the CSV import, called with a single row. The
 * database owns the formulas and every range check, and it upserts by
 * `(match_id, player_id)` — so this corrects exactly one player and cannot
 * produce a score the import would have rejected. Writing to
 * `player_match_scores` directly would mean recomputing base and final scores in
 * the browser, which is how two sources of truth start.
 *
 * Like any import, it marks the match as scored.
 */
export async function saveMatchScore(
  matchId: string,
  row: ImportRow,
): Promise<void> {
  await importMatchScores(matchId, [row])
}

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

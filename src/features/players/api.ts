import { supabase, PLAYER_AVATARS_BUCKET } from '@/lib/supabase'
import { toImageExtension } from '@/lib/images'
import {
  toPlayerCardData,
  type PlayerCardData,
  type PlayerPosition,
} from '@/types/domain'

export const playerKeys = {
  all: ['players'] as const,
  cards: (leagueId: string) => ['players', 'cards', leagueId] as const,
  card: (playerId: string) => ['players', 'card', playerId] as const,
  history: (playerId: string) => ['players', 'history', playerId] as const,
  mine: (userId: string) => ['players', 'mine', userId] as const,
}

/**
 * The player the signed-in account plays as, or null if it has not claimed one.
 *
 * A single unique index guarantees at most one per league, and RLS restricts
 * the query to the caller's own league, so `maybeSingle` is safe.
 */
export async function fetchMyPlayerId(userId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('players')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle()

  if (error) throw error
  return data?.id ?? null
}

export async function fetchPlayerCards(
  leagueId: string,
): Promise<PlayerCardData[]> {
  const { data, error } = await supabase
    .from('player_cards')
    .select('*')
    .eq('league_id', leagueId)
    .order('card_rating', { ascending: false })

  if (error) throw error

  return data
    .map(toPlayerCardData)
    .filter((card): card is PlayerCardData => card !== null)
}

export async function fetchPlayerCard(
  playerId: string,
): Promise<PlayerCardData> {
  const { data, error } = await supabase
    .from('player_cards')
    .select('*')
    .eq('id', playerId)
    .single()

  if (error) throw error

  const card = toPlayerCardData(data)
  if (!card) throw new Error('This player record is incomplete')

  return card
}

export interface PlayerMatchHistoryEntry {
  matchId: string
  matchTitle: string
  playedAt: string
  goals: number
  /** 1 won, 0 lost, 0.5 drawn. */
  victory: number
  baseScore: number
  attributePoints: number
  finalScore: number
  metricScores: Record<string, number>
  attributes: { code: string; label: string; points: number }[]
}

/**
 * A player's scored matches, newest first.
 *
 * Nested selects keep this to one round trip; PostgREST resolves the joins
 * through the foreign keys declared in the schema.
 */
export async function fetchPlayerHistory(
  playerId: string,
): Promise<PlayerMatchHistoryEntry[]> {
  const { data, error } = await supabase
    .from('player_match_scores')
    .select(
      `base_score,
       attribute_points,
       final_score,
       metric_scores,
       goals,
       victory,
       matches!inner (id, title, played_at, status),
       player_match_score_attributes (
         league_attributes (code, label, points)
       )`,
    )
    .eq('player_id', playerId)
    .eq('matches.status', 'scored')
    .order('played_at', { ascending: false, referencedTable: 'matches' })

  if (error) throw error

  return data.map((row) => ({
    matchId: row.matches.id,
    matchTitle: row.matches.title,
    playedAt: row.matches.played_at,
    goals: row.goals,
    victory: Number(row.victory),
    baseScore: row.base_score,
    attributePoints: row.attribute_points,
    finalScore: row.final_score,
    metricScores: (row.metric_scores ?? {}) as Record<string, number>,
    attributes: row.player_match_score_attributes
      .map((link) => link.league_attributes)
      .filter((attribute): attribute is NonNullable<typeof attribute> =>
        Boolean(attribute),
      ),
  }))
}

/** What a player may say about themselves. */
export interface PlayerInput {
  firstName: string
  lastName: string
  nickname: string | null
  preferredPosition: PlayerPosition
}

/**
 * That, plus the two judgements only an administrator makes.
 *
 * Separate types rather than optional fields, because the split is the
 * authorization boundary: `updateOwnPlayerProfile` below goes through a
 * function whose argument list simply has nowhere to put these, and a member
 * pricing themselves or excusing themselves from the league table is exactly
 * what that function exists to prevent.
 */
export interface AdminPlayerInput extends PlayerInput {
  isGuest: boolean
  /** Null when the administrator did not venture a figure. */
  estimatedMarketValueGbp: number | null
}

/**
 * Generates a `PLR-XXXX` import code.
 *
 * The alphabet omits I, O, 0 and 1: these codes are typed by hand into
 * spreadsheets, where those characters get confused for each other.
 */
function generatePlayerCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const random = crypto.getRandomValues(new Uint8Array(4))
  const suffix = Array.from(
    random,
    (byte) => alphabet[byte % alphabet.length],
  ).join('')

  return `PLR-${suffix}`
}

export async function createPlayer(
  leagueId: string,
  input: AdminPlayerInput,
): Promise<string> {
  // A collision is possible but vanishingly unlikely at this scale; the unique
  // constraint on (league_id, player_code) is what actually guarantees it.
  const { data, error } = await supabase
    .from('players')
    .insert({
      league_id: leagueId,
      player_code: generatePlayerCode(),
      first_name: input.firstName,
      last_name: input.lastName,
      nickname: input.nickname,
      preferred_position: input.preferredPosition,
      is_guest: input.isGuest,
      estimated_market_value_gbp: input.estimatedMarketValueGbp,
    })
    .select('id')
    .single()

  if (error) throw error
  return data.id
}

export async function updatePlayer(
  playerId: string,
  input: AdminPlayerInput,
): Promise<void> {
  const { error } = await supabase
    .from('players')
    .update({
      first_name: input.firstName,
      last_name: input.lastName,
      nickname: input.nickname,
      preferred_position: input.preferredPosition,
      is_guest: input.isGuest,
      estimated_market_value_gbp: input.estimatedMarketValueGbp,
    })
    .eq('id', playerId)

  if (error) throw error
}

/**
 * Activates or deactivates a player.
 *
 * Players are never deleted: their scores are part of the league's history, so
 * removing one would leave past matches referring to nobody.
 */
export async function setPlayerActive(
  playerId: string,
  isActive: boolean,
): Promise<void> {
  const { error } = await supabase
    .from('players')
    .update({ is_active: isActive })
    .eq('id', playerId)

  if (error) throw error
}

/**
 * Edits the caller's own player.
 *
 * A member reaches these fields through a function rather than the table
 * because RLS cannot restrict columns: an update policy wide enough to let
 * someone rename themselves would also hand them their import code and their
 * active flag. Administrators keep using updatePlayer above.
 */
export async function updateOwnPlayerProfile(
  playerId: string,
  input: PlayerInput,
): Promise<void> {
  const { error } = await supabase.rpc('update_own_player_profile', {
    p_player_id: playerId,
    p_first_name: input.firstName,
    p_last_name: input.lastName,
    // The function folds blank to null, and PostgREST types every text
    // argument as non-nullable, so "no nickname" travels as an empty string.
    p_nickname: input.nickname ?? '',
    p_preferred_position: input.preferredPosition,
  })

  if (error) throw error
}

/**
 * Uploads a photograph to `{leagueId}/{playerId}.{ext}`.
 *
 * That layout is what the storage policies authorize against: the first
 * segment identifies the league and the file name identifies the player, so
 * neither an administrator's nor a member's write needs a lookup table.
 * Upsert replaces rather than accumulating files.
 */
async function uploadAvatarObject(
  leagueId: string,
  playerId: string,
  file: File,
  extension: string,
): Promise<string> {
  const path = `${leagueId}/${playerId}.${extension}`

  const { error } = await supabase.storage
    .from(PLAYER_AVATARS_BUCKET)
    .upload(path, file, { upsert: true, contentType: file.type })

  if (error) throw error
  return path
}

/** Uploads a player photograph and records its path. Administrators only. */
export async function uploadPlayerAvatar(
  leagueId: string,
  playerId: string,
  file: File,
): Promise<string> {
  const extension = toImageExtension(file)
  const path = await uploadAvatarObject(leagueId, playerId, file, extension)

  const { error } = await supabase
    .from('players')
    .update({ avatar_path: path })
    .eq('id', playerId)

  if (error) throw error

  return path
}

/**
 * Uploads the caller's own photograph.
 *
 * The path is sent to the database as an extension only; the function rebuilds
 * it from the player's own league and id, so a member cannot point their card
 * at somebody else's object.
 */
export async function uploadOwnPlayerAvatar(
  leagueId: string,
  playerId: string,
  file: File,
): Promise<string> {
  const extension = toImageExtension(file)
  await uploadAvatarObject(leagueId, playerId, file, extension)

  const { data, error } = await supabase.rpc('set_own_player_avatar', {
    p_player_id: playerId,
    p_extension: extension,
  })

  if (error) throw error
  // The function always returns the path; PostgREST types it nullable because
  // plpgsql cannot promise that.
  if (!data) throw new Error('No se pudo guardar la foto')

  return data
}

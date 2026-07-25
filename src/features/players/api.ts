import { supabase, PLAYER_AVATARS_BUCKET } from '@/lib/supabase'
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

export interface PlayerInput {
  firstName: string
  lastName: string
  nickname: string | null
  preferredPosition: PlayerPosition
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
  input: PlayerInput,
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
    })
    .select('id')
    .single()

  if (error) throw error
  return data.id
}

export async function updatePlayer(
  playerId: string,
  input: PlayerInput,
): Promise<void> {
  const { error } = await supabase
    .from('players')
    .update({
      first_name: input.firstName,
      last_name: input.lastName,
      nickname: input.nickname,
      preferred_position: input.preferredPosition,
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

const MAX_AVATAR_BYTES = 3 * 1024 * 1024
const ALLOWED_AVATAR_TYPES = ['image/jpeg', 'image/png', 'image/webp']

/**
 * Uploads a player photograph and records its path.
 *
 * The path is `{leagueId}/{playerId}.{ext}`, which is what the storage
 * policies authorize against — the first segment identifies the league. Upload
 * uses upsert so replacing a photo overwrites rather than accumulating files.
 */
export async function uploadPlayerAvatar(
  leagueId: string,
  playerId: string,
  file: File,
): Promise<string> {
  if (!ALLOWED_AVATAR_TYPES.includes(file.type)) {
    throw new Error('La imagen debe ser JPEG, PNG o WebP')
  }

  if (file.size > MAX_AVATAR_BYTES) {
    throw new Error('La imagen no puede superar los 3 MB')
  }

  const extension =
    file.type === 'image/png'
      ? 'png'
      : file.type === 'image/webp'
        ? 'webp'
        : 'jpg'
  const path = `${leagueId}/${playerId}.${extension}`

  const { error: uploadError } = await supabase.storage
    .from(PLAYER_AVATARS_BUCKET)
    .upload(path, file, { upsert: true, contentType: file.type })

  if (uploadError) throw uploadError

  const { error: updateError } = await supabase
    .from('players')
    .update({ avatar_path: path })
    .eq('id', playerId)

  if (updateError) throw updateError

  return path
}

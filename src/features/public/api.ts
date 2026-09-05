import { supabase } from '@/lib/supabase'
import { toPlayerCardData } from '@/types/domain'
import type { Json, Database } from '@/types/database'
import type {
  LeagueAttributeRow,
  LeagueMetricRow,
  LeagueRow,
  MatchRow,
  PlayerCardData,
  PlayerPosition,
  TeamSide,
} from '@/types/domain'

type PlayerCardRow = Database['public']['Views']['player_cards']['Row']

interface PublicSquadRow {
  match_id: string
  player_id: string
  first_name: string
  last_name: string
  nickname: string | null
  preferred_position: PlayerPosition
  team_side: TeamSide
  pitch_slot: number | null
  market_value_gbp: number | null
}

export interface PublicScoreRow {
  match_id: string
  player_id: string
  display_name: string
  metric_scores: Record<string, number>
  goals: number
  victory: number
  base_score: number
  attribute_points: number
  final_score: number
  attributes: { code: string; label: string; points: number }[]
}

interface PublicSnapshotPayload {
  league: LeagueRow | null
  metrics: LeagueMetricRow[]
  attributes: LeagueAttributeRow[]
  players: PlayerCardRow[]
  matches: MatchRow[]
  squads: PublicSquadRow[]
  scores: PublicScoreRow[]
}

export interface PublicLeagueSnapshot
  extends Omit<PublicSnapshotPayload, 'players'> {
  players: PlayerCardData[]
}

export const publicKeys = {
  snapshot: ['public', 'league-snapshot'] as const,
}

let snapshotPromise: Promise<PublicLeagueSnapshot> | null = null
let snapshotFetchedAt = 0
const SNAPSHOT_TTL_MS = 30_000

function parseSnapshot(data: Json): PublicLeagueSnapshot {
  const payload = data as unknown as PublicSnapshotPayload

  return {
    ...payload,
    players: (payload.players ?? [])
      .map(toPlayerCardData)
      .filter((player): player is PlayerCardData => Boolean(player)),
  }
}

export function fetchPublicLeagueSnapshot(): Promise<PublicLeagueSnapshot> {
  if (!snapshotPromise || Date.now() - snapshotFetchedAt > SNAPSHOT_TTL_MS) {
    snapshotPromise = (async () => {
      const { data, error } = await supabase.rpc('get_public_league_snapshot')

      if (error) throw error
      if (!data) throw new Error('No hay una liga pública disponible')

      const snapshot = parseSnapshot(data)
      snapshotFetchedAt = Date.now()
      return snapshot
    })().catch((error) => {
      snapshotPromise = null
      snapshotFetchedAt = 0
      throw error
    })
  }

  return snapshotPromise
}

export async function publicSnapshotForAnonymous(): Promise<PublicLeagueSnapshot | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession()

  return session ? null : fetchPublicLeagueSnapshot()
}

import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Download, Pencil, Upload, Users } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { AdminOnly } from '@/components/AdminOnly'
import { AttributeBadge } from '@/components/AttributeBadge'
import { EmptyState } from '@/components/EmptyState'
import { MatchHero } from '@/components/MatchHero'
import { MatchForm } from '@/features/matches/MatchForm'
import {
  SquadSelector,
  type SquadDraft,
} from '@/features/matches/SquadSelector'
import { PitchLineups, type LineupEntry } from '@/features/matches/PitchLineups'
import { CsvUploadDialog } from '@/features/results/CsvUploadDialog'
import {
  fetchMatch,
  fetchMatchScores,
  fetchSquad,
  importMatchScores,
  matchKeys,
  saveFormation,
  saveLineup,
  saveSquad,
  updateMatch,
  type ImportRow,
  type LineupChange,
  type MatchInput,
} from '@/features/matches/api'
import { DEFAULT_FORMATION, type Formation } from '@/lib/formations'
import { fetchPlayerCards, playerKeys } from '@/features/players/api'
import {
  useIsAdmin,
  useLeagueAttributes,
  useLeagueMetrics,
  useMembership,
} from '@/features/league/useLeague'
import { buildScoreTemplate, downloadCsv, toTemplateFilename } from '@/lib/csv'
import { formatPosition, formatScore, formatVictories } from '@/lib/formatting'
import type { MatchRow, TeamSide } from '@/types/domain'

function toErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback
}

/**
 * The team a player turned out for, by its real name rather than "home".
 *
 * A squad member with no side is possible while an administrator is still
 * arranging the teams; once a match is scored it should not happen.
 */
function toTeamName(side: TeamSide, match: MatchRow | undefined): string {
  if (side === 'home') return match?.home_team_name ?? 'Local'
  if (side === 'away') return match?.away_team_name ?? 'Visitante'
  return 'Sin equipo'
}

export function MatchDetailPage() {
  const { matchId = '' } = useParams()
  const queryClient = useQueryClient()
  const isAdmin = useIsAdmin()
  const { data: membership } = useMembership()
  const { data: metrics = [] } = useLeagueMetrics()
  const { data: attributes = [] } = useLeagueAttributes()

  const [isEditing, setIsEditing] = useState(false)
  const [isSelectingSquad, setIsSelectingSquad] = useState(false)
  const [squadDraft, setSquadDraft] = useState<SquadDraft>(new Map())
  const [isUploadOpen, setIsUploadOpen] = useState(false)

  const { data: match, isPending: isMatchPending } = useQuery({
    queryKey: matchKeys.detail(matchId),
    enabled: Boolean(matchId),
    queryFn: () => fetchMatch(matchId),
  })

  const { data: squad = [], isPending: isSquadPending } = useQuery({
    queryKey: matchKeys.squad(matchId),
    enabled: Boolean(matchId),
    queryFn: () => fetchSquad(matchId),
  })

  const { data: scores = [] } = useQuery({
    queryKey: matchKeys.scores(matchId),
    enabled: Boolean(matchId),
    queryFn: () => fetchMatchScores(matchId),
  })

  // Needed by every viewer now, not just administrators: the pitch renders
  // player cards, which come from this view rather than from the squad query.
  const { data: players = [] } = useQuery({
    queryKey: playerKeys.cards(membership?.leagueId ?? ''),
    enabled: Boolean(membership),
    queryFn: () => fetchPlayerCards(membership!.leagueId),
  })

  /**
   * Which side each player was on.
   *
   * team_side lives on match_players and the scores come from
   * player_match_scores. The two tables have no foreign key between them — both
   * point at players and matches instead — so PostgREST cannot join them and
   * the pairing happens here, off two queries the page already runs.
   */
  const teamNameByPlayerId = useMemo(
    () =>
      new Map(
        squad.map((member) => [
          member.playerId,
          toTeamName(member.teamSide, match),
        ]),
      ),
    [squad, match],
  )

  // A player with a score must stay in the squad; removing them would orphan
  // the result.
  const scoredPlayerIds = useMemo(
    () => new Set(scores.map((score) => score.playerId)),
    [scores],
  )

  /**
   * The squad joined to the card data the pitch renders.
   *
   * A convocated player with no matching card is skipped rather than rendered
   * blank — that can only happen if the two queries are momentarily out of step
   * after a squad change.
   */
  const lineupEntries = useMemo<LineupEntry[]>(() => {
    const cardsById = new Map(players.map((player) => [player.id, player]))

    return squad
      .map((member) => {
        const player = cardsById.get(member.playerId)
        if (!player) return null

        return {
          playerId: member.playerId,
          teamSide: member.teamSide,
          pitchSlot: member.pitchSlot,
          player,
        }
      })
      .filter((entry): entry is LineupEntry => entry !== null)
  }, [squad, players])

  const squadByCode = useMemo(
    () =>
      new Map(
        squad.map((member) => [
          member.playerCode,
          { displayName: member.displayName },
        ]),
      ),
    [squad],
  )

  function invalidateMatch() {
    return Promise.all([
      queryClient.invalidateQueries({ queryKey: matchKeys.all }),
      // Scores move market values and card ratings, so player data is stale too.
      queryClient.invalidateQueries({ queryKey: playerKeys.all }),
    ])
  }

  const editMatch = useMutation({
    mutationFn: (input: MatchInput) => updateMatch(matchId, input),
    onSuccess: async () => {
      await invalidateMatch()
      setIsEditing(false)
      toast.success('Partido actualizado')
    },
    onError: (error) => {
      toast.error(toErrorMessage(error, 'No se pudo actualizar el partido'))
    },
  })

  const persistSquad = useMutation({
    mutationFn: (draft: SquadDraft) =>
      saveSquad(
        matchId,
        [...draft.entries()].map(([playerId, entry]) => ({
          playerId,
          teamSide: entry.teamSide,
          attendanceStatus: entry.attendanceStatus,
        })),
      ),
    onSuccess: async () => {
      await invalidateMatch()
      setIsSelectingSquad(false)
      toast.success('Convocatoria guardada')
    },
    onError: (error) => {
      toast.error(toErrorMessage(error, 'No se pudo guardar la convocatoria'))
    },
  })

  const persistLineup = useMutation({
    mutationFn: (changes: LineupChange[]) => saveLineup(matchId, changes),
    onSuccess: async () => {
      // Only the squad is affected; scores and player cards are untouched by a
      // rearrangement, so this refetches less than invalidateMatch would.
      await queryClient.invalidateQueries({
        queryKey: matchKeys.squad(matchId),
      })
    },
    onError: (error) => {
      toast.error(toErrorMessage(error, 'No se pudo guardar la alineación'))
    },
  })

  const persistFormation = useMutation({
    mutationFn: ({
      side,
      formation,
    }: {
      side: 'home' | 'away'
      formation: Formation
    }) => saveFormation(matchId, side, formation),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: matchKeys.detail(matchId),
      })
    },
    onError: (error) => {
      toast.error(toErrorMessage(error, 'No se pudo cambiar la formación'))
    },
  })

  const runImport = useMutation({
    mutationFn: (rows: ImportRow[]) => importMatchScores(matchId, rows),
    onSuccess: async (summary) => {
      await invalidateMatch()
      toast.success(
        `${summary.importedCount} puntuaciones importadas correctamente`,
      )
    },
    onError: (error) => {
      // The database's message names the offending row, so it is shown verbatim.
      toast.error(
        toErrorMessage(error, 'No se pudieron importar los resultados'),
      )
    },
  })

  function openSquadSelector() {
    setSquadDraft(
      new Map(
        squad.map((member) => [
          member.playerId,
          {
            teamSide: member.teamSide,
            attendanceStatus: member.attendanceStatus,
          },
        ]),
      ),
    )
    setIsSelectingSquad(true)
  }

  function handleDownloadTemplate() {
    if (!match) return

    if (squad.length === 0) {
      toast.error('Convoca primero a los jugadores')
      return
    }

    downloadCsv(
      toTemplateFilename(match.title),
      buildScoreTemplate(
        squad.map((member) => ({
          playerCode: member.playerCode,
          firstName: member.firstName,
          lastName: member.lastName,
        })),
        metrics,
      ),
    )
  }

  if (isMatchPending) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    )
  }

  if (!match) {
    return (
      <EmptyState
        title="No se encontró el partido"
        description="Puede que el enlace sea incorrecto."
        action={
          <Button asChild variant="outline">
            <Link to="/matches">Volver a partidos</Link>
          </Button>
        }
      />
    )
  }

  const homeSquad = squad.filter((member) => member.teamSide === 'home')
  const awaySquad = squad.filter((member) => member.teamSide === 'away')
  const unassignedSquad = squad.filter(
    (member) => member.teamSide === 'unassigned',
  )

  return (
    <div className="flex flex-col gap-5">
      <Button asChild variant="ghost" size="sm" className="w-fit">
        <Link to="/matches">
          <ArrowLeft className="size-4" aria-hidden="true" />
          Partidos
        </Link>
      </Button>

      <MatchHero match={match} />

      <AdminOnly>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={() => setIsEditing((open) => !open)}
          >
            <Pencil className="size-4" aria-hidden="true" />
            {isEditing ? 'Cerrar edición' : 'Editar partido'}
          </Button>
          <Button variant="outline" onClick={openSquadSelector}>
            <Users className="size-4" aria-hidden="true" />
            Convocatoria
          </Button>
          <Button variant="outline" onClick={handleDownloadTemplate}>
            <Download className="size-4" aria-hidden="true" />
            Descargar CSV
          </Button>
          <Button
            onClick={() => setIsUploadOpen(true)}
            disabled={squad.length === 0}
          >
            <Upload className="size-4" aria-hidden="true" />
            {match.status === 'scored'
              ? 'Corregir resultados'
              : 'Subir resultados'}
          </Button>
        </div>
      </AdminOnly>

      {isEditing ? (
        <Card className="max-w-2xl">
          <CardHeader>
            <CardTitle>
              <h2>Editar partido</h2>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <MatchForm
              match={match}
              submitLabel="Guardar cambios"
              onCancel={() => setIsEditing(false)}
              onSubmit={(input) => editMatch.mutateAsync(input)}
            />
          </CardContent>
        </Card>
      ) : null}

      {isSelectingSquad ? (
        <Card>
          <CardHeader>
            <CardTitle>
              <h2>Convocatoria</h2>
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <SquadSelector
              players={players}
              draft={squadDraft}
              onChange={setSquadDraft}
              homeTeamName={match.home_team_name}
              awayTeamName={match.away_team_name}
              lockedPlayerIds={scoredPlayerIds}
              disabled={persistSquad.isPending}
            />
            {scoredPlayerIds.size > 0 ? (
              <p className="text-xs text-muted-foreground">
                Los jugadores que ya tienen puntuación no se pueden quitar de la
                convocatoria.
              </p>
            ) : null}
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setIsSelectingSquad(false)}
              >
                Cancelar
              </Button>
              <Button
                onClick={() => persistSquad.mutate(squadDraft)}
                disabled={persistSquad.isPending}
              >
                Guardar convocatoria
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>
            <h2>Alineaciones</h2>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isSquadPending ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <Skeleton className="aspect-[1000/1250] rounded-xl" />
              <Skeleton className="aspect-[1000/1250] rounded-xl" />
            </div>
          ) : squad.length === 0 ? (
            <EmptyState
              icon={Users}
              title="Nadie convocado todavía"
              description="Selecciona la convocatoria y los jugadores aparecerán sobre el campo."
              className="border-0 py-6"
            />
          ) : (
            <PitchLineups
              entries={lineupEntries}
              metrics={metrics}
              homeTeamName={match.home_team_name}
              awayTeamName={match.away_team_name}
              homeFormation={match.home_formation ?? DEFAULT_FORMATION}
              awayFormation={match.away_formation ?? DEFAULT_FORMATION}
              interactive={isAdmin}
              onFormationChange={(side, formation) =>
                persistFormation.mutate({ side, formation })
              }
              onLineupChange={(changes) => persistLineup.mutate(changes)}
            />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            <h2>Convocados ({squad.length})</h2>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isSquadPending ? (
            <Skeleton className="h-24" />
          ) : squad.length === 0 ? (
            <EmptyState
              icon={Users}
              title="Nadie convocado todavía"
              description="Un administrador debe seleccionar la convocatoria antes de poder puntuar el partido."
              className="border-0 py-6"
            />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {[
                { title: match.home_team_name, members: homeSquad },
                { title: match.away_team_name, members: awaySquad },
                { title: 'Sin asignar', members: unassignedSquad },
              ]
                .filter((group) => group.members.length > 0)
                .map((group) => (
                  <div key={group.title}>
                    <h3 className="mb-2 text-sm font-semibold">
                      {group.title}{' '}
                      <span className="numeric font-normal text-muted-foreground">
                        ({group.members.length})
                      </span>
                    </h3>
                    <ul className="flex flex-col gap-1">
                      {group.members.map((member) => (
                        <li
                          key={member.playerId}
                          className="flex items-baseline justify-between gap-2 text-sm"
                        >
                          <Link
                            to={`/players/${member.playerId}`}
                            className="hover:underline"
                          >
                            {member.displayName}
                          </Link>
                          <span className="text-xs text-muted-foreground">
                            {formatPosition(member.preferredPosition)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
            </div>
          )}
        </CardContent>
      </Card>

      {scores.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>
              <h2>Resultados</h2>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Jugador</TableHead>
                    <TableHead>Equipo</TableHead>
                    {metrics.map((metric) => (
                      <TableHead key={metric.code} className="text-right">
                        {metric.label}
                      </TableHead>
                    ))}
                    <TableHead className="text-right">Goles</TableHead>
                    <TableHead className="text-right">Victoria</TableHead>
                    <TableHead className="text-right">Base</TableHead>
                    <TableHead>Atributos</TableHead>
                    <TableHead className="text-right">Final</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {scores.map((score) => (
                    <TableRow key={score.playerId}>
                      <TableCell className="font-medium">
                        <Link
                          to={`/players/${score.playerId}`}
                          className="hover:underline"
                        >
                          {score.displayName}
                        </Link>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground">
                        {teamNameByPlayerId.get(score.playerId) ?? '—'}
                      </TableCell>
                      {metrics.map((metric) => (
                        <TableCell
                          key={metric.code}
                          className="numeric text-right"
                        >
                          {formatScore(score.metricScores[metric.code] ?? null)}
                        </TableCell>
                      ))}
                      <TableCell className="numeric text-right">
                        {score.goals}
                      </TableCell>
                      <TableCell className="numeric text-right">
                        {formatVictories(score.victory)}
                      </TableCell>
                      <TableCell className="numeric text-right">
                        {formatScore(score.baseScore)}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {score.attributes.map((attribute) => (
                            <AttributeBadge
                              key={attribute.code}
                              label={attribute.label}
                              points={attribute.points}
                            />
                          ))}
                        </div>
                      </TableCell>
                      <TableCell className="numeric text-right font-bold">
                        {formatScore(score.finalScore)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <CsvUploadDialog
        open={isUploadOpen}
        onOpenChange={setIsUploadOpen}
        context={{ metrics, attributes, squad: squadByCode }}
        metrics={metrics}
        attributes={attributes}
        isReimport={match.status === 'scored'}
        onImport={(rows) => runImport.mutateAsync(rows).then(() => undefined)}
      />
    </div>
  )
}

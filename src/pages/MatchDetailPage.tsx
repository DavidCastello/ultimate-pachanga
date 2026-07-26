import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft,
  Check,
  Download,
  Pencil,
  Upload,
  UserPlus,
  Users,
} from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
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
import { ErrorState } from '@/components/ErrorState'
import { MatchHero } from '@/components/MatchHero'
import { MatchForm, type MatchSubmission } from '@/features/matches/MatchForm'
import {
  SquadSelector,
  type SquadDraft,
} from '@/features/matches/SquadSelector'
import { PitchLineups, type LineupEntry } from '@/features/matches/PitchLineups'
import { BalanceTeamsButton } from '@/features/matches/BalanceTeamsButton'
import { CsvUploadDialog } from '@/features/results/CsvUploadDialog'
import {
  MatchScoreDialog,
  type ScoreTarget,
} from '@/features/results/MatchScoreDialog'
import {
  fetchMatch,
  fetchMatchScores,
  fetchSquad,
  importMatchScores,
  joinMatch,
  matchKeys,
  saveFormation,
  saveLineup,
  saveMatchScore,
  saveSquad,
  updateMatch,
  uploadMatchPhoto,
  type ImportRow,
  type LineupChange,
  type MatchScoreEntry,
} from '@/features/matches/api'
import { DEFAULT_FORMATION, type Formation } from '@/lib/formations'
import { fetchPlayerCards, playerKeys } from '@/features/players/api'
import { useMyPlayerId } from '@/features/players/useMyPlayer'
import {
  useIsAdmin,
  useLeagueAttributes,
  useLeagueMetrics,
  useMembership,
} from '@/features/league/useLeague'
import { buildScoreTemplate, downloadCsv, toTemplateFilename } from '@/lib/csv'
import {
  formatMarketValue,
  formatPosition,
  formatScore,
  formatVictories,
} from '@/lib/formatting'
import { isUpcomingMatch } from '@/lib/matchLifecycle'
import { balanceTeams } from '@/lib/teamBalance'
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

interface ResultRow {
  playerId: string
  playerCode: string
  displayName: string
  teamName: string
  /** Absent while this player has no result for the match yet. */
  score: MatchScoreEntry | undefined
}

function toScoreTarget(row: ResultRow): ScoreTarget {
  return {
    playerCode: row.playerCode,
    displayName: row.displayName,
    existing: row.score
      ? {
          metricScores: row.score.metricScores,
          goals: row.score.goals,
          victory: row.score.victory,
          attributeCodes: row.score.attributes.map(
            (attribute) => attribute.code,
          ),
        }
      : undefined,
  }
}

export function MatchDetailPage() {
  const { matchId = '' } = useParams()
  const queryClient = useQueryClient()
  const isAdmin = useIsAdmin()
  const { data: membership } = useMembership()
  const { data: myPlayerId } = useMyPlayerId()
  const { data: metrics = [] } = useLeagueMetrics()
  const { data: attributes = [] } = useLeagueAttributes()

  const [isEditing, setIsEditing] = useState(false)
  const [isSelectingSquad, setIsSelectingSquad] = useState(false)
  const [squadDraft, setSquadDraft] = useState<SquadDraft>(new Map())
  const [isUploadOpen, setIsUploadOpen] = useState(false)
  const [scoreTarget, setScoreTarget] = useState<ScoreTarget | null>(null)

  const {
    data: match,
    isPending: isMatchPending,
    error: matchError,
    refetch: refetchMatch,
  } = useQuery({
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

  /**
   * Who may do what, all of it hanging off one question: has it been played?
   *
   * Before kickoff the convocatoria is everybody's — anyone signs themselves up
   * and anyone sorts the teams out on the pitch. Afterwards it is the record of
   * what happened: nobody adds or removes a player, and only an administrator
   * still moves people, to correct where they actually played. RLS enforces
   * every one of these; this only decides what is worth rendering.
   */
  const isUpcoming = isUpcomingMatch(match?.status)
  const canArrangeLineup = isAdmin || isUpcoming
  const canManageSquad = isAdmin && isUpcoming
  const isAlreadyCalledUp = squad.some(
    (member) => member.playerId === myPlayerId,
  )
  const canJoin = isUpcoming && Boolean(myPlayerId) && !isAlreadyCalledUp

  /**
   * A row of the results table.
   *
   * Administrators get one per convocated player, so somebody the CSV missed can
   * be scored from here; everyone else gets one per result, because an empty row
   * is only useful to whoever can fill it in.
   */
  const resultRows = useMemo<ResultRow[]>(() => {
    const scoreByPlayerId = new Map(
      scores.map((score) => [score.playerId, score]),
    )

    const rows: ResultRow[] = isAdmin
      ? squad.map((member) => ({
          playerId: member.playerId,
          playerCode: member.playerCode,
          displayName: member.displayName,
          teamName: toTeamName(member.teamSide, match),
          score: scoreByPlayerId.get(member.playerId),
        }))
      : scores.map((score) => ({
          playerId: score.playerId,
          playerCode: score.playerCode,
          displayName: score.displayName,
          teamName: teamNameByPlayerId.get(score.playerId) ?? '—',
          score,
        }))

    // Scored players first and best first, the way the table already read; the
    // players still waiting for a score queue up alphabetically underneath.
    return rows.sort((left, right) => {
      if (left.score && right.score) {
        return right.score.finalScore - left.score.finalScore
      }
      if (left.score) return -1
      if (right.score) return 1
      return left.displayName.localeCompare(right.displayName, 'es')
    })
  }, [isAdmin, squad, scores, match, teamNameByPlayerId])

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
    mutationFn: async ({ match: input, photo }: MatchSubmission) => {
      await updateMatch(matchId, input)
      // Second statement rather than second field: the object is stored under
      // the match's id, so it cannot be written by the same update.
      if (photo) await uploadMatchPhoto(membership!.leagueId, matchId, photo)
    },
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
        [...draft.entries()].map(([playerId, teamSide]) => ({
          playerId,
          teamSide,
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

  /**
   * Splits the convocatoria into two sides of equal market value.
   *
   * The arithmetic is `balanceTeams` (src/lib/teamBalance.ts) and it is all that
   * happens here: the result is written through the same `saveLineup` path a
   * drag would have used, and only for the players it actually moves.
   */
  const balance = useMutation({
    mutationFn: async () => {
      const balanced = balanceTeams(
        lineupEntries.map((entry) => ({
          playerId: entry.playerId,
          marketValueGbp: entry.player.marketValueGbp,
          isGoalkeeper: entry.player.preferredPosition === 'GK',
        })),
      )

      const current = new Map(
        lineupEntries.map((entry) => [entry.playerId, entry]),
      )
      const changes = balanced.assignments.filter((assignment) => {
        const entry = current.get(assignment.playerId)
        return (
          entry?.teamSide !== assignment.teamSide ||
          entry?.pitchSlot !== assignment.pitchSlot
        )
      })

      await saveLineup(matchId, changes)
      return balanced
    },
    onSuccess: async (balanced) => {
      await queryClient.invalidateQueries({
        queryKey: matchKeys.squad(matchId),
      })
      toast.success(
        balanced.difference === 0
          ? 'Equipos equilibrados: idéntico valor de mercado'
          : `Equipos equilibrados: ${formatMarketValue(balanced.difference)} de diferencia`,
      )
    },
    onError: (error) => {
      toast.error(
        toErrorMessage(error, 'No se pudieron equilibrar los equipos'),
      )
    },
  })

  const join = useMutation({
    mutationFn: () => joinMatch(matchId, myPlayerId!),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: matchKeys.squad(matchId),
      })
      toast.success('Estás en la convocatoria. Toca una posición libre.')
    },
    onError: (error) => {
      toast.error(
        toErrorMessage(error, 'No se pudo añadirte a la convocatoria'),
      )
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

  const saveScore = useMutation({
    mutationFn: (row: ImportRow) => saveMatchScore(matchId, row),
    onSuccess: async () => {
      await invalidateMatch()
      setScoreTarget(null)
      toast.success('Puntuación guardada')
    },
    onError: (error) => {
      // The database's message names what it objected to, so it is shown as is.
      toast.error(toErrorMessage(error, 'No se pudo guardar la puntuación'))
    },
  })

  function openSquadSelector() {
    setSquadDraft(
      new Map(squad.map((member) => [member.playerId, member.teamSide])),
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

  if (matchError) {
    return <ErrorState error={matchError} onRetry={() => void refetchMatch()} />
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

      <div className="flex flex-wrap gap-2">
        {canJoin ? (
          <Button onClick={() => join.mutate()} disabled={join.isPending}>
            <UserPlus className="size-4" aria-hidden="true" />
            Apuntarme
          </Button>
        ) : null}

        {/* A status rather than a control: there is no self-removal, and saying
            so where the sign-up button was avoids the hunt for one. */}
        {isUpcoming && isAlreadyCalledUp ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge
                variant="secondary"
                className="h-9 gap-1.5 px-3"
                tabIndex={0}
              >
                <Check className="size-4" aria-hidden="true" />
                Estás convocado
              </Badge>
            </TooltipTrigger>
            <TooltipContent>
              Solo un administrador puede quitar a alguien de la convocatoria.
            </TooltipContent>
          </Tooltip>
        ) : null}

        <AdminOnly>
          <Button
            variant="outline"
            onClick={() => setIsEditing((open) => !open)}
          >
            <Pencil className="size-4" aria-hidden="true" />
            {isEditing ? 'Cerrar edición' : 'Editar partido'}
          </Button>
          {/* Once a match has been played its squad is closed to everybody, so
              there is nothing behind this button but a rejected write. */}
          {canManageSquad ? (
            <Button variant="outline" onClick={openSquadSelector}>
              <Users className="size-4" aria-hidden="true" />
              Convocatoria
            </Button>
          ) : null}
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
        </AdminOnly>
      </div>

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
              onSubmit={(submission) => editMatch.mutateAsync(submission)}
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
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
          <CardTitle>
            <h2>Alineaciones</h2>
          </CardTitle>
          {isUpcoming ? (
            <BalanceTeamsButton
              isAdmin={isAdmin}
              hasEnoughPlayers={squad.length >= 2}
              isPending={balance.isPending}
              onBalance={() => balance.mutate()}
            />
          ) : null}
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
              description={
                isUpcoming
                  ? 'Apúntate o añade jugadores y aparecerán sobre el campo.'
                  : 'Este partido se jugó sin convocatoria registrada.'
              }
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
              interactive={canArrangeLineup}
              canChangeFormation={isAdmin}
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
              description={
                isUpcoming
                  ? 'Cualquiera puede apuntarse; quitar a alguien es cosa del administrador.'
                  : 'Nadie quedó registrado en este partido.'
              }
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

      {resultRows.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>
              <h2>Resultados</h2>
            </CardTitle>
            {isAdmin ? (
              <p className="text-sm text-muted-foreground">
                Edita cualquier puntuación, gol o atributo aquí mismo; se guarda
                en la base de datos al instante.
              </p>
            ) : null}
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
                    {isAdmin ? (
                      <TableHead className="text-right">
                        <span className="sr-only">Acciones</span>
                      </TableHead>
                    ) : null}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {resultRows.map((row) => (
                    <TableRow key={row.playerId}>
                      <TableCell className="font-medium">
                        <Link
                          to={`/players/${row.playerId}`}
                          className="hover:underline"
                        >
                          {row.displayName}
                        </Link>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground">
                        {row.teamName}
                      </TableCell>
                      {metrics.map((metric) => (
                        <TableCell
                          key={metric.code}
                          className="numeric text-right"
                        >
                          {formatScore(
                            row.score?.metricScores[metric.code] ?? null,
                          )}
                        </TableCell>
                      ))}
                      <TableCell className="numeric text-right">
                        {row.score ? row.score.goals : '—'}
                      </TableCell>
                      <TableCell className="numeric text-right">
                        {row.score ? formatVictories(row.score.victory) : '—'}
                      </TableCell>
                      <TableCell className="numeric text-right">
                        {formatScore(row.score?.baseScore ?? null)}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {(row.score?.attributes ?? []).map((attribute) => (
                            <AttributeBadge
                              key={attribute.code}
                              label={attribute.label}
                              points={attribute.points}
                            />
                          ))}
                        </div>
                      </TableCell>
                      <TableCell className="numeric text-right font-bold">
                        {formatScore(row.score?.finalScore ?? null)}
                      </TableCell>
                      {isAdmin ? (
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            data-testid={`edit-score-${row.playerCode}`}
                            onClick={() => setScoreTarget(toScoreTarget(row))}
                          >
                            <Pencil className="size-4" aria-hidden="true" />
                            {row.score ? 'Editar' : 'Puntuar'}
                          </Button>
                        </TableCell>
                      ) : null}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <MatchScoreDialog
        open={scoreTarget !== null}
        onOpenChange={(open) => {
          if (!open) setScoreTarget(null)
        }}
        target={scoreTarget}
        metrics={metrics}
        attributes={attributes}
        onSubmit={(row) => saveScore.mutateAsync(row).then(() => undefined)}
      />

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

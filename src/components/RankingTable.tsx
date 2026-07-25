import { Link } from 'react-router'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { getAvatarUrl } from '@/lib/supabase'
import { formatPosition, toInitials } from '@/lib/formatting'
import { cn } from '@/lib/utils'
import type { PlayerCardData } from '@/types/domain'

/** Gold, silver and bronze for the podium; plain type for everyone else. */
const PODIUM_CLASSES = [
  'text-tier-gold',
  'text-tier-silver',
  'text-tier-bronze',
]

interface RankingTableProps {
  players: readonly PlayerCardData[]
  /** Column heading for the ranked value. */
  valueLabel: string
  renderValue: (player: PlayerCardData) => React.ReactNode
  /** Secondary column, e.g. matches played for context. */
  contextLabel?: string
  renderContext?: (player: PlayerCardData) => React.ReactNode
}

export function RankingTable({
  players,
  valueLabel,
  renderValue,
  contextLabel,
  renderContext,
}: RankingTableProps) {
  return (
    <div className="overflow-x-auto rounded-xl border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-12 text-right">#</TableHead>
            <TableHead>Jugador</TableHead>
            <TableHead className="hidden sm:table-cell">Posición</TableHead>
            {contextLabel && renderContext ? (
              <TableHead className="text-right">{contextLabel}</TableHead>
            ) : null}
            <TableHead className="text-right">{valueLabel}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {players.map((player, index) => {
            const avatarUrl = getAvatarUrl(player.avatarPath)

            return (
              <TableRow key={player.id}>
                <TableCell
                  className={cn(
                    'numeric text-right font-bold',
                    PODIUM_CLASSES[index] ?? 'text-muted-foreground',
                  )}
                >
                  {index + 1}
                </TableCell>
                <TableCell>
                  <Link
                    to={`/players/${player.id}`}
                    className="flex min-w-0 items-center gap-2 hover:underline"
                  >
                    <Avatar className="size-7 shrink-0">
                      {avatarUrl ? (
                        <AvatarImage
                          src={avatarUrl}
                          alt=""
                          className="object-cover"
                          loading="lazy"
                        />
                      ) : null}
                      <AvatarFallback className="text-[0.625rem]">
                        {toInitials(
                          player.firstName,
                          player.lastName,
                          player.displayName,
                        )}
                      </AvatarFallback>
                    </Avatar>
                    <span className="truncate font-medium">
                      {player.displayName}
                    </span>
                  </Link>
                </TableCell>
                <TableCell className="hidden text-sm text-muted-foreground sm:table-cell">
                  {formatPosition(player.preferredPosition)}
                </TableCell>
                {contextLabel && renderContext ? (
                  <TableCell className="numeric text-right text-sm text-muted-foreground">
                    {renderContext(player)}
                  </TableCell>
                ) : null}
                <TableCell className="numeric text-right font-semibold">
                  {renderValue(player)}
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}

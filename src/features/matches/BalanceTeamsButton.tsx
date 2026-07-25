import { Lock, Scale } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'

/**
 * "Equilibrar equipos": splits the convocatoria into two sides of equal market
 * value.
 *
 * Offered to everyone and enabled for administrators only. Showing it locked
 * rather than hiding it is the point — the button is how anyone finds out the
 * feature exists, and a tooltip saying whose call it is answers the question
 * before it is asked. Hiding it would just produce "can we not balance the
 * teams?" in the group chat.
 *
 * The arithmetic it triggers lives in src/lib/teamBalance.ts.
 */

interface BalanceTeamsButtonProps {
  isAdmin: boolean
  /** False until there are at least two players to distribute. */
  hasEnoughPlayers: boolean
  isPending: boolean
  onBalance: () => void
}

export function BalanceTeamsButton({
  isAdmin,
  hasEnoughPlayers,
  isPending,
  onBalance,
}: BalanceTeamsButtonProps) {
  const blockedReason = !isAdmin
    ? 'Solo un administrador puede equilibrar los equipos.'
    : !hasEnoughPlayers
      ? 'Convoca al menos dos jugadores para poder repartirlos.'
      : null

  return (
    <Tooltip>
      {/* A disabled button emits no pointer events, so the tooltip hangs off a
          wrapper that does. Focusable, or the explanation would be unreachable
          by keyboard. */}
      <TooltipTrigger asChild>
        <span className="inline-flex" tabIndex={blockedReason ? 0 : -1}>
          <Button
            type="button"
            variant={blockedReason ? 'outline' : 'default'}
            size="sm"
            disabled={Boolean(blockedReason) || isPending}
            onClick={onBalance}
            data-testid="balance-teams"
          >
            {!isAdmin ? (
              <Lock className="size-4" aria-hidden="true" />
            ) : (
              <Scale className="size-4" aria-hidden="true" />
            )}
            Equilibrar equipos
          </Button>
        </span>
      </TooltipTrigger>

      <TooltipContent>
        {blockedReason ??
          'Reparte a los convocados para que el valor de mercado de los dos equipos sea lo más parecido posible.'}
      </TooltipContent>
    </Tooltip>
  )
}

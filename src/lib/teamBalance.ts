import { GOALKEEPER_SLOT, SQUAD_SIZE } from '@/lib/formations'
import type { TeamSide } from '@/types/domain'

/**
 * Splitting a convocatoria into two teams of equal market value.
 *
 * ── Where this formula lives, and why here ──────────────────────────────────
 *
 * In the browser, deliberately, unlike every scoring formula in this codebase.
 * A score is authoritative — it feeds market values and card ratings, so it is
 * computed and re-validated in PostgreSQL and nothing else is trusted with it.
 * A team split is the opposite: it is a *suggestion*. Any partition of the
 * squad is a legal line-up, the database has no opinion on which one is
 * fairest, and what the button produces is written through the same
 * `saveLineup` path an administrator would have produced by dragging cards
 * around. There is nothing to validate server-side, so there is no reason to
 * pay a round trip to find out what two sums are.
 *
 * The one input that *is* authoritative comes from the database:
 * `player_cards.market_value_gbp`, via `public.player_market_values` in
 * migration 004. A player who has never been scored is not worth zero there —
 * the view falls back to the league's average weighted score — so a debutant is
 * balanced as an average player rather than as dead weight.
 *
 * ── What "as equal as possible" means ───────────────────────────────────────
 *
 * Minimise the absolute gap between the two sides' total market value, subject
 * to the squads being the same size (the odd player out goes home). Bench
 * included: everyone called up counts towards their side's total, because
 * substitutions happen and a team is its whole squad.
 *
 * This is the balanced partition problem. It is NP-hard in general and trivial
 * at this scale: descending values plus branch-and-bound settles a
 * twenty-player convocatoria exactly, in single-digit milliseconds. The node
 * budget below is a backstop for absurd inputs, not the expected path — if it
 * is ever spent the answer degrades to the best split found so far, which is
 * always at least as good as the greedy one.
 */

/** A player as the balancer sees them: an id, a price and whether they keep. */
export interface BalanceCandidate {
  playerId: string
  marketValueGbp: number
  /** Their preferred position is GK, so slot 0 is theirs.  */
  isGoalkeeper: boolean
}

export interface TeamAssignment {
  playerId: string
  teamSide: TeamSide
  /** Null for a player who does not fit on the pitch: the bench. */
  pitchSlot: number | null
}

export interface BalancedTeams {
  assignments: TeamAssignment[]
  homeValue: number
  awayValue: number
  /** The gap the search minimised, in GBP. Zero is a perfect split. */
  difference: number
}

/**
 * Search nodes before the exhaustive pass gives up and keeps its best answer.
 *
 * Reached only by a convocatoria far larger than seven-a-side implies. Every
 * realistic input is solved exactly, long before this.
 */
const SEARCH_NODE_BUDGET = 200_000

/**
 * Which side each player takes, as a flag per index into a descending roster.
 *
 * Descending order is what makes the bound bite: the expensive players are
 * placed first, so the gap is large early and the suffix that could still close
 * it is small. `remainingValue[index]` is the most any branch can still move,
 * which is the entire pruning argument — if the current gap cannot be closed to
 * within the champion's even by throwing everything left onto the lighter side,
 * nothing below this node can win.
 */
function findBestSplit(
  values: readonly number[],
  homeCapacity: number,
): boolean[] {
  const total = values.length

  const remainingValue = new Array<number>(total + 1).fill(0)
  for (let index = total - 1; index >= 0; index -= 1) {
    remainingValue[index] = remainingValue[index + 1] + values[index]
  }

  const isHome = new Array<boolean>(total).fill(false)
  let bestSplit = isHome.slice()
  let bestGap = Number.POSITIVE_INFINITY
  let nodesVisited = 0

  /** @param gap home total minus away total, so far. */
  function explore(index: number, homeCount: number, gap: number): void {
    if (bestGap === 0 || nodesVisited >= SEARCH_NODE_BUDGET) return
    nodesVisited += 1

    if (index === total) {
      if (Math.abs(gap) < bestGap) {
        bestGap = Math.abs(gap)
        bestSplit = isHome.slice()
      }
      return
    }

    if (Math.abs(gap) - remainingValue[index] >= bestGap) return

    // The lighter side is tried first, which alone reaches a greedy-quality
    // leaf on the first dive and gives the bound something to work with.
    const sides = gap > 0 ? [false, true] : [true, false]

    for (const takesHome of sides) {
      const fits = takesHome
        ? homeCount < homeCapacity
        : index - homeCount < total - homeCapacity

      if (!fits) continue

      isHome[index] = takesHome
      explore(
        index + 1,
        takesHome ? homeCount + 1 : homeCount,
        takesHome ? gap + values[index] : gap - values[index],
      )
    }
  }

  explore(0, 0, 0)
  return bestSplit
}

/**
 * Where a side's players stand.
 *
 * The goalkeeper takes slot 0; the rest fill the outfield most expensive first,
 * so a short-handed team is short at the back rather than leaving a hole in the
 * middle of the shape. With nobody who plays in goal, the cheapest player of
 * the side goes in — which is the call a captain makes anyway, and beats
 * fielding six players and an empty net.
 */
function placeSide(
  side: TeamSide,
  members: readonly BalanceCandidate[],
): TeamAssignment[] {
  const byValueDescending = [...members].sort(
    (left, right) =>
      right.marketValueGbp - left.marketValueGbp ||
      left.playerId.localeCompare(right.playerId),
  )

  const keeper =
    byValueDescending.find((member) => member.isGoalkeeper) ??
    byValueDescending.at(-1)

  const outfielders = byValueDescending.filter((member) => member !== keeper)

  const placed: TeamAssignment[] = keeper
    ? [
        {
          playerId: keeper.playerId,
          teamSide: side,
          pitchSlot: GOALKEEPER_SLOT,
        },
      ]
    : []

  outfielders.forEach((member, index) => {
    const slot = GOALKEEPER_SLOT + 1 + index
    placed.push({
      playerId: member.playerId,
      teamSide: side,
      pitchSlot: slot < SQUAD_SIZE ? slot : null,
    })
  })

  return placed
}

function sumValues(members: readonly BalanceCandidate[]): number {
  return members.reduce((total, member) => total + member.marketValueGbp, 0)
}

/**
 * Two teams of near-identical market value, each laid out on its pitch.
 *
 * Deterministic: equal-value players are ordered by id, so the same
 * convocatoria always produces the same teams and pressing the button twice
 * changes nothing.
 */
export function balanceTeams(
  candidates: readonly BalanceCandidate[],
): BalancedTeams {
  const roster = [...candidates].sort(
    (left, right) =>
      right.marketValueGbp - left.marketValueGbp ||
      left.playerId.localeCompare(right.playerId),
  )

  // The odd player out plays at home. Somebody has to, and choosing by a rule
  // rather than by whoever happens to be first keeps the result reproducible.
  const homeCapacity = Math.ceil(roster.length / 2)

  const split = findBestSplit(
    roster.map((member) => member.marketValueGbp),
    homeCapacity,
  )

  const home = roster.filter((_, index) => split[index])
  const away = roster.filter((_, index) => !split[index])

  const homeValue = sumValues(home)
  const awayValue = sumValues(away)

  return {
    assignments: [...placeSide('home', home), ...placeSide('away', away)],
    homeValue,
    awayValue,
    difference: Math.abs(homeValue - awayValue),
  }
}

import type { SetupRng } from "./setup-rng.js";
import { deepFreeze } from "./component-catalog.js";
import type { CuratorDealer } from "./setupComponentCatalog.js";

export interface PlayerPrivateGoals {
  readonly curatorGoal: CuratorDealer
  readonly dealerGoal: CuratorDealer
}
export type PrivateGoalsByPlayer =
  Readonly<Record<string, PlayerPrivateGoals>>
export interface PreparedPrivateGoals {
  readonly goalsByPlayer: PrivateGoalsByPlayer
  readonly remainingCuratorGoals: readonly CuratorDealer[]
  readonly remainingDealerGoals: readonly CuratorDealer[]
}

function copyGoal(card: CuratorDealer): CuratorDealer {
  return {
    id: card.id,
    type: card.type,
    artworkReuse: card.artworkReuse,
    targets: card.targets.map(target => ({
      coins: target.coins,
      goal: [...target.goal],
    })),
  }
}

export function preparePrivateGoals(
  playerIds: readonly string[],
  curatorGoals: readonly CuratorDealer[],
  dealerGoals: readonly CuratorDealer[],
  rng: SetupRng
): PreparedPrivateGoals {
  const sortedCuratorGoals = curatorGoals.map(copyGoal).sort((a, b) => {
    if(a.id > b.id) return 1
    if(a.id < b.id) return -1
    return 0
  })
  const sortedDealerGoals = dealerGoals.map(copyGoal).sort((a, b) => {
    if(a.id > b.id) return 1
    if(a.id < b.id) return -1
    return 0
  })

  let remainingCuratorGoals = rng.shuffle('curator-goals', sortedCuratorGoals).map((item) => ({...item}))
  let remainingDealerGoals = rng.shuffle('dealer-goals', sortedDealerGoals).map((item) => ({...item}))
  const goalsByPlayer: Record<string, PlayerPrivateGoals> = {}

  for (const playerId of playerIds) {
    goalsByPlayer[playerId] = {
      curatorGoal: remainingCuratorGoals.shift()!,
      dealerGoal: remainingDealerGoals.shift()!,
    }
  }

  return deepFreeze({
    goalsByPlayer,
    remainingDealerGoals,
    remainingCuratorGoals
  })
}

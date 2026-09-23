import type { SetupRng } from "./setup-rng.js";
import { deepFreeze } from "./component-catalog.js";
import type { GoalCardDefinition } from './goal-card-catalog.js'

export interface PlayerPrivateGoals {
  readonly curatorGoal: GoalCardDefinition
  readonly dealerGoal: GoalCardDefinition
}
export type PrivateGoalsByPlayer =
  Readonly<Record<string, PlayerPrivateGoals>>
export interface PreparedPrivateGoals {
  readonly goalsByPlayer: PrivateGoalsByPlayer
  readonly remainingCuratorGoals: readonly GoalCardDefinition[]
  readonly remainingDealerGoals: readonly GoalCardDefinition[]
}

/** Копирует карту личной цели, чтобы заморозка результата не затронула каталог. */
function copyGoalCard(card: GoalCardDefinition): GoalCardDefinition {
  return {
    id: card.id,
    type: card.type,
    artworkReuse: card.artworkReuse,
    rewardTiers: card.rewardTiers.map(rewardTier => ({
      coins: rewardTier.coins,
      requiredGenres: [...rewardTier.requiredGenres],
    })),
  }
}

/** Детерминированно раздаёт личные цели по ADR-001 и сохраняет остатки колод. */
export function preparePrivateGoals(
  playerIds: readonly string[],
  curatorGoals: readonly GoalCardDefinition[],
  dealerGoals: readonly GoalCardDefinition[],
  rng: SetupRng
): PreparedPrivateGoals {
  const sortedCuratorGoals = curatorGoals.map(copyGoalCard).sort((a, b) => {
    if(a.id > b.id) return 1
    if(a.id < b.id) return -1
    return 0
  })
  const sortedDealerGoals = dealerGoals.map(copyGoalCard).sort((a, b) => {
    if(a.id > b.id) return 1
    if(a.id < b.id) return -1
    return 0
  })

  const remainingCuratorGoals = rng.shuffle('curator-goals', sortedCuratorGoals).map((item) => ({...item}))
  const remainingDealerGoals = rng.shuffle('dealer-goals', sortedDealerGoals).map((item) => ({...item}))
  const goalsByPlayer: Record<string, PlayerPrivateGoals> = {}

  // Обе колоды раздаются синхронно в фиксированном порядке мест игроков.
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

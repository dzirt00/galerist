import { freezeTransition, type GameEvent, type GameTransition } from "./game-events.js";
import type { FinalScoringGameState, GameState } from "./types.js";
import { applyFinalInfluenceScoreToPlayers } from "./final-influence-award.js";
import { calculateFinalInfluenceCoins } from "./influence-scoring.js";

/**
 * Однократно начисляет всем игрокам финальную ценность влияния по SCORE-006.
 * Допускается только после карт целей; сохраняет флаг выплаты, переводит подсчёт
 * в стадию complete и создаёт InfluenceScored в порядке игроков.
 */
export function applyFinalInfluenceScoringToGameState(
  state: Readonly<GameState>,
): GameTransition<Readonly<FinalScoringGameState>> {
  if(state.phase !== 'final_scoring') {
    throw new Error('Is phase not final_scoring')
  }

  if(state.status !== 'in_progress') {
    throw new Error('Is status not in_progress')
  }

  // Флаг хранится в снимке, поэтому повторное начисление запрещено и после восстановления.
  if (state.finalInfluenceScored) {
    throw new Error('Final influence has already been scored')
  }
  if (state.finalScoringStage !== 'influence') throw new Error('Previous final scoring stages are incomplete')

  const updatePlayers = applyFinalInfluenceScoreToPlayers(state.players)

  const influenceScoredPlayerEvents = updatePlayers.map((player) => {

    return {
      type: 'InfluenceScored',
      playerId: player.id,
      coinsAwarded: calculateFinalInfluenceCoins(player.influence),
    } satisfies GameEvent
  })

  return freezeTransition({
    ...state,
    players: updatePlayers,
    finalInfluenceScored: true,
    finalScoringStage: 'complete',
  },influenceScoredPlayerEvents)
}

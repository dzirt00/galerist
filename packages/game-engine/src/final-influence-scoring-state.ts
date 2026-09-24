import { freezeTransition, type GameEvent, type GameTransition } from "./game-events.js";
import type { FinalScoringGameState, GameState } from "./types.js";
import { applyFinalInfluenceScoreToPlayers } from "./final-influence-award.js";
import { calculateFinalInfluenceCoins } from "./influence-scoring.js";

export function applyFinalInfluenceScoringToGameState(
  state: Readonly<GameState>,
): GameTransition<Readonly<FinalScoringGameState>> {
  if(state.phase !== 'final_scoring') {
    throw new Error('Is phase not final_scoring')
  }

  if(state.status !== 'in_progress') {
    throw new Error('Is status not in_progress')
  }

  if (state.finalInfluenceScored) {
    throw new Error('Final influence has already been scored')
  }

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
    finalInfluenceScored: true
  },influenceScoredPlayerEvents)
}

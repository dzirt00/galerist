import type { FinishedGameState, GameState, WinnerCandidate } from "./types.js";
import { freezeTransition, type GameTransition } from "./game-events.js";
import { determineWinners } from "./winner-determination.js";
import { deepFreeze } from "./component-catalog.js";
import { deepEqual } from "./game-state-validation.js";



export function completeFinalScoring(
  state: Readonly<GameState>,
  candidates: readonly WinnerCandidate[],
): GameTransition<Readonly<FinishedGameState>> {

  if ( state.phase !== 'final_scoring' ) {
    throw new Error( 'Is final_scoring' )
  }

  if ( !state.finalInfluenceScored ) {
    throw new Error( 'Is final_scoring' )
  }

  const coinsCandidate = candidates.map(candidate => {
    return {
      playersID: candidate.playerId,
      coins: candidate.coins
    }
  }).sort((a, b) => {
    if(a.playersID > b.playersID) return 1
    if(a.playersID < b.playersID) return -1
    return 0
  })

  const coinsPlayers = state.players.map(player => {
    return {
      playersID: player.id,
      coins: player.coins
    }
  }).sort((a, b) => {
    if(a.playersID > b.playersID) return 1
    if(a.playersID < b.playersID) return -1
    return 0
  })

  if(!deepEqual(coinsPlayers,coinsCandidate)) {
    throw new Error( 'Invalid candidates' )
  }


  const winnersIds = deepFreeze(determineWinners(candidates))


  return freezeTransition({
    ...structuredClone(state),
    phase: 'finished',
    status: 'finished',
    activePlayerId: null,
    winnerIds: winnersIds
  },deepFreeze([{type:'WinnerDetermined', winnerIds: winnersIds },{type: 'FinalScoringCompleted', winnerIds: winnersIds}]))
}

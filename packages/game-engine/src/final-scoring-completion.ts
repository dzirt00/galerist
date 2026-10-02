import type { FinishedGameState, GameState, WinnerCandidate } from "./types.js";
import { freezeTransition, type GameTransition } from "./game-events.js";
import { determineWinners } from "./winner-determination.js";
import { deepFreeze } from "./component-catalog.js";
import { deepEqual } from "./game-state-validation.js";



/** Проверяет итоговых кандидатов, определяет победителей и переводит партию в finished. */

function arraysEqual  (a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((val, i) => val === b[i]);
}

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

  // Сравниваем ID и монеты независимо от порядка кандидатов; остальные показатели переданы извне.
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

  const playerBoards = state.playerBoards.map(player => {
    return {
      playerId: player.playerId,
      visitorsInGallery: player.gallery.visitors
    }
  }).sort((a, b) => {
    if(a.playerId > b.playerId) return 1
    if(a.playerId < b.playerId) return -1
    return 0
  })

  if(!arraysEqual(playerBoards.map(el => el.playerId),coinsPlayers.map(player => player.playersID))) {
    throw new Error( 'Invalid candidates' )
  }

  const updatedCandidates = candidates.map(candidate => {
    const playerBoard = playerBoards.find(pb => pb.playerId === candidate.playerId)
    if(playerBoard === undefined) {
      throw new Error('Invalid candidate')
    }

    return {
      ...candidate,
      galleryVisitorCount: playerBoard.visitorsInGallery.length
    }

  })

  const winnersIds = deepFreeze(determineWinners(updatedCandidates))


  return freezeTransition({
    ...structuredClone(state),
    phase: 'finished',
    status: 'finished',
    activePlayerId: null,
    winnerIds: winnersIds
  },deepFreeze([{type:'WinnerDetermined', winnerIds: winnersIds },{type: 'FinalScoringCompleted', winnerIds: winnersIds}, { type: 'GameFinished', gameId: state.id }]))
}

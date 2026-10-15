import type { FinishedGameState, GameState } from "./types.js";
import { freezeTransition, type GameTransition } from "./game-events.js";
import { determineWinners } from "./winner-determination.js";
import { deepFreeze } from "./component-catalog.js";
import { countAssistantsInPlay } from './final-scoring.js'



/** Сравнивает два упорядоченных набора ID с учётом длины и повторов. */

function arraysEqual  (a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((val, i) => val === b[i]);
}

/**
 * Завершает SCORE-007 после всех выплат финального подсчёта.
 * Собирает показатели ничьей из актуального GameState, сохраняет winnerIds
 * и возвращает переход в finished с итоговыми событиями без изменения входа.
 */
export function completeFinalScoring(
  state: Readonly<GameState>,
): GameTransition<Readonly<FinishedGameState>> {

  if ( state.phase !== 'final_scoring' ) {
    throw new Error( 'Is final_scoring' )
  }

  if ( !state.finalInfluenceScored ) {
    throw new Error( 'Is final_scoring' )
  }
  // Одного флага выплаты влияния недостаточно: стадия также должна подтверждать прохождение всех этапов.
  if (state.finalScoringStage !== 'complete') throw new Error('Previous final scoring stages are incomplete')

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

  const playerBoards = state.playerBoards.map(player => {
    return {
      playerId: player.playerId,
      visitorsInGallery: player.gallery.visitors,
      assistants : player.assistants,
    }
  }).sort((a, b) => {
    if(a.playerId > b.playerId) return 1
    if(a.playerId < b.playerId) return -1
    return 0
  })

  // Сортировка нужна только для проверки состава; исходная очередность players сохраняется для полной ничьей.
  if(!arraysEqual(playerBoards.map(el => el.playerId), coinsPlayers.map(player => player.playersID))) {
    throw new Error( 'Invalid candidates' )
  }

  const candidates = state.players.map(playerState => {
    const playerBoard = playerBoards.find(pb => pb.playerId === playerState.id)
    if(playerBoard === undefined) {
      throw new Error('Invalid candidate')
    }

    if(playerState === undefined) {
      throw new Error('Invalid player')
    }

    return {
      playerId: playerState.id,
      coins: playerState.coins,
      galleryVisitorCount: playerBoard.visitorsInGallery.length,
      assistantsInPlayCount: countAssistantsInPlay(state, playerState.id),
      acquiredArtworkCount: playerState.acquiredArtworkCount
    }

  })

  const winnersIds = deepFreeze(determineWinners(candidates))


  return freezeTransition({
    ...structuredClone(state),
    phase: 'finished',
    status: 'finished',
    activePlayerId: null,
    winnerIds: winnersIds
  },deepFreeze([{type:'WinnerDetermined', winnerIds: winnersIds },{type: 'FinalScoringCompleted', winnerIds: winnersIds}, { type: 'GameFinished', gameId: state.id }]))
}

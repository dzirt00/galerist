import { describe, expect, it } from 'vitest'
import { advanceFinalScoring, advanceTurn, applyFinalInfluenceScoringToGameState, completeFinalScoring,
  determineAuctionOrder, calculateGoalCardCoins, curatorGoals, dealerGoals, setupComponentCatalog,
  projectGameForViewer, projectEventsForViewer, restoreGameState, triggerGameEnd,
  type GameState, type FinalScoringGameState, type ArtworkGenre } from '../src/index.js'
import { createGameState, startGameAfterSetup, withGameEndConditions } from './helpers.js'
import { twoPlayerConfigs, threePlayerConfigs, fourPlayerConfigs } from './fixtures.js'

/** Проводит партию через подготовку и оба завершающих раунда до первого этапа финального подсчёта. */
function finalState(count: 2 | 3 | 4 = 3): FinalScoringGameState {
  let state: GameState = triggerGameEnd(withGameEndConditions(startGameAfterSetup(createGameState({ playerCount: count, seed: 43 },
    count === 2 ? twoPlayerConfigs : count === 3 ? threePlayerConfigs : fourPlayerConfigs)))).state
  while ((state as GameState).phase !== 'final_scoring') state = advanceTurn(state as GameState).state
  if (state.phase !== 'final_scoring') throw new Error('Expected final_scoring')
  return state
}
/** Задаёт ставки сценария и изымает выбранных помощников из офисов и очередей, сохраняя физический запас. */
function placeBids(state: FinalScoringGameState, cells: readonly [number, string][]): FinalScoringGameState {
  const placements = cells.map(([index, cellId], sequence) => ({ cellId, playerId: state.players[index]!.id,
    assistantId: `ASSISTANT-${sequence + 1}`, bid: setupComponentCatalog.marketBidCells.find(item => item.id === cellId)!.bid }))
  return { ...state, internationalMarket: { ...state.internationalMarket, marketAssistants: placements },
    playerBoards: state.playerBoards.map(board => {
      const used = placements.filter(item => item.playerId === board.playerId).map(item => item.assistantId)
      const office = board.assistants.assistantOfficeIds.filter(id => !used.includes(id))
      const queue = board.assistants.assistantHireQueueIds.filter(id => !used.includes(id))
      return { ...board, assistants: { office: office.length, hireQueue: queue.length, assistantOfficeIds: office, assistantHireQueueIds: queue } }
    }) }
}
/** Выполняет публичные этапы до заданной стадии; выбор на непустом аукционе должен задаваться самим тестом. */
function through(state: GameState, target: FinalScoringGameState['finalScoringStage']): FinalScoringGameState {
  while (state.phase === 'final_scoring' && state.finalScoringStage !== target) state = advanceFinalScoring(state).state
  if (state.phase !== 'final_scoring') throw new Error('Expected final scoring')
  return state
}

describe('SCORE-001–007 public persisted sequence', () => {
  it.each([2, 3, 4] as const)('finishes %i players in fixed order, restores every stage, forbids bypass and repeats', count => {
    let state: GameState = finalState(count)
    const initial = structuredClone(state)
    expect(() => applyFinalInfluenceScoringToGameState(state)).toThrow('Previous')
    expect(() => completeFinalScoring(state)).toThrow()
    const events: string[] = []
    while (state.phase !== 'finished') {
      const before = structuredClone(state)
      const result = advanceFinalScoring(state)
      expect(state).toEqual(before)
      expect(Object.isFrozen(result.state)).toBe(true)
      state = restoreGameState(JSON.parse(JSON.stringify(result.state)))
      expect(projectEventsForViewer(result.events, state, null)).toEqual(result.events)
      events.push(...result.events.map(item => item.type))
    }
    const types = ['ExhibitionScored', 'AuctionResolved', 'CuratorCardScored', 'DealerCardScored', 'InfluenceScored', 'WinnerDetermined', 'FinalScoringCompleted', 'GameFinished']
    expect(types.map(type => events.indexOf(type))).toEqual([...types.map(type => events.indexOf(type))].sort((a, b) => a - b))
    expect(state.players.every(player => player.coins >= initial.players.find(item => item.id === player.id)!.coins)).toBe(true)
    expect(projectGameForViewer(state, null).winnerIds).toEqual(state.winnerIds)
    expect(() => advanceFinalScoring(state)).toThrow()
  })

  it('splits tied occupied places, skips absent players and disabled middle column', () => {
    const state = placeBids(finalState(), [[0, 'MARKET-BID-C1-B1'], [1, 'MARKET-BID-C1-B3'], [2, 'MARKET-BID-C3-B6']])
    const result = advanceFinalScoring(state)
    expect(result.events).toEqual([
      { type: 'MarketLeadershipScored', column: 1, playerId: 'player-1', coinsAwarded: 4 },
      { type: 'MarketLeadershipScored', column: 1, playerId: 'player-2', coinsAwarded: 4 },
      { type: 'MarketLeadershipScored', column: 3, playerId: 'player-3', coinsAwarded: 15 },
    ])
    const two = placeBids(finalState(2), [[0, 'MARKET-BID-C2-B1']])
    expect(advanceFinalScoring(two).events).toEqual([])
  })

  it('pays first/second/third and a tie spanning the last printed place', () => {
    const state = placeBids(finalState(4), [[0, 'MARKET-BID-C1-B1'], [0, 'MARKET-BID-C1-B3'], [1, 'MARKET-BID-C1-B6']])
    expect(advanceFinalScoring(state).events.map(item => 'coinsAwarded' in item ? item.coinsAwarded : -1)).toEqual([6, 3])
    const tied = placeBids(finalState(4), [[0, 'MARKET-BID-C1-B1'], [1, 'MARKET-BID-C1-B3'], [2, 'MARKET-BID-C1-B6']])
    expect(advanceFinalScoring(tied).events.map(item => 'coinsAwarded' in item ? item.coinsAwarded : -1)).toEqual([3, 3, 3])
  })

  it('persists auction choices, pays genre price, and forbids duplicate works and players', () => {
    const state = through(placeBids(finalState(), [[0, 'MARKET-BID-C1-B1'], [1, 'MARKET-BID-C3-B6'], [2, 'MARKET-BID-C1-B3']]), 'auction')
    const before = structuredClone(state)
    const artworkId = state.masterpieceAuction.artworks[0]!.id
    expect(determineAuctionOrder(state)).toEqual(['player-2', 'player-3', 'player-1'])
    expect(() => advanceFinalScoring(state, { playerId: 'player-1', artworkId, goalType: 'curator' })).toThrow()
    const first = advanceFinalScoring(state, { playerId: 'player-2', artworkId, goalType: 'dealer' })
    expect(state).toEqual(before)
    expect(first.state.auctionAwards).toEqual([{ playerId: 'player-2', artworkId, goalType: 'dealer' }])
    expect(first.state.players[1]!.acquiredArtworkCount).toBe(state.players[1]!.acquiredArtworkCount + 1)
    expect(first.state.playerBoards[1]!.soldArtworkIds).toEqual(state.playerBoards[1]!.soldArtworkIds)
    const restored = restoreGameState(first.state)
    expect(() => restoreGameState({ ...first.state, auctionAwards: [...first.state.auctionAwards, ...first.state.auctionAwards] })).toThrow('auction award')
    expect(() => restoreGameState({ ...first.state, finalScoringStage: 'unknown' })).toThrow('finalScoringStage')
    const injected = advanceFinalScoring(state, { playerId: 'player-2', artworkId, goalType: 'dealer', type: 'GameFinished' } as import('../src/index.js').AuctionAward)
    expect(injected.events[0]!.type).toBe('ExceptionalArtworkAwarded')
    expect(injected.state.auctionAwards[0]).not.toHaveProperty('type')
    expect(() => advanceFinalScoring(restored, { playerId: 'player-3', artworkId, goalType: 'curator' })).toThrow('unavailable')
    const last = advanceFinalScoring(restored, { playerId: 'player-3', artworkId: state.masterpieceAuction.artworks[1]!.id, goalType: 'curator' })
    expect(last.state).toMatchObject({ finalScoringStage: 'curator' })
    expect(last.events.at(-1)).toEqual({ type: 'AuctionResolved', playerIds: ['player-2', 'player-3'] })
    expect(restoreGameState(last.state)).toEqual(last.state)
  })

  it('uses column priorities and firstPlayerId for a full tie; zero bids never qualify', () => {
    let state = placeBids(finalState(), [[0, 'MARKET-BID-C1-B3'], [1, 'MARKET-BID-C3-B3']])
    expect(determineAuctionOrder(state)).toEqual(['player-2', 'player-1'])
    state = { ...state, internationalMarket: { ...state.internationalMarket, marketAssistants: [
      { playerId: 'player-1', assistantId: 'one', cellId: 'MARKET-BID-C1-B3', bid: 3 },
      { playerId: 'player-2', assistantId: 'two', cellId: 'MARKET-BID-C1-B3', bid: 3 },
    ] }, firstPlayerId: 'player-2' }
    expect(determineAuctionOrder(state)).toEqual(['player-2', 'player-1'])
    expect(determineAuctionOrder(finalState())).toEqual([])
  })

  it.each([...curatorGoals, ...dealerGoals])('scores every target of $id without reusing artworks', card => {
    for (const target of card.rewardTiers) {
      expect(calculateGoalCardCoins(card, target.requiredGenres)).toBe(target.coins)
      if (card.type === 'dealer') expect(calculateGoalCardCoins(card, [...target.requiredGenres, ...target.requiredGenres])).toBe(target.coins * 2)
    }
    expect(calculateGoalCardCoins(card, [])).toBe(0)
  })
  it('chooses the best non-overlapping collection rather than paying overlapping tiers twice', () => {
    const genres: ArtworkGenre[] = ['S', 'P', 'P', 'D', 'A']
    expect(calculateGoalCardCoins(curatorGoals[0]!, genres)).toBe(15)
    expect(calculateGoalCardCoins(dealerGoals[0]!, ['S', 'S', 'S', 'S'])).toBe(20)
    expect(calculateGoalCardCoins(dealerGoals[0]!, ['S'])).toBe(0)
  })
  it.each([...curatorGoals, ...dealerGoals])('integrates $id into the persisted public goal stage', card => {
    const initial = finalState()
    const target = card.rewardTiers[0]!
    const selected: string[] = []
    for (const genre of target.requiredGenres) selected.push(setupComponentCatalog.artworks.find(item => item.genre === genre && !selected.includes(item.id))!.id)
    const state: FinalScoringGameState = { ...initial, finalScoringStage: card.type,
      privateGoals: { ...initial.privateGoals, goalsByPlayer: { ...initial.privateGoals.goalsByPlayer,
        'player-1': { ...initial.privateGoals.goalsByPlayer['player-1']!, [card.type === 'curator' ? 'curatorGoal' : 'dealerGoal']: card } } },
      playerBoards: initial.playerBoards.map((board,index) => index ? board : { ...board,
        soldArtworkIds: card.type === 'dealer' ? selected : [],
        gallery: { ...board.gallery, artworkSlots: (card.type === 'curator' ? [...selected.map(id => ({ artworkId:id,artistId:'ART-A-BLUE-3',signatureTokenId:id,saleValue:0,isMasterpiece:false })), ...Array(4-selected.length).fill(null)] : [null,null,null,null]) as unknown as typeof board.gallery.artworkSlots } }) }
    const result = advanceFinalScoring(state)
    expect(result.events[0]).toEqual({ type: card.type === 'curator' ? 'CuratorCardScored' : 'DealerCardScored', playerId:'player-1', coinsAwarded:target.coins })
    expect(result.state.players[0]!.coins).toBe(state.players[0]!.coins + target.coins)
  })
  it('uses an auction work on only the selected goal, pays zero for a genre without open artists', () => {
    const initial = through(placeBids(finalState(2), [[0, 'MARKET-BID-C1-B3']]), 'auction')
    const artwork = initial.masterpieceAuction.artworks[0]!
    const state = { ...initial, artistMarket: { ...initial.artistMarket, slots: initial.artistMarket.slots.map(item => item.genre === artwork.genre ? { ...item, isOpen:false, fame:null } : item) } }
    const result = advanceFinalScoring(state,{playerId:'player-1',artworkId:artwork.id,goalType:'dealer'})
    expect(result.events).toContainEqual({type:'CoinsReceived',playerId:'player-1',coinsReceived:0})
    expect(result.state.auctionAwards[0]!.goalType).toBe('dealer')
    expect(result.state.playerBoards[0]!.soldArtworkIds).toEqual(state.playerBoards[0]!.soldArtworkIds)
  })
  it('counts market, location and order assistants in the final tie break', () => {
    const initial = through(finalState(2), 'complete')
    const state: FinalScoringGameState = { ...initial, players:initial.players.map(player=>({...player,coins:10})),
      internationalMarket: { ...initial.internationalMarket, marketAssistants:[{cellId:'MARKET-BID-C1-B1',playerId:'player-2',assistantId:'market',bid:1}] },
      playerBoards:initial.playerBoards.map((board,index)=>index?{...board,locationAssistants:[{assistantId:'location',locationId:'LOC-MEDIA_CENTER'}],boardOrders:{...board.boardOrders,1:{orderId:'ORDER-01',orderStatus:'unfulfilled',assistant:'order'}}}:board) }
    expect(completeFinalScoring(state).state.winnerIds).toEqual(['player-2'])
  })
})

describe('SCORE-003 all twenty reputation formulas through public stage', () => {
  const expected = [[3,0],[3,1],[2,1],[2,1],[3,0],[4,0],[2,1],[3,1],[3,3],[2,0],
    [4,0],[3,1],[3,1],[4,2],[0,0],[3,1],[3,1],[0,0],[2,1],[4,2]]
  it.each(setupComponentCatalog.reputationTokenIds.map((tokenId,index) => ({ tokenId,index })))('$tokenId applies exact coins and influence', ({ tokenId,index }) => {
    const initial = finalState()
    const id = initial.players[0]!.id
    const artist = initial.artistMarket.slots[0]!
    const state: FinalScoringGameState = { ...initial, finalScoringStage: 'reputation', players: initial.players.map(player => ({ ...player, influence: 9 })),
      internationalMarket: { ...initial.internationalMarket, marketAssistants: [{ cellId: 'MARKET-BID-C1-B1', playerId: id, assistantId: 'bid', bid: 1 }] },
      artistMarket: { ...initial.artistMarket, slots: initial.artistMarket.slots.map((item,i) => ({ ...item, promotionLevel: i === 0 ? 4 : 0, fame: i === 0 ? 15 : 1, isOpen: true })) },
      playerBoards: initial.playerBoards.map(board => board.playerId === id ? { ...board, boardReputationTokens: { 'BOARD-REP-R2-L': tokenId }, soldArtworkIds: ['WORK-D-01'],
        gallery: { visitors: [{id:'one',type:'B'},{id:'two',type:'R'},{id:'three',type:'W'}], artworkSlots: [{ artworkId:'WORK-A-01', artistId:artist.artistId, signatureTokenId:'signature',saleValue:14,isMasterpiece:true },null,null,null] } } : board) }
    const snapshot = structuredClone(state)
    const result = advanceFinalScoring(state)
    const [coins,influence] = expected[index]!
    expect(result.state.players[0]!.coins).toBe(state.players[0]!.coins + coins!)
    expect(result.state.players[0]!.influence).toBe(9 + influence!)
    expect(result.events[0]).toEqual({ type:'ReputationTokensScored', playerId:id, coinsAwarded:coins, influenceAwarded:influence })
    expect(state).toEqual(snapshot)
    expect(projectEventsForViewer(result.events,result.state,null)).toEqual(result.events)
  })
  it('skips no token and atomically rejects multiple tokens', () => {
    const state = { ...finalState(), finalScoringStage: 'reputation' as const }
    expect(advanceFinalScoring(state).events).toEqual([])
    const bad = { ...state, playerBoards: state.playerBoards.map((board,index) => index ? board : { ...board, boardReputationTokens: { a:'REP-001',b:'REP-002' } }) }
    expect(() => advanceFinalScoring(bad)).toThrow('Only one')
  })
})

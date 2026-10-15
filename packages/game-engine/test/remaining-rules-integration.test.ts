import { describe, expect, it } from 'vitest'
import { resolveStartingReputation, advanceTurn, restoreGameState, projectGameForViewer, projectEventsForViewer,
  openArtist, applyTicketRewardToGameState, setupComponentCatalog, advertisingArtist, applyArtworkPurchaseToGameState,
  type GameState, type RegularPlayGameState } from '../src/index.js'
import { createGameState, startGameAfterSetup } from './helpers.js'
import { twoPlayerConfigs, twoPlayerGameConfig } from './fixtures.js'

/** Создаёт детерминированную партию на двоих и завершает подготовку публичными переходами. */
function game(): RegularPlayGameState { return startGameAfterSetup(createGameState(twoPlayerGameConfig,twoPlayerConfigs)) }
/** Изолированно задаёт активированный стартовый жетон для проверки его разрешения в конце хода. */
function activated(): RegularPlayGameState {
  const state=game(), board=state.playerBoards[0]!, token=board.thirdPartitionReputationTokenId!
  return { ...state, playerBoards:state.playerBoards.map((item,index)=> index ? item : { ...item, thirdPartitionReputationTokenId:null,
    reputationTokenArtworkIds:{ [token]: 'WORK-A-01' } }) }
}

describe('ARTWORK-006: end-of-turn starting reputation',()=>{
  it('buys three works then resolves the starting token before advancing the ordinary turn',()=>{
    const initial=game(),playerId=initial.players[0]!.id
    let state:GameState={...initial,players:initial.players.map(player=>({...player,coins:200,influence:35}))}
    for(const genre of ['D','P','S'] as const){
      const artist:GameState['artistMarket']['slots'][number]=state.artistMarket.slots.find(item=>item.genre===genre && item.category==='blue')!
      if(!artist.isOpen){
        const bonus:NonNullable<GameState['artistSetup']['slots'][number]['bonus']>=state.artistSetup.slots.find(item=>item.artistId===artist.artistId)!.bonus!
        const visitor=[...state.plazaVisitors,...state.visitorBag.visitors].find(item=>item.type==='B'||item.type==='R')!
        const permitted:GameState['plazaVisitors'][number]=state.plazaVisitors.length?state.plazaVisitors.find(item=>item.type!=='W')??state.plazaVisitors[0]!:visitor
        state=openArtist(state,{playerId,artistId:artist.artistId,visitorId:permitted.id,fameArtistId:artist.artistId,
          requestedTicketColors:bonus.reward==='TICKET-DIFF2'?['B','R']:['B']}).state
      }
      const reward=state.artworkMarket.openArtworksByGenre[genre]!.artwork.ticketReward
      const requestedTicketColors:readonly ('B'|'R'|'W')[]=reward==='—'?[]:reward==='B+R+W'?['B','R','W']:
        reward==='R+(B/W)'||reward==='B+(R/W)'||reward==='DIFF2'?['B','R']:reward==='B'||reward==='R'||reward==='W'?[reward]:['B']
      const contract:GameState['playerBoards'][number]['contract']=state.playerBoards.find(board=>board.playerId===playerId)!.contract
      state=applyArtworkPurchaseToGameState(state,{playerId,artistId:artist.artistId,purchaseType:contract?.artistId===artist.artistId?'contract':'regular',requestedTicketColors}).state
    }
    expect(state.playerBoards.find(board=>board.playerId===playerId)!.gallery.artworkSlots.filter(Boolean)).toHaveLength(3)
    expect(()=>advanceTurn(state)).toThrow('starting reputation')
    const visitorId=state.vestibuleVisitors.find(item=>item.playerId===playerId)?.vestibuleVisitor.id
    const result=resolveStartingReputation(state,playerId,{boardCellId:'BOARD-REP-R1-R',...(visitorId?{visitorId}:{})})
    expect(restoreGameState(result.state)).toEqual(result.state)
    expect(()=>advanceTurn(result.state)).not.toThrow()
  })
  it.each(setupComponentCatalog.boardReputationCells)('$id transfers once, pays its reward and returns own vestibule visitor',cell=>{
    const state=activated(), playerId=state.players[0]!.id
    const token=Object.keys(state.playerBoards[0]!.reputationTokenArtworkIds!)[0]!
    const visitor=state.vestibuleVisitors.find(item=>item.playerId===playerId)!.vestibuleVisitor
    const artist=state.artistMarket.slots.find(item=>item.isOpen)!
    const before=structuredClone(state)
    expect(()=>advanceTurn(state)).toThrow('starting reputation')
    const result=resolveStartingReputation(state,playerId,{boardCellId:cell.id,visitorId:visitor.id,
      choices:{fameArtistId:artist.artistId,requestedTicketColors:['B','R'],visitorId:state.plazaVisitors[0]!.id}})
    expect(result.state.playerBoards[0]!.boardReputationTokens).toEqual({[cell.id]:token})
    expect(result.state.playerBoards[0]!.reputationTokenArtworkIds).toBeNull()
    expect(result.events.slice(0,2)).toEqual([
      {type:'ReputationTokenClaimed',playerId,tokenId:token,cellId:'third_partition',boardCellId:cell.id},
      {type:'BoardRewardClaimed',playerId,boardCellId:cell.id,reward:cell.reward},
    ])
    expect(result.events.at(-1)).toMatchObject({type:'VisitorMoved',visitorId:visitor.id,from:'vestibule',to:'plaza'})
    expect(result.state.plazaVisitors.some(item=>item.id===visitor.id)).toBe(true)
    expect(state).toEqual(before)
    expect(restoreGameState(result.state)).toEqual(result.state)
    expect(projectGameForViewer(result.state,null).playerBoards).toEqual(result.state.playerBoards)
    expect(projectEventsForViewer(result.events,result.state,null)).toEqual(result.events)
    expect(()=>resolveStartingReputation(result.state,playerId,{boardCellId:cell.id})).toThrow('No pending')
    expect(()=>advanceTurn(result.state)).not.toThrow()
  })
  it('awards with empty vestibule, rejects missing choice and invalid visitor atomically',()=>{
    const base=activated(), playerId=base.players[0]!.id
    const state={...base,vestibuleVisitors:base.vestibuleVisitors.filter(item=>item.playerId!==playerId)}
    expect(()=>resolveStartingReputation(state,playerId)).toThrow('Choose')
    expect(()=>resolveStartingReputation(base,playerId,{boardCellId:'BOARD-REP-R2-L'})).toThrow('visitor')
    const before=structuredClone(state)
    const result=resolveStartingReputation(state,playerId,{boardCellId:'BOARD-REP-R2-L'})
    expect(result.state.playerBoards[0]!.boardReputationTokens).toHaveProperty('BOARD-REP-R2-L')
    expect(result.events.some(event=>event.type==='VisitorMoved')).toBe(false)
    expect(state).toEqual(before)
  })
  it('removes the activated token when no legal ownership slot remains',()=>{
    const base=activated(),playerId=base.players[0]!.id
    const state={...base,playerBoards:base.playerBoards.map((board,index)=> index ? board : {...board,boardReputationTokens:{'BOARD-REP-R2-L':'REP-001'}})}
    const result=resolveStartingReputation(state,playerId)
    expect(result.events).toEqual([{type:'ReputationTokenRemoved',playerId,tokenId:Object.keys(base.playerBoards[0]!.reputationTokenArtworkIds!)[0]}])
    expect(result.state.playerBoards[0]!.reputationTokenArtworkIds).toBeNull()
    expect(result.state.players).toEqual(state.players)
  })
})

describe('END-001/002: all persisted conditions',()=>{
  it('records the last bag visitor after opening and triggers only after all effects',()=>{
    const base=game(),artist=base.artistMarket.slots.find(item=>!item.isOpen)!
    const bonus=setupComponentCatalog.artistBonuses.find(item=>item.reward==='VISITOR-ANY')!
    const visitor=base.visitorBag.visitors[0]!
    const state:GameState={...base,plazaVisitors:[],visitorBag:{visitors:[visitor]},
      ticketOffice:{ticketsByColor:{B:0,R:0,W:0}},
      artistSetup:{...base.artistSetup,slots:base.artistSetup.slots.map(item=>item.artistId===artist.artistId?{...item,bonus}:item)}}
    const result=openArtist(state,{playerId:base.players[0]!.id,artistId:artist.artistId,visitorId:visitor.id})
    expect(result.state).toMatchObject({visitorBagEmptyReached:true,phase:'ending_current_round'})
    expect(result.events.at(-2)).toEqual({type:'EndConditionReached',condition:'visitor_bag_empty'})
    expect(result.events.at(-1)?.type).toBe('GameEndTriggered')
    expect(projectGameForViewer(result.state,null).visitorBagEmptyReached).toBe(true)
    expect(restoreGameState(result.state)).toEqual(result.state)
    const repeat=applyTicketRewardToGameState(result.state,{playerId:base.players[0]!.id,requestedColors:['B']})
    expect(repeat.events.some(event=>event.type==='EndConditionReached'||event.type==='GameEndTriggered')).toBe(false)
  })
  it('records two superstars from advertising, including final_round, without a repeat',()=>{
    const base=game(),artist=base.artistMarket.slots.find(item=>item.initialPromotion===0)!
    const other=base.artistMarket.slots.find(item=>item.artistId!==artist.artistId)!
    const state:GameState={...base,phase:'final_round',endTriggeredRound:1,
      artistMarket:{...base.artistMarket,slots:base.artistMarket.slots.map(item=>item.artistId===artist.artistId?{...item,isOpen:true,fame:18}:item.artistId===other.artistId?{...item,isOpen:true,fame:19,isSuperstar:true}:item)}}
    const request={playerId:base.players[0]!.id,artistId:artist.artistId,requestedTicketColors:['B'] as const}
    const result=advertisingArtist(state,request)
    expect(result.state.twoSuperstarsReached).toBe(true)
    expect(result.state.phase).toBe('final_round')
    expect(result.events.filter(event=>event.type==='EndConditionReached')).toContainEqual({type:'EndConditionReached',condition:'two_superstars'})
    expect(result.events.some(event=>event.type==='GameEndTriggered')).toBe(false)
    expect(restoreGameState(result.state)).toEqual(result.state)
  })
  it.each(['visitorBagEmptyReached','twoSuperstarsReached'] as const)('restoration requires boolean %s and rejects old schema',field=>{
    const state=game()
    for(const value of [undefined,0,'true',null])expect(()=>restoreGameState({...state,[field]:value})).toThrow()
    expect(()=>restoreGameState({...state,stateSchemaVersion:18})).toThrow('19')
  })
})

describe('CORE-002 finite physical pools',()=>{
  it.each([2,3,4] as const)('valid setup for %i players preserves supplies and rejects fabricated ticket',count=>{
    const players=Array.from({length:count},(_,index)=>({id:`player-${index}`,name:'Player',kind:'human' as const}))
    const state=createGameState({playerCount:count,seed:42},players)
    expect(restoreGameState(state)).toEqual(state)
    expect(()=>restoreGameState({...state,ticketDiscard:{...state.ticketDiscard,B:1}})).toThrow('Ticket component')
    expect(()=>restoreGameState({...state,plazaVisitors:[...state.plazaVisitors,state.visitorBag.visitors[0]!]})).toThrow('multiple locations')
    const artwork=state.artworkMarket.openArtworksByGenre.D!.artwork
    expect(()=>restoreGameState({...state,artworkMarket:{...state.artworkMarket,remainingArtworksByGenre:{...state.artworkMarket.remainingArtworksByGenre,D:[...state.artworkMarket.remainingArtworksByGenre.D,artwork]}}})).toThrow('artwork component')
  })
  it('does not create visitors, tickets or assistants from exhausted supplies',()=>{
    const base=activated(),playerId=base.players[0]!.id
    const state:GameState={...base,plazaVisitors:[],visitorBag:{visitors:[]},vestibuleVisitors:[],
      playerBoards:base.playerBoards.map((board,index)=>index?board:{...board,assistants:{...board.assistants,assistantHireQueueIds:[],hireQueue:0}})}
    const visitor=resolveStartingReputation(state,playerId,{boardCellId:'BOARD-REP-R3-R'})
    expect(visitor.events.filter(event=>event.type==='VisitorMoved')).toEqual([])
    const hire=resolveStartingReputation(state,playerId,{boardCellId:'BOARD-REP-R1-R'})
    expect(hire.events.filter(event=>event.type==='AssistantsHired')).toEqual([])
    const tickets=applyTicketRewardToGameState({...state,ticketOffice:{ticketsByColor:{B:0,R:0,W:0}}},{playerId,requestedColors:['B','R']})
    expect(tickets.events.filter(event=>event.type==='TicketReceived')).toEqual([])
  })
})

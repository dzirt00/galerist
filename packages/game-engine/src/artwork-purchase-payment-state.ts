import type { GameState, PlayerId } from "./types.js";
import { applyArtworkPurchaseCostAndMoveVisitors, type ApplyArtworkPurchaseInput, type ArtworkPurchaseType } from "./artwork-purchase-payment.js";
import { freezeTransition, type GameEvent, type GameTransition } from "./game-events.js";

export interface ArtworkPurchasePaymentRequest {
  readonly playerId: PlayerId
  readonly artistId: string
  readonly purchaseType: ArtworkPurchaseType
  readonly targetInfluence?: number
}

export function applyArtworkPurchasePaymentToGameState(
  state: Readonly<GameState>,
  request: Readonly<ArtworkPurchasePaymentRequest>
): GameTransition<Readonly<GameState>> {

  const {
    playerId,
    artistId,
    purchaseType,
    targetInfluence,
  } = request

  const [ getPlayer ] = state.players.filter( player => player.id === playerId );
  const getIndexPlayer = state.players.findIndex(player => player.id === playerId);

  if ( getPlayer === undefined ) {
    throw new Error( `Invalid player id ${ playerId }` );
  }
  const [ getArtist ] = state.artistMarket.slots.filter( artist => {
    return artist.artistId === artistId
    && artist.isOpen
    && artist.fame !== null
  })

  if ( getArtist === undefined ) {
    throw new Error( `Invalid artist id ${ artistId }` );
  }

  const getArtwork = state.artworkMarket.openArtworksByGenre[getArtist.genre]

  if(getArtwork.artwork.genre !== getArtist.genre) {
    throw new Error('Artwork genre must match artist genre')
  }

  const inputData: ApplyArtworkPurchaseInput = {
    player: { ...getPlayer },
    openArtwork: {...getArtwork},
    artistInitialFame: getArtist.initialFame,
    artistCurrentFame: getArtist.fame!,
    purchaseType: purchaseType,
    plazaVisitors: state.plazaVisitors,
    ...(targetInfluence !== undefined && { targetInfluence })
  }
  const artworkPurchasePaymentResult = applyArtworkPurchaseCostAndMoveVisitors(inputData)

  const visitorMovedEvents = getArtwork.visitors.reduce((acc,visitor) =>{
    const event = Object.freeze({
      type: 'VisitorMoved',
      visitorId: visitor.id,
      from: 'artwork',
      to: 'plaza'})

    acc.push(event)
    return acc;

  },[] as GameEvent[])
  const updatedPlayers = [...state.players.map(item => ({...item}))]
  updatedPlayers[getIndexPlayer] = artworkPurchasePaymentResult.player

  const events: GameEvent[] = [
    { type: 'ArtworkSelected',
      playerId: playerId,
      artistId: artistId,
      artworkId: artworkPurchasePaymentResult.openArtwork.artwork.id
    },
    ...(artworkPurchasePaymentResult.spentInfluence > 0
      ? [
          { type: 'InfluenceSpent', playerId, spentInfluence: artworkPurchasePaymentResult.spentInfluence } as const,
          { type: 'CoinsReceived', playerId, coinsReceived: artworkPurchasePaymentResult.coinsReceived } as const,
        ]
      : []),
    { type: 'CoinsSpent', playerId: playerId, paid: artworkPurchasePaymentResult.paid},
    ...visitorMovedEvents
  ]

  const updatedState = structuredClone({
    ...state,
    players: updatedPlayers,
    artworkMarket: {
      ...state.artworkMarket,
      openArtworksByGenre: {
        ...state.artworkMarket.openArtworksByGenre,
        [getArtist.genre]: artworkPurchasePaymentResult.openArtwork,
      },
    },
    plazaVisitors: artworkPurchasePaymentResult.plazaVisitors,
  })

  return freezeTransition(updatedState, events)

}

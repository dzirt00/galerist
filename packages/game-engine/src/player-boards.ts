import { deepFreeze, type StartingLocationId, type VisitorInstance } from "./component-catalog.js";

export interface ExhibitedArtwork {
  readonly artworkId: string
  readonly artistId: string
  readonly signatureTokenId: string
  readonly saleValue: number
  readonly isMasterpiece: boolean
}

export interface Gallery {
  readonly artworkSlots: readonly [
      ExhibitedArtwork | null,
      ExhibitedArtwork | null,
      ExhibitedArtwork | null,
      ExhibitedArtwork | null,
  ]
  readonly visitors: readonly VisitorInstance[]
}

export interface PlayerContract {
  readonly artistId: string
  readonly signatureTokenId: string
}
export type OrderStatus = 'completed' | 'unfulfilled'
export interface BoardOrders {
  readonly 1: {
    readonly orderId: string | null
    readonly orderStatus: OrderStatus | null
  }
  readonly 2: {
    readonly orderId: string | null
    readonly orderStatus: OrderStatus | null
  }
  readonly 3: {
    readonly orderId: string | null
    readonly orderStatus: OrderStatus | null
  }
}
export interface PlayerBoard {
  readonly playerId: string,
  readonly assistants: {
    readonly office: number,
    readonly hireQueue: number
    readonly assistantOfficeIds: readonly string[]
    readonly assistantHireQueueIds: readonly string[]
  },
  readonly boardOrders: BoardOrders
  readonly startingLocationId: StartingLocationId | null,
  readonly thirdPartitionReputationTokenId: string | null
  readonly gallery: Gallery
  readonly contract: PlayerContract | null
  readonly reputationTokenArtworkIds: Record<string, string> | null
}
/** Подготавливает личные планшеты игроков по SETUP-012 в порядке мест. */
export function preparePlayerBoards(
  playerIds: readonly string[],
  assistantsPerPlayer: { readonly office: 2; readonly hireQueue: 8, assistantOfficeIds: readonly string[], assistantHireQueueIds: readonly string[] }
): readonly PlayerBoard[] {
  const playerBoards = playerIds.map(playerId => {
    return {
      playerId,
      assistants: {
        ...assistantsPerPlayer,
        assistantOfficeIds: [...assistantsPerPlayer.assistantOfficeIds],
        assistantHireQueueIds: [...assistantsPerPlayer.assistantHireQueueIds],
      },
      startingLocationId: null,
      thirdPartitionReputationTokenId: null,
      gallery: {
        artworkSlots: [null, null, null, null] as const,
        visitors: [],
      },
      contract: null,
      reputationTokenArtworkIds: null,
      boardOrders: {
        1: {
          orderId: null,
          orderStatus: null
        },
        2: {
          orderId: null,
          orderStatus:  null
        },
        3: {
          orderId: null,
          orderStatus: null
        }
      }
    }
  });
  return deepFreeze(playerBoards)
}

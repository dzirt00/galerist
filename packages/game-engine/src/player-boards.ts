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

export interface PlayerBoard {
  readonly playerId: string,
  readonly assistants: {
    readonly office: number,
    readonly hireQueue: number
  },
  readonly startingLocationId: StartingLocationId | null,
  readonly thirdPartitionReputationTokenId: string | null
  readonly gallery: Gallery
  readonly contract: PlayerContract | null
  readonly reputationTokenArtworkIds: Record<string, string> | null
}
/** Подготавливает личные планшеты игроков по SETUP-012 в порядке мест. */
export function preparePlayerBoards(
  playerIds: readonly string[],
  assistantsPerPlayer: { readonly office: 2; readonly hireQueue: 8 }
): readonly PlayerBoard[] {
  const playerBoards = playerIds.map(playerId => {
    return {
      playerId,
      assistants: {
        ...assistantsPerPlayer
      },
      startingLocationId: null,
      thirdPartitionReputationTokenId: null,
      gallery: {
        artworkSlots: [null, null, null, null] as const,
        visitors: [],
      },
      contract: null,
      reputationTokenArtworkIds: null
    }
  });
  return deepFreeze(playerBoards)
}

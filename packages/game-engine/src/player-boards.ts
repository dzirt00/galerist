import { deepFreeze } from "./component-catalog.js";

export interface PlayerBoard {
 readonly playerId: string,
  readonly assistants: {
    readonly office: number,
    readonly hireQueue: number
  },
  readonly startingLocationId: null,
  readonly thirdPartitionReputationTokenId: null
}

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
    }
  });
  return deepFreeze(playerBoards)
}

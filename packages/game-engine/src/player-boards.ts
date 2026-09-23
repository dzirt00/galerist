import { deepFreeze, type StartingLocationId } from "./component-catalog.js";

export interface PlayerBoard {
 readonly playerId: string,
  readonly assistants: {
    readonly office: number,
    readonly hireQueue: number
  },
  readonly startingLocationId: StartingLocationId | null,
  readonly thirdPartitionReputationTokenId: string | null
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
    }
  });
  return deepFreeze(playerBoards)
}

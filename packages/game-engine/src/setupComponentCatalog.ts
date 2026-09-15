import { type ArtworkGenre, deepFreeze } from "./component-catalog.js";

export type typeGoal = 'curator' | 'dealer'
export interface TargetCuratorDealer {
  readonly goal: readonly Readonly<ArtworkGenre>[],
  readonly coins: number

}
export interface CuratorDealer {
  readonly id: string,
  readonly targets: readonly Readonly<TargetCuratorDealer>[]
  readonly type: typeGoal
  readonly artworkReuse: 'forbidden_across_targets'
}


export const curator: readonly CuratorDealer[] = deepFreeze([
  { id: 'CURATOR-01',
    artworkReuse: 'forbidden_across_targets',
    type: 'curator',
    targets: [ {
        goal: ['S','D','A'],
        coins: 10

      },
      {
        goal: ['P','P','D','A'],
        coins: 15
      },
    ]
  },
  {
    id: 'CURATOR-02',
    artworkReuse: 'forbidden_across_targets',
    type: 'curator',
    targets: [
      {
        goal: ['P','D','A'],
        coins: 10
      },
      {
        goal: ['S','S','A','P'],
        coins: 15
      },
    ]
  },
  {
    id: 'CURATOR-03',
    artworkReuse: 'forbidden_across_targets',
    type: 'curator',
    targets: [
      {
        goal: ['S','D','P'],
        coins: 10
      },
      {
        goal: ['A','A','S','D'],
        coins: 15
      },
    ]
  },
  {
    id: 'CURATOR-04',
    artworkReuse: 'forbidden_across_targets',
    type: 'curator',
    targets: [
      {
        goal: ['P','S','A'],
        coins: 10
      },
      {
        goal: ['D','D','P','S'],
        coins: 15
      },
    ]
  }
])

export const dealer: readonly CuratorDealer[] = deepFreeze([
  { id: 'DEALER-01',
    type: 'dealer',
    artworkReuse: 'forbidden_across_targets',
    targets: [
      {
        goal: ['P'],
        coins: 5
      },
      {
        goal: ['D','A'],
        coins: 10
      },
      {
        goal: ['S','S'],
        coins: 10
      },
    ]
  },
  {
    id: 'DEALER-02',
    type: 'dealer',
    artworkReuse: 'forbidden_across_targets',
    targets: [
      {
        goal: ['S'],
        coins: 5
      },
      {
        goal: ['D','P'],
        coins: 10
      },
      {
        goal: ['A','A'],
        coins: 10
      },
    ]
  },
  {
    id: 'DEALER-03',
    type: 'dealer',
    artworkReuse: 'forbidden_across_targets',
    targets: [
      {
        goal: ['A'],
        coins: 5
      },
      {
        goal: ['S','P'],
        coins: 10
      },
      {
        goal: ['D','D'],
        coins: 10
      },
    ]
  },
  {
    id: 'DEALER-04',
    type: 'dealer',
    artworkReuse: 'forbidden_across_targets',
    targets: [
      {
        goal: ['D'],
        coins: 5
      },
      {
        goal: ['S','A'],
        coins: 10
      },
      {
        goal: ['P','P'],
        coins: 10
      },
    ]
  }
])

import { type ArtworkGenre, deepFreeze } from "./component-catalog.js";

export type GoalType = 'curator' | 'dealer'
export interface GoalRewardTier {
  readonly requiredGenres: readonly Readonly<ArtworkGenre>[],
  readonly coins: number

}
export interface GoalCardDefinition {
  readonly id: string,
  readonly rewardTiers: readonly Readonly<GoalRewardTier>[]
  readonly type: GoalType
  readonly artworkReuse: 'forbidden_across_targets'
}

export const curatorGoals: readonly GoalCardDefinition[] = deepFreeze( [
  {
    id: 'CURATOR-01',
    artworkReuse: 'forbidden_across_targets',
    type: 'curator',
    rewardTiers: [ {
      requiredGenres: [ 'S', 'D', 'A' ],
      coins: 10

    },
      {
        requiredGenres: [ 'P', 'P', 'D', 'A' ],
        coins: 15
      },
    ]
  },
  {
    id: 'CURATOR-02',
    artworkReuse: 'forbidden_across_targets',
    type: 'curator',
    rewardTiers: [
      {
        requiredGenres: [ 'P', 'D', 'A' ],
        coins: 10
      },
      {
        requiredGenres: [ 'S', 'S', 'A', 'P' ],
        coins: 15
      },
    ]
  },
  {
    id: 'CURATOR-03',
    artworkReuse: 'forbidden_across_targets',
    type: 'curator',
    rewardTiers: [
      {
        requiredGenres: [ 'S', 'D', 'P' ],
        coins: 10
      },
      {
        requiredGenres: [ 'A', 'A', 'S', 'D' ],
        coins: 15
      },
    ]
  },
  {
    id: 'CURATOR-04',
    artworkReuse: 'forbidden_across_targets',
    type: 'curator',
    rewardTiers: [
      {
        requiredGenres: [ 'P', 'S', 'A' ],
        coins: 10
      },
      {
        requiredGenres: [ 'D', 'D', 'P', 'S' ],
        coins: 15
      },
    ]
  }
] )
export const dealerGoals: readonly GoalCardDefinition[] = deepFreeze( [
  {
    id: 'DEALER-01',
    type: 'dealer',
    artworkReuse: 'forbidden_across_targets',
    rewardTiers: [
      {
        requiredGenres: [ 'P' ],
        coins: 5
      },
      {
        requiredGenres: [ 'D', 'A' ],
        coins: 10
      },
      {
        requiredGenres: [ 'S', 'S' ],
        coins: 10
      },
    ]
  },
  {
    id: 'DEALER-02',
    type: 'dealer',
    artworkReuse: 'forbidden_across_targets',
    rewardTiers: [
      {
        requiredGenres: [ 'S' ],
        coins: 5
      },
      {
        requiredGenres: [ 'D', 'P' ],
        coins: 10
      },
      {
        requiredGenres: [ 'A', 'A' ],
        coins: 10
      },
    ]
  },
  {
    id: 'DEALER-03',
    type: 'dealer',
    artworkReuse: 'forbidden_across_targets',
    rewardTiers: [
      {
        requiredGenres: [ 'A' ],
        coins: 5
      },
      {
        requiredGenres: [ 'S', 'P' ],
        coins: 10
      },
      {
        requiredGenres: [ 'D', 'D' ],
        coins: 10
      },
    ]
  },
  {
    id: 'DEALER-04',
    type: 'dealer',
    artworkReuse: 'forbidden_across_targets',
    rewardTiers: [
      {
        requiredGenres: [ 'D' ],
        coins: 5
      },
      {
        requiredGenres: [ 'S', 'A' ],
        coins: 10
      },
      {
        requiredGenres: [ 'P', 'P' ],
        coins: 10
      },
    ]
  }
] )



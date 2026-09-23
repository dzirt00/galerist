import { expect, it } from 'vitest'
import {
  createSetupRng,
  curatorGoals,
  dealerGoals,
  preparePrivateGoals,
  type GoalCardDefinition,
} from '../src/index.js'

const playerIds = ['player-1', 'player-2'] as const

function createRng() {
  return createSetupRng({
    rulesVersion: 'galerist-rules-2026-09-15-v1',
    componentsVersion: 'goals-test-v1',
    seed: 42,
    playerIds,
  })
}

function mutableGoalCopies(goals: readonly GoalCardDefinition[]): GoalCardDefinition[] {
  return structuredClone(goals) as GoalCardDefinition[]
}

it('раздаёт каждому игроку по одной цели куратора и арт-дилера', () => {
  const result = preparePrivateGoals(playerIds, curatorGoals, dealerGoals, createRng())
  const dealt = Object.values(result.goalsByPlayer)
  const curatorIds = dealt.map(goals => goals.curatorGoal.id)
  const dealerIds = dealt.map(goals => goals.dealerGoal.id)

  expect(Object.keys(result.goalsByPlayer)).toEqual(playerIds)
  expect(new Set(curatorIds).size).toBe(playerIds.length)
  expect(new Set(dealerIds).size).toBe(playerIds.length)
  expect(result.remainingCuratorGoals).toHaveLength(2)
  expect(result.remainingDealerGoals).toHaveLength(2)
  expect(Object.isFrozen(result)).toBe(true)
  expect(Object.isFrozen(result.goalsByPlayer)).toBe(true)
  expect(dealt.every(Object.isFrozen)).toBe(true)
})

it('не изменяет и не замораживает переданные колоды', () => {
  const mutableCuratorGoals = mutableGoalCopies(curatorGoals)
  const mutableDealerGoals = mutableGoalCopies(dealerGoals)
  const curatorSnapshot = structuredClone(mutableCuratorGoals)
  const dealerSnapshot = structuredClone(mutableDealerGoals)

  preparePrivateGoals(playerIds, mutableCuratorGoals, mutableDealerGoals, createRng())

  expect(mutableCuratorGoals).toEqual(curatorSnapshot)
  expect(mutableDealerGoals).toEqual(dealerSnapshot)
  expect(Object.isFrozen(mutableCuratorGoals)).toBe(false)
  expect(Object.isFrozen(mutableDealerGoals)).toBe(false)
  expect(Object.isFrozen(mutableCuratorGoals[0])).toBe(false)
  expect(Object.isFrozen(mutableDealerGoals[0])).toBe(false)
  expect(Object.isFrozen(mutableCuratorGoals[0]!.rewardTiers)).toBe(false)
  expect(Object.isFrozen(mutableDealerGoals[0]!.rewardTiers)).toBe(false)
})

it('не зависит от порядка входных колод', () => {
  const direct = preparePrivateGoals(playerIds, curatorGoals, dealerGoals, createRng())
  const reversed = preparePrivateGoals(
    playerIds,
    [...curatorGoals].reverse(),
    [...dealerGoals].reverse(),
    createRng(),
  )

  expect(reversed).toEqual(direct)
})

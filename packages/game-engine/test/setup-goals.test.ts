import { expect, it } from 'vitest'
import {
  createSetupRng,
  curator,
  dealer,
  preparePrivateGoals,
  type CuratorDealer,
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

function mutableGoalCopies(goals: readonly CuratorDealer[]): CuratorDealer[] {
  return structuredClone(goals) as CuratorDealer[]
}

it('раздаёт каждому игроку по одной цели куратора и арт-дилера', () => {
  const result = preparePrivateGoals(playerIds, curator, dealer, createRng())
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
  const curatorGoals = mutableGoalCopies(curator)
  const dealerGoals = mutableGoalCopies(dealer)
  const curatorSnapshot = structuredClone(curatorGoals)
  const dealerSnapshot = structuredClone(dealerGoals)

  preparePrivateGoals(playerIds, curatorGoals, dealerGoals, createRng())

  expect(curatorGoals).toEqual(curatorSnapshot)
  expect(dealerGoals).toEqual(dealerSnapshot)
  expect(Object.isFrozen(curatorGoals)).toBe(false)
  expect(Object.isFrozen(dealerGoals)).toBe(false)
  expect(Object.isFrozen(curatorGoals[0])).toBe(false)
  expect(Object.isFrozen(dealerGoals[0])).toBe(false)
  expect(Object.isFrozen(curatorGoals[0]!.targets)).toBe(false)
  expect(Object.isFrozen(dealerGoals[0]!.targets)).toBe(false)
})

it('не зависит от порядка входных колод', () => {
  const direct = preparePrivateGoals(playerIds, curator, dealer, createRng())
  const reversed = preparePrivateGoals(
    playerIds,
    [...curator].reverse(),
    [...dealer].reverse(),
    createRng(),
  )

  expect(reversed).toEqual(direct)
})

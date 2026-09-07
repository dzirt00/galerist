import { expect, it } from "vitest";
import { applyIntermediateIncomeToPlayer, type IntermediateVisitorCounts, type PlayerState } from "../src/index.js";

it.each([
  // [id, name, kind, coins, influence, investors, celebrities, collectors, coinsRes, influenceRes]
  ['player-1','Alex','human', 8, 1,0,0,0,8,1],
  ['player-1','Alex','human', 8, 1,2,3,1,13,8],
  ['player-1','Alex','human', 8, 1,4,0,0,16,1],
  ['player-1','Alex','human', 8, 1,0,2,0,8,5],
  ['player-1','Alex','human', 8, 1,0,0,3,11,4],
  ['player-1','Alex','human', 8, 35,0,0,3,11,35],
  ['player-1','Alex','human', 8, 34,0,0,2,10,35],
] as const)(
  'правильно прибавляет влияние и монеты',
  (id, name, kind,coins,influence,investors,celebrities,collectors,coinsRes,influenceRes) => {
    const playerState: PlayerState = Object.freeze({
      id: id,
      name: name,
      kind: kind,
      influence: influence,
      coins: coins,
    })

    const playerStateRes: PlayerState = Object.freeze({
      id: id,
      name: name,
      kind: kind,
      influence: influenceRes,
      coins: coinsRes,
    })

    const visitor: IntermediateVisitorCounts = {
      investors: investors,
      celebrities: celebrities,
      collectors: collectors,
    }

    const cloneVisitor = structuredClone(visitor)
    const clonePlayerState = structuredClone(playerState)
    const res = applyIntermediateIncomeToPlayer(playerState,visitor)

    expect(res).toEqual(playerStateRes)
    expect(Object.isFrozen(res)).toBe(true)
    expect(visitor).toEqual(cloneVisitor)
    expect(playerState).toEqual(clonePlayerState)
  },
)

it.each([
  // [id, name, kind, coins, influence, investors, celebrities, collectors, coinsRes, influenceRes]
  ['player-1', 'Alex', 'human', 8, 1, 0, 0, 0, 8, 1],
] as const)(
  'возвращает правильные ресурсы при расчете дохода',
  (id, name, kind, coins, influence, investors, celebrities, collectors, coinsRes, influenceRes) => {
    const playerState: PlayerState = Object.freeze({
      id,
      name,
      kind,
      influence,
      coins,
    })

    const visitor: IntermediateVisitorCounts = {
      investors,
      celebrities,
      collectors,
    }

    const playerStateRes: PlayerState = {
      id,
      name,
      kind,
      influence: influenceRes,
      coins: coinsRes,
    }

    const res = applyIntermediateIncomeToPlayer(playerState, visitor)
    expect(res).toEqual(playerStateRes)
    expect(res).not.toBe(playerState)
  },
)

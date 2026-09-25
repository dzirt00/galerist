import { expect, it } from "vitest";
import { applyIntermediateIncomeToPlayer, type IntermediateVisitorCounts, type PlayerState } from "../src/index.js";

it.each([
  // [ID, имя, тип, монеты, влияние, инвесторы, знаменитости, коллекционеры, итоговые монеты, итоговое влияние]
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
      ticketsByColor: { B: 0, R: 0, W: 0 },
    })

    const playerStateRes: PlayerState = Object.freeze({
      id: id,
      name: name,
      kind: kind,
      influence: influenceRes,
      coins: coinsRes,
      ticketsByColor: { B: 0, R: 0, W: 0 },
    })

    const visitor: IntermediateVisitorCounts = {
      investors: investors,
      celebrities: celebrities,
      collectors: collectors,
    }

    const cloneVisitor = structuredClone(visitor)
    const clonePlayerState = structuredClone(playerState)
    const updatedPlayer = applyIntermediateIncomeToPlayer(playerState,visitor)

    expect(updatedPlayer).toEqual(playerStateRes)
    expect(Object.isFrozen(updatedPlayer)).toBe(true)
    expect(visitor).toEqual(cloneVisitor)
    expect(playerState).toEqual(clonePlayerState)
  },
)

it.each([
  // [ID, имя, тип, монеты, влияние, инвесторы, знаменитости, коллекционеры, итоговые монеты, итоговое влияние]
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
      ticketsByColor: { B: 0, R: 0, W: 0 },
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
      ticketsByColor: { B: 0, R: 0, W: 0 },
    }

    const updatedPlayer = applyIntermediateIncomeToPlayer(playerState, visitor)
    expect(updatedPlayer).toEqual(playerStateRes)
    expect(updatedPlayer).not.toBe(playerState)
  },
)

import { createHash } from 'node:crypto'
import type { PlayerId, RuntimeRngState } from "./types.js";
import { deepFreeze } from "./component-catalog.js";

export interface RngRuntimeConfig {
  readonly runtimeRng: RuntimeRngState,
  readonly rulesVersion: string,
  readonly componentsVersion: string,
  readonly seedString: string
  readonly playerIds: PlayerId[]
  readonly streamId: 'orders/recycle',
  readonly orderMarket: readonly string[]
}

const UINT32_RANGE = 2 ** 32

function assertStageId(stageId: string): void {
  if (typeof stageId !== 'string' || stageId.length === 0) {
    throw new Error('Stage ID must be a non-empty string')
  }
}

/** Проверяет допустимый размер набора для случайного выбора индекса. */
function assertItemCount(itemCount: number): void {
  if (!Number.isInteger(itemCount) || itemCount < 1 || itemCount > UINT32_RANGE) {
    throw new Error('Item count must be an integer from 1 to 2^32')
  }
}

/** Создаёт детерминированный setup RNG с независимыми потоками по ADR-001. */
export function createRuntimeRng(config: RngRuntimeConfig) {
  const copyOrdersRecycle = {...config.runtimeRng.runtimeRngCounters}
  const seed = Number( config.seedString )
  if ( !Number.isSafeInteger( Number( seed ) ) ) {
    throw new Error( 'Seed must be a safe integer' )
  }


  /** Возвращает следующее 32-битное значение для указанного этапа. */
  function nextUint32(stageId: 'orders/recycle'): number {
    assertStageId(stageId)
    let counter = copyOrdersRecycle["orders/recycle"]
    const payload = JSON.stringify([
      'runtime-rng-v1',
      config.rulesVersion,
      config.componentsVersion,
      config.seedString,
      config.playerIds,
      stageId,
      String(counter)
    ])
    // Версии и порядок мест входят в хеш, чтобы снимок нельзя было воспроизвести
    // с другим каталогом, правилом или составом игроков незаметно для вызывающей стороны.
    const digest = createHash('sha256').update(payload, 'utf8').digest()
    if(!Number.isSafeInteger(counter + 1)) throw new Error( 'invalid counter' )
    counter++
    copyOrdersRecycle["orders/recycle"] = counter
    return (
      digest[0]! * 2 ** 24
      + digest[1]! * 2 ** 16
      + digest[2]! * 2 ** 8
      + digest[3]!
    )
  }

  /** Выбирает индекс без смещения вероятностей с помощью отбрасывания лишних значений. */
  function chooseIndex(stageId: 'orders/recycle', itemCount: number): number {
    assertStageId(stageId)
    assertItemCount(itemCount)

    // Оставляем диапазон, кратный числу элементов, чтобы остаток от деления не давал смещения.
    const limit = Math.floor(UINT32_RANGE / itemCount) * itemCount
    let value: number
    do {
      value = nextUint32(stageId)
    } while (value >= limit)

    return value % itemCount
  }

  /** Перемешивает копию по Фишеру—Йетсу; наборы короче двух элементов RNG не расходуют. */
  function shuffle<T>(stageId: 'orders/recycle', items: readonly T[]): readonly T[] {
    assertStageId(stageId)

    const shuffled = [...items]
    for (let index = shuffled.length - 1; index > 0; index -= 1) {
      const swapIndex = chooseIndex(stageId, index + 1)
      const current = shuffled[index]!
      shuffled[index] = shuffled[swapIndex]!
      shuffled[swapIndex] = current
    }

    return Object.freeze(shuffled)
  }

  const shuffleOrderMarket =  shuffle(config.streamId, config.orderMarket)

  return deepFreeze({
    orderMarket: shuffleOrderMarket,
    runtimeRng: {
      ...config.runtimeRng,
      runtimeRngCounters: copyOrdersRecycle
    }
  })
}

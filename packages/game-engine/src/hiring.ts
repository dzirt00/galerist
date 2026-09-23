import { deepFreeze, type RewardId } from './component-catalog.js'
import type { PlayerState } from './types.js'
import { spendInfluenceForImmediatePayment } from "./influence-spending-award.js";

export interface HireQueueEntry {
  /** Устойчивый идентификатор помощника, занимающего эту позицию очереди. */
  readonly assistantId: string
  /** Стоимость найма помощника с текущей позиции. */
  readonly cost: number
  /** Награда позиции; применяется внешней оркестрацией после успешного найма. */
  readonly reward: RewardId | null
}

/** Результат атомарного найма без применения наград позиций и событий. */
export interface HireAssistantsResult {
  /** Состояние игрока после оплаты. */
  readonly player: Readonly<PlayerState>
  /** Старые и вновь нанятые помощники в порядке размещения в офисе. */
  readonly officeAssistantIds: readonly string[]
  /** Оставшиеся помощники в порядке дальнейшего найма. */
  readonly queue: readonly HireQueueEntry[]
  /** Нанятый префикс исходной очереди в исходном порядке. */
  readonly hired: readonly HireQueueEntry[]
  /** Суммарная стоимость всех нанятых помощников. */
  readonly totalCost: number
}

/** Вход чистого расчёта найма после проверки доступности действия по HIRE-001. */
export interface HireAssistantsInput {
  readonly player: Readonly<PlayerState>
  /** Помощники, уже находящиеся в офисе, в текущем порядке. */
  readonly officeAssistantIds: readonly string[]
  /** Очередь уже расположена в порядке найма. */
  readonly queue: readonly HireQueueEntry[]
  /** Число помощников, снимаемых с начала очереди. */
  readonly count: number
  /** null — влияние не расходуется. */
  readonly targetInfluence: number | null
}

/**
 * Нанимает выбранный префикс очереди по HIRE-002 и оплачивает его монетами,
 * при необходимости или по выбору игрока используя INFLUENCE-002.
 */
export function hireAssistants(
  input: Readonly<HireAssistantsInput>,
): Readonly<HireAssistantsResult> {

  let remainingQueue = [ ...input.queue.map( item => ( { ...item } ) ) ]

  if (
    !Number.isSafeInteger( input.count )
    || input.count < 1
    || input.count > input.queue.length
  ) {
    throw new RangeError( 'Invalid assistant count' )
  }

  const hiredAssistants = remainingQueue.splice( 0, input.count )
  const totalCost = hiredAssistants.reduce( ( acc, cur ) => acc + cur.cost, 0 );
  const hiredAssistantIds = hiredAssistants.reduce( ( acc, cur ) => {
    acc.push( cur.assistantId )
    return acc
  }, [] as string[] );

  let updatedPlayer = { ...input.player }
  if ( input.targetInfluence === null ) {
    if ( input.player.coins < totalCost ) {
      throw new RangeError( 'Insufficient funds' )
    }

    updatedPlayer = {
      ...input.player,
      coins: input.player.coins - totalCost,
    }
  } else {
    updatedPlayer = spendInfluenceForImmediatePayment(
      input.player,
      totalCost,
      input.targetInfluence,
    )
  }

  const updatedOfficeAssistantIds = [
    ...input.officeAssistantIds,
    ...hiredAssistantIds,
  ]

  return deepFreeze( {
    player: updatedPlayer,
    officeAssistantIds: updatedOfficeAssistantIds,
    queue: remainingQueue,
    hired: hiredAssistants,
    totalCost: totalCost
  } )
}

import type { GameState } from './types.js'
import { freezeTransition, type GameEvent, type GameTransition } from './game-events.js'
import { canTriggerGameEnd, triggerGameEnd } from './game-lifecycle.js'

/** Отличает полностью пустую кассу от опустошения стопки только одного цвета. */
const emptyTickets = (state: GameState) => Object.values(state.ticketOffice.ticketsByColor).every(count => count === 0)
/** Проверяет достижение индикатора как минимум двух художников-суперзвёзд. */
const twoSuperstars = (state: GameState) => state.artistMarket.slots.filter(artist => artist.isSuperstar).length >= 2

/**
 * Фиксирует впервые достигнутые индикаторы END-001 после атомарного эффекта.
 * Сравнивает состояния до и после, сохраняет флаги и при двух индикаторах запускает END-002.
 * Возвращает замороженный переход; повторные проверки не дублируют достижение и запуск конца.
 */
export function evaluateEndConditions(before: GameState, after: GameState, events: readonly GameEvent[]): GameTransition<GameState> {
  let next = after
  const emitted: GameEvent[] = [...events]
  const conditions = [
    { field: 'ticketOfficeEmptyReached', test: emptyTickets, condition: 'ticket_office_empty' },
    { field: 'visitorBagEmptyReached',
      /** Проверяет полное опустошение текущего мешочка посетителей. */
      test: (state: GameState) => state.visitorBag.visitors.length === 0, condition: 'visitor_bag_empty' },
    { field: 'twoSuperstarsReached', test: twoSuperstars, condition: 'two_superstars' },
  ] as const
  for (const item of conditions) {
    // Событие возникает только при новом достижении; сохранённый флаг исключает повтор при вложенных наградах.
    if (!next[item.field] && !item.test(before) && item.test(next)) {
      next = { ...next, [item.field]: true }
      // Для кассы сохраняем прежнюю форму события без condition; новые индикаторы указывают причину явно.
      emitted.push(item.condition === 'ticket_office_empty' ? { type: 'EndConditionReached' }
        : { type: 'EndConditionReached', condition: item.condition })
    }
  }
  if (next.phase === 'regular_play' && canTriggerGameEnd(next)) {
    const end = triggerGameEnd(next)
    next = end.state
    emitted.push(...end.events)
  }
  // Вложенная команда могла запустить завершение раньше: оставляем одно событие после всех внешних эффектов.
  const endEvents = emitted.filter(event => event.type === 'GameEndTriggered')
  return freezeTransition(next, [...emitted.filter(event => event.type !== 'GameEndTriggered'), ...endEvents.slice(0, 1)])
}

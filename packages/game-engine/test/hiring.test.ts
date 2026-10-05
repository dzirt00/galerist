import { describe, expect, it } from 'vitest'
import {
  hireAssistants,
  type HireAssistantsInput,
  type HireQueueEntry,
  type PlayerState,
} from '../src/index.js'

/** Создаёт тестового игрока с заданными ресурсами и пустым запасом билетов. */
function createPlayer(coins: number, influence: number): PlayerState {
  return {
    id: 'player-1',
    name: 'Алина',
    kind: 'human',
    coins,
    influence,
    acquiredArtworkCount: 0, ticketsByColor: { B: 0, R: 0, W: 0 },
  }
}

/** Создаёт тестовую очередь найма с возрастающей стоимостью и билетными наградами. */
function createQueue(): HireQueueEntry[] {
  return [
    { assistantId: 'assistant-3', cost: 1, reward: null },
    { assistantId: 'assistant-4', cost: 2, reward: 'TICKET-B' },
    { assistantId: 'assistant-5', cost: 2, reward: 'TICKET-R' },
  ]
}

describe('HIRE-001: доступность найма', () => {
  it.each([0, 1, 2, 3])('заполняет свободные места при %i помощниках в офисе', (occupied) => {
    const queue: HireQueueEntry[] = Array.from({ length: 4 }, (_, index) => ({
      assistantId: `queued-${index}`,
      cost: index + 1,
      reward: null,
    }))
    const input: HireAssistantsInput = {
      player: createPlayer(20, 10),
      officeAssistantIds: Array.from({ length: occupied }, (_, index) => `office-${index}`),
      queue,
      count: 4 - occupied,
      targetInfluence: null,
    }
    const snapshot = structuredClone(input)

    const result = hireAssistants(input)
    const hired = queue.slice(0, input.count)
    const totalCost = hired.reduce((sum, entry) => sum + entry.cost, 0)

    expect(result.officeAssistantIds).toEqual([
      ...input.officeAssistantIds,
      ...hired.map(entry => entry.assistantId),
    ])
    expect(result.officeAssistantIds).toHaveLength(4)
    expect(result.queue).toEqual(queue.slice(input.count))
    expect(result.hired).toEqual(hired)
    expect(result.totalCost).toBe(totalCost)
    expect(result.player).toEqual({ ...input.player, coins: 20 - totalCost })
    expect(input).toEqual(snapshot)
    expect(Object.isFrozen(result.officeAssistantIds)).toBe(true)
  })

  it.each([
    { scenario: 'переполнение офиса', occupied: 3, count: 2, queue: createQueue() },
    { scenario: 'полный офис', occupied: 4, count: 1, queue: createQueue() },
    { scenario: 'пустая очередь', occupied: 0, count: 1, queue: [] },
    { scenario: 'выбор больше очереди', occupied: 0, count: 2, queue: createQueue().slice(0, 1) },
  ])('атомарно отклоняет $scenario до оплаты', ({ occupied, count, queue }) => {
    for (const targetInfluence of [null, 8]) {
      const input: HireAssistantsInput = {
        player: createPlayer(20, 10),
        officeAssistantIds: Array.from({ length: occupied }, (_, index) => `office-${index}`),
        queue: structuredClone(queue),
        count,
        targetInfluence,
      }
      const snapshot = structuredClone(input)

      expect(() => hireAssistants(input)).toThrow()
      expect(input).toEqual(snapshot)
      expect(Object.isFrozen(input.player)).toBe(false)
      expect(Object.isFrozen(input.officeAssistantIds)).toBe(false)
      expect(Object.isFrozen(input.queue)).toBe(false)
    }
  })
})

describe('HIRE-002: найм помощников', () => {
  it('нанимает выбранный префикс очереди, сохраняет порядок и оплачивает общую стоимость', () => {
    const input: HireAssistantsInput = {
      player: createPlayer(5, 8),
      officeAssistantIds: ['assistant-1', 'assistant-2'],
      queue: createQueue(),
      count: 2,
      targetInfluence: null,
    }
    const snapshot = structuredClone(input)

    const result = hireAssistants(input)

    expect(result).toEqual({
      player: { ...input.player, coins: 2 },
      officeAssistantIds: [
        'assistant-1',
        'assistant-2',
        'assistant-3',
        'assistant-4',
      ],
      queue: [
        { assistantId: 'assistant-5', cost: 2, reward: 'TICKET-R' },
      ],
      hired: [
        { assistantId: 'assistant-3', cost: 1, reward: null },
        { assistantId: 'assistant-4', cost: 2, reward: 'TICKET-B' },
      ],
      totalCost: 3,
    })
    expect(input).toEqual(snapshot)
    expect(Object.isFrozen(input.queue)).toBe(false)
    expect(input.queue.every(entry => !Object.isFrozen(entry))).toBe(true)
    expect(Object.isFrozen(result)).toBe(true)
    expect(Object.isFrozen(result.player)).toBe(true)
    expect(Object.isFrozen(result.officeAssistantIds)).toBe(true)
    expect(Object.isFrozen(result.queue)).toBe(true)
    expect(Object.isFrozen(result.hired)).toBe(true)
    expect(result.queue.every(Object.isFrozen)).toBe(true)
    expect(result.hired.every(Object.isFrozen)).toBe(true)
  })

  it('по выбору игрока использует влияние даже при достаточном числе монет', () => {
    const result = hireAssistants({
      player: createPlayer(10, 10),
      officeAssistantIds: [],
      queue: createQueue(),
      count: 1,
      targetInfluence: 8,
    })

    expect(result.player).toMatchObject({
      coins: 10,
      influence: 8,
    })
    expect(result.totalCost).toBe(1)
    expect(result.hired.map(entry => entry.assistantId)).toEqual(['assistant-3'])
  })

  it('атомарно отклоняет найм при недостатке средств без расхода влияния', () => {
    const input: HireAssistantsInput = {
      player: createPlayer(2, 10),
      officeAssistantIds: ['assistant-1'],
      queue: createQueue(),
      count: 2,
      targetInfluence: null,
    }
    const snapshot = structuredClone(input)

    expect(() => hireAssistants(input)).toThrow('Insufficient funds')
    expect(input).toEqual(snapshot)
  })

  it.each([0, -1, 1.5, 4])(
    'отклоняет недопустимое количество %s без изменения входа',
    (count) => {
      const input: HireAssistantsInput = {
        player: createPlayer(10, 10),
        officeAssistantIds: ['assistant-1'],
        queue: createQueue(),
        count,
        targetInfluence: null,
      }
      const snapshot = structuredClone(input)

      expect(() => hireAssistants(input)).toThrow('Invalid assistant count')
      expect(input).toEqual(snapshot)
    },
  )
})

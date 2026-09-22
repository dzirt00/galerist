import { describe, expect, it } from 'vitest'
import {
  hireAssistants,
  type HireAssistantsInput,
  type HireQueueEntry,
  type PlayerState,
} from '../src/index.js'

function createPlayer(coins: number, influence: number): PlayerState {
  return {
    id: 'player-1',
    name: 'Алина',
    kind: 'human',
    coins,
    influence,
  }
}

function createQueue(): HireQueueEntry[] {
  return [
    { assistantId: 'assistant-3', cost: 1, reward: null },
    { assistantId: 'assistant-4', cost: 2, reward: 'TICKET-B' },
    { assistantId: 'assistant-5', cost: 2, reward: 'TICKET-R' },
  ]
}

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

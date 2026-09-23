import { describe, expect, it } from 'vitest'
import { curatorGoals, dealerGoals } from '../src/index.js'

describe('Каталоги карт целей куратора и дилера', () => {
  it('содержит четыре карты каждого типа с согласованными строками целей', () => {
    expect(curatorGoals).toHaveLength(4)
    expect(dealerGoals).toHaveLength(4)
    expect(curatorGoals.map(card => card.id)).toEqual([
      'CURATOR-01', 'CURATOR-02', 'CURATOR-03', 'CURATOR-04',
    ])
    expect(dealerGoals.find(card => card.id === 'DEALER-01')?.rewardTiers).toEqual([
      { requiredGenres: ['P'], coins: 5 },
      { requiredGenres: ['D', 'A'], coins: 10 },
      { requiredGenres: ['S', 'S'], coins: 10 },
    ])
    expect(curatorGoals.find(card => card.id === 'CURATOR-01')?.rewardTiers).toEqual([
      { requiredGenres: ['S', 'D', 'A'], coins: 10 },
      { requiredGenres: ['P', 'P', 'D', 'A'], coins: 15 },
    ])
  })

  it('запрещает повторное использование работ для всех карт', () => {
    expect([...curatorGoals, ...dealerGoals]).toHaveLength(8)
    expect([...curatorGoals, ...dealerGoals].every(
      card => card.artworkReuse === 'forbidden_across_targets',
    )).toBe(true)
  })

  it('глубоко замораживает публичные данные карт', () => {
    const curatorCard = curatorGoals[0]!
    const dealerCard = dealerGoals[0]!

    expect(Object.isFrozen(curatorGoals)).toBe(true)
    expect(Object.isFrozen(dealerGoals)).toBe(true)
    expect(Object.isFrozen(curatorCard)).toBe(true)
    expect(Object.isFrozen(dealerCard)).toBe(true)
    expect(Object.isFrozen(curatorCard.rewardTiers)).toBe(true)
    expect(Object.isFrozen(curatorCard.rewardTiers[0])).toBe(true)
    expect(Object.isFrozen(curatorCard.rewardTiers[0]!.requiredGenres)).toBe(true)
    expect(Object.isFrozen(dealerCard.rewardTiers)).toBe(true)
    expect(Object.isFrozen(dealerCard.rewardTiers[0]!.requiredGenres)).toBe(true)
  })
})

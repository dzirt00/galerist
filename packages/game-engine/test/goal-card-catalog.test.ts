import { describe, expect, it } from 'vitest'
import { curator, dealer } from '../src/index.js'

describe('catalogues of curator and dealer goal cards', () => {
  it('содержит четыре карты каждого типа с согласованными строками целей', () => {
    expect(curator).toHaveLength(4)
    expect(dealer).toHaveLength(4)
    expect(curator.map(card => card.id)).toEqual([
      'CURATOR-01', 'CURATOR-02', 'CURATOR-03', 'CURATOR-04',
    ])
    expect(dealer.find(card => card.id === 'DEALER-01')?.targets).toEqual([
      { goal: ['P'], coins: 5 },
      { goal: ['D', 'A'], coins: 10 },
      { goal: ['S', 'S'], coins: 10 },
    ])
    expect(curator.find(card => card.id === 'CURATOR-01')?.targets).toEqual([
      { goal: ['S', 'D', 'A'], coins: 10 },
      { goal: ['P', 'P', 'D', 'A'], coins: 15 },
    ])
  })

  it('запрещает повторное использование работ для всех карт', () => {
    expect([...curator, ...dealer]).toHaveLength(8)
    expect([...curator, ...dealer].every(
      card => card.artworkReuse === 'forbidden_across_targets',
    )).toBe(true)
  })

  it('глубоко замораживает публичные данные карт', () => {
    const curatorCard = curator[0]!
    const dealerCard = dealer[0]!

    expect(Object.isFrozen(curator)).toBe(true)
    expect(Object.isFrozen(dealer)).toBe(true)
    expect(Object.isFrozen(curatorCard)).toBe(true)
    expect(Object.isFrozen(dealerCard)).toBe(true)
    expect(Object.isFrozen(curatorCard.targets)).toBe(true)
    expect(Object.isFrozen(curatorCard.targets[0])).toBe(true)
    expect(Object.isFrozen(curatorCard.targets[0]!.goal)).toBe(true)
    expect(Object.isFrozen(dealerCard.targets)).toBe(true)
    expect(Object.isFrozen(dealerCard.targets[0]!.goal)).toBe(true)
  })
})

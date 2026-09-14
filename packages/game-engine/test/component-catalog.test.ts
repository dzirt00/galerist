import { describe, expect, it } from 'vitest'
import { setupComponentCatalog } from '../src/index.js'

describe('setupComponentCatalog', () => {
  it('содержит согласованные количества и устойчивые уникальные ID компонентов подготовки', () => {
    expect(setupComponentCatalog.genreOrder).toEqual(['D', 'P', 'S', 'A'])
    expect(setupComponentCatalog.artists).toHaveLength(16)
    expect(setupComponentCatalog.artworks).toHaveLength(44)
    expect(setupComponentCatalog.orders).toHaveLength(20)
    expect(setupComponentCatalog.artistBonuses).toHaveLength(10)
    expect(setupComponentCatalog.reputationTokenIds).toHaveLength(20)
    expect(new Set(setupComponentCatalog.artworks.map(artwork => artwork.id)).size).toBe(44)
    expect(setupComponentCatalog.artworks.filter(artwork => artwork.genre === 'D')).toHaveLength(11)
    expect(setupComponentCatalog.artworks.filter(artwork => artwork.genre === 'P')).toHaveLength(11)
    expect(setupComponentCatalog.artworks.filter(artwork => artwork.genre === 'S')).toHaveLength(10)
    expect(setupComponentCatalog.artworks.filter(artwork => artwork.genre === 'A')).toHaveLength(12)
  })

  it('задаёт пулы для 2–4 игроков и глубоко заморожен', () => {
    expect(setupComponentCatalog.visitorPools).toEqual({ 2: { B: 10, R: 10, W: 8 }, 3: { B: 12, R: 12, W: 10 }, 4: { B: 14, R: 14, W: 12 } })
    expect(setupComponentCatalog.ticketsPerColor).toEqual({ 2: 10, 3: 15, 4: 20 })
    expect(Object.isFrozen(setupComponentCatalog)).toBe(true)
    expect(Object.isFrozen(setupComponentCatalog.artists)).toBe(true)
    expect(Object.isFrozen(setupComponentCatalog.artists[0])).toBe(true)
    expect(Object.isFrozen(setupComponentCatalog.visitorPools)).toBe(true)
    expect(Object.isFrozen(setupComponentCatalog.visitorPools[2])).toBe(true)
  })

  it('описывает клетки рынка и исключает среднюю колонку для двух игроков', () => {
    expect(setupComponentCatalog.marketBidCells).toHaveLength(9)
    expect(new Set(setupComponentCatalog.marketBidCells.map(cell => cell.id)).size).toBe(9)
    expect(setupComponentCatalog.marketReputationCells).toHaveLength(12)
    expect(setupComponentCatalog.marketReputationPlacementOrder).toEqual([
      'MARKET-REP-C1-D', 'MARKET-REP-C2-D', 'MARKET-REP-C3-D',
      'MARKET-REP-C1-P', 'MARKET-REP-C2-P', 'MARKET-REP-C3-P',
      'MARKET-REP-C1-S', 'MARKET-REP-C2-S', 'MARKET-REP-C3-S',
      'MARKET-REP-C1-A', 'MARKET-REP-C2-A', 'MARKET-REP-C3-A',
    ])
    expect(setupComponentCatalog.marketReputationCells.filter(cell => cell.playerCounts.includes(2)).map(cell => cell.column)).not.toContain(2)
    expect(Object.isFrozen(setupComponentCatalog.marketBidCells)).toBe(true)
    expect(Object.isFrozen(setupComponentCatalog.marketReputationCells[0])).toBe(true)
  })

  it('описывает планшет и начальный запас помощников', () => {
    expect(setupComponentCatalog.hireQueue.map(item => [item.id, item.cost, item.reward])).toEqual([
      ['BOARD-HIRE-1', 1, null], ['BOARD-HIRE-2', 2, 'TICKET-B'], ['BOARD-HIRE-3', 2, 'TICKET-R'], ['BOARD-HIRE-4', 3, 'INFLUENCE'],
      ['BOARD-HIRE-5', 3, null], ['BOARD-HIRE-6', 4, 'TICKET-ANY'], ['BOARD-HIRE-7', 5, null], ['BOARD-HIRE-8', 6, 'COINS'],
    ])
    expect(setupComponentCatalog.boardReputationCells).toHaveLength(6)
    expect(setupComponentCatalog.boardOrderCells.map(cell => cell.reward)).toEqual(['TICKET-B', 'TICKET-R', 'TICKET-ANY'])
    expect(setupComponentCatalog.assistantsPerPlayer).toEqual({ office: 2, hireQueue: 8 })
    expect(Object.isFrozen(setupComponentCatalog.hireQueue[0])).toBe(true)
    expect(Object.isFrozen(setupComponentCatalog.assistantsPerPlayer)).toBe(true)
  })

  it('содержит полный запас рекламы и суперзвёзд', () => {
    expect(setupComponentCatalog.promotionTokens).toHaveLength(20)
    expect(new Set(setupComponentCatalog.promotionTokens.map(token => token.id)).size).toBe(20)
    expect(setupComponentCatalog.promotionTokens.filter(token => token.level === 1).map(token => token.reward)).toEqual(['TICKET-ANY', 'TICKET-ANY', 'TICKET-ANY', 'TICKET-ANY'])
    expect(setupComponentCatalog.promotionTokens.filter(token => token.level === 5).map(token => token.reward)).toEqual(['VISITOR-ANY', 'VISITOR-ANY', 'VISITOR-ANY', 'VISITOR-ANY'])
    expect(setupComponentCatalog.superstarTokenIds).toEqual(['SUPERSTAR-1', 'SUPERSTAR-2', 'SUPERSTAR-3', 'SUPERSTAR-4', 'SUPERSTAR-5'])
    expect(Object.isFrozen(setupComponentCatalog.promotionTokens[0])).toBe(true)
    expect(Object.isFrozen(setupComponentCatalog.superstarTokenIds)).toBe(true)
  })
})

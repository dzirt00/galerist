import type { PlayerId, WinnerCandidate } from './types.js'

export function determineWinners(
  candidates: readonly WinnerCandidate[],
): readonly PlayerId[] {
  if (!candidates || candidates.length < 2 || candidates.length > 4) {
    throw new Error('Turn cannot determine a winner')
  }

  const seenPlayerIds = new Set<PlayerId>()

  for (const candidate of candidates) {
    if (seenPlayerIds.has(candidate.playerId)) {
      throw new Error(`Duplicate playerId found: ${candidate.playerId}`)
    }
    seenPlayerIds.add(candidate.playerId)

    const metrics = [
      candidate.coins,
      candidate.acquiredArtworkCount,
      candidate.galleryVisitorCount,
      candidate.assistantsInPlayCount,
    ]

    for (const metric of metrics) {
      if (
        typeof metric !== 'number'
        || !Number.isInteger(metric)
        || metric < 0
        || metric > Number.MAX_SAFE_INTEGER
      ) {
        throw new Error(
          `Invalid metric value: ${metric}. Must be a safe, non-negative integer.`,
        )
      }
    }
  }

  const sorted = [...candidates].sort((a, b) => {
    if (b.coins !== a.coins) return b.coins - a.coins
    if (b.acquiredArtworkCount !== a.acquiredArtworkCount) {
      return b.acquiredArtworkCount - a.acquiredArtworkCount
    }
    if (b.galleryVisitorCount !== a.galleryVisitorCount) {
      return b.galleryVisitorCount - a.galleryVisitorCount
    }
    return b.assistantsInPlayCount - a.assistantsInPlayCount
  })

  const top = sorted[0]!
  const winners = candidates.filter(candidate =>
    candidate.coins === top.coins
    && candidate.acquiredArtworkCount === top.acquiredArtworkCount
    && candidate.galleryVisitorCount === top.galleryVisitorCount
    && candidate.assistantsInPlayCount === top.assistantsInPlayCount)

  return Object.freeze(winners.map(winner => winner.playerId))
}

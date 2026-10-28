import {corsHeaders} from '@supabase/supabase-js/cors'
import {withAuthenticatedRequest} from '../_shared/http.ts'

interface GameListItem {
  id: string
  seat_count: number
  occupiedSeatCount: number
  hasPassword: boolean
}

function isGameListItem(value: unknown): value is GameListItem {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const item = value as Record<string, unknown>
  return typeof item.id === 'string' && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(item.id)
    && typeof item.seat_count === 'number' && [2, 3, 4].includes(item.seat_count)
    && typeof item.occupiedSeatCount === 'number' && Number.isSafeInteger(item.occupiedSeatCount)
    && item.occupiedSeatCount >= 0 && item.occupiedSeatCount <= item.seat_count
    && typeof item.hasPassword === 'boolean'
}

Deno.serve(withAuthenticatedRequest('GET', 'Ошибка чтения записей', async (_request, {createAdminClient}) => {
  const startedAt = performance.now()
  const queries: {table: string; durationMs: number}[] = []
  let roomCount: number | null = null
  const measure = async <T>(table: string, query: PromiseLike<T>): Promise<T> => {
    const queryStartedAt = performance.now()
    try {
      return await query
    } finally {
      queries.push({table, durationMs: performance.now() - queryStartedAt})
    }
  }
  try {
    const supabaseAdmin = createAdminClient()
    if (supabaseAdmin instanceof Response) return supabaseAdmin

    const {data, error} = await measure('get_game_list', supabaseAdmin.rpc('get_game_list'))
    if (error || !Array.isArray(data) || !data.every(isGameListItem)) {
      return Response.json({error: 'Ошибка чтения записей'}, {status: 500, headers: corsHeaders})
    }

    roomCount = data.length
    const gameList: GameListItem[] = data.map(({id, seat_count, occupiedSeatCount, hasPassword}) =>
      ({id, seat_count, occupiedSeatCount, hasPassword}))

    return Response.json(gameList, {status: 200, headers: corsHeaders})
  } finally {
    console.info(JSON.stringify({
      event: 'game-list.db-timing',
      roomCount,
      queryCount: queries.length,
      queries,
      totalMs: performance.now() - startedAt,
    }))
  }
}, {timingLabel: 'game-list'}))

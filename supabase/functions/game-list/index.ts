import {corsHeaders} from '@supabase/supabase-js/cors'
import {withAuthenticatedRequest} from '../_shared/http.ts'

interface GameListItem {
  id: string
  seat_count: number
  occupiedSeatCount: number
  hasPassword: boolean
  turnDurationMinutes: number
}

function isGameListItem(value: unknown): value is GameListItem {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const item = value as Record<string, unknown>
  return typeof item.id === 'string' && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(item.id)
    && typeof item.seat_count === 'number' && [2, 3, 4].includes(item.seat_count)
    && typeof item.occupiedSeatCount === 'number' && Number.isSafeInteger(item.occupiedSeatCount)
    && item.occupiedSeatCount >= 0 && item.occupiedSeatCount <= item.seat_count
    && typeof item.hasPassword === 'boolean'
    && typeof item.turnDurationMinutes === 'number' && Number.isSafeInteger(item.turnDurationMinutes)
    && item.turnDurationMinutes >= 1 && item.turnDurationMinutes <= 10
}

Deno.serve(withAuthenticatedRequest('GET', 'Ошибка чтения записей', async (_request, {createAdminClient}) => {
  const supabaseAdmin = createAdminClient()
  if (supabaseAdmin instanceof Response) return supabaseAdmin

  const {data, error} = await supabaseAdmin.rpc('get_game_list')
  if (error || !Array.isArray(data) || !data.every(isGameListItem)) {
    return Response.json({error: 'Ошибка чтения записей'}, {status: 500, headers: corsHeaders})
  }

  const gameList: GameListItem[] = data.map(({id, seat_count, occupiedSeatCount, hasPassword, turnDurationMinutes}) =>
    ({id, seat_count, occupiedSeatCount, hasPassword, turnDurationMinutes}))

  return Response.json(gameList, {status: 200, headers: corsHeaders})
}))

import {corsHeaders} from '@supabase/supabase-js/cors'
import {jsonError, withAuthenticatedRequest} from '../_shared/http.ts'
import {isGameIdRequest, isGameListItem} from '../_shared/lobby-validation.ts'

Deno.serve(withAuthenticatedRequest('POST', 'Не удалось вернуться в своё лобби. Попробуйте ещё раз', async (request, {user, createAdminClient}) => {
  let body: unknown
  try { body = await request.json() } catch { return jsonError(400, 'Некорректный JSON') }
  if (!isGameIdRequest(body)) return jsonError(400, 'Некорректный ID комнаты')
  const admin = createAdminClient()
  if (admin instanceof Response) return admin
  const {data, error} = await admin.rpc('get_own_lobby', {p_game_id: body.gameId, p_user_id: user.id})
  if (error) {
    if (error.code === 'P0002') return jsonError(404, 'Ваше открытое лобби не найдено. Обновите список комнат')
    return jsonError(500, 'Не удалось вернуться в своё лобби. Попробуйте ещё раз')
  }
  if (!isGameListItem(data) || data.id !== body.gameId || data.occupiedSeatCount < 1) {
    return jsonError(500, 'Некорректный ответ сервера')
  }
  const {id, seat_count, occupiedSeatCount, hasPassword, turnDurationMinutes} = data
  return Response.json({id, seat_count, occupiedSeatCount, hasPassword, turnDurationMinutes}, {headers: corsHeaders})
}))

import {jsonError, withAuthenticatedRequest} from '../_shared/http.ts'
import {
  isAddBot,
  isLeaveGame,
  isResponseAddBot,
  isResponseAddBotError,
  isResponseDeleteUser
} from '../_shared/lobby-validation.ts'
import {corsHeaders} from '@supabase/supabase-js/cors'

Deno.serve(withAuthenticatedRequest('POST', 'Ошибка чтения записей', async (_request, {user, createAdminClient}) => {
  const supabaseAdmin = createAdminClient()
  if (supabaseAdmin instanceof Response) return supabaseAdmin
  let body: unknown

  try {
    body = await _request.json()
    if (!isLeaveGame(body)) {
      return jsonError(400, 'Ошибка запроса')
    }
  } catch {
    return jsonError(400, 'Ошибка запроса')
  }

  const {data, error} = await supabaseAdmin.rpc('leave_game', {
    p_game_id: body.gameId,
    p_user_id: user.id,
    p_request_id: body.requestId,
  })

  if (error) {
    if (error.code === '22023') {
      return jsonError(400, 'ID комнаты, пользователя и запроса обязательны')
    }
    if (error.code === 'P0002') {
      return jsonError(404, 'Комната не найдена')
    }
    if (error.code === '42501') {
      return jsonError(403, 'Создатель не может покинуть игру')
    }
    if (error.code === 'P1002') {
      return jsonError(409, 'Юзера нет в комнате')
    }

    return jsonError(500, 'Ошибка чтения записей')
  }

  if (isResponseAddBotError(data) && data.gameId === body.gameId) {
    return jsonError(409, 'Нельзя выйти из комнаты')

  }

  if (isResponseDeleteUser(data) && body.gameId === data.gameId) {
    const request = {
      "gameId": data['gameId'],
    }
    return Response.json(request, {status: 200, headers: corsHeaders})

  }
  return jsonError(500, 'Ошибка чтения записей')
}))

import {corsHeaders} from '@supabase/supabase-js/cors'
import {jsonError, withAuthenticatedRequest} from '../_shared/http.ts'
import {isGameIdRequest, isGamePlayersRows} from '../_shared/lobby-validation.ts'

Deno.serve(withAuthenticatedRequest('POST', 'Не удалось загрузить состав комнаты', async (_request, {
  user,
  createAdminClient
}) => {
  const supabaseAdmin = createAdminClient()
  if (supabaseAdmin instanceof Response) return supabaseAdmin

  let body: unknown
  try {
    body = await _request.json()

  } catch {
    return jsonError(400, 'Ошибка чтения данных')
  }

  if (isGameIdRequest(body)) {
    const supabaseAdminResponse = await supabaseAdmin.rpc('get_game_players', {
      'p_game_id': body.gameId,
      'p_user_id': user.id,
    })

    if (supabaseAdminResponse.error) {
      if (supabaseAdminResponse.error.code === 'P0002') {
        return jsonError(404, 'Комната или участник не найдены')
      }
      if (supabaseAdminResponse.error.code === '22023') {
        return jsonError(400, 'Некорректные параметры чтения состава')
      }
      return jsonError(500, 'Не удалось обновить данные')
    }
    
    if (isGamePlayersRows(supabaseAdminResponse.data)) {

      const request = {
        gameId: body.gameId,
        players: supabaseAdminResponse.data.map(el => {
          return {
            isReady: el.is_ready,
            user_id: el.user_id
          }
        })
      }
      return Response.json(request, {status: 200, headers: corsHeaders})
    } else {
      return jsonError(500, 'Некорректный ответ сервера')
    }
  } else {
    return jsonError(400, 'Ошибка чтения данных')
  }

}))

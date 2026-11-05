import {corsHeaders} from '@supabase/supabase-js/cors'
import {jsonError, withAuthenticatedRequest} from '../_shared/http.ts'
import {isReadyRequest, isReadyResult} from '../_shared/lobby-validation.ts'

Deno.serve(withAuthenticatedRequest('POST', 'Не удалось изменить готовность', async (_request, {
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

  if (isReadyRequest(body)) {

    const supabaseAdminResponse = await supabaseAdmin.rpc('ready_to_game', {
      'p_game_id': body.gameId,
      'p_user_id': user.id,
      'p_is_ready': body.isReady,
    })

    if (supabaseAdminResponse.error) {
      if (supabaseAdminResponse.error.code === 'P0002') {
        return jsonError(404, 'Комната или участник не найдены')
      }
      if (supabaseAdminResponse.error.code === '22023') {
        return jsonError(400, 'Некорректные параметры готовности')
      }
      return jsonError(500, 'Не удалось обновить данные')
    }

    if (isReadyResult(supabaseAdminResponse.data) && supabaseAdminResponse.data.isReady === body.isReady) {
      const request: {
        isReady: boolean,
      } = {
        isReady: supabaseAdminResponse.data.isReady
      }

      return Response.json(request, {status: 200, headers: corsHeaders})
    } else {
      return jsonError(500, 'Некорректный ответ сервера')
    }
  } else {
    return jsonError(400, 'Ошибка чтения данных')
  }

}))

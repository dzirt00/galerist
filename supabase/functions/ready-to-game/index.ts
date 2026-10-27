import {corsHeaders} from '@supabase/supabase-js/cors'
import {withAuthenticatedRequest} from '../_shared/http.ts'

function isUUID(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value)
}

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
    return Response.json({error: 'Ошибка чтения данных'}, {status: 400, headers: corsHeaders})
  }

  if (typeof body === 'object' &&
    body !== null &&
    !Array.isArray(body) &&
    'gameId' in body &&
    'isReady' in body &&
    isUUID(body.gameId) &&
    typeof body.isReady === 'boolean'
  ) {

    const supabaseAdminResponse = await supabaseAdmin.rpc('ready_to_game', {
      'p_game_id': body.gameId,
      'p_user_id': user.id,
      'p_is_ready': body.isReady,
    })

    if (supabaseAdminResponse.error) {
      if (supabaseAdminResponse.error.code === 'P0002') {
        return Response.json({error: 'Комната или участник не найдены'}, {status: 404, headers: corsHeaders})
      }
      if (supabaseAdminResponse.error.code === '22023') {
        return Response.json({error: 'Некорректные параметры готовности'}, {status: 400, headers: corsHeaders})
      }
      return Response.json({error: 'Не удалось обновить данные'}, {status: 500, headers: corsHeaders})
    }

    if (typeof supabaseAdminResponse.data === 'object' &&
      supabaseAdminResponse.data !== null &&
      !Array.isArray(supabaseAdminResponse.data) &&
      'isReady' in supabaseAdminResponse.data &&
      typeof supabaseAdminResponse.data.isReady === 'boolean' &&
      supabaseAdminResponse.data.isReady === body.isReady
    ) {
      const request: {
        isReady: boolean,
      } = {
        isReady: supabaseAdminResponse.data.isReady
      }

      return Response.json(request, {status: 200, headers: corsHeaders})
    } else {
      return Response.json({error: 'Некорректный ответ сервера'}, {status: 500, headers: corsHeaders})
    }
  } else {
    return Response.json({error: 'Ошибка чтения данных'}, {status: 400, headers: corsHeaders})
  }

}))

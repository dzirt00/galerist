import {corsHeaders} from '@supabase/supabase-js/cors'
import {withAuthenticatedRequest} from '../_shared/http.ts'

interface GamePlayer {
  isReady: boolean,
  user_id: string
}

interface RequestGamePlayer {
  gameId: string,
  players: GamePlayer[],
}

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
    isUUID(body.gameId)
  ) {
    const supabaseAdminResponse = await supabaseAdmin.rpc('get_game_players', {
      'p_game_id': body.gameId,
      'p_user_id': user.id,
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
    
    if (Array.isArray(supabaseAdminResponse.data) &&
      supabaseAdminResponse.data.every(el => typeof el === 'object' && el !== null && !Array.isArray(el) && 'user_id' in el && 'is_ready' in el && isUUID(el.user_id) && typeof el.is_ready === 'boolean')) {

      let request: RequestGamePlayer = {
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
      return Response.json({error: 'Некорректный ответ сервера'}, {status: 500, headers: corsHeaders})
    }
  } else {
    return Response.json({error: 'Ошибка чтения данных'}, {status: 400, headers: corsHeaders})
  }

}))

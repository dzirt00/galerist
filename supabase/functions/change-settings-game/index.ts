import {corsHeaders} from '@supabase/supabase-js/cors'
import {jsonError, withAuthenticatedRequest} from '../_shared/http.ts'
import {isChangeSettingsGameRequest, isSettingsRow} from '../_shared/lobby-validation.ts'

Deno.serve(withAuthenticatedRequest('POST', 'Ошибка чтения записей', async (_request, {user, createAdminClient}) => {
  const supabaseAdmin = createAdminClient()
  if (supabaseAdmin instanceof Response) return supabaseAdmin
  let body: unknown

  try {
    body = await _request.json()
    if (!isChangeSettingsGameRequest(body)) {
      return jsonError(400, 'Ошибка запроса')
    }
  } catch {
    return jsonError(400, 'Ошибка запроса')
  }


  const {data, error} = await supabaseAdmin.rpc('change_settings_game', {
    p_game_id: body.gameId,
    p_user_id: user.id,
    p_seat_count: body.seatCount,
    p_turn_duration_minutes: body.turnDurationMinutes
  })

  if (error) {
    if (error.code === 'P0002') {
      return jsonError(400, 'Невозможно изменить настройки комнаты')
    }
    return jsonError(500, 'Ошибка чтения записей')
  }

  if (isSettingsRow(data) && body.seatCount === data.seat_count && body.turnDurationMinutes === data.turn_duration_minutes) {
    const request = {
      "seat_count": data['seat_count'],
      "turnDurationMinutes": data['turn_duration_minutes']
    }
    return Response.json(request, {status: 200, headers: corsHeaders})

  }
  return jsonError(500, 'Ошибка чтения записей')
}))

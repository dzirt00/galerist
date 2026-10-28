import {corsHeaders} from '@supabase/supabase-js/cors'
import {withAuthenticatedRequest} from '../_shared/http.ts'

interface ChangeSettingsGameRequest {
  gameId: string
  seatCount: 2 | 3 | 4
  turnDurationMinutes: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10
}

function isValidUUID(uuid: unknown): uuid is string {
  const uuidRegex = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
  return typeof uuid === 'string' && uuidRegex.test(uuid);
}

function isChangeSettingsGameRequest(value: unknown): value is ChangeSettingsGameRequest {
  return (value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    'gameId' in value &&
    'seatCount' in value &&
    'turnDurationMinutes' in value &&
    typeof value.seatCount === 'number' &&
    typeof value.turnDurationMinutes === 'number' &&
    [2, 3, 4].includes(value.seatCount) &&
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].includes(value.turnDurationMinutes) &&
    isValidUUID(value.gameId))
}

Deno.serve(withAuthenticatedRequest('POST', 'Ошибка чтения записей', async (_request, {user, createAdminClient}) => {
  const supabaseAdmin = createAdminClient()
  if (supabaseAdmin instanceof Response) return supabaseAdmin
  let body: unknown

  try {
    body = await _request.json()
    if (!isChangeSettingsGameRequest(body)) {
      return Response.json({error: 'Ошибка запроса'}, {status: 400, headers: corsHeaders})
    }
  } catch {
    return Response.json({error: 'Ошибка запроса'}, {status: 400, headers: corsHeaders})
  }


  const {data, error} = await supabaseAdmin.rpc('change_settings_game', {
    p_game_id: body.gameId,
    p_user_id: user.id,
    p_seat_count: body.seatCount,
    p_turn_duration_minutes: body.turnDurationMinutes
  })

  if (error) {
    if (error.code === 'P0002') {
      return Response.json({error: 'Невозможно изменить настройки комнаты'}, {status: 400, headers: corsHeaders})
    }
    return Response.json({error: 'Ошибка чтения записей'}, {status: 500, headers: corsHeaders})
  }

  if (data !== null &&
    !Array.isArray(data) &&
    typeof data === 'object' &&
    'seat_count' in data &&
    typeof data['seat_count'] === 'number' &&
    body.seatCount === data['seat_count'] &&
    typeof data['turn_duration_minutes'] === 'number' &&
    body.turnDurationMinutes === data['turn_duration_minutes']
  ) {
    const request = {
      "seat_count": data['seat_count'],
      "turnDurationMinutes": data['turn_duration_minutes']
    }
    return Response.json(request, {status: 200, headers: corsHeaders})

  }
  return Response.json({error: 'Ошибка чтения записей'}, {status: 500, headers: corsHeaders})
}))

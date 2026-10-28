import {corsHeaders} from '@supabase/supabase-js/cors'
import {withAuthenticatedRequest} from '../_shared/http.ts'

interface ChangeGameCount {
  gameId: string
  seatCount: 2 | 3 | 4
}

function isValidUUID(uuid: unknown): uuid is string {
  const uuidRegex = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
  return typeof uuid === 'string' && uuidRegex.test(uuid);
}

function isChangeGameCount(value: unknown): value is ChangeGameCount {
  return (value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    'gameId' in value &&
    'seatCount' in value &&
    typeof value.seatCount === 'number' &&
    [2, 3, 4].includes(value.seatCount) &&
    isValidUUID(value.gameId))
}

Deno.serve(withAuthenticatedRequest('POST', 'Ошибка чтения записей', async (_request, {user, createAdminClient}) => {
  const supabaseAdmin = createAdminClient()
  if (supabaseAdmin instanceof Response) return supabaseAdmin
  let body: unknown

  try {
    body = await _request.json()
    if (!isChangeGameCount(body)) {
      return Response.json({error: 'Ошибка запроса'}, {status: 400, headers: corsHeaders})
    }
  } catch {
    return Response.json({error: 'Ошибка запроса'}, {status: 400, headers: corsHeaders})
  }


  const {data, error} = await supabaseAdmin.rpc('change_seat_count', {
    p_game_id: body.gameId, p_user_id: user.id, p_seat_count: body.seatCount,
  })

  if (error) {
    if (error.code === 'P0002') {
      return Response.json({error: 'Невозможно изменить вместимость'}, {status: 400, headers: corsHeaders})
    }
    return Response.json({error: 'Ошибка чтения записей'}, {status: 500, headers: corsHeaders})
  }

  if (data !== null &&
    !Array.isArray(data) &&
    typeof data === 'object' &&
    'seat_count' in data &&
    typeof data['seat_count'] === 'number' &&
    body.seatCount === data['seat_count']
  ) {
    const request = {"seat_count": data['seat_count']}
    return Response.json(request, {status: 200, headers: corsHeaders})

  }
  return Response.json({error: 'Ошибка чтения записей'}, {status: 500, headers: corsHeaders})
}))

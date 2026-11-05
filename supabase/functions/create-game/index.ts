import {hashGamePassword} from './game-password.ts'
import {corsHeaders} from '@supabase/supabase-js/cors'
import {jsonError, withAuthenticatedRequest} from '../_shared/http.ts'
import {isRecord, isUUID} from '../_shared/validation.ts'
import {isCreateGameResult, isGameRow, isGamePlayerRows, isSeatCount, isTurnDurationMinutes} from '../_shared/lobby-validation.ts'

const errorMessage = {
  OWN_LOBBY_EXISTS: 'У вас уже есть открытое лобби',
  GAME_IN_PROGRESS: 'Вы участвуете в незавершённой партии',
  LOBBY_MEMBERSHIP_EXISTS: 'Вы уже участвуете в другом открытом лобби'
}
Deno.serve(withAuthenticatedRequest('POST', 'Не удалось создать комнату', async (request, {user, createAdminClient}) => {
  let payload: unknown

  try {
    payload = await request.json()
  } catch {
    return jsonError(400, 'Некорректный JSON')
  }
  if (!isRecord(payload)) {
    return jsonError(400, 'Настройки комнаты должны быть объектом')
  }
  const seatCount = ('seatCount' in payload) ? payload.seatCount : null
  const requestId = ('requestId' in payload) ? payload.requestId : null
  const password = ('password' in payload) ? payload.password : undefined
  const turnDurationMinutes = ('turnDurationMinutes' in payload) ? payload.turnDurationMinutes : undefined

  if (!isSeatCount(seatCount)) {
    return jsonError(400, 'Некорректное число игроков')
  }
  if (!isUUID(requestId)) {
    return jsonError(400, 'Некорректный ID запроса')
  }
  if (password !== undefined && typeof password !== 'string') {
    return jsonError(400, 'Пароль должен быть строкой')
  }
  if (password !== undefined && typeof password === 'string' && password.length < 8 && password.length > 0) {
    return jsonError(400, 'Пароль должен состоять как минимум из 8 символов')
  }

  if (!isTurnDurationMinutes(turnDurationMinutes)) {
    return jsonError(400, 'Укажите количество минут на ход')
  }

  let passwordHash: string | null = null
  if (password) {
    try {
      passwordHash = await hashGamePassword(password)
    } catch {
      return jsonError(500, 'Ошибка')
    }
  }

  const supabaseAdmin = createAdminClient()
  if (supabaseAdmin instanceof Response) return supabaseAdmin

  try {
    const supabaseAdminResponse = await supabaseAdmin.rpc('create_game', {
      'p_creator_id': user.id,
      'p_request_id': requestId,
      'p_seat_count': seatCount,
      'p_password_hash': passwordHash,
      'p_turn_duration_minutes': turnDurationMinutes
    })
    const supabaseAdminResponseData = supabaseAdminResponse.data
    const supabaseAdminResponseError = supabaseAdminResponse.error

    if (supabaseAdminResponseError) {
      return jsonError(500, 'Не удалось создать комнату')
    }

    if (!isCreateGameResult(supabaseAdminResponseData)) {
      return jsonError(500, 'Не удалось создать комнату')
    }


    const code = supabaseAdminResponseData.code
    if (code !== 'SUCCESS') {
      return jsonError(409, errorMessage[code], {code, gameId: supabaseAdminResponseData.gameId})
    }

    const response = await supabaseAdmin.from('games').select('id, creator_id, seat_count, turn_duration_minutes').eq('id', supabaseAdminResponseData.gameId).single()

    if (response.error || !isGameRow(response.data)) {
      return jsonError(500, 'Не удалось создать комнату')
    }
    const id = response.data.id
    const creator_id = response.data['creator_id']
    const seat_count = response.data['seat_count']
    const turn_duration_minutes = response.data['turn_duration_minutes']
    const responseGamePlayers = await supabaseAdmin.from('game_players').select('user_id').eq('game_id', id)
    const responseGamePasswords = await supabaseAdmin.from('game_passwords').select('game_id').eq('game_id', id).maybeSingle()

    if (!isGamePlayerRows(responseGamePlayers.data) || responseGamePlayers.error || responseGamePasswords.error) {
      return jsonError(500, 'Не удалось создать комнату')
    }

    const request = {
      id: id,
      creator_id: creator_id,
      seat_count: seat_count,
      hasPassword: (responseGamePasswords.data) ? true : false,
      occupiedSeats: responseGamePlayers.data,
      turnDurationMinutes: turn_duration_minutes
    }
    return Response.json(request, {status: 200, headers: corsHeaders})
  } catch {
    return jsonError(500, 'Не удалось создать комнату')
  }
}))

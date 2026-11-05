import {jsonError, withAuthenticatedRequest} from '../_shared/http.ts'
import {corsHeaders} from '@supabase/supabase-js/cors'
import {verifyGamePassword} from './game-password.ts'
import {isRecord, isUUID, isObject, isString} from '../_shared/validation.ts'
import {isGameListItem, isJoinGameRefusal} from '../_shared/lobby-validation.ts'

const errorMessage = {
  LOBBY_NOT_OPEN: 'Комната больше не принимает участников',
  OWN_LOBBY_EXISTS: 'У вас уже есть открытое лобби',
  GAME_IN_PROGRESS: 'Вы участвуете в незавершённой партии',
}
const isPasswordRow = isObject({password_hash: isString})

Deno.serve(withAuthenticatedRequest('POST', 'Не удалось присоединиться к комнате. Попробуйте ещё раз', async (request, {
  user,
  createAdminClient
}) => {
  const fail = jsonError
  const admin = createAdminClient()
  if (admin instanceof Response) return admin
  let payload: unknown
  try {
    payload = await request.json()
  } catch {
    return fail(400, 'Некорректный JSON')
  }
  if (!isRecord(payload)) return fail(400, 'Некорректные данные комнаты')
  const {gameId, password} = payload
  if (!isUUID(gameId)) return fail(400, 'Некорректный ID комнаты')
  if (password !== undefined && typeof password !== 'string') return fail(400, 'Пароль должен быть строкой')
  let verifiedHash: string | null = null
  // SQL still decides membership: a retry by an existing member needs no password.
  if (typeof password === 'string' && password.length > 0) {
    const stored = await admin.from('game_passwords').select('password_hash').eq('game_id', gameId).maybeSingle()
    if (stored.error) return fail(500, 'Не удалось проверить пароль')
    if (stored.data) {
      if (!isPasswordRow(stored.data)) return fail(500, 'Не удалось проверить пароль')
      if (await verifyGamePassword(password, stored.data.password_hash)) verifiedHash = stored.data.password_hash
    }
  }
  const result = await admin.rpc('join_game', {
    p_game_id: gameId, p_user_id: user.id, p_verified_password_hash: verifiedHash,
  })
  if (result.error) {
    if (result.error.code === 'P0002') return fail(404, 'Комната не найдена')
    if (result.error.code === 'P1001') return fail(403, 'Неверный пароль')
    if (result.error.code === 'P1002') return fail(409, 'Свободных мест нет')
    return fail(500, 'Не удалось присоединиться к комнате. Попробуйте ещё раз')
  }
  if (isRecord(result.data) && 'code' in result.data) {
    if (isJoinGameRefusal(result.data)) {
      return jsonError(409, errorMessage[result.data.code], {code: result.data.code, gameId: result.data.gameId})
    } else {
      return fail(500, 'Не удалось присоединиться к комнате. Попробуйте ещё раз')
    }
  }
  if (!isGameListItem(result.data) || result.data.id !== gameId || result.data.occupiedSeatCount < 1) {
    return fail(500, 'Не удалось присоединиться к комнате. Попробуйте ещё раз')
  }

  const {id, seat_count, occupiedSeatCount, hasPassword, turnDurationMinutes} = result.data
  return Response.json({id, seat_count, occupiedSeatCount, hasPassword, turnDurationMinutes}, {headers: corsHeaders})
}, {requireAdminKeyBeforeAuth: true}))

import {jsonError, withAuthenticatedRequest} from '../_shared/http.ts'
import {corsHeaders} from '@supabase/supabase-js/cors'
import {verifyGamePassword} from './game-password.ts'

function isUUID(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value)
}

function isLobby(value: unknown, gameId: string): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const lobby = value as Record<string, unknown>
  return lobby.id === gameId && [2, 3, 4].includes(lobby.seat_count as number)
    && typeof lobby.occupiedSeatCount === 'number' && Number.isSafeInteger(lobby.occupiedSeatCount)
    && lobby.occupiedSeatCount >= 1 && lobby.occupiedSeatCount <= (lobby.seat_count as number)
    && typeof lobby.hasPassword === 'boolean'
    && typeof lobby.turnDurationMinutes === 'number' && Number.isSafeInteger(lobby.turnDurationMinutes)
    && lobby.turnDurationMinutes > 0 && lobby.turnDurationMinutes < 11
}

Deno.serve(withAuthenticatedRequest('POST', 'Не удалось присоединиться к комнате. Попробуйте ещё раз', async (request, {user, createAdminClient}) => {
  const fail = jsonError
  const admin = createAdminClient()
  if (admin instanceof Response) return admin
  let payload: unknown
  try { payload = await request.json() } catch { return fail(400, 'Некорректный JSON') }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return fail(400, 'Некорректные данные комнаты')
  const {gameId, password} = payload as Record<string, unknown>
  if (!isUUID(gameId)) return fail(400, 'Некорректный ID комнаты')
  if (password !== undefined && typeof password !== 'string') return fail(400, 'Пароль должен быть строкой')
  let verifiedHash: string | null = null
  // SQL still decides membership: a retry by an existing member needs no password.
  if (typeof password === 'string' && password.length > 0) {
    const stored = await admin.from('game_passwords').select('password_hash').eq('game_id', gameId).maybeSingle()
    if (stored.error) return fail(500, 'Не удалось проверить пароль')
    if (stored.data) {
      if (typeof stored.data.password_hash !== 'string') return fail(500, 'Не удалось проверить пароль')
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
  if (!isLobby(result.data, gameId)) return fail(500, 'Некорректный ответ сервера')
  const {id, seat_count, occupiedSeatCount, hasPassword, turnDurationMinutes} = result.data
  return Response.json({id, seat_count, occupiedSeatCount, hasPassword, turnDurationMinutes}, {headers: corsHeaders})
}, {requireAdminKeyBeforeAuth: true}))

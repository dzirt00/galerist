import {corsHeaders} from '@supabase/supabase-js/cors'
import {jsonError, withAuthenticatedRequest} from '../_shared/http.ts'
import {isGameList, type GameListItem} from '../_shared/lobby-validation.ts'

Deno.serve(withAuthenticatedRequest('GET', 'Ошибка чтения записей', async (_request, {createAdminClient}) => {
  const supabaseAdmin = createAdminClient()
  if (supabaseAdmin instanceof Response) return supabaseAdmin

  const {data, error} = await supabaseAdmin.rpc('get_game_list')
  if (error || !isGameList(data)) {
    return jsonError(500, 'Ошибка чтения записей')
  }

  const gameList: GameListItem[] = data.map(({id, seat_count, occupiedSeatCount, hasPassword, turnDurationMinutes}) =>
    ({id, seat_count, occupiedSeatCount, hasPassword, turnDurationMinutes}))

  return Response.json(gameList, {status: 200, headers: corsHeaders})
}))

import {corsHeaders} from '@supabase/supabase-js/cors'
import {withAuthenticatedRequest} from '../_shared/http.ts'

interface GameListItem {
  id: string
  seat_count: number
  occupiedSeatCount: number
  hasPassword: boolean
}

Deno.serve(withAuthenticatedRequest('GET', 'Ошибка чтения записей', async (_request, {createAdminClient}) => {
  const supabaseAdmin = createAdminClient()
  if (supabaseAdmin instanceof Response) return supabaseAdmin

  const {data, error} = await supabaseAdmin.from('games').select('id, seat_count')


  if (error) {
    return Response.json({error: 'Ошибка чтения записей'}, {status: 500, headers: corsHeaders})
  }

  let gameList: GameListItem[] = []
  for (const el of data) {
    const responseOccupiedSeatCount = await supabaseAdmin.from('game_players').select('game_id').eq('game_id', el.id)
    const responseGamePasswords = await supabaseAdmin.from('game_passwords').select('game_id').eq('game_id', el.id)

    if (responseOccupiedSeatCount.error || responseGamePasswords.error) {
      return Response.json({error: 'Ошибка чтения записей'}, {status: 500, headers: corsHeaders})
    }

    gameList.push({
      id: el.id,
      seat_count: el.seat_count,
      occupiedSeatCount: responseOccupiedSeatCount.data.length,
      hasPassword: (responseGamePasswords.data.length !== 0)
    })
  }

  return Response.json(gameList, {status: 200, headers: corsHeaders})
}))

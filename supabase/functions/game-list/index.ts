import {createClient} from '@supabase/supabase-js'
import {corsHeaders} from '@supabase/supabase-js/cors'

interface GameListItem {
  id: string
  seat_count: number
  occupiedSeatCount: number
  hasPassword: boolean
}

Deno.serve(async (request: Request) => {

  if (request.method === 'OPTIONS') {
    return new Response(null, {status: 204, headers: corsHeaders})
  }

  if (request.method !== 'GET') {
    return Response.json({error: 'Метод не поддерживается'}, {
      status: 405,
      headers: {...corsHeaders, Allow: 'GET, OPTIONS'}
    })
  }

  const authorization = request.headers.get('Authorization')
  if (!authorization) {
    return Response.json({error: 'Требуется авторизация'}, {status: 401, headers: corsHeaders})
  } else {
    if (authorization.startsWith('Bearer ')) {
      const token = authorization.slice('Bearer '.length).trim()
      if (!token) return Response.json({error: 'Требуется авторизация'}, {status: 401, headers: corsHeaders})
      try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL')
        const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')

        if (!supabaseUrl || !supabaseAnonKey) {
          return Response.json({error: 'Сервер не настроен'}, {status: 500, headers: corsHeaders})
        }
        const supabase = createClient(supabaseUrl, supabaseAnonKey, {
          auth: {persistSession: false, autoRefreshToken: false}
        })


        const authResult = await supabase.auth.getUser(token)
        const authResultError = authResult.error
        if (authResultError && (authResultError.status === 400 || authResultError.status === 401 || authResultError.status === 403)) {
          return Response.json({error: 'Сессия недействительна'}, {status: 401, headers: corsHeaders})
        }

        if (authResultError) {
          return Response.json({error: 'Не удалось проверить сессию. Повторите позже'}, {
            status: 503,
            headers: corsHeaders
          })
        }

        const user = authResult.data.user
        if (!user) {
          return Response.json({error: 'Сессия недействительна'}, {status: 401, headers: corsHeaders})
        }

        const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

        if (!supabaseServiceRoleKey) {
          return Response.json({error: 'Сервер не настроен'}, {status: 500, headers: corsHeaders})
        }

        const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
          auth: {persistSession: false, autoRefreshToken: false}
        })


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
      } catch {
        return Response.json({error: 'Ошибка чтения записей'}, {status: 500, headers: corsHeaders})
      }


    } else {
      return Response.json({error: 'Требуется авторизация'}, {status: 401, headers: corsHeaders})
    }
  }

})

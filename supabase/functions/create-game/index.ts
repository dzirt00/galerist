import {createClient} from '@supabase/supabase-js'
import {hashGamePassword} from './game-password.ts'
import {corsHeaders} from '@supabase/supabase-js/cors'

function isValidUUID(uuid: unknown) {
  const uuidRegex = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
  return typeof uuid === 'string' && uuidRegex.test(uuid);
}

Deno.serve(async (request: Request) => {

  if (request.method === 'OPTIONS') {
    return new Response(null, {status: 204, headers: corsHeaders})
  }

  if (request.method !== 'POST') {
    return Response.json({error: 'Метод не поддерживается'}, {
      status: 405,
      headers: {...corsHeaders, Allow: 'POST, OPTIONS'}
    })
  }

  const authorization = request.headers.get('Authorization')
  if (!authorization) {
    return Response.json({error: 'Требуется авторизация'}, {status: 401, headers: corsHeaders})
  } else {
    if (authorization.startsWith('Bearer ')) {
      const token = authorization.slice('Bearer '.length).trim()
      if (!token) return Response.json({error: 'Требуется авторизация'}, {status: 401, headers: corsHeaders})

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

      let payload: unknown

      try {
        payload = await request.json()
      } catch {
        return Response.json({error: 'Некорректный JSON'}, {status: 400, headers: corsHeaders})
      }
      if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
        return Response.json({error: 'Настройки комнаты должны быть объектом'}, {status: 400, headers: corsHeaders})
      }
      const seatCount = ('seatCount' in payload) ? payload.seatCount : null
      const requestId = ('requestId' in payload) ? payload.requestId : null
      const password = ('password' in payload) ? payload.password : undefined
      if (typeof seatCount !== 'number' || !Number.isSafeInteger(seatCount) || ![2, 3, 4].includes(seatCount)) {
        return Response.json({error: 'Некорректное число игроков'}, {status: 400, headers: corsHeaders})
      }
      if (!isValidUUID(requestId)) {
        return Response.json({error: 'Некорректное запрос'}, {status: 400, headers: corsHeaders})
      }
      if (password !== undefined && typeof password !== 'string') {
        return Response.json({error: 'пароль не строка'}, {status: 400, headers: corsHeaders})
      }
      if (password !== undefined && typeof password === 'string' && password.length < 8 && password.length > 0) {
        return Response.json({error: 'пароль должен состоять как минимум из 8 символов'}, {
          status: 400,
          headers: corsHeaders
        })
      }
      let passwordHash: string | null = null
      if (password) {
        try {
          passwordHash = await hashGamePassword(password)
        } catch {
          return Response.json({error: 'Ошибка'}, {status: 500, headers: corsHeaders})
        }
      }

      const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

      if (!supabaseServiceRoleKey) {
        return Response.json({error: 'Сервер не настроен'}, {status: 500, headers: corsHeaders})
      }

      const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
        auth: {persistSession: false, autoRefreshToken: false}
      })

      try {
        const supabaseAdminResponse = await supabaseAdmin.rpc('create_game', {
          'p_creator_id': user.id,
          'p_request_id': requestId,
          'p_seat_count': seatCount,
          'p_password_hash': passwordHash
        })
        const supabaseAdminResponseData = supabaseAdminResponse.data
        const supabaseAdminResponseError = supabaseAdminResponse.error

        if (supabaseAdminResponseError) {
          return Response.json({error: 'Не удалось создать комнату'}, {status: 500, headers: corsHeaders})
        }
        if (!isValidUUID(supabaseAdminResponseData)) {
          return Response.json({error: 'Не удалось создать комнату'}, {status: 500, headers: corsHeaders})
        }

        const response = await supabaseAdmin.from('games').select('id, creator_id, seat_count').eq('id', supabaseAdminResponseData).single()

        if (response.error || !response.data) {
          return Response.json({error: 'Не удалось создать комнату'}, {status: 500, headers: corsHeaders})
        }
        const id = response.data.id
        const creator_id = response.data['creator_id']
        const seat_count = response.data['seat_count']
        if (!id || !creator_id || (seat_count !== 2 && seat_count !== 3 && seat_count !== 4)) {
          return Response.json({error: 'Не удалось создать комнату'}, {status: 500, headers: corsHeaders})
        }

        const responseGamePlayers = await supabaseAdmin.from('game_players').select('user_id').eq('game_id', id)
        const responseGamePasswords = await supabaseAdmin.from('game_passwords').select('game_id').eq('game_id', id).maybeSingle()

        if (!responseGamePlayers.data || responseGamePlayers.error || responseGamePasswords.error) {
          return Response.json({error: 'Не удалось создать комнату'}, {status: 500, headers: corsHeaders})
        }

        const request = {
          id: id,
          creator_id: creator_id,
          seat_count: seat_count,
          hasPassword: (responseGamePasswords.data) ? true : false,
          occupiedSeats: responseGamePlayers.data
        }
        return Response.json(request, {status: 200, headers: corsHeaders})
      } catch {
        return Response.json({error: 'Не удалось создать комнату'}, {status: 500, headers: corsHeaders})
      }

    } else {
      return Response.json({error: 'Требуется авторизация'}, {status: 401, headers: corsHeaders})
    }

  }
})

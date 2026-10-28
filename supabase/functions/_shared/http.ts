import {createClient, type SupabaseClient, type User} from '@supabase/supabase-js'
import {corsHeaders} from '@supabase/supabase-js/cors'

type AuthenticatedContext = {
  user: User
  createAdminClient: () => SupabaseClient | Response
}

export function jsonError(status: number, error: string): Response {
  return Response.json({error}, {status, headers: corsHeaders})
}

// The handler owns payload validation and authorization for the specific action.
export function withAuthenticatedRequest(
  method: 'GET' | 'POST',
  failureMessage: string,
  handle: (request: Request, context: AuthenticatedContext) => Promise<Response>,
  options: {requireAdminKeyBeforeAuth?: boolean; timingLabel?: string} = {},
): (request: Request) => Promise<Response> {
  return async (request) => {
    const startedAt = performance.now()
    let authMs: number | null = null
    const execute = async () => {
      if (request.method === 'OPTIONS') return new Response(null, {status: 204, headers: corsHeaders})
      if (request.method !== method) {
        return Response.json({error: 'Метод не поддерживается'}, {
          status: 405, headers: {...corsHeaders, Allow: `${method}, OPTIONS`},
        })
      }
      const authorization = request.headers.get('Authorization')
      if (!authorization?.startsWith('Bearer ') || !authorization.slice(7).trim()) {
        return jsonError(401, 'Требуется авторизация')
      }
      try {
        const url = Deno.env.get('SUPABASE_URL')
        const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
        if (!url || !anonKey) return jsonError(500, 'Сервер не настроен')
        if (options.requireAdminKeyBeforeAuth && !Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')) {
          return jsonError(500, 'Сервер не настроен')
        }
        const clientOptions = {auth: {persistSession: false, autoRefreshToken: false}}
        const supabase = createClient(url, anonKey, clientOptions)
        const authStartedAt = performance.now()
        const auth = await supabase.auth.getUser(authorization.slice(7).trim()).finally(() => {
          authMs = performance.now() - authStartedAt
        })
        if (auth.error) {
          return [400, 401, 403].includes(auth.error.status ?? 0)
            ? jsonError(401, 'Сессия недействительна')
            : jsonError(503, 'Не удалось проверить сессию. Повторите позже')
        }
        if (!auth.data.user) return jsonError(401, 'Сессия недействительна')
        // Lazy creation preserves the action's order of validation and DB access.
        const createAdminClient = () => {
          const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
          return key ? createClient(url, key, clientOptions) : jsonError(500, 'Сервер не настроен')
        }
        return await handle(request, {user: auth.data.user, createAdminClient})
      } catch {
        return jsonError(500, failureMessage)
      }
    }
    let status: number | null = null
    try {
      const response = await execute()
      status = response.status
      return response
    } finally {
      if (options.timingLabel) {
        console.info(JSON.stringify({
          event: `${options.timingLabel}.request-timing`,
          method: request.method,
          status,
          authMs,
          totalMs: performance.now() - startedAt,
        }))
      }
    }
  }
}

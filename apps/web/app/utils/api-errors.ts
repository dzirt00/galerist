import {isNonEmptyString, isObject, isRecord, isUUID} from './validation'

const isErrorBody = isObject({error: isNonEmptyString})

/** Read the user-facing message prepared by our Edge Function, never an SDK exception message. */
export interface FunctionError {
  message: string
  status?: number
  code?: string
  gameId?: string
}

export async function getFunctionError(error: unknown, fallback: string): Promise<FunctionError> {
  if (!isRecord(error) || !(error.context instanceof Response) || error.context.status < 400) return {message: fallback}
  const status = error.context.status
  try {
    const body: unknown = await error.context.json()
    if (!isRecord(body)) return {message: fallback, status}
    const {code, gameId} = body
    if (!isErrorBody(body)) return {message: fallback, status}
    return {
      message: body.error, status,
      code: isNonEmptyString(code) ? code : undefined,
      gameId: isUUID(gameId) ? gameId : undefined,
    }
  } catch {
    return {message: fallback, status}
  }
}

export async function getFunctionErrorMessage(error: unknown, fallback: string): Promise<string> {
  return (await getFunctionError(error, fallback)).message
}

/** Auth/PostgREST returned errors use message rather than our Edge Function's error field. */
export function getSupabaseErrorMessage(error: unknown, fallback: string): string {
  return isRecord(error) && isNonEmptyString(error.message) ? error.message : fallback
}

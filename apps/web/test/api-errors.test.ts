import {describe, expect, it} from 'vitest'
import {getFunctionErrorMessage, getSupabaseErrorMessage} from '../app/utils/api-errors'

describe('сообщения сервера', () => {
  it.each([400, 401, 403, 404, 409, 500, 503])('читает error из HTTP %s независимо от code', async (status) => {
    const context = Response.json({code: 'FUTURE_CODE', error: 'Сообщение сервера'}, {status})
    expect(await getFunctionErrorMessage({context}, 'Запасной текст')).toBe('Сообщение сервера')
  })
  it.each([null, [], {}, {error: ''}, {error: ' '}, {error: 12}, {message: 'SDK diagnostic'}])('не принимает некорректное тело %j', async (body) => {
    expect(await getFunctionErrorMessage({context: Response.json(body, {status: 409})}, 'Запасной текст')).toBe('Запасной текст')
  })
  it('оставляет запасной текст при сетевой ошибке и сломанном JSON', async () => {
    for (const error of [new Error('SDK diagnostic'), null, {context: {status: 409}},
      {context: new Response('{', {status: 500})}, {context: Response.json({error: 'Не ошибка'}, {status: 200})}]) {
      expect(await getFunctionErrorMessage(error, 'Запасной текст')).toBe('Запасной текст')
    }
  })
  it('читает возвращённую ошибку Auth/PostgREST и проверяет текст', () => {
    expect(getSupabaseErrorMessage({message: 'Сервер отказал'}, 'Запасной текст')).toBe('Сервер отказал')
    expect(getSupabaseErrorMessage({message: 1}, 'Запасной текст')).toBe('Запасной текст')
  })
})

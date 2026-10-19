import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import App from '../app/app.vue'

const api = vi.hoisted(() => ({
  getSession: vi.fn(),
  signInWithOtp: vi.fn(),
  from: vi.fn(),
  select: vi.fn(),
  eq: vi.fn(),
  maybeSingle: vi.fn(),
}))

vi.mock('nuxt/app', () => ({
  useNuxtApp: () => ({
    $supabase: {
      auth: { getSession: api.getSession, signInWithOtp: api.signInWithOtp },
      from: api.from,
    },
  }),
}))

enableAutoUnmount(afterEach)

const userId = '11111111-1111-4111-8111-111111111111'
const otherId = '22222222-2222-4222-8222-222222222222'
const ownProfile = { id: userId, created_at: '2026-10-19T00:00:00Z' }
const signedIn = { data: { session: { user: { id: userId } } }, error: null }
const signedOut = { data: { session: null }, error: null }

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => { resolve = done })
  return { promise, resolve }
}

beforeEach(() => {
  vi.resetAllMocks()
  window.history.replaceState(null, '', '/')
  api.getSession.mockResolvedValue(signedOut)
  api.signInWithOtp.mockResolvedValue({ error: null })
  api.from.mockReturnValue({ select: api.select })
  api.select.mockReturnValue({ eq: api.eq })
  api.eq.mockReturnValue({ maybeSingle: api.maybeSingle })
  api.maybeSingle.mockResolvedValue({ data: ownProfile, error: null })
})

describe('WEB-001: вход и собственный профиль', () => {
  it('без сессии показывает форму и не запрашивает профили', async () => {
    const wrapper = mount(App)
    await flushPromises()

    expect(wrapper.find('input[type="email"]').exists()).toBe(true)
    expect(wrapper.get('input').attributes('required')).toBeDefined()
    expect(api.getSession).toHaveBeenCalledTimes(1)
    expect(api.from).not.toHaveBeenCalled()
    expect(wrapper.find('section').exists()).toBe(false)
    expect(wrapper.find('input[type="number"]').exists()).toBe(false)
  })

  it('передаёт введённый email, блокирует повтор и показывает результат отправки', async () => {
    const request = deferred<{ error: null }>()
    api.signInWithOtp.mockReturnValueOnce(request.promise)
    const wrapper = mount(App)
    await flushPromises()
    await wrapper.get('input').setValue('learner@example.test')
    await wrapper.get('form').trigger('submit')

    expect(api.signInWithOtp).toHaveBeenCalledWith({ email: 'learner@example.test' })
    expect(wrapper.get('button[type="submit"]').attributes('disabled')).toBeDefined()
    expect(wrapper.text()).toContain('Отправляем…')
    await wrapper.get('form').trigger('submit')
    expect(api.signInWithOtp).toHaveBeenCalledTimes(1)

    request.resolve({ error: null })
    await flushPromises()
    expect(wrapper.get('[role="status"]').text()).toContain('Письмо отправлено')
    expect(wrapper.get('button[type="submit"]').attributes('disabled')).toBeUndefined()
    expect(api.getSession).toHaveBeenCalledTimes(1)
  })

  it.each(['response', 'exception'])('при ошибке отправки (%s) разрешает новую попытку', async (kind) => {
    if (kind === 'response') {
      api.signInWithOtp.mockResolvedValueOnce({ error: { message: 'test error' } })
    } else {
      api.signInWithOtp.mockRejectedValueOnce(new Error('offline'))
    }
    const wrapper = mount(App)
    await flushPromises()
    await wrapper.get('input').setValue('learner@example.test')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(wrapper.get('[role="status"]').text()).toContain('Не удалось отправить письмо')
    expect(wrapper.text()).not.toContain('Письмо отправлено')
    expect(wrapper.get('button[type="submit"]').attributes('disabled')).toBeUndefined()

    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(wrapper.get('[role="status"]').text()).toContain('Письмо отправлено')
  })

  it('показывает загрузку, затем профиль из сохранённой сессии; повторное открытие восстанавливает его', async () => {
    const request = deferred<typeof signedIn>()
    api.getSession.mockReturnValueOnce(request.promise).mockResolvedValue(signedIn)
    const wrapper = mount(App)
    await flushPromises()
    expect(wrapper.text()).toContain('Загружаем профиль…')
    expect(wrapper.find('form').exists()).toBe(false)

    request.resolve(signedIn)
    await flushPromises()
    expect(api.from).toHaveBeenCalledWith('profiles')
    expect(api.select).toHaveBeenCalledWith('id, created_at')
    expect(api.eq).toHaveBeenCalledWith('id', userId)
    expect(wrapper.get('section').text()).toContain('Мой профиль')
    expect(wrapper.get('section').text()).toContain(userId)
    expect(wrapper.text()).not.toContain(otherId)
    expect(wrapper.find('input[type="email"]').exists()).toBe(false)
    expect(wrapper.find('input[type="number"]').exists()).toBe(true)
    expect(wrapper.text()).not.toContain('Загружаем профиль…')
    wrapper.unmount()

    const reopened = mount(App)
    await flushPromises()
    expect(reopened.get('section').text()).toContain(userId)
    expect(api.signInWithOtp).not.toHaveBeenCalled()
  })

  it.each(['session', 'query', 'missing', 'exception'])(
    'при ошибке (%s) показывает повтор без формы и загружает профиль без нового письма',
    async (kind) => {
      api.getSession.mockResolvedValue(signedIn)
      if (kind === 'session') {
        api.getSession.mockResolvedValueOnce({ data: { session: null }, error: { message: 'test' } })
      } else if (kind === 'query') {
        api.maybeSingle.mockResolvedValueOnce({ data: null, error: { message: 'test' } })
      } else if (kind === 'missing') {
        api.maybeSingle.mockResolvedValueOnce({ data: null, error: null })
      } else {
        api.maybeSingle.mockRejectedValueOnce(new Error('offline'))
      }
      const wrapper = mount(App)
      await flushPromises()
      expect(wrapper.find('form').exists()).toBe(false)
      expect(wrapper.find('section').exists()).toBe(false)
      const previousMessage = wrapper.get('[role="status"]').text()
      expect(previousMessage).not.toContain('Профиль загружен')
      expect(wrapper.get('button').text()).toBe('Повторить загрузку')

      const request = deferred<{ data: typeof ownProfile; error: null }>()
      api.maybeSingle.mockReturnValueOnce(request.promise)
      await wrapper.get('button').trigger('click')
      await flushPromises()
      expect(wrapper.text()).toContain('Загружаем профиль…')
      expect(wrapper.text()).not.toContain(previousMessage)
      expect(wrapper.find('button').exists()).toBe(false)

      request.resolve({ data: ownProfile, error: null })
      await flushPromises()
      expect(wrapper.get('section').text()).toContain(userId)
      expect(wrapper.find('button[type="button"]').exists()).toBe(false)
      expect(wrapper.find('input[type="email"]').exists()).toBe(false)
      expect(wrapper.find('input[type="number"]').exists()).toBe(true)
      expect(api.signInWithOtp).not.toHaveBeenCalled()
    },
  )

  it('при недействительной ссылке сохраняет понятную ошибку и позволяет запросить новую', async () => {
    window.history.replaceState(null, '', '/#error=access_denied&error_code=otp_expired&error_description=untrusted')
    const wrapper = mount(App)
    await flushPromises()

    expect(wrapper.get('[role="status"]').text()).toContain('Ссылка недействительна или устарела')
    expect(wrapper.text()).not.toContain('untrusted')
    expect(api.getSession).not.toHaveBeenCalled()
    expect(api.from).not.toHaveBeenCalled()
    expect(wrapper.find('form').exists()).toBe(true)

    await wrapper.get('input').setValue('learner@example.test')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(wrapper.get('[role="status"]').text()).toContain('Письмо отправлено')
    expect(wrapper.text()).not.toContain('Ссылка недействительна или устарела')
  })
})

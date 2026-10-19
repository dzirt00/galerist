import { afterEach, describe, expect, it } from 'vitest'
import { enableAutoUnmount, mount } from '@vue/test-utils'
import CreateGameForm from '../app/CreateGameForm.vue'

enableAutoUnmount(afterEach)

describe('WEB-002: локальная форма создания комнаты', () => {
  it.each([2, 3, 4])('принимает %s места без пароля и перехватывает отправку формы', async (seatCount) => {
    const wrapper = mount(CreateGameForm)
    await wrapper.get('input[type="number"]').setValue(String(seatCount))
    expect(wrapper.get('button').attributes('type')).toBe('submit')

    const event = new Event('submit', { bubbles: true, cancelable: true })
    wrapper.get('form').element.dispatchEvent(event)
    await wrapper.vm.$nextTick()

    expect(event.defaultPrevented).toBe(true)
    expect(wrapper.get('p').text()).toBe('Данные формы проверены')
    expect(wrapper.text()).not.toContain('Комната создана')
  })

  it.each(['', '1', '5', '2.5'])('отклоняет недопустимое количество мест: "%s"', async (seatCount) => {
    const wrapper = mount(CreateGameForm)
    await wrapper.get('input[type="number"]').setValue(seatCount)
    await wrapper.get('form').trigger('submit')

    expect(wrapper.get('p').text()).toBe('Укажите число игроков')
    expect(wrapper.text()).not.toContain('Данные формы проверены')
  })

  it('сохраняет короткий пароль после ошибки и принимает исправление до 8 символов', async () => {
    const wrapper = mount(CreateGameForm)
    await wrapper.get('input[type="number"]').setValue('3')
    const password = wrapper.get('input[type="password"]')
    await password.setValue('1234567')

    await wrapper.get('form').trigger('submit')
    expect(wrapper.get('p').text()).toBe('Минимальное количество символов пароля 8')
    expect((password.element as HTMLInputElement).value).toBe('1234567')

    await wrapper.get('form').trigger('submit')
    expect(wrapper.get('p').text()).toBe('Минимальное количество символов пароля 8')

    await password.setValue('12345678')
    await wrapper.get('form').trigger('submit')
    expect(wrapper.get('p').text()).toBe('Данные формы проверены')
  })

  it('позволяет очистить введённый пароль и продолжить без него', async () => {
    const wrapper = mount(CreateGameForm)
    await wrapper.get('input[type="number"]').setValue('2')
    await wrapper.get('input[type="password"]').setValue('1234567')
    await wrapper.get('form').trigger('submit')
    expect(wrapper.get('p').text()).toBe('Минимальное количество символов пароля 8')

    await wrapper.get('input[type="password"]').setValue('')
    await wrapper.get('form').trigger('submit')
    expect(wrapper.get('p').text()).toBe('Данные формы проверены')
  })
})

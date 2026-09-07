import { expect, it } from 'vitest'
import { calculateInfluenceAfterGain } from "../src/index";


it('обычный прирост: 10 + 5 → 15',() =>{
  const res = calculateInfluenceAfterGain(10, 5)
  expect(res).toBe(15)
})

it('нулевая награда: 10 + 0 → 10',() =>{
  const res = calculateInfluenceAfterGain(10, 0)
  expect(res).toBe(10)
})
it('нижняя граница: 0 + 1 → 1',() =>{
  const res = calculateInfluenceAfterGain(0, 1)
  expect(res).toBe(1)
})
it(' точное достижение максимума: 34 + 1 → 35',() =>{
  const res = calculateInfluenceAfterGain(34, 1)
  expect(res).toBe(35)
})
it('превышение максимума: 34 + 2 → 35;',() =>{
  const res = calculateInfluenceAfterGain(34, 2)
  expect(res).toBe(35)
})
it('получение на максимуме: 35 + 1 → 35',() =>{
  const res = calculateInfluenceAfterGain(35, 1)
  expect(res).toBe(35)
})

it('большая допустимая награда: 10 + Number.MAX_SAFE_INTEGER → 35;',() =>{
  const res = calculateInfluenceAfterGain(10, Number.MAX_SAFE_INTEGER)
  expect(res).toBe(35)
})
it.each([
  // Отрицательные значения
  { value: -1 },
  { value: -5 },
  { value: -10 },
  { value: -2 },

  // Нецелые числа (Дроби)
  { value: 10.5 },
  { value: 3.14 },

  // Не числовые типы (NaN, строки, булевы значения, null)
  { value: NaN },
  { value: '3' },
  { value: true },
  { value: null },

  // Превышение безопасного максимума
  { value: Number.MAX_SAFE_INTEGER + 1 },

  // Бесконечность
  { value: Infinity},
  { value: -Infinity },
])('невалидные значения каждого аргумента отдельно', ({ value }) => {

  expect(() => calculateInfluenceAfterGain(value as unknown as number, 5)).toThrow(`currentInfluence must be an integer from 0 to 35`)
  expect(() => calculateInfluenceAfterGain(2, value as unknown as number)).toThrow(`gainedInfluence must be a non-negative safe integer`)
})

it('динаковый результат повторных вызовов', () => {
  const dw1 = calculateInfluenceAfterGain(1,1)
  const dw2 = calculateInfluenceAfterGain(1,1)

  expect(dw1).toEqual(dw2);
});

it('проверка не валидных данных gainedInfluence = -1', () => {
  expect(() => calculateInfluenceAfterGain(35,-1)).toThrow(`gainedInfluence must be a non-negative safe integer`);
});

/** Runtime checks shared within this environment. Objects may contain extra fields. */
export type Validator<T> = (value: unknown) => value is T
type ValueOf<V> = V extends Validator<infer T> ? T : never

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export const isString: Validator<string> = (value): value is string => typeof value === 'string'
export const isNonEmptyString: Validator<string> = (value): value is string =>
  isString(value) && value.trim().length > 0
export const isBoolean: Validator<boolean> = (value): value is boolean => typeof value === 'boolean'
export const isUUID: Validator<string> = (value): value is string =>
  isString(value) && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value)

export function isIntegerInRange(min: number, max: number): Validator<number> {
  return (value): value is number =>
    typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max
}

export function isOneOf<const T extends readonly (string | number)[]>(values: T): Validator<T[number]> {
  return (value): value is T[number] => values.some(item => item === value)
}

export function isArrayOf<T>(validate: Validator<T>): Validator<T[]> {
  return (value): value is T[] => Array.isArray(value) && value.every(item => validate(item))
}

export function isObject<S extends Record<string, Validator<unknown>>>(shape: S): Validator<{ [K in keyof S]: ValueOf<S[K]> }> {
  return (value): value is { [K in keyof S]: ValueOf<S[K]> } =>
    isRecord(value) && Object.entries(shape).every(([key, validate]) =>
      Object.hasOwn(value, key) && validate(value[key]))
}

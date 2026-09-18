declare module 'node:crypto' {
  interface Hash {
    /** Добавляет строковые данные к текущему хешу. */
    update(data: string, inputEncoding: 'utf8'): Hash
    /** Завершает вычисление и возвращает байты хеша. */
    digest(): Uint8Array
  }

  /** Создаёт хешер SHA-256 для детерминированного генератора подготовки. */
  export function createHash(algorithm: 'sha256'): Hash
}

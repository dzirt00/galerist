const ITERATIONS = 600_000;

// Вспомогательная функция для перевода Uint8Array в hex-строку
function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function hashGamePassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await deriveBits(password, salt);

  // Соединяем четыре части через буквальный знак \$
  return `pbkdf2-sha256$${ITERATIONS}$${toHex(salt)}$${toHex(hash)}`;
}


export async function deriveBits(
  password: string,
  salt: Uint8Array<ArrayBuffer>,
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );

  const bits = await crypto.subtle.deriveBits(
    {name: "PBKDF2", hash: "SHA-256", salt, iterations: ITERATIONS},
    key,
    256,
  );

  return new Uint8Array(bits);
}

import {deriveBits} from '../create-game/game-password.ts'

export async function verifyGamePassword(password: string, passwordHash: string): Promise<boolean> {
  const parts = /^pbkdf2-sha256\$600000\$([0-9a-f]{32})\$([0-9a-f]{64})$/.exec(passwordHash)
  if (!parts) throw new Error('Unsupported stored password hash')
  const salt = Uint8Array.from(parts[1].match(/../g)!, (byte) => parseInt(byte, 16))
  const expected = Uint8Array.from(parts[2].match(/../g)!, (byte) => parseInt(byte, 16))
  const actual = await deriveBits(password, salt)
  let difference = 0
  for (let index = 0; index < expected.length; index++) difference |= actual[index] ^ expected[index]
  return difference === 0
}
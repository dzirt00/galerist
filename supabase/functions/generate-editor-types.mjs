import { spawnSync } from 'node:child_process'
import { existsSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

// Use the installed runtime's real declarations, not a handwritten Deno shim.
const conventionalPath = join(homedir(), '.deno', 'bin',
  process.platform === 'win32' ? 'deno.exe' : 'deno')
const executable = process.argv[2]
  ?? (existsSync(conventionalPath) ? conventionalPath : 'deno')
const result = spawnSync(executable, ['types'], {
  encoding: 'utf8',
  timeout: 30_000,
  maxBuffer: 8 * 1024 * 1024,
})
if (result.error || result.status !== 0 || !result.stdout.includes('declare namespace Deno')) {
  throw new Error(`Cannot generate Deno editor types: ${result.error?.message ?? result.stderr}`)
}
writeFileSync(new URL('./deno-runtime.d.ts', import.meta.url), result.stdout)
console.log('Generated local Deno editor types: supabase/functions/deno-runtime.d.ts')

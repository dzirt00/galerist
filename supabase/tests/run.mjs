import { spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'

const testRoot = new URL('./', import.meta.url)
const migrationRoot = new URL('../migrations/', import.meta.url)
const name = `galerist-web001-test-${randomUUID()}`
const image = 'postgres:17-alpine'

function docker(args, options = {}) {
  const result = spawnSync('docker', args, {
    encoding: 'utf8',
    timeout: 180_000,
    maxBuffer: 8 * 1024 * 1024,
    ...options,
  })
  if (result.error || result.status !== 0) {
    throw new Error(`docker ${args[0]} failed: ${result.error?.message ?? result.stderr}`)
  }
  return result.stdout.trim()
}

let containerId
try {
  // No exposed port, bind mounts, persistent volumes or access to cloud credentials.
  containerId = docker([
    'run', '--detach', '--rm', '--network', 'none', '--name', name,
    '-e', 'POSTGRES_HOST_AUTH_METHOD=trust', image,
  ])
  if (!/^[a-f0-9]{64}$/.test(containerId)) {
    throw new Error('Docker did not return a valid container ID')
  }
  let ready = false
  for (let attempt = 0; attempt < 30; attempt++) {
    const result = spawnSync('docker', ['exec', containerId, 'pg_isready', '-U', 'postgres'], {
      encoding: 'utf8', timeout: 5_000,
    })
    if (result.status === 0) {
      ready = true
      break
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000))
  }
  if (!ready) throw new Error('Test PostgreSQL was not ready within 30 attempts')

  const migrations = readdirSync(migrationRoot).filter((file) => file.endsWith('.sql')).sort()
  if (migrations.length === 0) throw new Error('No migrations found')
  const sql = [
    'BEGIN;',
    readFileSync(new URL('bootstrap.sql', testRoot), 'utf8'),
    ...migrations.map((file) => readFileSync(new URL(file, migrationRoot), 'utf8')),
    readFileSync(new URL('profiles.sql', testRoot), 'utf8'),
    'ROLLBACK;',
  ].join('\n')
  const output = docker([
    'exec', '-i', containerId, 'psql', '-X', '-q', '-U', 'postgres',
    '-d', 'postgres', '--set', 'ON_ERROR_STOP=1',
  ], { input: sql })
  console.log(output)
  console.log('WEB-001 migration and RLS tests passed.')
} finally {
  // Remove only the disposable container created by this run.
  if (containerId && /^[a-f0-9]{64}$/.test(containerId)) {
    docker(['rm', '--force', '--volumes', containerId])
  }
}

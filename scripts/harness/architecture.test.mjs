import { test } from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { inspectSource, projectRoot } from './architecture.mjs'

const engineFile = path.join(projectRoot, 'packages/game-engine/src/example.ts')
const webFile = path.join(projectRoot, 'apps/web/app/example.vue')
const rules = (file, code) => inspectSource(file, code).map(item => item.rule)

test('engine permits local imports, deterministic hashing and ordinary arithmetic', () => {
  assert.deepEqual(rules(engineFile, `import { createHash as hash } from 'node:crypto';
    export { x } from './local.js'; const x = Math.floor(2.3);
    // Math.random() and Date.now() here are documentation.
    const message = 'import x from "nuxt"';`), [])
})

test('engine rejects outward imports, reexports and dynamic dependencies', () => {
  for (const code of [
    `import x from '../../../apps/web/app.js'`, `export * from 'vue'`,
    `const x = import('node:fs')`, `const x = require('node:fs')`,
    `import x = require('node:fs')`, `type X = import('vue').X`,
  ]) assert.ok(rules(engineFile, code).some(rule => rule.startsWith('engine-')), code)
  assert.ok(rules(engineFile, 'import(moduleName)').includes('static-import'))
})

test('clock, randomness, aliases and ambient inputs cannot enter engine directly', () => {
  for (const code of [
    'Date.now()', 'new Date()', 'Math.random()', 'Math["random"]()',
    'const random = Math.random', 'Math[key]()', 'globalThis.Math.random()',
    'const m = Math; m.random()', 'const { random } = Math',
    'const { now } = Date', 'fetch("/state")', 'process.env.SEED',
    `import { randomBytes } from 'node:crypto'`, `import * as c from 'node:crypto'`,
    `export { createHash } from 'node:crypto'`,
  ]) assert.ok(rules(engineFile, code).length > 0, code)
})

test('web uses public package entry; templates and comments are ignored', () => {
  assert.deepEqual(rules(webFile, `<template><p>Date.now()</p></template>
    <script setup lang="ts">import { createGame } from '@galerist/game-engine'; const now = Date.now()</script>`), [])
  for (const code of [
    `import { x } from '@galerist/game-engine/src/types'`,
    `export * from '../../../packages/game-engine/src/types.js'`,
    `import('~/packages/game-engine/src/types')`,
  ]) assert.ok(rules(webFile, `<script>${code}</script>`).includes('public-engine-api'), code)
  const [violation] = inspectSource(webFile, '<template/>\n<script>\nimport "@galerist/game-engine/src/types"\n</script>')
  assert.equal(violation.line, 3)
})

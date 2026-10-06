import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export async function loadSuite() {
  return JSON.parse(await readFile(new URL('../../harness/scenarios.json', import.meta.url), 'utf8'))
}

const nonempty = value => typeof value === 'string' && value.trim().length > 0

export function validateSuite(suite) {
  const errors = []
  if (suite?.version !== 1 || !Array.isArray(suite.scenarios) || suite.scenarios.length === 0) {
    return ['Suite must have version 1 and nonempty scenarios.']
  }
  const ids = new Set()
  for (const scenario of suite.scenarios) {
    if (!nonempty(scenario.id) || ids.has(scenario.id)) errors.push('Scenario IDs must be nonempty and unique.')
    ids.add(scenario.id)
    if (!nonempty(scenario.prompt) || !nonempty(scenario.setup)) errors.push(`${scenario.id}: missing prompt or setup.`)
    if (!Array.isArray(scenario.checks) || scenario.checks.length === 0) {
      errors.push(`${scenario.id}: missing checks.`)
      continue
    }
    const checks = new Set()
    for (const check of scenario.checks) {
      if (!nonempty(check.id) || checks.has(check.id) || !nonempty(check.expectation)) errors.push(`${scenario.id}: invalid check.`)
      checks.add(check.id)
    }
  }
  return errors
}

export function createReport(suite) {
  return {
    suiteVersion: suite.version,
    agent: '',
    reviewer: '',
    evaluatedAt: '',
    results: suite.scenarios.map(scenario => ({
      id: scenario.id,
      artifacts: [],
      checks: scenario.checks.map(check => ({ id: check.id, passed: null, evidence: '' })),
    })),
  }
}

export function evaluateReport(suite, report) {
  const errors = validateSuite(suite)
  if (errors.length) return { errors, passed: false, score: 0, total: 0 }
  if (report?.suiteVersion !== suite.version || !Array.isArray(report.results)) {
    return { errors: ['Report version or results are invalid.'], passed: false, score: 0, total: suite.scenarios.length }
  }
  for (const field of ['agent', 'reviewer', 'evaluatedAt']) {
    if (!nonempty(report[field])) errors.push(`Missing ${field}.`)
  }
  if (nonempty(report.evaluatedAt) && Number.isNaN(Date.parse(report.evaluatedAt))) errors.push('Invalid evaluatedAt date.')
  const expected = new Set(suite.scenarios.map(scenario => scenario.id))
  const seen = new Set()
  for (const result of report.results) {
    if (!result || !expected.has(result.id) || seen.has(result.id)) errors.push('Unknown or duplicate scenario result.')
    seen.add(result?.id)
  }
  let score = 0
  for (const scenario of suite.scenarios) {
    const result = report.results.find(item => item?.id === scenario.id)
    if (!result || !Array.isArray(result.checks)) {
      errors.push(`${scenario.id}: missing result or checks.`)
      continue
    }
    if (!Array.isArray(result.artifacts) || !result.artifacts.length || !result.artifacts.every(nonempty)) {
      errors.push(`${scenario.id}: provide transcript/tool log and diff artifact references.`)
    }
    const checkIds = new Set(scenario.checks.map(check => check.id))
    const seenChecks = new Set()
    let passed = true
    for (const check of result.checks) {
      if (!check || !checkIds.has(check.id) || seenChecks.has(check.id)) {
        errors.push(`${scenario.id}: unknown or duplicate check.`)
        passed = false
      }
      seenChecks.add(check?.id)
    }
    for (const expectedCheck of scenario.checks) {
      const check = result.checks.find(item => item?.id === expectedCheck.id)
      if (!check || typeof check.passed !== 'boolean' || !nonempty(check.evidence)) {
        errors.push(`${scenario.id}/${expectedCheck.id}: boolean verdict and evidence required.`)
        passed = false
      } else if (!check.passed) passed = false
    }
    if (passed) score++
  }
  return { errors, passed: errors.length === 0 && score === suite.scenarios.length, score, total: suite.scenarios.length }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const suite = await loadSuite()
  const suiteErrors = validateSuite(suite)
  if (suiteErrors.length) {
    console.error(suiteErrors.join('\n'))
    process.exitCode = 1
  } else if (process.argv[2] === '--validate-suite') {
    console.log(`Eval suite: ${suite.scenarios.length} scenarios validated. Agent performance was not evaluated.`)
  } else if (process.argv[2] === '--template' && process.argv[3]) {
    await writeFile(process.argv[3], `${JSON.stringify(createReport(suite), null, 2)}\n`, { flag: 'wx' })
    console.log('Created an unevaluated report template. Existing files are never overwritten.')
  } else if (process.argv[2] && !process.argv[2].startsWith('--')) {
    const result = evaluateReport(suite, JSON.parse(await readFile(process.argv[2], 'utf8')))
    for (const error of result.errors) console.error(error)
    console.log(`Reviewer verdicts: ${result.score}/${result.total} scenarios passed; ${result.errors.length} report error(s).`)
    process.exitCode = result.passed ? 0 : 1
  } else {
    console.error('Usage: npm run eval:harness -- --validate-suite | --template <new-report.json> | <report.json>')
    process.exitCode = 1
  }
}

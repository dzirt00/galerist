import { test } from 'node:test'
import assert from 'node:assert/strict'
import { loadSuite, validateSuite, createReport, evaluateReport } from './evaluate.mjs'

const suite = await loadSuite()
function reviewedReport() {
  const report = createReport(suite)
  Object.assign(report, { agent: 'test-fixture', reviewer: 'test-reviewer', evaluatedAt: '2026-10-06T00:00:00Z' })
  for (const result of report.results) {
    result.artifacts = ['fixture/transcript.json', 'fixture/diff.patch']
    for (const check of result.checks) Object.assign(check, { passed: true, evidence: 'Synthetic unit-test evidence; not an actual agent run.' })
  }
  return report
}

test('suite has unique scenarios and explicit expectations', () => {
  assert.deepEqual(validateSuite(suite), [])
  assert.ok(validateSuite({ version: 1, scenarios: [suite.scenarios[0], suite.scenarios[0]] }).length)
})

test('template cannot be mistaken for passed agent evaluation', () => {
  assert.equal(evaluateReport(suite, createReport(suite)).passed, false)
})

test('complete reviewer report passes; failed behavior fails even with valid evidence', () => {
  assert.equal(evaluateReport(suite, reviewedReport()).passed, true)
  const report = reviewedReport()
  report.results[0].checks[0].passed = false
  const result = evaluateReport(suite, report)
  assert.equal(result.passed, false)
  assert.equal(result.score, suite.scenarios.length - 1)
  assert.deepEqual(result.errors, [])
})

test('missing, duplicate and fabricated result IDs or evidence cannot pass', () => {
  const changes = [
    report => report.results.pop(),
    report => report.results.push(report.results[0]),
    report => { report.results[0].id = 'unknown' },
    report => { report.results[0].checks[0].evidence = '' },
    report => { report.results[0].checks[0].passed = null },
    report => { report.results[0].artifacts = [] },
    report => report.results[0].checks.push(report.results[0].checks[0]),
    report => { report.results[0].checks[0].id = 'unknown' },
    report => { report.suiteVersion = 99 },
    report => { report.reviewer = '' },
  ]
  for (const change of changes) {
    const report = reviewedReport()
    change(report)
    assert.equal(evaluateReport(suite, report).passed, false)
  }
})

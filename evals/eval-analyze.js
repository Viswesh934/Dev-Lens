#!/usr/bin/env node
// evals/eval-analyze.js
//
// Read-only evaluation script for the DevLens analysis pipeline.
// Sends a fixed set of test questions to the worker and scores the responses.
//
// Usage:
//   node evals/eval-analyze.js
//   node evals/eval-analyze.js --repo 1 --audience PM
//   node evals/eval-analyze.js --worker http://localhost:8787
//
// Environment:
//   WORKER_URL   Base URL of the DevLens worker (default: http://localhost:8787)
//
// Exit codes:
//   0  All evals passed
//   1  One or more evals failed

import { parseArgs } from 'node:util';
import { writeFileSync } from 'node:fs';

// ── CLI args ──────────────────────────────────────────────────────────────────

const { values: args } = parseArgs({
  options: {
    worker:   { type: 'string',  default: process.env.WORKER_URL || 'http://localhost:8787' },
    repo:     { type: 'string',  default: '1' },
    audience: { type: 'string',  default: 'Developer' },
    output:   { type: 'string',  default: null },
    verbose:  { type: 'boolean', default: false },
  },
  strict: false,
});

const BASE = args.worker.replace(/\/$/, '');
const REPO_ID = args.repo;
const AUDIENCE = args.audience;

// ── Test cases ────────────────────────────────────────────────────────────────
// Each case defines:
//   question   — question sent to /api/analyze
//   audience   — audience override (falls back to --audience)
//   checks     — array of { field, test(value) } checks run on the result JSON

const EVAL_CASES = [
  {
    id: 'basic-structure',
    question: 'What is the overall architecture of this codebase?',
    checks: [
      { field: 'current_system',    test: v => typeof v === 'string' && v.length > 20 },
      { field: 'what_would_change', test: v => typeof v === 'string' && v.length > 0 },
      { field: 'affected_areas',    test: v => typeof v === 'string' && v.length > 0 },
      { field: 'effort',            test: v => typeof v === 'string' && v.length > 0 },
      { field: 'risks',             test: v => typeof v === 'string' && v.length > 0 },
      { field: 'unknowns',          test: v => typeof v === 'string' && v.length > 0 },
      { field: 'developer_reasoning', test: v => typeof v === 'string' && v.length > 0 },
    ],
  },
  {
    id: 'no-json-escape',
    question: 'Describe the entry points of the application.',
    checks: [
      // Result should not contain raw JSON escape sequences — model should return clean prose
      { field: 'current_system', test: v => !v.includes('\\n') && !v.includes('\\t') },
    ],
  },
  {
    id: 'current-system-mentions-repo',
    question: 'What language and framework does this project use?',
    checks: [
      // current_system should mention some technology (word with caps or common keywords)
      { field: 'current_system', test: v => /[A-Z]/.test(v) || /language|framework|stack|tech/i.test(v) },
    ],
  },
  {
    id: 'developer-reasoning-length',
    question: 'How would you add a new REST endpoint?',
    checks: [
      // Developer reasoning should be substantive (> 40 chars)
      { field: 'developer_reasoning', test: v => v.length > 40 },
    ],
  },
  {
    id: 'no-parse-error',
    question: 'What are the main risks of changing the authentication system?',
    checks: [
      { field: 'parseError', test: v => v === undefined },
      { field: 'risks',      test: v => typeof v === 'string' && v.length > 0 },
    ],
  },
];

// ── Runner ────────────────────────────────────────────────────────────────────

async function runCase(tc) {
  const audience = tc.audience || AUDIENCE;
  const startMs = Date.now();

  let response;
  try {
    const res = await fetch(`${BASE}/api/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: tc.question, repoId: REPO_ID, audience }),
    });
    if (!res.ok) {
      const text = await res.text();
      return { id: tc.id, passed: false, error: `HTTP ${res.status}: ${text}`, ms: Date.now() - startMs };
    }
    response = await res.json();
  } catch (err) {
    return { id: tc.id, passed: false, error: err.message, ms: Date.now() - startMs };
  }

  const failures = [];
  for (const check of tc.checks) {
    const value = response[check.field];
    try {
      if (!check.test(value)) {
        failures.push(`  field "${check.field}": check failed (value: ${JSON.stringify(String(value ?? '').slice(0, 80))})`);
      }
    } catch (err) {
      failures.push(`  field "${check.field}": check threw — ${err.message}`);
    }
  }

  return {
    id: tc.id,
    passed: failures.length === 0,
    failures,
    response: args.verbose ? response : undefined,
    ms: Date.now() - startMs,
  };
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n DevLens Eval — ${BASE}  repo=${REPO_ID}  audience=${AUDIENCE}\n`);
  console.log(`  Running ${EVAL_CASES.length} eval cases...\n`);

  const results = [];
  for (const tc of EVAL_CASES) {
    process.stdout.write(`  [${tc.id}] ... `);
    const result = await runCase(tc);
    results.push(result);
    if (result.passed) {
      console.log(`PASS  (${result.ms}ms)`);
    } else if (result.error) {
      console.log(`ERROR  ${result.error}`);
    } else {
      console.log(`FAIL`);
      for (const f of result.failures) console.log(f);
    }
    if (args.verbose && result.response) {
      console.log('  Response:', JSON.stringify(result.response, null, 2));
    }
  }

  const passed = results.filter(r => r.passed).length;
  const failed = results.length - passed;

  console.log(`\n  Results: ${passed} passed, ${failed} failed out of ${results.length}\n`);

  if (args.output) {
    const report = {
      timestamp: new Date().toISOString(),
      worker: BASE,
      repo_id: REPO_ID,
      audience: AUDIENCE,
      summary: { total: results.length, passed, failed },
      cases: results,
    };
    writeFileSync(args.output, JSON.stringify(report, null, 2));
    console.log(`  Report written to ${args.output}\n`);
  }

  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('Eval runner crashed:', err);
  process.exit(1);
});

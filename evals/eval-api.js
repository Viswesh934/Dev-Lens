#!/usr/bin/env node
// evals/eval-api.js
//
// Read-only smoke tests for all DevLens API endpoints.
// No writes to the database — reads only.
//
// Usage:
//   node evals/eval-api.js
//   node evals/eval-api.js --worker https://devlens-worker.sigireddyviswesh.workers.dev
//
// Exit codes:
//   0  All checks passed
//   1  One or more checks failed

import { parseArgs } from 'node:util';

const { values: args } = parseArgs({
  options: {
    worker:  { type: 'string',  default: process.env.WORKER_URL || 'http://localhost:8787' },
    verbose: { type: 'boolean', default: false },
  },
  strict: false,
});

const BASE = args.worker.replace(/\/$/, '');

// ── Helpers ───────────────────────────────────────────────────────────────────

async function get(path) {
  const res = await fetch(`${BASE}${path}`);
  const body = await res.json();
  return { status: res.status, body };
}

async function check(label, fn) {
  process.stdout.write(`  ${label} ... `);
  try {
    const result = await fn();
    if (result.passed) {
      console.log('PASS');
    } else {
      console.log(`FAIL  ${result.reason || ''}`);
    }
    return result.passed;
  } catch (err) {
    console.log(`ERROR  ${err.message}`);
    return false;
  }
}

// ── Checks ────────────────────────────────────────────────────────────────────

const checks = [
  ['GET /api/repositories returns array', async () => {
    const { status, body } = await get('/api/repositories');
    if (status !== 200) return { passed: false, reason: `status ${status}` };
    if (!Array.isArray(body)) return { passed: false, reason: 'body is not an array' };
    return { passed: true };
  }],

  ['GET /api/repositories each repo has id + name + url', async () => {
    const { body } = await get('/api/repositories');
    if (!Array.isArray(body) || body.length === 0) return { passed: true }; // nothing to check
    for (const r of body) {
      if (!r.id || !r.name || !r.url) return { passed: false, reason: `missing field on repo ${JSON.stringify(r)}` };
    }
    return { passed: true };
  }],

  ['GET /api/repositories components field is array', async () => {
    const { body } = await get('/api/repositories');
    if (!Array.isArray(body) || body.length === 0) return { passed: true };
    for (const r of body) {
      if (!Array.isArray(r.components)) return { passed: false, reason: `repo ${r.id} components is not array` };
    }
    return { passed: true };
  }],

  ['GET /api/repositories/:id returns 404 for unknown id', async () => {
    const { status } = await get('/api/repositories/99999999');
    return { passed: status === 404, reason: `expected 404, got ${status}` };
  }],

  ['GET /api/developer-lens returns object', async () => {
    const { status, body } = await get('/api/developer-lens');
    if (status !== 200) return { passed: false, reason: `status ${status}` };
    if (typeof body !== 'object' || Array.isArray(body)) return { passed: false, reason: 'not an object' };
    return { passed: true };
  }],

  ['GET /api/shares/:id returns 404 for unknown share', async () => {
    const { status } = await get('/api/shares/nonexistent_share_id');
    return { passed: status === 404, reason: `expected 404, got ${status}` };
  }],

  ['GET /api/analyze without repoId returns 400', async () => {
    const res = await fetch(`${BASE}/api/analyze`);
    return { passed: res.status === 400, reason: `expected 400, got ${res.status}` };
  }],

  ['GET /api/analyze?repoId=1 returns array (even if empty)', async () => {
    const { status, body } = await get('/api/analyze?repoId=1');
    if (status !== 200) return { passed: false, reason: `status ${status}` };
    if (!Array.isArray(body)) return { passed: false, reason: 'body is not an array' };
    return { passed: true };
  }],

  ['CORS headers present on GET /api/repositories', async () => {
    const res = await fetch(`${BASE}/api/repositories`);
    const origin = res.headers.get('access-control-allow-origin');
    return { passed: origin === '*', reason: `access-control-allow-origin = "${origin}"` };
  }],
];

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n DevLens API Eval — ${BASE}\n`);

  let passed = 0;
  let failed = 0;

  for (const [label, fn] of checks) {
    const ok = await check(label, fn);
    ok ? passed++ : failed++;
  }

  console.log(`\n  Results: ${passed} passed, ${failed} failed out of ${checks.length}\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('Eval runner crashed:', err);
  process.exit(1);
});

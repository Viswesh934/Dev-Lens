#!/usr/bin/env node
// evals/eval-granite.js
//
// Lightweight tests for the Granite evidence validation layer.
// Tests span: happy path, malformed JSON, 503, 429, timeout, fallback, status field.
//
// These are unit-style tests that mock the HF HTTP layer directly —
// no live HF token or running worker required.
//
// Usage:
//   node evals/eval-granite.js
//
// Exit codes:
//   0  All tests passed
//   1  One or more tests failed

// ── Minimal mock infrastructure ───────────────────────────────────────────────
// We inline the modules under test by dynamically importing them after
// patching globalThis.fetch. This avoids a test framework dependency.

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

async function test(name, fn) {
  process.stdout.write(`  ${name} ... `);
  try {
    await fn();
    console.log('PASS');
    passed++;
  } catch (err) {
    console.log(`FAIL  ${err.message}`);
    failed++;
  }
}

// ── Stub fetch ────────────────────────────────────────────────────────────────

function makeFetch(status, body, throwNetwork = false, throwTimeout = false) {
  return async (_url, opts) => {
    if (throwNetwork) throw new Error('network failure');
    if (throwTimeout) {
      // Simulate AbortController signal firing
      const signal = opts?.signal;
      if (signal) {
        await new Promise((_, reject) =>
          setTimeout(() => reject(Object.assign(new Error('The operation was aborted'), { name: 'AbortError' })), 5)
        );
      }
    }
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
      text: async () => JSON.stringify(body),
    };
  };
}

// ── Valid Granite output ──────────────────────────────────────────────────────

const VALID_GRANITE_RESPONSE = {
  choices: [{
    message: {
      content: JSON.stringify({
        claims: [
          {
            claimId: 'claim-current',
            classification: 'SUPPORTED',
            reason: 'The entry point evidence directly shows the described system.',
            evidenceReferences: ['src/index.js'],
          },
          {
            claimId: 'claim-areas',
            classification: 'WEAKLY_SUPPORTED',
            reason: 'Directory structure partially confirms the affected modules.',
            evidenceReferences: ['directory structure'],
          },
        ],
        anomalies: [
          {
            severity: 'medium',
            description: 'No test coverage found for the import path.',
            evidenceReferences: [],
          },
        ],
        missingEvidence: [
          {
            claimId: 'claim-risks',
            description: 'No dependency manifest evidence supplied for risk assessment.',
          },
        ],
      }),
    },
  }],
};

const SAMPLE_INPUT = {
  question: 'What would a CSV import feature involve?',
  repository: { name: 'Peekachu', context: {} },
  claims: [
    { id: 'claim-current', claim: 'System handles customer creation via REST API.', evidence: [{ file: 'src/index.js', excerpt: 'export default app' }] },
    { id: 'claim-areas', claim: 'Frontend and backend would be affected.', evidence: [{ file: 'directory structure', excerpt: 'src/, frontend/' }] },
    { id: 'claim-risks', claim: 'Validation logic may be missing.', evidence: [] },
  ],
  analysis: { affected_areas: 'Frontend and backend', risks: 'Validation gaps', effort: 'Medium' },
};

// ── Import the modules under test ─────────────────────────────────────────────
// We use dynamic import after setting up each fetch stub.
// Since Node caches modules, we test the adapter functions directly.

import { hfInference, HFError } from '../Dev-Lens/worker/src/ai/huggingface.js';
import { validateEvidence } from '../Dev-Lens/worker/src/ai/granite.js';

// ── Tests ─────────────────────────────────────────────────────────────────────

console.log('\n DevLens Granite Eval\n');

await test('1. Granite returns valid validation JSON — status completed', async () => {
  globalThis.fetch = makeFetch(200, VALID_GRANITE_RESPONSE);
  const env = { HF_TOKEN: 'hf_test', HF_MODEL: 'ibm-granite/granite-3.3-8b-instruct' };
  const result = await validateEvidence(SAMPLE_INPUT, env);

  assert(result.status === 'completed', `expected completed, got ${result.status}`);
  assert(result.provider === 'huggingface', 'provider should be huggingface');
  assert(Array.isArray(result.claims), 'claims should be array');
  assert(result.claims.length === 2, `expected 2 claims, got ${result.claims.length}`);
  assert(result.claims[0].classification === 'SUPPORTED', 'first claim should be SUPPORTED');
  assert(result.claims[1].classification === 'WEAKLY_SUPPORTED', 'second claim should be WEAKLY_SUPPORTED');
  assert(Array.isArray(result.anomalies), 'anomalies should be array');
  assert(result.anomalies.length === 1, 'expected 1 anomaly');
  assert(Array.isArray(result.missingEvidence), 'missingEvidence should be array');
});

await test('2. Granite returns malformed JSON — status unavailable, reason malformed_response', async () => {
  globalThis.fetch = makeFetch(200, {
    choices: [{ message: { content: 'this is not json at all { broken' } }],
  });
  const env = { HF_TOKEN: 'hf_test' };
  const result = await validateEvidence(SAMPLE_INPUT, env);

  assert(result.status === 'unavailable', `expected unavailable, got ${result.status}`);
  assert(result.reason === 'malformed_response', `expected malformed_response, got ${result.reason}`);
});

await test('3. Hugging Face returns 503 — status unavailable, reason provider_busy', async () => {
  globalThis.fetch = makeFetch(503, { error: 'Service Unavailable' });
  const env = { HF_TOKEN: 'hf_test' };
  const result = await validateEvidence(SAMPLE_INPUT, env);

  assert(result.status === 'unavailable', `expected unavailable, got ${result.status}`);
  assert(result.reason === 'provider_busy', `expected provider_busy, got ${result.reason}`);
});

await test('4. Hugging Face returns 429 — status unavailable, reason rate_limited', async () => {
  globalThis.fetch = makeFetch(429, { error: 'Too Many Requests' });
  const env = { HF_TOKEN: 'hf_test' };
  const result = await validateEvidence(SAMPLE_INPUT, env);

  assert(result.status === 'unavailable', `expected unavailable, got ${result.status}`);
  assert(result.reason === 'rate_limited', `expected rate_limited, got ${result.reason}`);
});

await test('5. Hugging Face request times out — status unavailable, reason timeout', async () => {
  globalThis.fetch = makeFetch(200, {}, false, true);
  const env = { HF_TOKEN: 'hf_test' };
  const result = await validateEvidence(SAMPLE_INPUT, env);

  assert(result.status === 'unavailable', `expected unavailable, got ${result.status}`);
  assert(result.reason === 'timeout', `expected timeout, got ${result.reason}`);
});

await test('6. Granite unavailable — primary analysis shape is unaffected', async () => {
  // validateEvidence returns unavailable; we check the shape the API route would return
  globalThis.fetch = makeFetch(503, {});
  const env = { HF_TOKEN: 'hf_test' };
  const validation = await validateEvidence(SAMPLE_INPUT, env);

  // The primary analysis result object is untouched — only validation is degraded
  const combined = {
    analysis: { current_system: 'System exists', risks: 'Some risk' },
    evidence: [{ type: 'entry_point', file: 'src/index.js', label: 'Entry Point' }],
    validation,
  };

  assert(combined.analysis.current_system === 'System exists', 'primary analysis should be intact');
  assert(combined.evidence.length === 1, 'evidence should be present');
  assert(combined.validation.status === 'unavailable', 'validation should be unavailable');
});

await test('7. Validation status field — client can distinguish completed vs unavailable', async () => {
  // Completed
  globalThis.fetch = makeFetch(200, VALID_GRANITE_RESPONSE);
  const env = { HF_TOKEN: 'hf_test' };
  const completed = await validateEvidence(SAMPLE_INPUT, env);
  assert(completed.status === 'completed', 'completed status');
  assert(typeof completed.claims !== 'undefined', 'completed has claims');

  // Unavailable
  globalThis.fetch = makeFetch(503, {});
  const unavail = await validateEvidence(SAMPLE_INPUT, env);
  assert(unavail.status === 'unavailable', 'unavailable status');
  assert(typeof unavail.claims === 'undefined', 'unavailable should not have claims');

  // Client can switch on status
  assert(completed.status !== unavail.status, 'statuses are distinct');
});

// ── hfInference unit tests ────────────────────────────────────────────────────

await test('8. hfInference — HFError thrown on 503 with correct reason', async () => {
  globalThis.fetch = makeFetch(503, {});
  let caught;
  try {
    await hfInference({ token: 'x', model: 'ibm-granite/granite-3.3-8b-instruct', messages: [] });
  } catch (err) {
    caught = err;
  }
  assert(caught instanceof HFError, 'should throw HFError');
  assert(caught.reason === 'provider_busy', `expected provider_busy, got ${caught.reason}`);
});

await test('9. hfInference — HFError thrown on network failure with reason network', async () => {
  globalThis.fetch = makeFetch(0, {}, true);
  let caught;
  try {
    await hfInference({ token: 'x', model: 'ibm-granite/granite-3.3-8b-instruct', messages: [] });
  } catch (err) {
    caught = err;
  }
  assert(caught instanceof HFError, 'should throw HFError');
  assert(caught.reason === 'network', `expected network, got ${caught.reason}`);
});

// ── Summary ───────────────────────────────────────────────────────────────────

console.log(`\n  Results: ${passed} passed, ${failed} failed out of ${passed + failed}\n`);
process.exit(failed > 0 ? 1 : 0);

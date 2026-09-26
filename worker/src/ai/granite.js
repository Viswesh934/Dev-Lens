// worker/src/ai/granite.js
//
// Granite evidence validator.
// Granite's single responsibility: determine whether the claims produced
// by the primary analysis are actually supported by the supplied evidence.
//
// Public API:
//   validateEvidence(input, env) → ValidationResult | UnavailableResult
//
// This function NEVER throws — all failures return an unavailable result
// so the primary analysis can always be returned to the client.

import { hfInference, HFError } from './huggingface.js';

// ── Configuration ─────────────────────────────────────────────────────────────

// Default model — can be overridden by HF_MODEL Worker secret
const DEFAULT_MODEL = 'ibm-granite/granite-3.3-8b-instruct';

// Maximum characters sent as evidence excerpt per claim (keeps prompts bounded)
const MAX_EXCERPT_CHARS = 300;

// Maximum claims sent to Granite in one call
const MAX_CLAIMS = 10;

// ── Public interface ──────────────────────────────────────────────────────────

/**
 * @typedef {object} EvidenceItem
 * @property {string} file
 * @property {string} [lines]
 * @property {string} excerpt
 */

/**
 * @typedef {object} Claim
 * @property {string}         id
 * @property {string}         claim
 * @property {EvidenceItem[]} evidence
 */

/**
 * @typedef {object} ValidationInput
 * @property {string}   question
 * @property {{ name: string, context: object }} repository
 * @property {Claim[]}  claims
 * @property {object}   analysis   — affected_areas, risks, effort from primary analysis
 */

/**
 * Run Granite evidence validation.
 * Failure is non-fatal — returns an unavailable result on any error.
 *
 * @param {ValidationInput} input
 * @param {object} env    — Cloudflare Worker env (reads HF_TOKEN, HF_MODEL)
 * @returns {Promise<object>}
 */
export async function validateEvidence(input, env) {
  const token = env.HF_TOKEN;
  if (!token) {
    console.log('[granite] HF_TOKEN not configured — validation skipped');
    return unavailable('not_configured');
  }

  const model = env.HF_MODEL || DEFAULT_MODEL;
  const payload = buildPayload(input);

  console.log(`[granite] validation started — ${payload.claims.length} claims, model=${model}`);
  const t0 = Date.now();

  let raw;
  try {
    const result = await hfInference({
      token,
      model,
      messages: buildMessages(payload),
      maxTokens: 800,
      timeoutMs: 15000,
    });
    raw = result.text;
  } catch (err) {
    const reason = err instanceof HFError ? err.reason : 'provider_error';
    console.log(`[granite] validation unavailable — ${reason}`);
    return unavailable(reason);
  }

  // One short retry only for transient busy/rate-limit errors is handled
  // by the caller if needed — here we return immediately on first failure.

  const parsed = parseGraniteOutput(raw);
  if (!parsed) {
    console.log('[granite] validation unavailable — malformed response from model');
    return unavailable('malformed_response');
  }

  const latencyMs = Date.now() - t0;
  console.log(`[granite] validation completed — latency=${latencyMs}ms`);

  return {
    status: 'completed',
    provider: 'huggingface',
    model,
    latencyMs,
    claims: parsed.claims || [],
    anomalies: parsed.anomalies || [],
    missingEvidence: parsed.missingEvidence || [],
  };
}

// ── Payload builder ───────────────────────────────────────────────────────────

function buildPayload(input) {
  // Trim evidence excerpts and cap the number of claims sent
  const claims = (input.claims || []).slice(0, MAX_CLAIMS).map(c => ({
    id: c.id,
    claim: c.claim,
    evidence: (c.evidence || []).map(e => ({
      file: e.file,
      lines: e.lines || '',
      excerpt: String(e.excerpt || '').slice(0, MAX_EXCERPT_CHARS),
    })),
  }));

  return {
    question: input.question,
    repository: {
      name: input.repository?.name || '',
    },
    claims,
    analysis: {
      affectedAreas: input.analysis?.affected_areas || '',
      risks: input.analysis?.risks || '',
      effort: input.analysis?.effort || '',
    },
  };
}

// ── Prompt builder ────────────────────────────────────────────────────────────

function buildMessages(payload) {
  const system = `You are an evidence validation agent for software repository analysis.

Your ONLY job is to determine whether the claims made by a primary analysis are actually supported by the supplied repository evidence.

Rules:
- Only use the supplied evidence. Never assume repository facts not present in the evidence.
- Do not solve the user's request. Do not re-analyse. Only validate.
- For every claim, classify it as exactly one of: SUPPORTED, WEAKLY_SUPPORTED, CONTRADICTED, INSUFFICIENT_EVIDENCE
- SUPPORTED: The evidence directly and clearly supports the claim.
- WEAKLY_SUPPORTED: The evidence partially supports the claim but is incomplete or indirect.
- CONTRADICTED: The evidence contradicts or conflicts with the claim.
- INSUFFICIENT_EVIDENCE: The supplied evidence is absent or insufficient to evaluate the claim.
- Identify anomalies: unexpected coupling, missing files, stale assumptions, over-confident conclusions.
- Return ONLY valid JSON. No markdown, no prose outside JSON.`;

  const user = `Validate the following analysis claims against the supplied evidence.

Question asked: ${payload.question}
Repository: ${payload.repository.name}

Claims to validate:
${JSON.stringify(payload.claims, null, 2)}

Primary analysis summary:
- Affected areas: ${payload.analysis.affectedAreas}
- Risks: ${payload.analysis.risks}
- Effort: ${payload.analysis.effort}

Return ONLY a JSON object with this exact structure:
{
  "claims": [
    {
      "claimId": "<id>",
      "classification": "SUPPORTED|WEAKLY_SUPPORTED|CONTRADICTED|INSUFFICIENT_EVIDENCE",
      "reason": "<1-2 sentence explanation citing evidence>",
      "evidenceReferences": ["<file or excerpt reference>"]
    }
  ],
  "anomalies": [
    {
      "severity": "low|medium|high",
      "description": "<what the anomaly is>",
      "evidenceReferences": ["<file or excerpt reference>"]
    }
  ],
  "missingEvidence": [
    {
      "claimId": "<id>",
      "description": "<what evidence would be needed>"
    }
  ]
}`;

  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];
}

// ── Output parser ─────────────────────────────────────────────────────────────

const VALID_CLASSIFICATIONS = new Set([
  'SUPPORTED',
  'WEAKLY_SUPPORTED',
  'CONTRADICTED',
  'INSUFFICIENT_EVIDENCE',
]);

const VALID_SEVERITIES = new Set(['low', 'medium', 'high']);

/**
 * Parse and validate the JSON returned by Granite.
 * Returns null if the output is malformed or untrustworthy.
 */
function parseGraniteOutput(raw) {
  let obj;
  try {
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
    obj = JSON.parse(cleaned);
  } catch {
    return null;
  }

  if (typeof obj !== 'object' || obj === null) return null;
  if (!Array.isArray(obj.claims)) return null;

  // Sanitise claims — drop entries that don't match the schema
  const claims = obj.claims.filter(c =>
    typeof c.claimId === 'string' &&
    VALID_CLASSIFICATIONS.has(c.classification) &&
    typeof c.reason === 'string'
  ).map(c => ({
    claimId: c.claimId,
    classification: c.classification,
    reason: c.reason,
    evidenceReferences: Array.isArray(c.evidenceReferences) ? c.evidenceReferences : [],
  }));

  // Sanitise anomalies
  const anomalies = Array.isArray(obj.anomalies)
    ? obj.anomalies.filter(a =>
        typeof a.description === 'string' &&
        VALID_SEVERITIES.has(a.severity)
      ).map(a => ({
        severity: a.severity,
        description: a.description,
        evidenceReferences: Array.isArray(a.evidenceReferences) ? a.evidenceReferences : [],
      }))
    : [];

  // Sanitise missingEvidence
  const missingEvidence = Array.isArray(obj.missingEvidence)
    ? obj.missingEvidence.filter(m =>
        typeof m.claimId === 'string' &&
        typeof m.description === 'string'
      ).map(m => ({ claimId: m.claimId, description: m.description }))
    : [];

  return { claims, anomalies, missingEvidence };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function unavailable(reason) {
  return {
    status: 'unavailable',
    provider: 'huggingface',
    model: DEFAULT_MODEL,
    reason,
  };
}

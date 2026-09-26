# DevLens — Phase 4 Summary

> **Status:** Complete  
> **Scope:** IBM Granite evidence validator via Hugging Face Inference — secondary validation of primary analysis claims against repository evidence.

---

## What Phase 4 Built

Phase 4 adds a secondary validation layer that runs after the primary LLM analysis. IBM Granite checks whether the claims in the analysis are actually supported by the repository evidence. Granite failure is always non-fatal — the primary result is returned regardless.

---

## Architecture Addition

```
Primary Analysis (OpenRouter / gpt-4o-mini)
        │
        ▼
Claim extractor  ←─── indexed context evidence
        │
        ▼
validateEvidence({ question, repository, claims, analysis })
        │
        ▼
IBM Granite (ibm-granite/granite-3.3-8b-instruct via HF Inference)
        │
        ├── SUPPORTED
        ├── WEAKLY_SUPPORTED
        ├── CONTRADICTED
        └── INSUFFICIENT_EVIDENCE
        │
        ▼
Combined { analysis, evidence, validation }
```

---

## New Files

### `worker/src/ai/huggingface.js`

Provider adapter — all HF HTTP details isolated here.

- `hfInference({ token, model, messages, maxTokens, timeoutMs })` — sends chat completions request
- `AbortController` timeout (default 12s)
- Maps HTTP status → typed reason: `503 → provider_busy`, `429 → rate_limited`, `401/403 → auth_error`, `404 → model_not_found`
- `HFError(reason, detail)` — exported error class for typed catch
- **Token is injected at the `Authorization` header only — never logged, never returned**

### `worker/src/ai/granite.js`

Granite evidence validator.

- `validateEvidence(input, env)` — public API, never throws
- Reads `env.HF_TOKEN` (skips with `not_configured` if absent)
- Reads `env.HF_MODEL` (defaults to `ibm-granite/granite-3.3-8b-instruct`)
- Caps claims at 10; truncates evidence excerpts to 300 chars
- Strict validation prompt: classify each claim, identify anomalies, find missing evidence
- Output parser sanitises the response — drops any claim with an invalid classification
- Any failure returns `{ status: "unavailable", reason }` — never throws

### `evals/eval-granite.js`

9 unit tests with mocked `fetch` — no live keys needed:

| # | Test |
|---|---|
| 1 | Valid response → `status: completed`, correct claim classifications |
| 2 | Malformed JSON → `status: unavailable`, `reason: malformed_response` |
| 3 | HF returns 503 → `status: unavailable`, `reason: provider_busy` |
| 4 | HF returns 429 → `status: unavailable`, `reason: rate_limited` |
| 5 | Request times out → `status: unavailable`, `reason: timeout` |
| 6 | Granite unavailable → primary analysis shape is unaffected |
| 7 | Status field — client can distinguish `completed` from `unavailable` |
| 8 | `hfInference` throws `HFError` with `reason: provider_busy` on 503 |
| 9 | `hfInference` throws `HFError` with `reason: network` on network failure |

---

## Changed Files

### `worker/src/routes/analyze.js`

- Imports `validateEvidence` from `../ai/granite.js`
- **Claim extractor** — derives up to 4 verifiable claims from primary analysis sections (`current_system`, `what_would_change`, `affected_areas`, `risks`); attaches relevant indexed context evidence to each
- **Evidence list builder** — derives a flat `evidence[]` array from indexed context (entry points, key files, dependency manifests, test locations) for the UI
- `validateEvidence()` called after primary analysis succeeds (sequential, not parallel — Granite needs the primary result to have claims to validate)
- Persists `{ analysis, evidence, validation }` to `analysis_results`
- Returns `{ analysis, evidence, validation }` — backward compatible (old flat result shape also handled in frontend)
- On primary JSON parse failure: returns `{ raw, parseError, validation: { status: "unavailable", reason: "primary_parse_failed" } }`

### `worker/.dev.vars.example`

```
HF_TOKEN=hf_your-token-here          # read access sufficient
# HF_MODEL=ibm-granite/granite-3.3-8b-instruct  # optional override
```

### `frontend/src/pages/AnalyzePage.jsx`

- Destructures `{ analysis, evidence, validation }` from response (falls back gracefully for old flat shape)
- **Evidence panel** — lists each evidence item with type label + file path
- **`ValidationPanel` component** — two states:
  - `status: completed` — IBM Granite badge, per-classification counts (✓ supported, ⚠ weakly supported, ✕ contradicted, ○ insufficient), high-severity anomaly highlights, "Show validation details" toggle with full claim rows + anomaly detail + missing evidence list
  - `status: unavailable` — dashed border, plain "Validation unavailable" message with reason (human-readable), clarifies primary analysis was still generated

### `frontend/src/styles.css`

New classes:
- `.validation-panel`, `.validation-panel.validation-unavailable`
- `.validation-panel-title`, `.validation-badge` (IBM Granite tag)
- `.validation-status-row`, `.validation-status-dot.completed` / `.unavailable`
- `.validation-counts`, `.validation-count-item`
- `.validation-anomaly-row`, `.validation-anomaly.high`
- `.validation-detail`, `.validation-detail-section`, `.validation-detail-heading`
- `.validation-claim-row`, `.validation-claim-icon`, `.validation-claim-body`, `.validation-claim-classification`, `.validation-claim-reason`
- `.validation-anomaly-detail.sev-{high|medium|low}`, `.validation-anomaly-sev`
- `.validation-missing-item`, `.validation-missing-icon`
- `.evidence-list`, `.evidence-item`, `.evidence-icon`, `.evidence-label`, `.evidence-file`

---

## API Response Shape (Phase 4)

### POST /api/analyze — success

```json
{
  "analysis": {
    "current_system": "...",
    "what_would_change": "...",
    "affected_areas": "...",
    "effort": "...",
    "risks": "...",
    "unknowns": "...",
    "developer_reasoning": "..."
  },
  "evidence": [
    { "type": "entry_point",  "file": "src/index.js",       "label": "Entry Point" },
    { "type": "file",         "file": "src/handlers/api.go", "label": "Key File" },
    { "type": "manifest",     "file": "package.json",        "label": "Dependency Manifest" },
    { "type": "tests",        "file": "src/__tests__/",      "label": "Tests" }
  ],
  "validation": {
    "status": "completed",
    "provider": "huggingface",
    "model": "ibm-granite/granite-3.3-8b-instruct",
    "latencyMs": 1840,
    "claims": [
      {
        "claimId": "claim-current",
        "classification": "SUPPORTED",
        "reason": "The entry point evidence directly shows the described system.",
        "evidenceReferences": ["src/index.js"]
      }
    ],
    "anomalies": [
      { "severity": "medium", "description": "No test coverage for the import path.", "evidenceReferences": [] }
    ],
    "missingEvidence": [
      { "claimId": "claim-risks", "description": "No dependency manifest evidence for risk assessment." }
    ]
  }
}
```

### POST /api/analyze — Granite unavailable

```json
{
  "analysis": { "...": "primary result still here" },
  "evidence": [],
  "validation": {
    "status": "unavailable",
    "provider": "huggingface",
    "model": "ibm-granite/granite-3.3-8b-instruct",
    "reason": "provider_busy"
  }
}
```

### Reason values

| Reason | Cause |
|---|---|
| `not_configured` | `HF_TOKEN` not set in Worker env |
| `provider_busy` | HF returned 503 |
| `rate_limited` | HF returned 429 |
| `timeout` | Request exceeded 15s |
| `network` | Network-level failure |
| `auth_error` | HF returned 401 or 403 |
| `model_not_found` | HF returned 404 |
| `malformed_response` | Model returned non-JSON or invalid schema |
| `primary_parse_failed` | Primary LLM output could not be parsed |

---

## Security

| Requirement | Implementation |
|---|---|
| Token never in frontend | `HF_TOKEN` read from `env.HF_TOKEN` in Worker only |
| Token never logged | No `console.log` involving the token anywhere |
| Token never in responses | Not included in any JSON response field |
| Token never in error messages | `HFError` contains HTTP status and reason only |
| Token not in source | `.dev.vars` is gitignored; `.dev.vars.example` shows placeholder |
| Model configurable | `HF_MODEL` Worker secret, never hardcoded in routes |

---

## Production Setup

```bash
# Add HF token to Cloudflare Worker secrets
cd worker
npx wrangler secret put HF_TOKEN
# paste your token at the prompt: hf_...

# Optionally override the model
npx wrangler secret put HF_MODEL
# paste: ibm-granite/granite-3.3-8b-instruct
```

---

## File Map Delta (Phase 4)

```
worker/src/ai/
  huggingface.js                  NEW — HF Inference provider adapter
  granite.js                      NEW — validateEvidence(), prompt, parser, fallback

worker/src/routes/
  analyze.js                      CHANGED — claim extractor, evidence builder, Granite call

worker/
  .dev.vars.example               CHANGED — HF_TOKEN, HF_MODEL entries added

frontend/src/pages/
  AnalyzePage.jsx                 CHANGED — Evidence panel + ValidationPanel component

frontend/src/
  styles.css                      CHANGED — validation + evidence panel styles

evals/
  eval-granite.js                 NEW — 9 unit tests (fetch mocked)
```

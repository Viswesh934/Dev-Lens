# DevLens Evals

Read-only, script-based evaluation suite for the DevLens worker API.

## Files

| Script | Purpose |
|--------|---------|
| `eval-api.js` | Smoke tests all API endpoints (GET only — strictly read-only) |
| `eval-analyze.js` | Sends fixed analysis questions and checks the response structure and quality |

## Usage

```bash
# Smoke test all endpoints against local dev worker
node evals/eval-api.js

# Smoke test against production
node evals/eval-api.js --worker https://devlens-worker.sigireddyviswesh.workers.dev

# Run analysis evals against repo 1 for PM audience
node evals/eval-analyze.js --repo 1 --audience PM

# Save a JSON report
node evals/eval-analyze.js --output evals/results.json

# Verbose mode — prints full response objects
node evals/eval-analyze.js --verbose
```

## Environment

```
WORKER_URL   Base URL of the DevLens worker (default: http://localhost:8787)
```

## Exit codes

- `0` — all evals passed
- `1` — one or more evals failed

## Notes

- Both scripts are **strictly read-only** — they never POST writes or mutate any data.
- `eval-analyze.js` does issue POST `/api/analyze` calls which trigger the LLM and persist a result row, but this is intentional — analysis persistence is a core feature being evaluated.
- No dependencies beyond Node.js 18+ built-ins (`node:util`, `node:fs`, native `fetch`).

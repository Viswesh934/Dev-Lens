# DevLens

> **A developer-first codebase analysis tool.** Point it at a GitHub repository, define how you think and explain things, and get structured, audience-aware analysis of any engineering question — validated by IBM Granite.

---

## What it does

DevLens bridges the gap between a developer's mental model of a codebase and the questions everyone else asks about it.

You give DevLens:
1. A GitHub repository (or a multi-service project with named components)
2. Your **Developer Lens** — how you investigate code and how you prefer to explain it
3. A question and an audience (PM, Manager, Client, Developer, Support)

It returns a structured 7-section analysis — current system, what would change, affected areas, effort, risks, unknowns, and internal developer reasoning — pitched at exactly the audience you chose.

A secondary **Granite Evidence Validator** (IBM Granite via Hugging Face Inference) then checks whether the claims in that analysis are actually supported by the repository evidence. Granite failure never blocks the primary result.

Analysis results are saved. A **Report Bot** lets you select any subset of past analyses and generate a paginated, print-ready PDF report via [Paprize](https://paprize.page). Your developer lens can be published as a public read-only share link.

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│  Browser (Vite + React)                                  │
│                                                          │
│  Analyze ─── Context ─── Developer ─── Report           │
│    │                                   └── @paprize/react│
│    └── Evidence + Validation panels                      │
│  SharePage (hash-routed, no auth)                        │
└────────────────────┬────────────────────────────────────┘
                     │ fetch / CORS
┌────────────────────▼────────────────────────────────────┐
│  Cloudflare Worker  (src/index.js)                       │
│                                                          │
│  /api/repositories       ─── repositories.js            │
│  /api/analyze            ─── analyze.js                 │
│    ├── Primary: OpenRouter / gpt-4o-mini                 │
│    └── Validator: Granite via HF Inference (non-fatal)   │
│  /api/developer-lens     ─── developerLens.js            │
│  /api/developer-lens/share                               │
│  /api/shares/:id         ─── shares.js  (public)        │
│                                                          │
│  src/ai/                                                 │
│    huggingface.js  ── HF provider adapter               │
│    granite.js      ── validateEvidence()                 │
└────────────────────┬────────────────────────────────────┘
                     │ D1 SQL
┌────────────────────▼────────────────────────────────────┐
│  Cloudflare D1  (SQLite)                                 │
│                                                          │
│  repositories      — projects + indexed GitHub context  │
│  developer_lens    — investigation/explanation styles   │
│  analysis_results  — persisted LLM outputs              │
│  lens_shares       — public read-only snapshots         │
└─────────────────────────────────────────────────────────┘
```

### Analysis pipeline

```
User Question
      │
      ▼
Repository Context + Developer Lens
      │
      ▼
Primary Analysis (OpenRouter / gpt-4o-mini)
      │
      ├── current_system
      ├── what_would_change
      ├── affected_areas
      ├── effort / risks / unknowns
      └── developer_reasoning
      │
      ▼
Claim extractor → compact claims + evidence
      │
      ▼
Granite Evidence Validator (IBM Granite via HF Inference)
      │
      ├── SUPPORTED / WEAKLY_SUPPORTED / CONTRADICTED / INSUFFICIENT_EVIDENCE
      ├── anomalies (unexpected coupling, missing files, stale assumptions)
      └── missingEvidence
      │
      ▼
Combined result { analysis, evidence, validation }
```

### Key design decisions

| Decision | Reason |
|---|---|
| Cloudflare Worker + D1 | Zero cold starts, runs at the edge, D1 is SQLite with no server to manage |
| OpenRouter (`gpt-4o-mini`) | Single API key, model-swappable, cheap for structured JSON generation |
| IBM Granite via HF Inference | Specialised model for evidence validation; secondary, non-blocking, model-swappable via `HF_MODEL` |
| `HF_TOKEN` server-side only | Token read from Worker env, never forwarded to frontend, never logged |
| Granite failure is non-fatal | Validation is a secondary layer; 503/429/timeout all return `{ status: "unavailable" }` |
| No retry loop | One attempt only; provider is marked unavailable immediately to keep latency bounded |
| Provider abstraction (`ai/`) | `validateEvidence()` is decoupled from HF; swapping providers requires only changing `granite.js` |
| `window.print()` for PDF | Zero dependency, works everywhere, neo-brutalism design prints cleanly |
| `@paprize/react` for report bot | Handles A4 pagination automatically — no manual page-break logic |
| Hash routing for share pages | Static SPA; no server-side routing needed for `/share/:id` |
| Results auto-saved after analysis | Makes the Report Bot useful with no extra user action |

---

## Project structure

```
Dev-Lens/
├── migrations/
│   ├── 0001_initial.sql       — repositories + developer_lens tables
│   ├── 0002_phase2.sql        — urls, developer_notes columns
│   └── 0003_phase3.sql        — components, analysis_results, lens_shares
│
├── worker/
│   ├── wrangler.toml
│   ├── .dev.vars.example      — copy to .dev.vars, never commit
│   └── src/
│       ├── index.js            — entry point, routing, CORS
│       ├── db/queries.js       — all D1 SQL (thin wrappers, no logic)
│       ├── indexer/index.js    — GitHub API crawler
│       ├── ai/
│       │   ├── huggingface.js  — HF Inference provider adapter
│       │   └── granite.js      — validateEvidence(), prompt, parser, fallback
│       └── routes/
│           ├── repositories.js    — CRUD + indexing
│           ├── analyze.js         — primary LLM + Granite validation + persistence
│           ├── developerLens.js   — lens save + share publish
│           └── shares.js          — public share read
│
├── frontend/
│   ├── index.html
│   ├── vite.config.js
│   └── src/
│       ├── App.jsx             — tab shell + hash router for /share/:id
│       ├── styles.css          — neo-brutalism design + @media print + validation styles
│       ├── lib/api.js          — fetch wrappers for all endpoints
│       └── pages/
│           ├── AnalyzePage.jsx    — analysis + Evidence panel + Validation panel
│           ├── ContextPage.jsx    — Component Manager + indexing
│           ├── DeveloperPage.jsx  — lens editor + Share Lens
│           ├── SharePage.jsx      — public read-only lens view
│           └── ReportPage.jsx     — report bot (Paprize PDF)
│
└── evals/
    ├── eval-api.js        — read-only smoke tests for all endpoints
    ├── eval-analyze.js    — scored analysis pipeline evals
    ├── eval-granite.js    — 9 Granite validator unit tests
    └── README.md
```

---

## Setup

### Prerequisites

- Node.js 18+
- Cloudflare account with Wrangler CLI (`npm i -g wrangler`)
- OpenRouter API key
- Hugging Face token (optional — Granite validation degrades gracefully without it)

### 1. Apply database migrations

```bash
# Local dev
wrangler d1 execute devlens-db --local --file=migrations/0001_initial.sql
wrangler d1 execute devlens-db --local --file=migrations/0002_phase2.sql
wrangler d1 execute devlens-db --local --file=migrations/0003_phase3.sql

# Production
wrangler d1 execute devlens-db --remote --file=migrations/0001_initial.sql
wrangler d1 execute devlens-db --remote --file=migrations/0002_phase2.sql
wrangler d1 execute devlens-db --remote --file=migrations/0003_phase3.sql
```

### 2. Configure secrets

```bash
cd worker
cp .dev.vars.example .dev.vars
# Fill in OPENROUTER_API_KEY, GITHUB_TOKEN, HF_TOKEN (optional), HF_MODEL (optional)

# Production secrets
wrangler secret put OPENROUTER_API_KEY
wrangler secret put GITHUB_TOKEN
wrangler secret put HF_TOKEN   # optional — enables Granite validation
```

### 3. Run locally

```bash
cd worker && npm run dev      # Worker at http://localhost:8787
cd frontend && npm run dev    # Frontend at http://localhost:5173
```

### 4. Deploy

```bash
cd worker && wrangler deploy
cd frontend && npm run build
# Deploy dist/ to Cloudflare Pages or any static host
```

---

## Evals

Read-only, script-based — no test database or live keys required for Granite tests.

```bash
# Smoke test all API endpoints
node evals/eval-api.js --worker http://localhost:8787

# Analysis pipeline quality evals (requires running worker + OPENROUTER_API_KEY)
node evals/eval-analyze.js --repo 1 --audience PM

# Granite validator unit tests (no live keys needed — fetch is mocked)
node evals/eval-granite.js

# Save a JSON report
node evals/eval-analyze.js --output evals/results.json
```

---

## API response shape

`POST /api/analyze` now returns:

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
    { "type": "entry_point", "file": "src/index.js", "label": "Entry Point" }
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
        "reason": "...",
        "evidenceReferences": ["src/index.js"]
      }
    ],
    "anomalies": [],
    "missingEvidence": []
  }
}
```

When Granite is unavailable:
```json
{
  "validation": {
    "status": "unavailable",
    "provider": "huggingface",
    "model": "ibm-granite/granite-3.3-8b-instruct",
    "reason": "provider_busy"
  }
}
```

---

## Phases

| Phase | What shipped |
|---|---|
| **1** | Single-repo indexing, Developer Lens, audience-aware 7-section analysis |
| **2** | Multi-URL indexing, sibling repo context, developer notes, per-repo notes |
| **3** | Structured components (name/role/url), analysis result persistence, shareable lens links, PDF export via `window.print()`, Paprize report bot, eval scripts |
| **4** | IBM Granite evidence validator via HF Inference, provider abstraction (`ai/`), claim extraction from primary analysis, Evidence + Validation panels in UI, 9-case eval suite |

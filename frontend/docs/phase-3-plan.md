# DevLens — Phase 3 Plan

> **Status:** ✅ Complete  
> **Scope:** Multi-URL projects as first-class entities, shareable lens views, PDF analysis dashboard export.

---

## Overview

Phase 3 upgrades DevLens from a single-developer tool into something that can be shared and consumed by teams. Three capabilities shipped in this phase:

1. **Projects** — a repository entry becomes a proper multi-service project with named components (frontend, backend, infra, etc.), each with its own URL and role
2. **Shareable Lens views** — a saved developer lens can be published as a read-only shareable URL for teammates, PMs, and clients
3. **PDF Dashboard export** — the analysis result panel can be exported as a structured PDF report, and a Paprize-powered report bot generates paginated multi-analysis PDFs

---

## What Was Implemented

### Feature 1 — Structured Components (replaces flat URL list)

The flat `urls` array became a structured `components` array — each entry has a **name**, a **role**, and a **URL**. Each service in a multi-service project now has a human-readable label that appears in the UI and in the LLM analysis prompt.

**Schema (`migrations/0003_phase3.sql`):**
```sql
ALTER TABLE repositories ADD COLUMN components TEXT;
-- Format: [{ "name": "Frontend", "role": "frontend", "url": "https://github.com/..." }, ...]
-- Roles: frontend | backend | worker | infra | other
```

**Backend:**
- `PATCH /api/repositories/:id` accepts a `components` array with role validation
- `POST /api/repositories/:id/index` — when components exist, indexes via `components` URLs (not `urls`); attaches component `name` + `role` to each sibling context entry
- Components injected into the LLM prompt as a `## Project Components` section

**Frontend — ContextPage:**
- URL list replaced with **Component Manager**: name input + role dropdown + GitHub URL per row
- "Add Component" appends a row; ✕ removes it; "Save Components" sends `PATCH`
- Indexed Components section in the context display shows `role` badge

**Frontend — AnalyzePage:**
- Component role badges (colour-coded) shown under the repo selector

### Feature 2 — Shareable Lens Views

A developer's lens (investigation style + explanation style + global notes) can be published as a public read-only snapshot anyone can view without logging in.

**Schema (`migrations/0003_phase3.sql`):**
```sql
CREATE TABLE IF NOT EXISTS lens_shares (
  id         TEXT    PRIMARY KEY,   -- short random slug
  lens_id    INTEGER NOT NULL,
  label      TEXT,
  snapshot   TEXT    NOT NULL,      -- JSON snapshot at publish time
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);
```

**Backend:**
- `POST /api/developer-lens/share` — creates share, returns `{ id, url }`
- `GET /api/shares/:id` — public, no auth, returns full share + snapshot

**Frontend — DeveloperPage:**
- "Share This Lens" section below Save button
- Optional label input; "Publish Share Link" button
- On success: URL displayed + auto-copied to clipboard

**Frontend — SharePage (new):**
- Read-only view at `#/share/:id` (hash routing — no server-side routing needed)
- Shows label, publish date, investigation style, explanation style, global notes
- DevLens header + "Powered by DevLens" footer
- No editing, no tabs

### Feature 3 — PDF Export + Paprize Report Bot

Two distinct PDF capabilities:

**Quick export (`AnalyzePage`):**
- "Export PDF" button in the analysis result header
- Calls `window.print()` — `@media print` CSS hides all UI chrome (sidebar, header, controls), leaving only the analysis result panel
- Zero dependencies, works in every browser

**Report Bot (`ReportPage` — new tab):**
- Loads all saved analysis results for a repo via `GET /api/analyze?repoId=`
- Checkbox list to select any subset of results
- "Preview Report" renders a paginated `@paprize/react` document:
  - Cover page: repo name, description, generated date, result count
  - One `PageContent` block per selected analysis: question, audience, date, 2-column section grid, developer reasoning
  - `PageHeader` and `PageFooter` on every A4 page
- "Print / Save PDF" → `window.print()` (Paprize injects its own `@media print` rules)

**Analysis result persistence (`migrations/0003_phase3.sql`):**
```sql
CREATE TABLE IF NOT EXISTS analysis_results (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  repo_id     INTEGER NOT NULL,
  question    TEXT    NOT NULL,
  audience    TEXT    NOT NULL,
  result      TEXT    NOT NULL,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);
```
Every successful `POST /api/analyze` automatically saves to this table (non-fatal if it fails).

---

## Eval Scripts

Two read-only, script-based eval scripts — no test database, no writes:

**`evals/eval-api.js`** — 9 GET-only smoke tests covering every endpoint, CORS headers, 404 shapes, `components` field shape

**`evals/eval-analyze.js`** — 5 scored analysis evals checking response structure, prose quality, `developer_reasoning` length, no parse errors. Supports `--repo`, `--audience`, `--output` flags.

---

## New API Routes

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/analyze?repoId=1` | Return saved results for a repo |
| `POST` | `/api/developer-lens/share` | Publish a lens snapshot → `{ id, url }` |
| `GET` | `/api/shares/:id` | Read a public lens snapshot (no auth) |

---

## File Map — Phase 3

```
migrations/
  0003_phase3.sql               NEW

worker/src/
  db/queries.js                 CHANGED — components, saveAnalysisResult, createShare, getShare
  routes/
    repositories.js             CHANGED — components in PATCH + components-aware indexing
    developerLens.js            CHANGED — POST /api/developer-lens/share
    analyze.js                  CHANGED — components in prompt, result persistence, GET history
    shares.js                   NEW — GET /api/shares/:id
  index.js                      CHANGED — /api/developer-lens startsWith + /api/shares/:id

frontend/src/
  App.jsx                       CHANGED — hash router, Report tab, no-print header/sidebar
  styles.css                    CHANGED — @media print, component row, share page, report styles
  lib/api.js                    CHANGED — shareLens, getShare, getAnalysisResults
  pages/
    AnalyzePage.jsx             CHANGED — component badges, Export PDF
    ContextPage.jsx             CHANGED — Component Manager replaces URL list
    DeveloperPage.jsx           CHANGED — Share Lens section
    SharePage.jsx               NEW
    ReportPage.jsx              NEW

evals/
  eval-api.js                   NEW
  eval-analyze.js               NEW
  README.md                     NEW
```

# DevLens — Phase 3 Plan

> **Status:** Planned  
> **Scope:** Multi-URL projects as first-class entities, shareable lens views, PDF analysis dashboard export.

---

## Overview

Phase 3 upgrades DevLens from a single-developer tool into something that can be shared and consumed by teams. Three capabilities ship in this phase:

1. **Projects** — a repository entry becomes a proper multi-service project with named components (frontend, backend, infra, etc.), each with its own URL and role
2. **Shareable Lens views** — a saved developer lens can be published as a read-only shareable URL for teammates, PMs, and clients
3. **PDF Dashboard export** — the analysis result panel can be exported as a structured PDF report

---

## Feature 1 — Projects (Multi-URL as First-Class)

### What Phase 2 did

Phase 2 added a `urls` JSON array column to `repositories` and indexes all URLs together in parallel. The primary URL is fixed; additional ones are linked. Sibling repo contexts are attached at `indexed_context.sibling_repos[]`.

### What Phase 3 changes

The flat `urls` array becomes a structured `components` array — each entry has a **name**, a **role**, and a **URL**. This makes it possible to give each repo a human-readable label ("Frontend", "Backend API", "Infrastructure", "Worker") and surface that label in the UI and in the analysis prompt.

#### Proposed schema change (`migrations/0003_phase3.sql`)

```sql
-- Replace the flat urls array with a structured components JSON array.
-- Format: [{ "name": "Frontend", "role": "frontend", "url": "https://github.com/..." }, ...]
ALTER TABLE repositories ADD COLUMN components TEXT;

-- analysis_results — persisted analysis output keyed by repo + question + audience
CREATE TABLE IF NOT EXISTS analysis_results (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  repo_id     INTEGER NOT NULL REFERENCES repositories(id),
  question    TEXT NOT NULL,
  audience    TEXT NOT NULL,
  result      TEXT NOT NULL,   -- JSON — the 7-section analysis object
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
```

The existing `urls` column is kept for backward compatibility; the new `components` column is additive.

#### Worker changes

- `POST /api/repositories` and `PATCH /api/repositories/:id` accept a `components` array
- `POST /api/repositories/:id/index` iterates over `components` instead of `urls`, attaching the component name and role to each sibling context entry
- `POST /api/analyze` includes component names and roles in the prompt context so the LLM can reference "the Frontend repo" or "the Backend API" by name

#### Frontend changes — ContextPage

Replace the generic URL list with a **Component Manager**:
- Each row: Name input (e.g. "Frontend"), Role dropdown (Frontend / Backend API / Worker / Infra / Other), GitHub URL input, Remove button
- "Add Component" button appends a new row
- Save triggers `PATCH /api/repositories/:id` with the full `components` array
- Component names shown as badges in the indexed context sibling card grid

#### Frontend changes — AnalyzePage

The repo selector shows a component summary under the repo name:
```
Peekachu
  Frontend (TypeScript) · Backend API (Go) · Worker (Python)
```

---

## Feature 2 — Shareable Lens Views

### Concept

A developer saves their investigation + explanation style + global notes as their lens. Phase 3 lets them **publish** that lens as a read-only shareable page that anyone with the URL can view — no login required.

This is useful for:
- PMs and managers wanting to understand how the developer approaches the codebase
- New team members onboarding
- Clients wanting to understand what "DevLens analysis" means for their project

### Schema change

```sql
-- lens_shares — public read-only snapshots of a developer lens
CREATE TABLE IF NOT EXISTS lens_shares (
  id           TEXT PRIMARY KEY,   -- short random slug, e.g. "abc123"
  lens_id      INTEGER NOT NULL REFERENCES developer_lens(id),
  label        TEXT,               -- optional human-readable title
  snapshot     TEXT NOT NULL,      -- JSON snapshot of the lens at publish time
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### New API routes

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/developer-lens/share` | Creates a share snapshot → returns `{ id, url }` |
| `GET` | `/api/shares/:id` | Returns the public snapshot (no auth) |

### Frontend changes

**DeveloperPage** — new "Share Lens" button below the save button:
- Calls `POST /api/developer-lens/share`
- Copies the share URL to clipboard
- Share URL format: `https://devlens-worker.sigireddyviswesh.workers.dev/share/:id`

**New SharePage** — rendered at `/share/:id` in the frontend (React Router or hash routing):
- Read-only view of the lens: investigation style, explanation style, global notes
- Clean readable layout with the DevLens header
- "Powered by DevLens" footer
- No tabs, no editing

---

## Feature 3 — PDF Dashboard Export

### Concept

After a successful analysis, the user can export the result as a PDF. The PDF is a structured one-page report with:

- Header: DevLens logo, repo name, audience, question, timestamp
- 7 analysis sections in a two-column grid layout (Current System + What Would Change as full-width, the rest in two columns)
- Developer Reasoning as a footnote section
- Footer: DevLens · generated at · model

### Implementation approach

The PDF is generated **client-side** using the browser's `window.print()` with a dedicated `@media print` stylesheet, rather than a server-side PDF library. This avoids adding a heavy dependency and works without any backend changes.

**Frontend changes**

1. Add a "Export PDF" button in `AnalyzePage` result header (only visible when `status === 'done'`)
2. Add `@media print` styles to `styles.css`:
   - Hide sidebar, header controls, audience picker, question input, and the Analyze button
   - Show only the analysis result panel in full-page width
   - Force white background, black text, no shadows, no borders
   - Section titles as bold uppercase, body text as regular weight
   - Page break avoidance on each result section
3. `handleExportPdf` calls `window.print()` directly — browser print dialog opens with the analysis pre-rendered

**Why not a PDF library?**
- `window.print()` is zero-dependency and works in every browser
- The existing HTML structure already mirrors a report layout
- The neo-brutalism design prints cleanly (no gradients, no blur)
- Can upgrade to a library later if richer control is needed

---

## Execution Order

Phase 3 should be built in this order — each step is independently shippable:

```
1. PDF export         (frontend-only, no schema, no backend — ship first)
2. Components model   (schema + backend + frontend — the core upgrade)
3. Shareable lens     (schema + two new routes + new frontend page)
```

---

## Schema — Full Phase 3 Migration

```sql
-- migrations/0003_phase3.sql

-- Feature 2: Structured components per project
ALTER TABLE repositories ADD COLUMN components TEXT;
-- Format: [{ "name": "Frontend", "role": "frontend", "url": "https://..." }, ...]
-- The existing `urls` column is preserved and ignored once components is populated.

-- Feature 1: Persisted analysis results
CREATE TABLE IF NOT EXISTS analysis_results (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  repo_id     INTEGER NOT NULL,
  question    TEXT NOT NULL,
  audience    TEXT NOT NULL,
  result      TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Feature 3: Shareable lens snapshots
CREATE TABLE IF NOT EXISTS lens_shares (
  id         TEXT PRIMARY KEY,
  lens_id    INTEGER NOT NULL,
  label      TEXT,
  snapshot   TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

---

## API Surface — Phase 3 Additions

| Method | Path | Feature | Description |
|--------|------|---------|-------------|
| `PATCH` | `/api/repositories/:id` | Components | Now also accepts `components` array |
| `POST` | `/api/developer-lens/share` | Shareable lens | Publish a lens snapshot |
| `GET` | `/api/shares/:id` | Shareable lens | Read a public lens snapshot |

No new routes for PDF — entirely client-side.

---

## File Map — Phase 3 Additions

```
migrations/
  0003_phase3.sql               NEW

worker/src/
  db/queries.js                 CHANGED — components field, createShare, getShare, saveAnalysisResult
  routes/
    repositories.js             CHANGED — components in PATCH + indexing
    developerLens.js            CHANGED — POST /share endpoint
    analyze.js                  CHANGED — components in prompt, save result to DB
    shares.js                   NEW — GET /api/shares/:id
  index.js                      CHANGED — route /api/shares/:id

frontend/src/
  styles.css                    CHANGED — @media print rules
  pages/
    AnalyzePage.jsx             CHANGED — Export PDF button + handleExportPdf
    ContextPage.jsx             CHANGED — Component Manager (name + role + url rows)
    DeveloperPage.jsx           CHANGED — Share Lens button + share URL display
    SharePage.jsx               NEW — read-only public lens view
  App.jsx                       CHANGED — /share/:id route handling
  lib/api.js                    CHANGED — shareL ens, getShare

docs/
  phase-3-plan.md               ← this file
```

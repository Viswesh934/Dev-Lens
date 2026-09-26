# DevLens — Phase 3 Summary

> **Status:** Complete  
> **Scope:** Structured project components, analysis result persistence, shareable lens views, Paprize PDF report bot, eval scripts.

---

## What Phase 3 Built

Phase 3 upgrades DevLens from a single-developer tool into something teams can consume. Three features shipped: structured components per project, public shareable lens links, and a PDF report bot. A script-based eval suite was added alongside.

---

## Schema Changes

**File:** `migrations/0003_phase3.sql`

```sql
-- Structured project components (replaces flat urls array for multi-service projects)
ALTER TABLE repositories ADD COLUMN components TEXT;
-- Format: [{ "name": "Frontend", "role": "frontend", "url": "https://..." }, ...]
-- Roles: frontend | backend | worker | infra | other
-- The existing `urls` column is preserved for backward compatibility.

-- Persisted analysis output
CREATE TABLE IF NOT EXISTS analysis_results (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  repo_id     INTEGER NOT NULL,
  question    TEXT    NOT NULL,
  audience    TEXT    NOT NULL,
  result      TEXT    NOT NULL,   -- JSON
  created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- Public read-only lens snapshots
CREATE TABLE IF NOT EXISTS lens_shares (
  id         TEXT    PRIMARY KEY,   -- short random slug e.g. "abc123xy"
  lens_id    INTEGER NOT NULL,
  label      TEXT,
  snapshot   TEXT    NOT NULL,      -- JSON snapshot at publish time
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);
```

### Full schema at end of Phase 3

| Table | Column | Phase | Description |
|---|---|---|---|
| `repositories` | `id` | 1 | PK |
| `repositories` | `name`, `url`, `description` | 1 | Core fields |
| `repositories` | `indexed_context` | 1 | Full GitHub context JSON |
| `repositories` | `urls` | 2 | JSON array of linked URLs (legacy) |
| `repositories` | `developer_notes` | 2 | Per-repo freeform context |
| `repositories` | `components` | **3** | JSON array `[{ name, role, url }]` |
| `developer_lens` | `investigation_style`, `explanation_style` | 1 | Lens definition |
| `developer_lens` | `developer_notes` | 2 | Global cross-repo context |
| `analysis_results` | `id`, `repo_id`, `question`, `audience`, `result` | **3** | Persisted analyses |
| `lens_shares` | `id`, `lens_id`, `label`, `snapshot` | **3** | Public snapshots |

---

## New and Changed API Routes

| Method | Path | Change | Description |
|---|---|---|---|
| `POST` | `/api/repositories` | Extended | Now accepts `components` array |
| `PATCH` | `/api/repositories/:id` | Extended | Now accepts `components` array with role validation |
| `POST` | `/api/repositories/:id/index` | Extended | Indexes via `components` (falls back to `urls`); attaches `name` + `role` to sibling contexts |
| `GET` | `/api/analyze?repoId=1` | **New** | Returns saved analysis results for a repo |
| `POST` | `/api/analyze` | Extended | Saves result to `analysis_results`; components injected into prompt |
| `POST` | `/api/developer-lens/share` | **New** | Publishes a lens snapshot → returns `{ id, url }` |
| `GET` | `/api/shares/:id` | **New** | Returns the public snapshot (no auth) |

### PATCH /api/repositories/:id — components body

```json
{
  "components": [
    { "name": "Frontend",    "role": "frontend", "url": "https://github.com/..." },
    { "name": "Backend API", "role": "backend",  "url": "https://github.com/..." }
  ]
}
```

### POST /api/developer-lens/share — response

```json
{ "id": "abc123xy", "url": "https://devlens-worker.sigireddyviswesh.workers.dev/share/abc123xy" }
```

---

## Backend Changes

### `worker/src/db/queries.js`

- `getRepositories` / `getRepository` — now selects `components` column
- `updateRepository` — extended to handle `components` field
- `parseRepo` — parses `components` JSON array (empty array default)
- **New:** `saveAnalysisResult(db, repo_id, question, audience, result)`
- **New:** `getAnalysisResults(db, repo_id)` — last 50, desc
- **New:** `getAllAnalysisResults(db)` — last 100
- **New:** `createShare(db, lens_id, label, snapshot)` — generates random slug
- **New:** `getShare(db, id)`

### `worker/src/routes/repositories.js`

- `POST /api/repositories` — accepts optional `components` array
- `PATCH /api/repositories/:id` — validates role against `frontend | backend | worker | infra | other`
- `POST /api/repositories/:id/index` — when `components` exist, uses them for URL list; attaches component `name` and `role` to sibling context entries

### `worker/src/routes/analyze.js`

- Components injected as a `## Project Components` section in the LLM prompt
- `GET /api/analyze?repoId=` — returns saved results from `analysis_results`
- After successful parse, result saved to D1 (non-fatal — failure does not block response)

### `worker/src/routes/developerLens.js`

- `POST /api/developer-lens/share` — reads current lens, takes snapshot, calls `createShare`, returns slug + URL

### `worker/src/routes/shares.js` ← **New file**

- `GET /api/shares/:id` — public, no auth, returns full share object including snapshot

### `worker/src/index.js`

- Router updated: `/api/developer-lens` → `startsWith` match (to catch `/share` sub-path)
- New route: `/api/shares/:id`

---

## Frontend Changes

### `frontend/src/pages/AnalyzePage.jsx`

- Component role badges under repo selector (colour-coded by role)
- `Export PDF` button in result header — calls `window.print()`
- `.no-print` class on sidebar, header, controls

### `frontend/src/pages/ContextPage.jsx`

- URL list replaced with **Component Manager**: name input + role dropdown + URL input per row
- "Add Component" / "Save Components" / remove (✕) per row
- Indexed Components section shows `role` badge alongside repo name
- Index count message updated: "Will index primary + N components"

### `frontend/src/pages/DeveloperPage.jsx`

- **Share Lens** section: optional label input, "Publish Share Link" button
- On success: share URL displayed, auto-copied to clipboard, confirmation shown
- `api.shareLens(label)` call

### `frontend/src/pages/SharePage.jsx` ← **New file**

- Read-only public view rendered at `#/share/:id` (hash routing)
- Shows lens label, publish date, investigation style, explanation style, global notes
- DevLens header + "Powered by DevLens" footer
- No tabs, no editing

### `frontend/src/pages/ReportPage.jsx` ← **New file**

- Loads saved analysis results for the selected repo via `GET /api/analyze?repoId=`
- Select/deselect individual results via checkbox list
- "Preview Report" → renders `@paprize/react` `ReportRoot` with A4 sections
- Cover page + one `PageContent` block per analysis (question, meta, 2-column section grid, reasoning)
- "Print / Save PDF" → `window.print()`
- Paprize injects `@media print` rules that hide non-report content automatically

### `frontend/src/App.jsx`

- Hash router: `#/share/:id` renders `SharePage` standalone (no app chrome)
- `hashchange` listener for back/forward nav
- **Report** tab added to nav
- `no-print` applied to header + sidebar

### `frontend/src/lib/api.js`

```js
api.shareLens(label)              // POST /api/developer-lens/share
api.getShare(id)                  // GET /api/shares/:id
api.getAnalysisResults(repoId)    // GET /api/analyze?repoId=
```

### `frontend/src/styles.css`

- `@media print` — hides `.no-print`, white background, borderless result panel
- `.component-row` — flex row for Component Manager inputs
- `.share-page`, `.share-header`, `.share-body`, `.share-section-*`, `.share-footer`
- `.report-preview-wrapper`, `.report-page-header`, `.report-page-footer`, `.report-cover-*`
- `.report-analysis-block`, `.report-sections-grid`, `.report-section-cell`, `.report-section-label`

---

## Evals

### `evals/eval-api.js` ← New

9 read-only GET-only smoke tests:
- `GET /api/repositories` returns array
- Each repo has `id`, `name`, `url`
- `components` field is array on every repo
- 404 for unknown repo
- `GET /api/developer-lens` returns object
- `GET /api/shares/:id` returns 404 for unknown share
- `GET /api/analyze` without `repoId` returns 400
- `GET /api/analyze?repoId=1` returns array
- CORS headers present

### `evals/eval-analyze.js` ← New

5 scored analysis evals with configurable `--repo`, `--audience`, `--output`:
- Response has all 7 required fields
- No raw JSON escape sequences in output
- `current_system` mentions a technology
- `developer_reasoning` is substantive (> 40 chars)
- No `parseError` field

---

## Local Dev Setup (after Phase 3)

```bash
cd worker
npx wrangler d1 execute devlens-db --local --file=../migrations/0003_phase3.sql
npm run dev

cd frontend
npm install        # installs @paprize/react
npm run dev
```

---

## File Map Delta (Phase 3)

```
migrations/
  0003_phase3.sql                 NEW

worker/src/
  db/queries.js                   CHANGED — components, saveAnalysisResult, createShare, getShare
  routes/
    repositories.js               CHANGED — components PATCH + components-aware indexing
    developerLens.js              CHANGED — POST /share
    analyze.js                    CHANGED — components in prompt, result persistence, GET history
    shares.js                     NEW — GET /api/shares/:id

  index.js                        CHANGED — /api/developer-lens startsWith + /api/shares/:id

frontend/src/
  App.jsx                         CHANGED — hash router, Report tab, no-print header
  styles.css                      CHANGED — @media print, component row, share page, report styles
  lib/api.js                      CHANGED — shareLens, getShare, getAnalysisResults
  pages/
    AnalyzePage.jsx               CHANGED — component badges, Export PDF
    ContextPage.jsx               CHANGED — Component Manager replaces URL list
    DeveloperPage.jsx             CHANGED — Share Lens section
    SharePage.jsx                 NEW
    ReportPage.jsx                NEW

evals/
  eval-api.js                     NEW
  eval-analyze.js                 NEW
  README.md                       NEW
```

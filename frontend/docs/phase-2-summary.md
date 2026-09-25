# DevLens — Phase 2 Summary

> **Status:** Complete  
> **Scope:** Multi-URL projects, per-repo developer notes, global lens notes, new repository creation, multi-repo parallel indexing, Cloudflare Worker deployed to production.

---

## What Phase 2 Built

Phase 2 extends the data model from single-repo entries to full multi-URL projects, adds freeform developer context at both the repo and global lens level, and ships the worker live to Cloudflare.

---

## Live Deployment

| Resource | URL |
|----------|-----|
| Cloudflare Worker | `https://devlens-worker.sigireddyviswesh.workers.dev` |
| D1 Database | `devlens-db` · ID `d2c5c3ac-985b-4f32-9568-86903a5f2131` · Region APAC |
| Secrets set | `OPENROUTER_API_KEY` |

The worker was deployed with `npx wrangler deploy` and smoke-tested live — `GET /api/repositories` returns both seeded repos and `POST /api/analyze` returns a full 7-section AI response.

---

## Schema Changes

**File:** `migrations/0002_phase2.sql`

```sql
ALTER TABLE repositories ADD COLUMN urls            TEXT;   -- JSON array of additional GitHub URLs
ALTER TABLE repositories ADD COLUMN developer_notes TEXT;   -- freeform per-repo context

ALTER TABLE developer_lens ADD COLUMN developer_notes TEXT; -- freeform global/org-wide context
```

### Extended repositories row

| Column | Type | Phase | Description |
|--------|------|-------|-------------|
| `id` | INTEGER | 1 | Primary key |
| `name` | TEXT | 1 | Display name |
| `url` | TEXT | 1 | Primary GitHub URL (locked, always indexed) |
| `urls` | TEXT | **2** | JSON array of additional linked GitHub URLs |
| `description` | TEXT | 1 | Short description |
| `developer_notes` | TEXT | **2** | Freeform developer context for this repo |
| `indexed_context` | TEXT | 1 | Full indexed context JSON |
| `created_at` | TEXT | 1 | |
| `updated_at` | TEXT | 1 | |

### Extended developer_lens row

| Column | Phase | Description |
|--------|-------|-------------|
| `investigation_style` | 1 | How the developer traces a codebase |
| `explanation_style` | 1 | How results should be communicated |
| `developer_notes` | **2** | Global/org-wide context appended to every analysis |

---

## New and Changed API Routes

| Method | Path | Change | Description |
|--------|------|--------|-------------|
| `POST` | `/api/repositories` | **New** | Create a new repository entry |
| `PATCH` | `/api/repositories/:id` | **New** | Update `urls` array and/or `developer_notes` |
| `POST` | `/api/repositories/:id/index` | **Extended** | Now indexes all connected URLs in parallel; merges sibling context |
| `PUT` | `/api/developer-lens` | **Extended** | Now accepts optional `developer_notes` field |
| `POST` | `/api/analyze` | **Extended** | Injects `repo.developer_notes` and `lens.developer_notes` into prompt |

### POST /api/repositories — request body

```json
{
  "name": "My Project",
  "url": "https://github.com/owner/primary-repo",
  "description": "Optional",
  "urls": ["https://github.com/owner/another-repo"]
}
```

### PATCH /api/repositories/:id — request body (all fields optional)

```json
{
  "urls": ["https://github.com/owner/frontend", "https://github.com/owner/infra"],
  "developer_notes": "Auth uses JWT stored in Redis. Billing module frozen until Q3."
}
```

### Multi-URL indexing result shape

When a repo has additional URLs, indexing appends `sibling_repos` to the primary context:

```json
{
  "name": "primary-repo",
  "...": "all normal indexed fields",
  "sibling_repos": [
    {
      "url": "https://github.com/owner/frontend",
      "name": "frontend",
      "description": "...",
      "primary_languages": ["TypeScript"],
      "entry_points": ["src/main.tsx"],
      "directory_tree": ["src", "public"]
    }
  ]
}
```

### CORS headers updated

`Access-Control-Allow-Methods` now includes `PATCH` and `DELETE`.

---

## Frontend Changes

### ContextPage — `frontend/src/pages/ContextPage.jsx`

Three new sections added above the indexed context display:

**1. Connected Repo URLs panel**
- Primary URL shown as a locked "Primary" badge row
- Each additional URL shown as a dismissable "Linked" row (✕ button → `PATCH` to remove)
- Add-URL input field (Enter key or "+ Add URL" button → `PATCH` to append)
- Re-index now shows "Will index N connected repos" when multiple URLs exist

**2. Developer Notes textarea**
- Freeform textarea, pre-populated from `repo.developer_notes`
- "Save Notes" button → `PATCH /api/repositories/:id`
- Confirmation badge on save

**3. Add Repository form** (collapsible)
- "+ Add Repository" button in repo selector row
- Inline form: Name, Primary GitHub URL, Description
- `POST /api/repositories` on submit → auto-selects new repo

**Connected repos in indexed context**
- After re-indexing, `sibling_repos` are rendered as a card grid between the architecture section and the files grid

### DeveloperPage — `frontend/src/pages/DeveloperPage.jsx`

Added **Global Developer Notes** textarea — org-wide context (team conventions, deployment notes, on-call info) stored in `developer_lens.developer_notes`. Saved alongside investigation and explanation styles. Shows a note that per-repo context lives in the Context tab.

### App.jsx

Added `handleRepoCreated` → appends a new repo to the `repositories` state list. Passed as `onRepoCreated` prop to `ContextPage`.

### api.js — `frontend/src/lib/api.js`

```js
api.createRepository(name, url, description, urls)  // POST /api/repositories
api.updateRepository(id, patch)                      // PATCH /api/repositories/:id
api.saveDeveloperLens(investigation, explanation, developer_notes)  // PUT extended
```

`BASE` now reads from `import.meta.env.VITE_API_BASE_URL || '/api'` — deployed frontends point at the live worker by setting `VITE_API_BASE_URL`.

---

## AI Prompt Changes

`developer_notes` from both the repo and the global lens are injected into the analysis prompt when present:

```
## Repository Context
...

## Developer Notes (this repo)
Auth uses JWT stored in Redis. Billing module frozen until Q3.

## Developer Lens
Investigation style: ...
Explanation style: ...
Global developer notes: Team uses trunk-based dev. All services containerised.
```

---

## wrangler.toml — final state

```toml
name = "devlens-worker"
main = "src/index.js"
compatibility_date = "2024-01-01"

[[d1_databases]]
binding = "DB"
database_name = "devlens-db"
database_id = "d2c5c3ac-985b-4f32-9568-86903a5f2131"

[dev]
port = 8787
```

---

## Local Dev Setup (after Phase 2)

```bash
# Worker
cd worker
cp .env.example .dev.vars          # fill in OPENROUTER_API_KEY
npx wrangler d1 execute devlens-db --local --file=../migrations/0001_initial.sql
npx wrangler d1 execute devlens-db --local --file=../migrations/0002_phase2.sql
npx wrangler d1 execute devlens-db --local --file=../migrations/seed.sql
npm run dev                         # http://localhost:8787

# Frontend (separate terminal)
cd frontend
cp .env.example .env.local          # VITE_API_BASE_URL= (leave blank for local dev)
npm install
npm run dev                         # http://localhost:5173
```

---

## File Map Delta (Phase 2 additions/changes)

```
migrations/
  0002_phase2.sql             NEW — ALTER TABLE urls + developer_notes

worker/
  wrangler.toml               CHANGED — real database_id
  src/
    index.js                  CHANGED — PATCH/DELETE in CORS
    db/queries.js             CHANGED — createRepository, updateRepository, new columns
    routes/
      repositories.js         CHANGED — POST create, PATCH update, multi-URL indexing
      developerLens.js        CHANGED — developer_notes field
      analyze.js              CHANGED — repo + lens notes injected into prompt

frontend/
  src/
    lib/api.js                CHANGED — createRepository, updateRepository, VITE_API_BASE_URL
    pages/
      ContextPage.jsx         CHANGED — URL manager, dev notes, add repo form, sibling cards
      DeveloperPage.jsx       CHANGED — global developer notes field
      App.jsx                 CHANGED — handleRepoCreated
```

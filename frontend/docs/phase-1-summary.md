# DevLens — Phase 1 Summary

> **Status:** Complete  
> **Scope:** Full scaffold — backend API, GitHub indexer, AI analysis pipeline, React frontend, design system, environment setup.

---

## What Phase 1 Built

Phase 1 establishes the complete end-to-end skeleton of DevLens. Every layer is wired and working; no placeholders remain.

---

## Architecture

```
Repository URLs (GitHub)
        ↓
GitHub Indexer  (REST API → structured context JSON)
        ↓
Cloudflare D1   (persistent storage — repositories + developer lens)
        ↓
Cloudflare Worker  (lightweight JSON API at /api/*)
        ↓
OpenRouter → gpt-4o-mini  (analysis pipeline)
        ↓
React Frontend  (Analyze / Context / Developer tabs)
```

---

## Database Schema

**File:** `migrations/0001_initial.sql`

```sql
repositories (
  id               INTEGER PRIMARY KEY AUTOINCREMENT
  name             TEXT
  url              TEXT
  description      TEXT
  indexed_context  TEXT   -- full structured context JSON
  created_at       TEXT
  updated_at       TEXT
)

developer_lens (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT
  investigation_style  TEXT   -- how the developer traces a codebase
  explanation_style    TEXT   -- how results should be communicated
  created_at           TEXT
  updated_at           TEXT
)
```

**Phase 2 extension plan** (schema changes go in a new migration file `migrations/0002_*.sql`):
- `repositories.urls` — free-text or JSON array field to store multiple connected repo URLs per logical project
- `developer_context` — freeform developer notes / context blobs per repository (the "dev adds context" story)
- `analysis_results` — persisted analysis output keyed by `(repo_id, question_hash, audience)`
- `developer_lens.name` + multi-lens support

---

## Backend — Cloudflare Worker

**Entry point:** `worker/src/index.js`

### API Routes

| Method | Path | File | Description |
|--------|------|------|-------------|
| `GET` | `/api/repositories` | `routes/repositories.js` | List all repositories |
| `GET` | `/api/repositories/:id` | `routes/repositories.js` | Get a single repo with indexed context |
| `POST` | `/api/repositories/:id/index` | `routes/repositories.js` | Re-fetch live context from GitHub |
| `GET` | `/api/developer-lens` | `routes/developerLens.js` | Read current developer lens |
| `PUT` | `/api/developer-lens` | `routes/developerLens.js` | Save developer lens |
| `POST` | `/api/analyze` | `routes/analyze.js` | Run AI analysis — returns 7-section structured result |

### Analyze Route — Request / Response

**Request body:**
```json
{
  "question": "string — what does the developer / PM need to understand?",
  "repoId": 1,
  "audience": "Developer | PM | Manager | Client | Support"
}
```

**Response body (success):**
```json
{
  "current_system": "...",
  "what_would_change": "...",
  "affected_areas": "...",
  "effort": "...",
  "risks": "...",
  "unknowns": "...",
  "developer_reasoning": "..."
}
```

The route:
1. Validates inputs
2. Checks `OPENROUTER_API_KEY` is present
3. Fetches repo + developer lens from D1 in parallel
4. Builds a focused context summary (languages, directories, files, commits, README excerpt)
5. Sends to OpenRouter (`openai/gpt-4o-mini`) with audience-specific guidance
6. Parses JSON from the LLM response (strips markdown fences if present)
7. Falls back to `{ raw, parseError: true }` if JSON parsing fails

### GitHub Indexer — `worker/src/indexer/index.js`

Fetches via GitHub REST API and builds a structured context object stored in `repositories.indexed_context`:

| Field | Source |
|-------|--------|
| `name`, `url`, `description` | Repo metadata |
| `primary_languages`, `language_bytes` | `/languages` endpoint |
| `topics`, `stars`, `default_branch` | Repo metadata |
| `readme_excerpt` | `/readme` endpoint (base64-decoded, first 3000 chars) |
| `directory_tree` | `/git/trees` recursive (top-level dirs) |
| `important_files` | Pattern-matched from file tree |
| `configuration_files` | Pattern-matched (wrangler.toml, tsconfig, jest, vite, etc.) |
| `dependency_manifests` | Pattern-matched (package.json, go.mod, requirements.txt, etc.) |
| `test_locations` | Pattern-matched (_test.go, .test.ts, /tests/, etc.) |
| `entry_points` | Pattern-matched (main.go, src/index.ts, etc.) |
| `recent_commits` | Last 10 commits — sha, message, author, date |
| `indexing_status` | `"indexed"` |
| `indexed_at` | ISO timestamp |

### Environment Variables

**Worker** — set in `.dev.vars` locally, `wrangler secret put` in production:

| Variable | Required | Description |
|----------|----------|-------------|
| `OPENROUTER_API_KEY` | Yes | OpenRouter API key for `/api/analyze` |
| `GITHUB_TOKEN` | No | GitHub PAT — raises rate limit from 60 → 5000 req/hr during indexing |

**Frontend** — set in `.env.local` (dev) or deployment env:

| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_API_BASE_URL` | No | Backend URL for deployed frontend. Leave blank for local dev (Vite proxy handles `/api`). |

Template files: `worker/.env.example`, `frontend/.env.example`

---

## Frontend — React + Vite

**Entry:** `frontend/src/main.jsx` → `App.jsx`

### Pages

| Tab | File | What it does |
|-----|------|-------------|
| Analyze | `pages/AnalyzePage.jsx` | Repo selector, question input, audience picker, Analyze button, result renderer |
| Context | `pages/ContextPage.jsx` | Displays indexed context — overview, architecture layers, directories, entry points, commits, README |
| Developer | `pages/DeveloperPage.jsx` | Edit + save the developer lens (investigation style + explanation style) |

### Analyze page states

```
idle     → user fills in question + selects repo + picks audience
loading  → POST /api/analyze in flight — placeholders shown in all 7 result sections
done     → result text rendered in each section
error    → inline error notice shown above the result panel
```

### API client — `frontend/src/lib/api.js`

All calls are thin wrappers around `fetch`:

```js
api.getRepositories()
api.getRepository(id)
api.indexRepository(id)
api.getDeveloperLens()
api.saveDeveloperLens(investigation_style, explanation_style)
api.analyze(question, repoId, audience)
```

---

## Design System — Neo-Brutalism

**File:** `frontend/src/styles.css`

Key tokens:
```
--bg:           #f5f0e8   warm parchment page background
--surface:      #ffffff   card / input / panel background
--border:       #1a1a1a   all borders
--border-width: 2px
--accent:       #ff6b35   primary CTA (orange)
--accent2:      #4361ee   selected states (blue)
--yellow:       #ffd60a   header, active nav, tags
--shadow:       3px 3px 0px #1a1a1a
--shadow-lg:    5px 5px 0px #1a1a1a
--radius:       0px       hard corners everywhere
```

Rules: no border-radius, no blur, flat offset shadows, bold uppercase labels, warm background.

Reusable skill available at `.bob/skills/neo-brutalism/SKILL.md`.

---

## Seeded Repositories

Both repositories are pre-indexed with hand-crafted context (no GitHub token needed to start):

| ID | Name | URL | Stack |
|----|------|-----|-------|
| 1 | Peekachu | https://github.com/Viswesh934/Peekachu | Go + TypeScript + Python, ClickHouse, LlamaIndex, OpenTelemetry |
| 2 | Gotei | https://github.com/Viswesh934/Gotei | Go, HTML→PDF pipeline, net/http |

Use `POST /api/repositories/:id/index` to replace pre-indexed context with live GitHub data.

---

## Project File Map

```
devlens/
  .gitignore                       node_modules, dist, .dev.vars, .env.*, .wrangler
  README.md                        Setup + deployment guide

  migrations/
    0001_initial.sql               repositories + developer_lens schema
    seed.sql                       Peekachu + Gotei pre-indexed context + default lens

  worker/
    .env.example                   ← copy to .dev.vars
    .dev.vars.example              (alias — same content)
    wrangler.toml                  D1 binding (DB), port 8787
    src/
      index.js                     Router + CORS
      routes/
        repositories.js            GET list, GET :id, POST :id/index
        developerLens.js           GET, PUT
        analyze.js                 POST — OpenRouter AI analysis
      db/
        queries.js                 D1 thin wrappers
      indexer/
        index.js                   GitHub API → structured context

  frontend/
    .env.example                   ← copy to .env.local
    vite.config.js                 /api proxy → :8787
    src/
      App.jsx                      Shell + tab routing + repo state
      main.jsx                     React root
      styles.css                   Neo-brutalism design system
      lib/
        api.js                     Fetch wrappers (6 endpoints)
      pages/
        AnalyzePage.jsx            Main analysis UI
        ContextPage.jsx            Repository context viewer
        DeveloperPage.jsx          Developer lens editor
    docs/
      phase-1-summary.md           ← this file

  .bob/
    skills/
      neo-brutalism/
        SKILL.md                   Reusable neo-brutalism design skill
```

---

## Phase 2 — Planned

The following is explicitly out of scope for Phase 1 and planned for Phase 2:

### Extended Repository Model
- A repository entry can hold **multiple connected URLs** (e.g. frontend + backend + infra repos for one product)
- Free-text input field for repository URLs — user pastes one or many GitHub links; each is indexed and their contexts are stored and linked
- All indexed contexts are preserved; re-indexing one URL does not overwrite the others

### Developer Context Blobs
- Developers can add freeform notes, architecture decisions, known gotchas, and team conventions per repository
- Stored in `developer_context` table, surfaced to the analysis prompt alongside the GitHub-indexed context
- Editable in the Developer tab alongside the lens

### Analysis Persistence
- Completed analyses stored in `analysis_results` table
- Keyed by `(repo_id, question_hash, audience)` — re-running the same question returns cached result
- History view per repository

### Multi-Lens Support
- Multiple named developer lenses per workspace
- Lens selector on the Analyze page

### Authentication
- Simple token-based or OAuth auth protecting all `/api/*` routes

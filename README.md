# DevLens

A small developer-understanding tool. Helps non-developers understand the engineering impact of a request against a real codebase.

> A developer can encode how they understand and investigate a codebase, and DevLens uses that developer lens to explain the system to PMs, managers, clients, support engineers, or other developers.

---

## Architecture

```
Repository URL
      ↓
Repository Indexer  (GitHub API → structured context)
      ↓
Cloudflare D1       (persistent storage)
      ↓
Cloudflare Worker   (lightweight API)
      ↓
React Frontend      (Analyze / Context / Developer)
```

**Future analysis flow:**

```
Question + Repository Context + Developer Lens
      ↓
Investigation workflow
      ↓
Parallel analysis
      ↓
Evidence synthesis
      ↓
Audience transformation
      ↓
Structured result
```

---

## Project Structure

```
devlens/
  frontend/               React + Vite frontend
    src/
      pages/              AnalyzePage, ContextPage, DeveloperPage
      lib/api.js          Fetch wrappers
      App.jsx
      main.jsx
      styles.css
    package.json
    vite.config.js
    index.html

  worker/                 Cloudflare Worker
    src/
      index.js            Entry point + routing
      routes/
        repositories.js   GET /api/repositories, POST /api/repositories/:id/index
        developerLens.js  GET /api/developer-lens, PUT /api/developer-lens
      db/
        queries.js        D1 SQL queries
      indexer/
        index.js          GitHub API → structured context
    package.json
    wrangler.toml

  migrations/
    0001_initial.sql      Schema
    seed.sql              Initial repositories + developer lens
```

---

## Local Development

### Prerequisites

- Node.js 18+
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/) (`npm install -g wrangler`)
- A Cloudflare account (for D1, even locally)

---

### 1. Worker

```bash
cd devlens/worker
npm install
```

Create a local D1 database:

```bash
wrangler d1 create devlens-db
```

Copy the `database_id` from the output into `wrangler.toml`.

Apply the schema:

```bash
wrangler d1 migrations apply devlens-db --local
```

Seed the initial data:

```bash
wrangler d1 execute devlens-db --local --file=../migrations/seed.sql
```

Start the worker locally:

```bash
npm run dev
# Worker runs at http://localhost:8787
```

---

### 2. Frontend

In a separate terminal:

```bash
cd devlens/frontend
npm install
npm run dev
# Frontend runs at http://localhost:5173
# /api requests are proxied to http://localhost:8787
```

Open `http://localhost:5173`.

---

### Optional: GitHub Token

To avoid GitHub API rate limits when using the indexer, set a token:

```bash
# In devlens/worker/.dev.vars
GITHUB_TOKEN=ghp_your_token_here
```

---

## Deployment

### Worker

```bash
cd devlens/worker

# Create production D1 database
wrangler d1 create devlens-db

# Update wrangler.toml with the production database_id

# Apply migrations
wrangler d1 migrations apply devlens-db

# Seed data
wrangler d1 execute devlens-db --file=../migrations/seed.sql

# Deploy
npm run deploy
```

Set secrets if needed:

```bash
wrangler secret put GITHUB_TOKEN
```

### Frontend

```bash
cd devlens/frontend
npm run build
# Deploy dist/ to Cloudflare Pages or any static host
```

For Cloudflare Pages, point the production worker URL in `vite.config.js` or use a `_redirects` / Pages Function proxy.

---

## API

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/repositories` | List all repositories |
| `GET` | `/api/repositories/:id` | Get repository with context |
| `POST` | `/api/repositories/:id/index` | Re-index repository from GitHub |
| `GET` | `/api/developer-lens` | Get current developer lens |
| `PUT` | `/api/developer-lens` | Save developer lens |

---

## Indexed Repositories

| Name | URL |
|------|-----|
| Peekachu | https://github.com/Viswesh934/Peekachu |
| Gotei | https://github.com/Viswesh934/Gotei |

Both repositories are seeded with pre-built structured context. Use `POST /api/repositories/:id/index` to fetch live context from GitHub.

---

## Data Model

```sql
repositories (
  id               INTEGER PRIMARY KEY
  name             TEXT
  url              TEXT
  description      TEXT
  indexed_context  TEXT  -- JSON
  created_at       TEXT
  updated_at       TEXT
)

developer_lens (
  id                   INTEGER PRIMARY KEY
  investigation_style  TEXT
  explanation_style    TEXT
  created_at           TEXT
  updated_at           TEXT
)
```

---

## What's Not Yet Implemented

- AI analysis pipeline (the Analyze button shows a placeholder)
- Authentication
- Analysis result persistence
- Multiple developer lenses

The next phase will wire up the investigation pipeline:
Question → Repository Context → Developer Lens → Investigation → Analysis → Audience-tailored result.

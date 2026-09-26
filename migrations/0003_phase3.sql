-- migrations/0003_phase3.sql — Phase 3 schema extensions
--
-- repositories.components      — structured project components as JSON array
--                               Format: [{ "name": "Frontend", "role": "frontend", "url": "https://..." }, ...]
--                               Roles: frontend | backend | worker | infra | other
--                               The existing `urls` column is preserved and ignored once components is populated.
--
-- analysis_results             — persisted analysis output keyed by repo + question + audience
--
-- lens_shares                  — public read-only snapshots of a developer lens

-- Feature 1: Structured components per project
ALTER TABLE repositories ADD COLUMN components TEXT;

-- Feature 2: Persisted analysis results
CREATE TABLE IF NOT EXISTS analysis_results (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  repo_id     INTEGER NOT NULL,
  question    TEXT    NOT NULL,
  audience    TEXT    NOT NULL,
  result      TEXT    NOT NULL,   -- JSON — the 7-section analysis object
  created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- Feature 3: Shareable lens snapshots
CREATE TABLE IF NOT EXISTS lens_shares (
  id         TEXT    PRIMARY KEY,   -- short random slug e.g. "abc123xy"
  lens_id    INTEGER NOT NULL,
  label      TEXT,
  snapshot   TEXT    NOT NULL,      -- JSON snapshot of the lens at publish time
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

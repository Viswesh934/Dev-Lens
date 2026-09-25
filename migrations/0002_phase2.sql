-- Migration 002: Phase 2 schema extensions
--
-- repositories.urls           — JSON array of GitHub URLs belonging to this project
--                               (the original `url` column remains as the primary/display URL)
-- repositories.developer_notes — freeform developer context: architecture decisions,
--                               known gotchas, team conventions, caveats
-- developer_lens.developer_notes — global freeform notes that apply across all repos

ALTER TABLE repositories ADD COLUMN urls             TEXT;
ALTER TABLE repositories ADD COLUMN developer_notes  TEXT;
ALTER TABLE developer_lens ADD COLUMN developer_notes TEXT;

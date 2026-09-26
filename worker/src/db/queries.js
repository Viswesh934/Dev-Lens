// db/queries.js — thin wrappers around D1 SQL

// ── Repositories ─────────────────────────────────────────────────────────────

export async function getRepositories(db) {
  const { results } = await db.prepare(
    'SELECT id, name, url, urls, components, description, developer_notes, indexed_context, created_at, updated_at FROM repositories ORDER BY id ASC'
  ).all();
  return results.map(parseRepo);
}

export async function getRepository(db, id) {
  const row = await db.prepare(
    'SELECT id, name, url, urls, components, description, developer_notes, indexed_context, created_at, updated_at FROM repositories WHERE id = ?'
  ).bind(id).first();
  if (!row) return null;
  return parseRepo(row);
}

export async function createRepository(db, name, url, description) {
  const result = await db.prepare(
    "INSERT INTO repositories (name, url, description) VALUES (?, ?, ?)"
  ).bind(name, url, description || null).run();
  return result.meta.last_row_id;
}

export async function upsertIndexedContext(db, id, context) {
  await db.prepare(
    "UPDATE repositories SET indexed_context = ?, updated_at = datetime('now') WHERE id = ?"
  ).bind(JSON.stringify(context), id).run();
}

// Update mutable fields: urls, components, and/or developer notes.
// Pass undefined for a field to leave it unchanged.
export async function updateRepository(db, id, { urls, components, developer_notes }) {
  const sets = [];
  const binds = [];

  if (urls !== undefined) {
    sets.push('urls = ?');
    binds.push(urls === null ? null : JSON.stringify(urls));
  }
  if (components !== undefined) {
    sets.push('components = ?');
    binds.push(components === null ? null : JSON.stringify(components));
  }
  if (developer_notes !== undefined) {
    sets.push('developer_notes = ?');
    binds.push(developer_notes);
  }
  if (sets.length === 0) return;

  sets.push("updated_at = datetime('now')");
  binds.push(id);
  await db.prepare(
    `UPDATE repositories SET ${sets.join(', ')} WHERE id = ?`
  ).bind(...binds).run();
}

// ── Developer Lens ────────────────────────────────────────────────────────────

export async function getDeveloperLens(db) {
  const row = await db.prepare(
    'SELECT id, investigation_style, explanation_style, developer_notes, created_at, updated_at FROM developer_lens ORDER BY id ASC LIMIT 1'
  ).first();
  return row || null;
}

export async function upsertDeveloperLens(db, investigation_style, explanation_style, developer_notes) {
  const existing = await db.prepare(
    'SELECT id FROM developer_lens LIMIT 1'
  ).first();

  if (existing) {
    await db.prepare(
      "UPDATE developer_lens SET investigation_style = ?, explanation_style = ?, developer_notes = ?, updated_at = datetime('now') WHERE id = ?"
    ).bind(investigation_style, explanation_style, developer_notes ?? null, existing.id).run();
    return existing.id;
  } else {
    const result = await db.prepare(
      'INSERT INTO developer_lens (investigation_style, explanation_style, developer_notes) VALUES (?, ?, ?)'
    ).bind(investigation_style, explanation_style, developer_notes ?? null).run();
    return result.meta.last_row_id;
  }
}

// ── Analysis Results ──────────────────────────────────────────────────────────

export async function saveAnalysisResult(db, repo_id, question, audience, result) {
  const res = await db.prepare(
    "INSERT INTO analysis_results (repo_id, question, audience, result) VALUES (?, ?, ?, ?)"
  ).bind(repo_id, question, audience, JSON.stringify(result)).run();
  return res.meta.last_row_id;
}

export async function getAnalysisResults(db, repo_id) {
  const { results } = await db.prepare(
    'SELECT id, repo_id, question, audience, result, created_at FROM analysis_results WHERE repo_id = ? ORDER BY id DESC LIMIT 50'
  ).bind(repo_id).all();
  return results.map(r => ({ ...r, result: JSON.parse(r.result) }));
}

export async function getAllAnalysisResults(db) {
  const { results } = await db.prepare(
    'SELECT id, repo_id, question, audience, result, created_at FROM analysis_results ORDER BY id DESC LIMIT 100'
  ).all();
  return results.map(r => ({ ...r, result: JSON.parse(r.result) }));
}

// ── Lens Shares ───────────────────────────────────────────────────────────────

export async function createShare(db, lens_id, label, snapshot) {
  // Generate a short random slug — 8 hex chars from Math.random, collision probability negligible
  const id = Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 6);
  await db.prepare(
    "INSERT INTO lens_shares (id, lens_id, label, snapshot) VALUES (?, ?, ?, ?)"
  ).bind(id, lens_id, label || null, JSON.stringify(snapshot)).run();
  return id;
}

export async function getShare(db, id) {
  const row = await db.prepare(
    'SELECT id, lens_id, label, snapshot, created_at FROM lens_shares WHERE id = ?'
  ).bind(id).first();
  if (!row) return null;
  return { ...row, snapshot: JSON.parse(row.snapshot) };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseRepo(row) {
  return {
    ...row,
    urls: row.urls ? JSON.parse(row.urls) : [],
    components: row.components ? JSON.parse(row.components) : [],
    indexed_context: row.indexed_context ? JSON.parse(row.indexed_context) : null,
  };
}

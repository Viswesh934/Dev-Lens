// db/queries.js — thin wrappers around D1 SQL

// ── Repositories ─────────────────────────────────────────────────────────────

export async function getRepositories(db) {
  const { results } = await db.prepare(
    'SELECT id, name, url, urls, description, developer_notes, indexed_context, created_at, updated_at FROM repositories ORDER BY id ASC'
  ).all();
  return results.map(parseRepo);
}

export async function getRepository(db, id) {
  const row = await db.prepare(
    'SELECT id, name, url, urls, description, developer_notes, indexed_context, created_at, updated_at FROM repositories WHERE id = ?'
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

// Update mutable fields: urls list and/or developer notes.
// Pass null for a field to leave it unchanged.
export async function updateRepository(db, id, { urls, developer_notes }) {
  const sets = [];
  const binds = [];

  if (urls !== undefined) {
    sets.push('urls = ?');
    binds.push(urls === null ? null : JSON.stringify(urls));
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

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseRepo(row) {
  return {
    ...row,
    urls: row.urls ? JSON.parse(row.urls) : [],
    indexed_context: row.indexed_context ? JSON.parse(row.indexed_context) : null,
  };
}

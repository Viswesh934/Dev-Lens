// routes/repositories.js

import {
  getRepositories,
  getRepository,
  createRepository,
  upsertIndexedContext,
  updateRepository,
} from '../db/queries.js';
import { indexRepository } from '../indexer/index.js';

export async function handleRepositories(request, env) {
  const url = new URL(request.url);
  const pathParts = url.pathname.replace(/^\/api\/repositories\/?/, '').split('/').filter(Boolean);
  const method = request.method;

  // GET /api/repositories
  if (pathParts.length === 0 && method === 'GET') {
    const repos = await getRepositories(env.DB);
    return jsonResponse(repos);
  }

  // POST /api/repositories — create a new repository
  if (pathParts.length === 0 && method === 'POST') {
    let body;
    try { body = await request.json(); } catch { return errorResponse('Invalid JSON body'); }

    const { name, url: repoUrl, description, urls } = body;
    if (!name || typeof name !== 'string' || !name.trim()) return errorResponse('name is required');
    if (!repoUrl || typeof repoUrl !== 'string' || !repoUrl.trim()) return errorResponse('url is required');

    const id = await createRepository(env.DB, name.trim(), repoUrl.trim(), description?.trim() || null);

    // If extra urls were supplied, persist them right away
    if (Array.isArray(urls) && urls.length > 0) {
      await updateRepository(env.DB, id, { urls });
    }

    const created = await getRepository(env.DB, id);
    return jsonResponse(created, 201);
  }

  // GET /api/repositories/:id
  if (pathParts.length === 1 && method === 'GET') {
    const repo = await getRepository(env.DB, pathParts[0]);
    if (!repo) return notFound('Repository not found');
    return jsonResponse(repo);
  }

  // PATCH /api/repositories/:id — update urls and/or developer_notes
  if (pathParts.length === 1 && method === 'PATCH') {
    const repo = await getRepository(env.DB, pathParts[0]);
    if (!repo) return notFound('Repository not found');

    let body;
    try { body = await request.json(); } catch { return errorResponse('Invalid JSON body'); }

    const patch = {};
    if ('urls' in body) {
      if (!Array.isArray(body.urls)) return errorResponse('urls must be an array');
      patch.urls = body.urls.map(u => String(u).trim()).filter(Boolean);
    }
    if ('developer_notes' in body) {
      if (typeof body.developer_notes !== 'string') return errorResponse('developer_notes must be a string');
      patch.developer_notes = body.developer_notes;
    }

    await updateRepository(env.DB, pathParts[0], patch);
    const updated = await getRepository(env.DB, pathParts[0]);
    return jsonResponse(updated);
  }

  // POST /api/repositories/:id/index
  if (pathParts.length === 2 && pathParts[1] === 'index' && method === 'POST') {
    const repo = await getRepository(env.DB, pathParts[0]);
    if (!repo) return notFound('Repository not found');

    // Index the primary URL plus any additional urls
    const allUrls = [repo.url, ...(repo.urls || [])].filter(Boolean);
    const uniqueUrls = [...new Set(allUrls)];

    try {
      const githubToken = env.GITHUB_TOKEN || null;

      // Index all URLs and merge their contexts
      const contexts = await Promise.all(
        uniqueUrls.map(u => indexRepository(u, githubToken).catch(err => ({ _error: err.message, url: u })))
      );

      // Primary context is the first (main) URL
      const primary = contexts[0];
      if (primary._error) throw new Error(primary._error);

      // Attach sibling contexts if there are multiple URLs
      if (contexts.length > 1) {
        primary.sibling_repos = contexts.slice(1).map(c => c._error
          ? { url: c.url, error: c._error }
          : { url: c.url, name: c.name, description: c.description, primary_languages: c.primary_languages, entry_points: c.entry_points, directory_tree: c.directory_tree }
        );
      }

      await upsertIndexedContext(env.DB, pathParts[0], primary);
      const updated = await getRepository(env.DB, pathParts[0]);
      return jsonResponse(updated);
    } catch (err) {
      return errorResponse(`Indexing failed: ${err.message}`, 500);
    }
  }

  return notFound();
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function notFound(msg = 'Not found') {
  return new Response(JSON.stringify({ error: msg }), {
    status: 404,
    headers: { 'Content-Type': 'application/json' },
  });
}

function errorResponse(msg, status = 400) {
  return new Response(JSON.stringify({ error: msg }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

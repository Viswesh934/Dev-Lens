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

    const { name, url: repoUrl, description, urls, components } = body;
    if (!name || typeof name !== 'string' || !name.trim()) return errorResponse('name is required');
    if (!repoUrl || typeof repoUrl !== 'string' || !repoUrl.trim()) return errorResponse('url is required');

    const id = await createRepository(env.DB, name.trim(), repoUrl.trim(), description?.trim() || null);

    const patch = {};
    if (Array.isArray(urls) && urls.length > 0) patch.urls = urls;
    if (Array.isArray(components) && components.length > 0) patch.components = components;
    if (Object.keys(patch).length > 0) await updateRepository(env.DB, id, patch);

    const created = await getRepository(env.DB, id);
    return jsonResponse(created, 201);
  }

  // GET /api/repositories/:id
  if (pathParts.length === 1 && method === 'GET') {
    const repo = await getRepository(env.DB, pathParts[0]);
    if (!repo) return notFound('Repository not found');
    return jsonResponse(repo);
  }

  // PATCH /api/repositories/:id — update urls, components, and/or developer_notes
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
    if ('components' in body) {
      if (!Array.isArray(body.components)) return errorResponse('components must be an array');
      const VALID_ROLES = ['frontend', 'backend', 'worker', 'infra', 'other'];
      for (const c of body.components) {
        if (!c.name || !c.url) return errorResponse('each component requires name and url');
        if (c.role && !VALID_ROLES.includes(c.role)) return errorResponse(`invalid role "${c.role}"`);
      }
      patch.components = body.components.map(c => ({
        name: String(c.name).trim(),
        role: c.role || 'other',
        url: String(c.url).trim(),
      }));
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

    // Build URL list — prefer structured components if present, fall back to flat urls
    let urlsToIndex;
    if (repo.components && repo.components.length > 0) {
      // Primary URL is always first; dedupe against component URLs
      const componentUrls = repo.components.map(c => c.url);
      const allUrls = [repo.url, ...componentUrls];
      urlsToIndex = [...new Set(allUrls.filter(Boolean))];
    } else {
      const allUrls = [repo.url, ...(repo.urls || [])].filter(Boolean);
      urlsToIndex = [...new Set(allUrls)];
    }

    try {
      const githubToken = env.GITHUB_TOKEN || null;

      const contexts = await Promise.all(
        urlsToIndex.map(u => indexRepository(u, githubToken).catch(err => ({ _error: err.message, url: u })))
      );

      const primary = contexts[0];
      if (primary._error) throw new Error(primary._error);

      // Attach sibling contexts enriched with component metadata if available
      if (contexts.length > 1) {
        primary.sibling_repos = contexts.slice(1).map((c, i) => {
          // i+1 because contexts[0] is primary; map back to components array (index i)
          const comp = repo.components?.[i] || null;
          if (c._error) return { url: c.url, error: c._error, ...(comp ? { name: comp.name, role: comp.role } : {}) };
          return {
            url: c.url,
            name: comp?.name || c.name,
            role: comp?.role || null,
            description: c.description,
            primary_languages: c.primary_languages,
            entry_points: c.entry_points,
            directory_tree: c.directory_tree,
          };
        });
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

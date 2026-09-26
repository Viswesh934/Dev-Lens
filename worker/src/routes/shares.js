// routes/shares.js — GET /api/shares/:id (public, no auth)

import { getShare } from '../db/queries.js';

export async function handleShares(request, env) {
  const url = new URL(request.url);
  const id = url.pathname.replace(/^\/api\/shares\//, '').split('/')[0];

  if (!id) {
    return new Response(JSON.stringify({ error: 'Share id is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (request.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const share = await getShare(env.DB, id);
  if (!share) {
    return new Response(JSON.stringify({ error: 'Share not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify(share), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

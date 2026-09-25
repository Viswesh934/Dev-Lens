// routes/developerLens.js

import { getDeveloperLens, upsertDeveloperLens } from '../db/queries.js';

export async function handleDeveloperLens(request, env) {
  const method = request.method;

  // GET /api/developer-lens
  if (method === 'GET') {
    const lens = await getDeveloperLens(env.DB);
    if (!lens) {
      return jsonResponse({
        id: null,
        investigation_style: '',
        explanation_style: '',
        created_at: null,
        updated_at: null,
      });
    }
    return jsonResponse(lens);
  }

  // PUT /api/developer-lens
  if (method === 'PUT') {
    let body;
    try {
      body = await request.json();
    } catch {
      return errorResponse('Invalid JSON body');
    }

    const { investigation_style, explanation_style, developer_notes } = body;
    if (typeof investigation_style !== 'string' || typeof explanation_style !== 'string') {
      return errorResponse('investigation_style and explanation_style are required strings');
    }

    await upsertDeveloperLens(
      env.DB,
      investigation_style.trim(),
      explanation_style.trim(),
      typeof developer_notes === 'string' ? developer_notes : null
    );
    const updated = await getDeveloperLens(env.DB);
    return jsonResponse(updated);
  }

  return new Response(JSON.stringify({ error: 'Method not allowed' }), {
    status: 405,
    headers: { 'Content-Type': 'application/json' },
  });
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function errorResponse(msg, status = 400) {
  return new Response(JSON.stringify({ error: msg }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

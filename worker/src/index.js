// worker/src/index.js — Cloudflare Worker entry point

import { handleRepositories } from './routes/repositories.js';
import { handleDeveloperLens } from './routes/developerLens.js';
import { handleAnalyze } from './routes/analyze.js';
import { handleShares } from './routes/shares.js';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, PUT, POST, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default {
  async fetch(request, env) {
    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    let response;

    try {
      if (path.startsWith('/api/repositories')) {
        response = await handleRepositories(request, env);
      } else if (path.startsWith('/api/developer-lens')) {
        response = await handleDeveloperLens(request, env);
      } else if (path.startsWith('/api/analyze')) {
        response = await handleAnalyze(request, env);
      } else if (path.startsWith('/api/shares/')) {
        response = await handleShares(request, env);
      } else {
        response = new Response(JSON.stringify({ error: 'Not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    } catch (err) {
      console.error('Unhandled error:', err);
      response = new Response(JSON.stringify({ error: 'Internal server error', detail: err.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Attach CORS headers to every response
    const corsed = new Response(response.body, response);
    Object.entries(CORS_HEADERS).forEach(([k, v]) => corsed.headers.set(k, v));
    return corsed;
  },
};

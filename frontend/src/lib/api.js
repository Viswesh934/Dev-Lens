// lib/api.js — thin fetch wrappers for the DevLens API

const BASE = import.meta.env.VITE_API_BASE_URL || '/api';

async function request(method, path, body) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };

  if (body !== undefined) {
    opts.body = JSON.stringify(body);
  }

  const res = await fetch(`${BASE}${path}`, opts);
  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.error || `Request failed: ${res.status}`);
  }

  return data;
}

export const api = {
  // Repositories
  getRepositories: () => request('GET', '/repositories'),
  getRepository: (id) => request('GET', `/repositories/${id}`),
  createRepository: (name, url, description, urls) =>
    request('POST', '/repositories', { name, url, description, urls }),
  updateRepository: (id, patch) =>
    request('PATCH', `/repositories/${id}`, patch),
  indexRepository: (id) =>
    request('POST', `/repositories/${id}/index`),

  // Developer lens
  getDeveloperLens: () => request('GET', '/developer-lens'),
  saveDeveloperLens: (
    investigation_style,
    explanation_style,
    developer_notes
  ) =>
    request('PUT', '/developer-lens', {
      investigation_style,
      explanation_style,
      developer_notes,
    }),

  // Analysis
  analyze: (question, repoId, audience) =>
    request('POST', '/analyze', { question, repoId, audience }),
};
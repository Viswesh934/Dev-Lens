// routes/analyze.js — POST /api/analyze

import { getRepository } from '../db/queries.js';
import { getDeveloperLens } from '../db/queries.js';

const AUDIENCE_HINTS = {
  Developer: 'Use precise technical language, reference files and code patterns, include implementation details.',
  PM: 'Avoid code. Focus on what changes, what it enables, rough effort, and risks in plain English.',
  Manager: 'Focus on timeline, team impact, risk, and business value. One or two sentences per section.',
  Client: 'Avoid all technical terms. Explain what will work differently from the user\'s perspective.',
  Support: 'Focus on what could go wrong, what error cases exist, and what support staff need to know.',
};

export async function handleAnalyze(request, env) {
  if (request.method !== 'POST') {
    return errorResponse('Method not allowed', 405);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return errorResponse('Invalid JSON body');
  }

  const { question, repoId, audience } = body;

  if (!question || typeof question !== 'string' || !question.trim()) {
    return errorResponse('question is required');
  }
  if (!repoId) {
    return errorResponse('repoId is required');
  }

  if (!env.OPENROUTER_API_KEY) {
    return errorResponse('OPENROUTER_API_KEY is not configured.', 503);
  }

  const [repo, lens] = await Promise.all([
    getRepository(env.DB, repoId),
    getDeveloperLens(env.DB),
  ]);

  if (!repo) {
    return errorResponse('Repository not found', 404);
  }

  const audienceKey = AUDIENCE_HINTS[audience] ? audience : 'Developer';
  const audienceHint = AUDIENCE_HINTS[audienceKey];

  const context = repo.indexed_context;
  const contextSummary = context
    ? buildContextSummary(context)
    : `Repository: ${repo.name} (${repo.url}). No indexed context available — answer from the repository name and URL only.`;

  const investigationStyle = lens?.investigation_style || '';
  const explanationStyle = lens?.explanation_style || '';
  const lensNotes = lens?.developer_notes || '';
  const repoNotes = repo.developer_notes || '';

  const systemPrompt = `You are DevLens, a developer tool that explains engineering impact to different audiences.
You have been given a developer's investigation style, explanation style, and optional freeform developer notes as their "lens" — use it to shape your analysis.
Always return valid JSON matching the exact schema specified. No markdown, no prose outside JSON.`;

  const userPrompt = `## Repository Context
${contextSummary}
${repoNotes ? `\n## Developer Notes (this repo)\n${repoNotes}` : ''}

## Developer Lens
Investigation style: ${investigationStyle || '(not set)'}
Explanation style: ${explanationStyle || '(not set)'}
${lensNotes ? `Global developer notes: ${lensNotes}` : ''}

## Request
Question: ${question.trim()}
Audience: ${audienceKey}
Audience guidance: ${audienceHint}

## Instructions
Analyze the question against the repository context using the developer lens.
Return ONLY a JSON object with these exact keys:
{
  "current_system": "...",
  "what_would_change": "...",
  "affected_areas": "...",
  "effort": "...",
  "risks": "...",
  "unknowns": "...",
  "developer_reasoning": "..."
}
Each value is a string of 1–4 sentences tailored to the ${audienceKey} audience.
"developer_reasoning" is always written for a developer regardless of audience — it is the internal reasoning trace.`;

  let raw;
  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${env.OPENROUTER_API_KEY}`,
        'HTTP-Referer': 'https://devlens.dev',
        'X-Title': 'DevLens',
      },
      body: JSON.stringify({
        model: 'openai/gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        max_tokens: 1024,
      }),
    });
    if (!res.ok) {
      const errText = await res.text();
      return errorResponse(`OpenRouter error ${res.status}: ${errText}`, 502);
    }
    const json = await res.json();
    raw = json.choices[0].message.content;
  } catch (err) {
    return errorResponse(`AI call failed: ${err.message}`, 502);
  }

  let result;
  try {
    // Strip markdown code fences if the model wrapped the JSON
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
    result = JSON.parse(cleaned);
  } catch {
    // Return raw text so the frontend can at least show something
    return jsonResponse({ raw, parseError: true });
  }

  return jsonResponse(result);
}

function buildContextSummary(ctx) {
  const lines = [];
  lines.push(`Name: ${ctx.name}`);
  lines.push(`URL: ${ctx.url}`);
  if (ctx.description) lines.push(`Description: ${ctx.description}`);
  if (ctx.primary_languages?.length) lines.push(`Languages: ${ctx.primary_languages.join(', ')}`);
  if (ctx.topics?.length) lines.push(`Topics: ${ctx.topics.join(', ')}`);
  if (ctx.directory_tree?.length) lines.push(`Top-level directories: ${ctx.directory_tree.join(', ')}`);
  if (ctx.important_files?.length) lines.push(`Key files: ${ctx.important_files.join(', ')}`);
  if (ctx.entry_points?.length) lines.push(`Entry points: ${ctx.entry_points.join(', ')}`);
  if (ctx.dependency_manifests?.length) lines.push(`Dependency manifests: ${ctx.dependency_manifests.join(', ')}`);
  if (ctx.test_locations?.length) lines.push(`Test locations: ${ctx.test_locations.join(', ')}`);
  if (ctx.recent_commits?.length) {
    const commits = ctx.recent_commits.slice(0, 5)
      .map(c => `  [${c.sha}] ${c.message} (${c.author})`).join('\n');
    lines.push(`Recent commits:\n${commits}`);
  }
  if (ctx.readme_excerpt) {
    lines.push(`README excerpt:\n${ctx.readme_excerpt.slice(0, 800)}`);
  }
  return lines.join('\n');
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

// routes/analyze.js — POST /api/analyze
//
// Pipeline:
//   1. Load repository context + developer lens
//   2. Run primary analysis (OpenRouter / gpt-4o-mini)
//   3. Extract claims from the primary result
//   4. Run Granite evidence validator in parallel with step 2 where possible,
//      or sequentially after — Granite is non-fatal
//   5. Return combined { analysis, evidence, validation }

import { getRepository, getDeveloperLens, saveAnalysisResult, getAnalysisResults } from '../db/queries.js';
import { validateEvidence } from '../ai/granite.js';

const AUDIENCE_HINTS = {
  Developer: 'Use precise technical language, reference files and code patterns, include implementation details.',
  PM: 'Avoid code. Focus on what changes, what it enables, rough effort, and risks in plain English.',
  Manager: 'Focus on timeline, team impact, risk, and business value. One or two sentences per section.',
  Client: 'Avoid all technical terms. Explain what will work differently from the user\'s perspective.',
  Support: 'Focus on what could go wrong, what error cases exist, and what support staff need to know.',
};

export async function handleAnalyze(request, env) {
  const url = new URL(request.url);

  // GET /api/analyze?repoId=1 — return saved results for a repo
  if (request.method === 'GET') {
    const repoId = url.searchParams.get('repoId');
    if (!repoId) return errorResponse('repoId query param is required');
    const results = await getAnalysisResults(env.DB, repoId);
    return jsonResponse(results);
  }

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

  const componentSummary = (repo.components || []).length > 0
    ? `\n## Project Components\n${repo.components.map(c => `- ${c.name} (${c.role}): ${c.url}`).join('\n')}`
    : '';

  const investigationStyle = lens?.investigation_style || '';
  const explanationStyle = lens?.explanation_style || '';
  const lensNotes = lens?.developer_notes || '';
  const repoNotes = repo.developer_notes || '';

  // ── Primary analysis prompt ───────────────────────────────────────────────

  const systemPrompt = `You are DevLens, a developer tool that explains engineering impact to different audiences.
You have been given a developer's investigation style, explanation style, and optional freeform developer notes as their "lens" — use it to shape your analysis.
Always return valid JSON matching the exact schema specified. No markdown, no prose outside JSON.`;

  const userPrompt = `## Repository Context
${contextSummary}
${componentSummary}
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

  // ── Run primary analysis ──────────────────────────────────────────────────

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

  let analysis;
  try {
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
    analysis = JSON.parse(cleaned);
  } catch {
    // Primary parse failed — return raw, no validation
    return jsonResponse({ raw, parseError: true, validation: unavailableValidation('primary_parse_failed') });
  }

  // ── Extract claims for Granite ────────────────────────────────────────────
  // Derive compact claims from the primary result + indexed context.
  // These are the statements Granite will validate against the evidence.

  const evidence = buildEvidence(context);
  const claims = buildClaims(analysis, context, question.trim());

  // ── Run Granite validation (non-fatal, runs after primary succeeds) ───────

  const validation = await validateEvidence(
    {
      question: question.trim(),
      repository: { name: repo.name, context: { name: context?.name, url: context?.url } },
      claims,
      analysis,
    },
    env
  );

  // ── Persist full result ───────────────────────────────────────────────────

  try {
    await saveAnalysisResult(env.DB, repoId, question.trim(), audienceKey, { analysis, evidence, validation });
  } catch {
    // Non-fatal
  }

  return jsonResponse({ analysis, evidence, validation });
}

// ── Claim extractor ───────────────────────────────────────────────────────────
// Builds a compact list of verifiable claims from the primary analysis output
// and any indexed evidence available in the repository context.

function buildClaims(analysis, context, question) {
  const claims = [];

  // Derive one claim per major analysis section that contains substantive text
  const sections = [
    { id: 'claim-current', field: 'current_system',    label: 'Current system state' },
    { id: 'claim-change',  field: 'what_would_change', label: 'What would change' },
    { id: 'claim-areas',   field: 'affected_areas',    label: 'Affected areas' },
    { id: 'claim-risks',   field: 'risks',             label: 'Risks' },
  ];

  for (const s of sections) {
    const text = analysis[s.field];
    if (!text || typeof text !== 'string' || text.length < 10) continue;

    // Attach supporting evidence from the indexed context where relevant
    const evidence = buildEvidenceForClaim(s.field, context);

    claims.push({
      id: s.id,
      claim: `[${s.label}] ${text}`,
      evidence,
    });
  }

  return claims;
}

function buildEvidenceForClaim(field, context) {
  if (!context) return [];
  const ev = [];

  if (field === 'claim-current' || field === 'current_system') {
    if (context.entry_points?.length) {
      ev.push({ file: context.entry_points[0], excerpt: `Entry point: ${context.entry_points[0]}` });
    }
    if (context.primary_languages?.length) {
      ev.push({ file: 'repository metadata', excerpt: `Languages: ${context.primary_languages.join(', ')}` });
    }
  }

  if (field === 'claim-areas' || field === 'affected_areas') {
    if (context.directory_tree?.length) {
      ev.push({ file: 'directory structure', excerpt: context.directory_tree.slice(0, 5).join(', ') });
    }
    if (context.important_files?.length) {
      ev.push({ file: 'key files', excerpt: context.important_files.slice(0, 4).join(', ') });
    }
  }

  if (field === 'claim-risks' || field === 'risks') {
    if (context.test_locations?.length) {
      ev.push({ file: context.test_locations[0], excerpt: `Test coverage at: ${context.test_locations[0]}` });
    }
    if (context.dependency_manifests?.length) {
      ev.push({ file: context.dependency_manifests[0], excerpt: `Dependencies declared in: ${context.dependency_manifests[0]}` });
    }
  }

  return ev;
}

// ── Evidence list builder ─────────────────────────────────────────────────────
// Builds a flat evidence list for the UI — derived from indexed context.

function buildEvidence(context) {
  if (!context) return [];
  const ev = [];

  if (context.entry_points?.length) {
    for (const ep of context.entry_points.slice(0, 3)) {
      ev.push({ type: 'entry_point', file: typeof ep === 'string' ? ep : ep.path, label: 'Entry Point' });
    }
  }
  if (context.important_files?.length) {
    for (const f of context.important_files.slice(0, 4)) {
      ev.push({ type: 'file', file: f, label: 'Key File' });
    }
  }
  if (context.dependency_manifests?.length) {
    for (const d of context.dependency_manifests.slice(0, 2)) {
      ev.push({ type: 'manifest', file: d, label: 'Dependency Manifest' });
    }
  }
  if (context.test_locations?.length) {
    for (const t of context.test_locations.slice(0, 2)) {
      ev.push({ type: 'tests', file: t, label: 'Tests' });
    }
  }

  return ev;
}

// ── Context summary ───────────────────────────────────────────────────────────

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

// ── Helpers ───────────────────────────────────────────────────────────────────

function unavailableValidation(reason) {
  return { status: 'unavailable', provider: 'huggingface', model: 'granite', reason };
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

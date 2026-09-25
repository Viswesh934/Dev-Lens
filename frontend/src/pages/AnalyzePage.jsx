// pages/AnalyzePage.jsx

import { useState } from 'react';
import { api } from '../lib/api.js';

const AUDIENCES = ['Developer', 'PM', 'Manager', 'Client', 'Support'];

const RESULT_SECTIONS = [
  { key: 'current_system',      label: 'Current System' },
  { key: 'what_would_change',   label: 'What Would Change' },
  { key: 'affected_areas',      label: 'Affected Areas' },
  { key: 'effort',              label: 'Effort' },
  { key: 'risks',               label: 'Risks' },
  { key: 'unknowns',            label: 'Unknowns' },
  { key: 'developer_reasoning', label: 'Developer Reasoning' },
];

export default function AnalyzePage({ repositories, selectedRepoId, onSelectRepo }) {
  const [question, setQuestion] = useState('');
  const [audience, setAudience] = useState('PM');
  const [status, setStatus] = useState('idle'); // idle | loading | done | error
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const selectedRepo = repositories.find(r => r.id === selectedRepoId);

  async function handleAnalyze() {
    if (!question.trim() || !selectedRepoId) return;
    setStatus('loading');
    setResult(null);
    setError(null);
    try {
      const data = await api.analyze(question.trim(), selectedRepoId, audience);
      setResult(data);
      setStatus('done');
    } catch (err) {
      setError(err.message);
      setStatus('error');
    }
  }

  return (
    <div>
      <div className="section">
        <h2>Analyze</h2>
        <p>Ask a question about the codebase. DevLens will use the repository context and your developer lens to explain it.</p>
      </div>

      <div className="section">
        <label className="field-label">Repository</label>
        <select
          value={selectedRepoId || ''}
          onChange={e => onSelectRepo(Number(e.target.value))}
          style={{ maxWidth: 280 }}
        >
          {repositories.map(r => (
            <option key={r.id} value={r.id}>{r.name}</option>
          ))}
        </select>
        {selectedRepo && (
          <div style={{ marginTop: 6, fontSize: 12, color: 'var(--muted)' }}>
            <a href={selectedRepo.url} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)' }}>
              {selectedRepo.url}
            </a>
            {selectedRepo.indexed_context && (
              <span style={{ marginLeft: 10 }}>
                · {selectedRepo.indexed_context.indexing_status === 'indexed' ? '✓ indexed' : 'pre-indexed context'}
              </span>
            )}
          </div>
        )}
      </div>

      <div className="section">
        <label className="field-label">What do you need to understand?</label>
        <textarea
          rows={4}
          placeholder="PM wants bulk CSV customer import. What would this involve?"
          value={question}
          onChange={e => setQuestion(e.target.value)}
        />
        <div style={{ marginTop: 6, fontSize: 12, color: 'var(--muted)' }}>
          Examples: "Why is this API slow?" · "Can we add Google login?" · "What would break if we removed this service?" · "Explain this architecture to a client."
        </div>
      </div>

      <div className="section">
        <label className="field-label">Audience</label>
        <div className="audience-options">
          {AUDIENCES.map(a => (
            <button
              key={a}
              className={`audience-btn${audience === a ? ' selected' : ''}`}
              onClick={() => setAudience(a)}
            >
              {a}
            </button>
          ))}
        </div>
      </div>

      <div className="section">
        <button
          className="btn"
          onClick={handleAnalyze}
          disabled={!question.trim() || !selectedRepoId || status === 'loading'}
        >
          {status === 'loading' ? 'Analyzing…' : 'Analyze'}
        </button>
      </div>

      {status === 'error' && (
        <div className="notice error" style={{ marginBottom: 20 }}>
          {error}
        </div>
      )}

      {(status === 'loading' || status === 'done') && (
        <div className="analysis-result">
          <div className="analysis-result-header">
            Analysis · {selectedRepo?.name} · Audience: {audience}
          </div>
          <div className="analysis-result-body">
            {RESULT_SECTIONS.map(s => (
              <div className="result-section" key={s.key}>
                <div className="result-section-title">{s.label}</div>
                {status === 'loading' || !result ? (
                  <div className="result-placeholder" />
                ) : result.parseError ? (
                  <p className="result-text">{result.raw}</p>
                ) : (
                  <p className="result-text">{result[s.key] || '—'}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

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

const ROLE_COLORS = {
  frontend: 'var(--accent)',
  backend: 'var(--accent2)',
  worker: 'var(--green)',
  infra: 'var(--muted)',
  other: 'var(--text)',
};

const CLASSIFICATION_ICON = {
  SUPPORTED:            { icon: '✓', label: 'Supported',             color: 'var(--green)' },
  WEAKLY_SUPPORTED:     { icon: '⚠', label: 'Weakly Supported',      color: '#f59e0b' },
  CONTRADICTED:         { icon: '✕', label: 'Contradicted',           color: 'var(--red)' },
  INSUFFICIENT_EVIDENCE:{ icon: '○', label: 'Insufficient Evidence',  color: 'var(--muted)' },
};

export default function AnalyzePage({ repositories, selectedRepoId, onSelectRepo }) {
  const [question, setQuestion] = useState('');
  const [audience, setAudience] = useState('PM');
  const [status, setStatus] = useState('idle'); // idle | loading | done | error
  const [result, setResult] = useState(null);   // { analysis, evidence, validation }
  const [error, setError] = useState(null);
  const [showValidationDetail, setShowValidationDetail] = useState(false);

  const selectedRepo = repositories.find(r => r.id === selectedRepoId);

  async function handleAnalyze() {
    if (!question.trim() || !selectedRepoId) return;
    setStatus('loading');
    setResult(null);
    setError(null);
    setShowValidationDetail(false);
    try {
      const data = await api.analyze(question.trim(), selectedRepoId, audience);
      setResult(data);
      setStatus('done');
    } catch (err) {
      setError(err.message);
      setStatus('error');
    }
  }

  function handleExportPdf() {
    window.print();
  }

  // Support both old shape (flat analysis object) and new shape ({ analysis, evidence, validation })
  const analysis = result?.analysis ?? result;
  const evidence = result?.evidence ?? [];
  const validation = result?.validation ?? null;

  return (
    <div>
      <div className="section">
        <h2>Analyze</h2>
        <p>Ask a question about the codebase. DevLens will use the repository context and your developer lens to explain it.</p>
      </div>

      <div className="section no-print">
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
            {(selectedRepo.components || []).length > 0 && (
              <div style={{ marginTop: 6, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {selectedRepo.components.map((c, i) => (
                  <span
                    key={i}
                    className="tag"
                    style={{ background: ROLE_COLORS[c.role] || 'var(--text)', color: '#fff', border: '2px solid var(--border)' }}
                    title={c.url}
                  >
                    {c.name}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="section no-print">
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

      <div className="section no-print">
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

      <div className="section no-print">
        <button
          className="btn"
          onClick={handleAnalyze}
          disabled={!question.trim() || !selectedRepoId || status === 'loading'}
        >
          {status === 'loading' ? 'Analyzing…' : 'Analyze'}
        </button>
      </div>

      {status === 'error' && (
        <div className="notice error no-print" style={{ marginBottom: 20 }}>
          {error}
        </div>
      )}

      {(status === 'loading' || status === 'done') && (
        <>
          {/* ── Primary analysis ── */}
          <div className="analysis-result">
            <div className="analysis-result-header">
              <span>Analysis · {selectedRepo?.name} · Audience: {audience}</span>
              {status === 'done' && (
                <button
                  className="btn btn-secondary no-print"
                  onClick={handleExportPdf}
                  style={{ fontSize: 11, padding: '4px 12px', marginLeft: 'auto' }}
                >
                  Export PDF
                </button>
              )}
            </div>
            <div className="analysis-result-body">
              {RESULT_SECTIONS.map(s => (
                <div className="result-section" key={s.key}>
                  <div className="result-section-title">{s.label}</div>
                  {status === 'loading' || !analysis ? (
                    <div className="result-placeholder" />
                  ) : analysis.parseError ? (
                    <p className="result-text">{analysis.raw}</p>
                  ) : (
                    <p className="result-text">{analysis[s.key] || '—'}</p>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* ── Evidence panel ── */}
          {status === 'done' && evidence.length > 0 && (
            <div className="validation-panel">
              <div className="validation-panel-title">Evidence</div>
              <div className="evidence-list">
                {evidence.map((e, i) => (
                  <div key={i} className="evidence-item">
                    <span className="evidence-icon">✓</span>
                    <span className="evidence-label">{e.label}</span>
                    <span className="evidence-file">{e.file}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Validation panel ── */}
          {status === 'done' && validation && (
            <ValidationPanel
              validation={validation}
              showDetail={showValidationDetail}
              onToggleDetail={() => setShowValidationDetail(v => !v)}
            />
          )}
        </>
      )}
    </div>
  );
}

// ── Validation panel ──────────────────────────────────────────────────────────

function ValidationPanel({ validation, showDetail, onToggleDetail }) {
  if (validation.status === 'unavailable') {
    return (
      <div className="validation-panel validation-unavailable">
        <div className="validation-panel-title">Evidence Validation</div>
        <div className="validation-status-row">
          <span className="validation-status-dot unavailable">○</span>
          <span>Validation unavailable</span>
        </div>
        <p style={{ fontSize: 12, color: 'var(--muted)', margin: '6px 0 0' }}>
          The primary analysis was generated successfully, but the secondary
          evidence validator was unavailable
          {validation.reason ? ` (${validation.reason.replace(/_/g, ' ')})` : ''}.
        </p>
      </div>
    );
  }

  if (validation.status !== 'completed') return null;

  const claims = validation.claims || [];
  const anomalies = validation.anomalies || [];
  const missing = validation.missingEvidence || [];

  const counts = {
    SUPPORTED: 0,
    WEAKLY_SUPPORTED: 0,
    CONTRADICTED: 0,
    INSUFFICIENT_EVIDENCE: 0,
  };
  for (const c of claims) {
    if (counts[c.classification] !== undefined) counts[c.classification]++;
  }

  return (
    <div className="validation-panel">
      <div className="validation-panel-title">
        Evidence Validation
        <span className="validation-badge">IBM Granite</span>
      </div>

      <div className="validation-status-row">
        <span className="validation-status-dot completed">●</span>
        <span style={{ fontWeight: 700, fontSize: 12 }}>Granite validation: Completed</span>
        {validation.latencyMs && (
          <span style={{ fontSize: 11, color: 'var(--muted)', marginLeft: 8 }}>
            {validation.latencyMs}ms
          </span>
        )}
      </div>

      <div className="validation-counts">
        {Object.entries(counts).map(([cls, n]) => {
          const meta = CLASSIFICATION_ICON[cls];
          return (
            <span key={cls} className="validation-count-item" style={{ color: meta.color }}>
              {meta.icon} {n} {meta.label.toLowerCase()}
            </span>
          );
        })}
      </div>

      {anomalies.length > 0 && (
        <div className="validation-anomaly-row">
          {anomalies.filter(a => a.severity === 'high').map((a, i) => (
            <span key={i} className="validation-anomaly high">⚑ {a.description}</span>
          ))}
        </div>
      )}

      <button
        className="btn btn-secondary"
        onClick={onToggleDetail}
        style={{ fontSize: 11, padding: '4px 12px', marginTop: 10 }}
      >
        {showDetail ? 'Hide validation details' : 'Show validation details'}
      </button>

      {showDetail && (
        <div className="validation-detail">
          {claims.length > 0 && (
            <div className="validation-detail-section">
              <div className="validation-detail-heading">Claims</div>
              {claims.map(c => {
                const meta = CLASSIFICATION_ICON[c.classification] || CLASSIFICATION_ICON.INSUFFICIENT_EVIDENCE;
                return (
                  <div key={c.claimId} className="validation-claim-row">
                    <span className="validation-claim-icon" style={{ color: meta.color }}>{meta.icon}</span>
                    <div className="validation-claim-body">
                      <div className="validation-claim-classification" style={{ color: meta.color }}>
                        {meta.label}
                      </div>
                      <div className="validation-claim-reason">{c.reason}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {anomalies.length > 0 && (
            <div className="validation-detail-section">
              <div className="validation-detail-heading">Anomalies</div>
              {anomalies.map((a, i) => (
                <div key={i} className={`validation-anomaly-detail sev-${a.severity}`}>
                  <span className="validation-anomaly-sev">{a.severity.toUpperCase()}</span>
                  {a.description}
                </div>
              ))}
            </div>
          )}

          {missing.length > 0 && (
            <div className="validation-detail-section">
              <div className="validation-detail-heading">Missing Evidence</div>
              {missing.map((m, i) => (
                <div key={i} className="validation-missing-item">
                  <span className="validation-missing-icon">○</span>
                  {m.description}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

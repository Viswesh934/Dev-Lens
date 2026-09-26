// pages/ReportPage.jsx — Report bot: generates a Paprize PDF report from saved analysis results

import { useState, useEffect } from 'react';
import {
  ReportRoot,
  Section,
  PageHeader,
  PageFooter,
  PageContent,
} from '@paprize/react';
import { pageSize, pageMargin } from '@paprize/core';
import { api } from '../lib/api.js';

const RESULT_SECTIONS = [
  { key: 'current_system',      label: 'Current System' },
  { key: 'what_would_change',   label: 'What Would Change' },
  { key: 'affected_areas',      label: 'Affected Areas' },
  { key: 'effort',              label: 'Effort' },
  { key: 'risks',               label: 'Risks' },
  { key: 'unknowns',            label: 'Unknowns' },
  { key: 'developer_reasoning', label: 'Developer Reasoning' },
];

export default function ReportPage({ repositories, selectedRepoId, onSelectRepo }) {
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [printing, setPrinting] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  const selectedRepo = repositories.find(r => r.id === selectedRepoId);

  // Load saved analysis results when repo changes
  useEffect(() => {
    if (!selectedRepoId) return;
    setLoading(true);
    setError(null);
    setResults([]);
    setSelectedIds(new Set());
    setShowPreview(false);
    api.getAnalysisResults(selectedRepoId)
      .then(data => {
        setResults(data);
        // Select all by default
        setSelectedIds(new Set(data.map(r => r.id)));
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [selectedRepoId]);

  function toggleSelect(id) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (selectedIds.size === results.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(results.map(r => r.id)));
    }
  }

  const selected = results.filter(r => selectedIds.has(r.id));

  function handleGenerateReport() {
    if (selected.length === 0) return;
    setShowPreview(true);
  }

  function handlePrint() {
    setPrinting(true);
    // Small delay so the report renders fully before print dialog
    setTimeout(() => {
      window.print();
      setPrinting(false);
    }, 200);
  }

  if (!selectedRepoId || repositories.length === 0) {
    return (
      <div>
        <div className="section">
          <h2>Report</h2>
          <p>Select a repository to generate a PDF report from its saved analysis results.</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="section no-print">
        <h2>Report</h2>
        <p>Select saved analysis results to include in a paginated PDF report, then generate and print.</p>
      </div>

      {/* ── Repo selector ── */}
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
      </div>

      {loading && <div className="loading no-print">Loading results…</div>}
      {error && <div className="notice error no-print">{error}</div>}

      {!loading && results.length === 0 && (
        <div className="notice no-print">
          No analysis results saved for <strong>{selectedRepo?.name}</strong> yet.
          Run some analyses in the Analyze tab first — they are automatically saved.
        </div>
      )}

      {!loading && results.length > 0 && (
        <div className="section no-print">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
            <label className="field-label" style={{ marginBottom: 0 }}>
              Select Results ({selectedIds.size} / {results.length})
            </label>
            <button className="btn btn-secondary" onClick={toggleAll} style={{ fontSize: 11, padding: '3px 10px' }}>
              {selectedIds.size === results.length ? 'Deselect All' : 'Select All'}
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {results.map(r => (
              <label key={r.id} className="result-select-row" style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 10,
                padding: '8px 12px',
                border: '2px solid var(--border)',
                background: selectedIds.has(r.id) ? 'var(--yellow)' : 'var(--surface)',
                cursor: 'pointer',
                fontFamily: 'var(--font)',
              }}>
                <input
                  type="checkbox"
                  checked={selectedIds.has(r.id)}
                  onChange={() => toggleSelect(r.id)}
                  style={{ marginTop: 2, flexShrink: 0 }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{r.question}</div>
                  <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                    Audience: {r.audience} · {new Date(r.created_at).toLocaleString()}
                  </div>
                </div>
              </label>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 14, alignItems: 'center' }}>
            <button
              className="btn"
              onClick={handleGenerateReport}
              disabled={selected.length === 0}
            >
              Preview Report
            </button>
            {showPreview && (
              <button
                className="btn btn-secondary"
                onClick={handlePrint}
                disabled={printing}
                style={{ fontSize: 12 }}
              >
                {printing ? 'Opening Print…' : 'Print / Save PDF'}
              </button>
            )}
            {showPreview && (
              <button
                className="btn btn-secondary"
                onClick={() => setShowPreview(false)}
                style={{ fontSize: 12 }}
              >
                Close Preview
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Paprize report preview ── */}
      {showPreview && selected.length > 0 && (
        <div className="report-preview-wrapper">
          <ReportRoot>
            <Section size={pageSize.A4} margin={pageMargin.Normal}>
              <PageHeader>
                <div className="report-page-header">
                  <span className="report-logo">Dev<span>Lens</span></span>
                  <span className="report-repo-name">{selectedRepo?.name}</span>
                  <span className="report-date">{new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</span>
                </div>
              </PageHeader>

              <PageFooter>
                <div className="report-page-footer">
                  DevLens · Analysis Report · {selectedRepo?.name}
                </div>
              </PageFooter>

              <PageContent>
                <div className="report-cover">
                  <div className="report-cover-title">Analysis Report</div>
                  <div className="report-cover-repo">{selectedRepo?.name}</div>
                  {selectedRepo?.indexed_context?.description && (
                    <div className="report-cover-desc">{selectedRepo.indexed_context.description}</div>
                  )}
                  <div className="report-cover-meta">
                    Generated {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
                    {' · '}{selected.length} analysis result{selected.length > 1 ? 's' : ''}
                  </div>
                </div>
              </PageContent>

              {selected.map((r, idx) => (
                <PageContent key={r.id}>
                  <div className="report-analysis-block">
                    <div className="report-analysis-question">
                      {idx + 1}. {r.question}
                    </div>
                    <div className="report-analysis-meta">
                      Audience: {r.audience} · {new Date(r.created_at).toLocaleString()}
                    </div>

                    <div className="report-sections-grid">
                      {RESULT_SECTIONS.filter(s => s.key !== 'developer_reasoning').map(s => (
                        <div className="report-section-cell" key={s.key}>
                          <div className="report-section-label">{s.label}</div>
                          <div className="report-section-text">{r.result[s.key] || '—'}</div>
                        </div>
                      ))}
                    </div>

                    {r.result.developer_reasoning && (
                      <div className="report-reasoning">
                        <div className="report-section-label">Developer Reasoning</div>
                        <div className="report-section-text">{r.result.developer_reasoning}</div>
                      </div>
                    )}
                  </div>
                </PageContent>
              ))}
            </Section>
          </ReportRoot>
        </div>
      )}
    </div>
  );
}

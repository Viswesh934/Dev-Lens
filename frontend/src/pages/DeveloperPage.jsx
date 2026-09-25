// pages/DeveloperPage.jsx

import { useState, useEffect } from 'react';
import { api } from '../lib/api.js';

const DEFAULT_INVESTIGATION = `When investigating a request, start from the relevant API or entry point. Trace the request through the controller/service/business logic and data layer. Look for existing patterns before proposing new ones. Inspect related tests and configuration. Check infrastructure and dependencies when they are relevant. Use git history when understanding why an implementation exists.`;

const DEFAULT_EXPLANATION = `Explain the user impact first. Avoid unnecessary technical jargon for PMs and clients. Explain technical dependencies when they materially affect scope, risk, or effort. Be explicit about uncertainty. Never invent repository facts.`;

export default function DeveloperPage() {
  const [investigation, setInvestigation] = useState('');
  const [explanation, setExplanation] = useState('');
  const [globalNotes, setGlobalNotes] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.getDeveloperLens()
      .then(lens => {
        setInvestigation(lens?.investigation_style || DEFAULT_INVESTIGATION);
        setExplanation(lens?.explanation_style || DEFAULT_EXPLANATION);
        setGlobalNotes(lens?.developer_notes || '');
      })
      .catch(() => {
        setInvestigation(DEFAULT_INVESTIGATION);
        setExplanation(DEFAULT_EXPLANATION);
      })
      .finally(() => setLoading(false));
  }, []);

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      await api.saveDeveloperLens(investigation, explanation, globalNotes);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="loading">Loading developer lens…</div>;
  }

  return (
    <div className="developer-form">
      <div className="section">
        <h2>Developer Lens</h2>
        <p>
          Define how you investigate and explain this codebase. DevLens uses this as context
          when generating analysis — ensuring explanations reflect how you actually think about the system.
        </p>
      </div>

      <div className="section">
        <label className="field-label">Investigation Style</label>
        <textarea
          rows={6}
          value={investigation}
          onChange={e => setInvestigation(e.target.value)}
          placeholder={DEFAULT_INVESTIGATION}
        />
        <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
          How do you approach understanding a new request against this codebase? Entry points, tracing patterns, what you look for.
        </div>
      </div>

      <div className="section">
        <label className="field-label">Explanation Style</label>
        <textarea
          rows={4}
          value={explanation}
          onChange={e => setExplanation(e.target.value)}
          placeholder={DEFAULT_EXPLANATION}
        />
        <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
          How should DevLens communicate findings? Tone, jargon level, what to emphasise.
        </div>
      </div>

      <div className="section">
        <label className="field-label">Global Developer Notes</label>
        <textarea
          rows={5}
          value={globalNotes}
          onChange={e => setGlobalNotes(e.target.value)}
          placeholder="Cross-cutting context that applies to all repos — e.g. team conventions, deployment process, on-call runbook location, known org constraints..."
        />
        <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
          These notes are appended to every analysis regardless of which repo is selected. Use for org-wide context. Per-repo notes live in the Context tab.
        </div>
      </div>

      <div className="save-row">
        <button className="btn" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving…' : 'Save Lens'}
        </button>
        {saved && <span className="save-confirmation">✓ Saved</span>}
        {error && <span style={{ fontSize: 13, color: 'var(--red)' }}>{error}</span>}
      </div>
    </div>
  );
}

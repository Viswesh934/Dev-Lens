// pages/ContextPage.jsx

import { useState } from 'react';
import { api } from '../lib/api.js';

const COMPONENT_ROLES = ['frontend', 'backend', 'worker', 'infra', 'other'];

export default function ContextPage({ repositories, selectedRepoId, onSelectRepo, onRepoUpdated, onRepoCreated }) {
  const [indexing, setIndexing] = useState(false);
  const [indexError, setIndexError] = useState(null);
  const [indexSuccess, setIndexSuccess] = useState(false);

  // Developer notes state
  const [notesSaving, setNotesSaving] = useState(false);
  const [notesSaved, setNotesSaved] = useState(false);
  const [notesError, setNotesError] = useState(null);
  const [notesValue, setNotesValue] = useState(null); // null = use repo value

  // Component manager state — local editable copy
  const [componentsDraft, setComponentsDraft] = useState(null); // null = use repo value
  const [compSaving, setCompSaving] = useState(false);
  const [compSaved, setCompSaved] = useState(false);
  const [compError, setCompError] = useState(null);

  // New repo form state
  const [showNewForm, setShowNewForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newUrl, setNewUrl] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState(null);

  const repo = repositories.find(r => r.id === selectedRepoId);
  const ctx = repo?.indexed_context;
  const currentNotes = notesValue !== null ? notesValue : (repo?.developer_notes || '');

  // Use local draft if set, otherwise repo's saved components
  const currentComponents = componentsDraft !== null
    ? componentsDraft
    : (repo?.components || []);

  // Reset local state when switching repos
  function handleSelectRepo(id) {
    setNotesValue(null);
    setNotesSaved(false);
    setNotesError(null);
    setComponentsDraft(null);
    setCompSaved(false);
    setCompError(null);
    onSelectRepo(id);
  }

  async function handleIndex() {
    if (!repo) return;
    setIndexing(true);
    setIndexError(null);
    setIndexSuccess(false);
    try {
      const updated = await api.indexRepository(repo.id);
      onRepoUpdated(updated);
      setIndexSuccess(true);
    } catch (err) {
      setIndexError(err.message);
    } finally {
      setIndexing(false);
    }
  }

  async function handleSaveNotes() {
    if (!repo) return;
    setNotesSaving(true);
    setNotesSaved(false);
    setNotesError(null);
    try {
      const updated = await api.updateRepository(repo.id, { developer_notes: currentNotes });
      onRepoUpdated(updated);
      setNotesValue(null);
      setNotesSaved(true);
      setTimeout(() => setNotesSaved(false), 3000);
    } catch (err) {
      setNotesError(err.message);
    } finally {
      setNotesSaving(false);
    }
  }

  // ── Component manager helpers ──

  function handleAddComponent() {
    setComponentsDraft([...currentComponents, { name: '', role: 'frontend', url: '' }]);
  }

  function handleUpdateComponent(index, field, value) {
    const next = currentComponents.map((c, i) => i === index ? { ...c, [field]: value } : c);
    setComponentsDraft(next);
  }

  function handleRemoveComponent(index) {
    setComponentsDraft(currentComponents.filter((_, i) => i !== index));
  }

  async function handleSaveComponents() {
    if (!repo) return;
    setCompSaving(true);
    setCompSaved(false);
    setCompError(null);
    try {
      const valid = currentComponents.filter(c => c.name.trim() && c.url.trim());
      const updated = await api.updateRepository(repo.id, { components: valid });
      onRepoUpdated(updated);
      setComponentsDraft(null);
      setCompSaved(true);
      setTimeout(() => setCompSaved(false), 3000);
    } catch (err) {
      setCompError(err.message);
    } finally {
      setCompSaving(false);
    }
  }

  async function handleCreateRepo() {
    if (!newName.trim() || !newUrl.trim()) return;
    setCreating(true);
    setCreateError(null);
    try {
      const created = await api.createRepository(newName.trim(), newUrl.trim(), newDesc.trim() || undefined);
      onRepoCreated(created);
      onSelectRepo(created.id);
      setShowNewForm(false);
      setNewName(''); setNewUrl(''); setNewDesc('');
    } catch (err) {
      setCreateError(err.message);
    } finally {
      setCreating(false);
    }
  }

  return (
    <div>
      <div className="section">
        <h2>Repository Context</h2>
        <p>Structured context extracted from the repository. Define project components, add developer notes, and re-index at any time.</p>
      </div>

      {/* ── Repo selector + new repo ── */}
      <div className="section">
        <label className="field-label">Repository</label>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <select
            value={selectedRepoId || ''}
            onChange={e => handleSelectRepo(Number(e.target.value))}
            style={{ maxWidth: 240 }}
          >
            {repositories.map(r => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
          <button className="btn btn-secondary" style={{ fontSize: 12 }} onClick={() => setShowNewForm(v => !v)}>
            {showNewForm ? '✕ Cancel' : '+ Add Repository'}
          </button>
        </div>
      </div>

      {/* ── New repo form ── */}
      {showNewForm && (
        <div className="context-card section" style={{ maxWidth: 520 }}>
          <h3>New Repository</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div>
              <label className="field-label">Name</label>
              <input type="text" placeholder="My Project" value={newName} onChange={e => setNewName(e.target.value)} />
            </div>
            <div>
              <label className="field-label">Primary GitHub URL</label>
              <input type="text" placeholder="https://github.com/owner/repo" value={newUrl} onChange={e => setNewUrl(e.target.value)} />
            </div>
            <div>
              <label className="field-label">Description (optional)</label>
              <input type="text" placeholder="Short description" value={newDesc} onChange={e => setNewDesc(e.target.value)} />
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 4 }}>
              <button className="btn" onClick={handleCreateRepo} disabled={!newName.trim() || !newUrl.trim() || creating}>
                {creating ? 'Creating…' : 'Create'}
              </button>
              {createError && <span style={{ fontSize: 12, color: 'var(--red)' }}>{createError}</span>}
            </div>
          </div>
        </div>
      )}

      {repo && (
        <>
          {/* ── Component Manager ── */}
          <div className="section">
            <label className="field-label">Project Components</label>
            <p style={{ fontSize: 12, marginBottom: 10 }}>
              Name each service with a role and GitHub URL. Components are indexed together and referenced by name in analysis.
              The primary URL (<code style={{ fontSize: 11 }}>{repo.url}</code>) is always indexed.
            </p>

            {currentComponents.length === 0 && (
              <div className="notice" style={{ marginBottom: 10, fontSize: 12 }}>
                No components defined. Add components to give each service a name and role.
              </div>
            )}

            {currentComponents.map((comp, i) => (
              <div key={i} className="component-row">
                <input
                  type="text"
                  placeholder="Name (e.g. Frontend)"
                  value={comp.name}
                  onChange={e => handleUpdateComponent(i, 'name', e.target.value)}
                  style={{ flex: '1 1 130px', minWidth: 0 }}
                />
                <select
                  value={comp.role}
                  onChange={e => handleUpdateComponent(i, 'role', e.target.value)}
                  style={{ flex: '0 0 120px', width: 120 }}
                >
                  {COMPONENT_ROLES.map(r => (
                    <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>
                  ))}
                </select>
                <input
                  type="text"
                  placeholder="https://github.com/owner/repo"
                  value={comp.url}
                  onChange={e => handleUpdateComponent(i, 'url', e.target.value)}
                  style={{ flex: '3 1 260px', minWidth: 0 }}
                />
                <button
                  className="url-remove"
                  onClick={() => handleRemoveComponent(i)}
                  title="Remove component"
                >
                  ✕
                </button>
              </div>
            ))}

            <div style={{ display: 'flex', gap: 8, marginTop: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <button className="btn btn-secondary" onClick={handleAddComponent} style={{ fontSize: 12 }}>
                + Add Component
              </button>
              <button
                className="btn"
                onClick={handleSaveComponents}
                disabled={compSaving}
                style={{ fontSize: 12 }}
              >
                {compSaving ? 'Saving…' : 'Save Components'}
              </button>
              {compSaved && <span className="save-confirmation">✓ Saved</span>}
              {compError && <span style={{ fontSize: 12, color: 'var(--red)' }}>{compError}</span>}
            </div>
          </div>

          {/* ── Index action ── */}
          <div className="section">
            <label className="field-label">Indexing</label>
            <div className="index-action" style={{ marginTop: 0 }}>
              <button className="btn btn-secondary" onClick={handleIndex} disabled={indexing} style={{ fontSize: 12 }}>
                {indexing ? 'Indexing…' : '↺ Re-index from GitHub'}
              </button>
              {indexSuccess && <span className="index-status" style={{ color: 'var(--green)' }}>✓ Indexed successfully.</span>}
              {indexError && <span className="index-status" style={{ color: 'var(--red)' }}>{indexError}</span>}
            </div>
            {currentComponents.length > 0 && (
              <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 6 }}>
                Will index primary + {currentComponents.length} component{currentComponents.length > 1 ? 's' : ''}.
              </div>
            )}
          </div>

          {/* ── Developer Notes ── */}
          <div className="section">
            <label className="field-label">Developer Notes</label>
            <p style={{ fontSize: 12, marginBottom: 8 }}>
              Architecture decisions, known gotchas, team conventions, caveats. Included in every analysis for this repo.
            </p>
            <textarea
              rows={6}
              placeholder="e.g. The billing module is frozen — no changes until Q3. Auth is JWT-based; tokens are stored in Redis with a 1h TTL. The legacy /v1 API is still live and has ~20% of traffic..."
              value={currentNotes}
              onChange={e => setNotesValue(e.target.value)}
            />
            <div className="save-row" style={{ marginTop: 8 }}>
              <button className="btn" onClick={handleSaveNotes} disabled={notesSaving}>
                {notesSaving ? 'Saving…' : 'Save Notes'}
              </button>
              {notesSaved && <span className="save-confirmation">✓ Saved</span>}
              {notesError && <span style={{ fontSize: 12, color: 'var(--red)' }}>{notesError}</span>}
            </div>
          </div>

          <hr className="divider" />

          {/* ── Indexed context display ── */}
          {!ctx && (
            <div className="notice">No indexed context yet. Use "Re-index from GitHub" above to fetch it.</div>
          )}

          {ctx && (
            <>
              <div className="section">
                <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>
                  <div style={{ flex: 1 }}>
                    <h3>Overview</h3>
                    <div style={{ fontSize: 14, marginBottom: 6 }}><strong>{ctx.name}</strong></div>
                    <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 10 }}>{ctx.description}</div>
                    {ctx.url && (
                      <div style={{ fontSize: 12, marginBottom: 10 }}>
                        <a href={ctx.url} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)' }}>{ctx.url}</a>
                      </div>
                    )}
                    <div>
                      {(ctx.primary_languages || []).map(lang => <span key={lang} className="tag">{lang}</span>)}
                      {(ctx.frameworks || []).map(f => <span key={f} className="tag">{f}</span>)}
                      {(ctx.infrastructure || []).map(i => <span key={i} className="tag">{i}</span>)}
                    </div>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--muted)', textAlign: 'right', flexShrink: 0 }}>
                    {ctx.indexing_status === 'indexed'
                      ? <span style={{ color: 'var(--green)' }}>✓ Live indexed</span>
                      : <span>Pre-indexed context</span>
                    }
                    {ctx.indexed_at && <div style={{ marginTop: 2 }}>{new Date(ctx.indexed_at).toLocaleString()}</div>}
                    {ctx.git?.last_push && <div style={{ marginTop: 2 }}>Last push: {new Date(ctx.git.last_push).toLocaleDateString()}</div>}
                  </div>
                </div>
              </div>

              <hr className="divider" />
              <ArchitectureSection ctx={ctx} />

              {ctx.sibling_repos?.length > 0 && (
                <>
                  <hr className="divider" />
                  <div className="section">
                    <h3>Indexed Components</h3>
                    <div className="context-grid">
                      {ctx.sibling_repos.map((s, i) => (
                        <div className="context-card" key={i}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                            <div style={{ fontSize: 12, fontWeight: 700 }}>{s.name || s.url}</div>
                            {s.role && <span className="tag" style={{ fontSize: 9 }}>{s.role}</span>}
                          </div>
                          {s.error
                            ? <div style={{ fontSize: 12, color: 'var(--red)' }}>Error: {s.error}</div>
                            : <>
                                <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 6 }}>{s.description}</div>
                                <div>{(s.primary_languages || []).map(l => <span key={l} className="tag">{l}</span>)}</div>
                              </>
                          }
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}

              <hr className="divider" />
              <div className="context-grid">
                <ImportantFilesCard ctx={ctx} />
                <EntryPointsCard ctx={ctx} />
                <DependenciesCard ctx={ctx} />
                <TestsCard ctx={ctx} />
              </div>

              {ctx.indexing_note && <div className="notice" style={{ marginTop: 16 }}>{ctx.indexing_note}</div>}

              {ctx.readme_excerpt && (
                <>
                  <hr className="divider" />
                  <div className="section">
                    <h3>README Excerpt</h3>
                    <pre style={{ fontSize: 12, color: 'var(--muted)', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 0, padding: 12, whiteSpace: 'pre-wrap', fontFamily: 'var(--mono)', maxHeight: 300, overflow: 'auto' }}>{ctx.readme_excerpt}</pre>
                  </div>
                </>
              )}

              {(ctx.recent_commits || []).length > 0 && (
                <>
                  <hr className="divider" />
                  <div className="section">
                    <h3>Recent Commits</h3>
                    {ctx.recent_commits.map(c => (
                      <div key={c.sha} style={{ fontSize: 12, padding: '5px 0', borderBottom: '1px solid var(--border)', display: 'flex', gap: 10 }}>
                        <code style={{ color: 'var(--accent)', fontFamily: 'var(--mono)', flexShrink: 0 }}>{c.sha}</code>
                        <span style={{ color: 'var(--text)' }}>{c.message}</span>
                        <span style={{ color: 'var(--muted)', marginLeft: 'auto', flexShrink: 0 }}>{c.author}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}

function ArchitectureSection({ ctx }) {
  const arch = ctx.architecture;
  if (!arch) return null;
  const layers = arch.layers || [];
  const pipeline = arch.pipeline || [];
  return (
    <div className="section">
      <h3>Architecture — {arch.style}</h3>
      {layers.length > 0 && (
        <ul className="layer-list">
          {layers.map(layer => (
            <li key={layer.name}>
              <strong>{layer.name}</strong>
              <span>{layer.description}</span>
              {layer.technologies && <div style={{ marginTop: 4 }}>{layer.technologies.map(t => <span key={t} className="tag">{t}</span>)}</div>}
            </li>
          ))}
        </ul>
      )}
      {pipeline.length > 0 && (
        <div>
          {pipeline.map(step => (
            <div key={step.stage} className="pipeline-step">
              <div className="pipeline-num">{step.stage.split('.')[0]}</div>
              <div className="pipeline-content">
                <strong>{step.stage.replace(/^\d+\.\s*/, '')}</strong>
                <small>{step.description}</small>
                {step.technologies && <div style={{ marginTop: 4 }}>{step.technologies.map(t => <span key={t} className="tag">{t}</span>)}</div>}
              </div>
            </div>
          ))}
        </div>
      )}
      {ctx.key_design_decisions && (
        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Key Design Decisions</div>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: 'var(--muted)' }}>
            {ctx.key_design_decisions.map((d, i) => <li key={i}>{d}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}

function ImportantFilesCard({ ctx }) {
  const dirs = ctx.important_directories || ctx.directory_tree || [];
  if (!dirs.length) return null;
  return (
    <div className="context-card">
      <h3>Important Directories</h3>
      <div className="file-list">
        {dirs.map((d, i) => (
          <div key={i}>
            {typeof d === 'string'
              ? <span>{d}/</span>
              : <div style={{ marginBottom: 4 }}><span style={{ color: 'var(--text)' }}>{d.path}</span>{d.description && <span style={{ color: 'var(--muted)', fontSize: 11, marginLeft: 8 }}>— {d.description}</span>}</div>
            }
          </div>
        ))}
      </div>
    </div>
  );
}

function EntryPointsCard({ ctx }) {
  const eps = ctx.entry_points || [];
  if (!eps.length) return null;
  return (
    <div className="context-card">
      <h3>Entry Points</h3>
      <div className="file-list">
        {eps.map((ep, i) => (
          <div key={i} style={{ marginBottom: 4 }}>
            <span style={{ color: 'var(--text)' }}>{typeof ep === 'string' ? ep : ep.path}</span>
            {ep.description && <span style={{ color: 'var(--muted)', fontSize: 11, marginLeft: 8 }}>— {ep.description}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

function DependenciesCard({ ctx }) {
  const deps = ctx.dependencies;
  if (!deps) return null;
  return (
    <div className="context-card">
      <h3>Dependencies</h3>
      {Object.entries(deps).map(([lang, list]) => (
        <div key={lang} style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', marginBottom: 4, textTransform: 'uppercase' }}>{lang}</div>
          {list.map(dep => <span key={dep} className="tag">{dep}</span>)}
        </div>
      ))}
    </div>
  );
}

function TestsCard({ ctx }) {
  const tests = ctx.tests;
  if (!tests) return null;
  const locs = Array.isArray(tests) ? tests : tests.locations || [];
  return (
    <div className="context-card">
      <h3>Tests</h3>
      {tests.description && <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 8 }}>{tests.description}</div>}
      <div className="file-list">{locs.map((l, i) => <div key={i}>{l}</div>)}</div>
    </div>
  );
}

// App.jsx

import { useState, useEffect } from 'react';
import './styles.css';
import { api } from './lib/api.js';
import AnalyzePage from './pages/AnalyzePage.jsx';
import ContextPage from './pages/ContextPage.jsx';
import DeveloperPage from './pages/DeveloperPage.jsx';
import SharePage from './pages/SharePage.jsx';
import ReportPage from './pages/ReportPage.jsx';

const TABS = [
  { id: 'analyze', label: 'Analyze' },
  { id: 'context', label: 'Context' },
  { id: 'developer', label: 'Developer' },
  { id: 'report', label: 'Report' },
];

// Minimal hash router: /share/:id renders SharePage standalone
function getShareId() {
  const hash = window.location.hash; // e.g. #/share/abc123
  const match = hash.match(/^#\/share\/([^/]+)/);
  return match ? match[1] : null;
}

export default function App() {
  const [tab, setTab] = useState('analyze');
  const [repositories, setRepositories] = useState([]);
  const [selectedRepoId, setSelectedRepoId] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [shareId, setShareId] = useState(getShareId);

  // Listen for hash changes (back/forward navigation on share pages)
  useEffect(() => {
    function onHashChange() { setShareId(getShareId()); }
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  useEffect(() => {
    api.getRepositories()
      .then(repos => {
        setRepositories(repos);
        if (repos.length > 0) {
          setSelectedRepoId(repos[0].id);
        }
      })
      .catch(err => setLoadError(err.message));
  }, []);

  function handleRepoUpdated(updated) {
    setRepositories(prev => prev.map(r => r.id === updated.id ? updated : r));
  }

  function handleRepoCreated(created) {
    setRepositories(prev => [...prev, created]);
  }

  const selectedRepo = repositories.find(r => r.id === selectedRepoId);

  // ── Share page — standalone, no app chrome ──
  if (shareId) {
    return <SharePage shareId={shareId} />;
  }

  return (
    <div className="app">
      <header className="app-header no-print">
        <div className="app-header-left">
          <span className="app-logo">Dev<span>Lens</span></span>
        </div>
        <div className="app-header-right">
          <span>Repository:</span>
          {repositories.length > 0 ? (
            <span className="repo-label">{selectedRepo?.name || '—'}</span>
          ) : (
            <span className="repo-label" style={{ color: 'var(--muted)' }}>Loading…</span>
          )}
        </div>
      </header>

      <div className="app-body">
        <nav className="app-sidebar no-print">
          {TABS.map(t => (
            <button
              key={t.id}
              className={`nav-item${tab === t.id ? ' active' : ''}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </nav>

        <main className="app-content">
          {loadError && (
            <div className="notice error no-print" style={{ marginBottom: 20 }}>
              Failed to load repositories: {loadError}. Is the worker running?
            </div>
          )}

          {tab === 'analyze' && (
            <AnalyzePage
              repositories={repositories}
              selectedRepoId={selectedRepoId}
              onSelectRepo={setSelectedRepoId}
            />
          )}
          {tab === 'context' && (
            <ContextPage
              repositories={repositories}
              selectedRepoId={selectedRepoId}
              onSelectRepo={setSelectedRepoId}
              onRepoUpdated={handleRepoUpdated}
              onRepoCreated={handleRepoCreated}
            />
          )}
          {tab === 'developer' && (
            <DeveloperPage />
          )}
          {tab === 'report' && (
            <ReportPage
              repositories={repositories}
              selectedRepoId={selectedRepoId}
              onSelectRepo={setSelectedRepoId}
            />
          )}
        </main>
      </div>
    </div>
  );
}

// App.jsx

import { useState, useEffect } from 'react';
import './styles.css';
import { api } from './lib/api.js';
import AnalyzePage from './pages/AnalyzePage.jsx';
import ContextPage from './pages/ContextPage.jsx';
import DeveloperPage from './pages/DeveloperPage.jsx';

const TABS = [
  { id: 'analyze', label: 'Analyze' },
  { id: 'context', label: 'Context' },
  { id: 'developer', label: 'Developer' },
];

export default function App() {
  const [tab, setTab] = useState('analyze');
  const [repositories, setRepositories] = useState([]);
  const [selectedRepoId, setSelectedRepoId] = useState(null);
  const [loadError, setLoadError] = useState(null);

  useEffect(() => {
    api.getRepositories()
      .then(repos => {
        setRepositories(repos);
        if (repos.length > 0) {
          setSelectedRepoId(repos[0].id); // Peekachu is first
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

  return (
    <div className="app">
      <header className="app-header">
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
        <nav className="app-sidebar">
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
            <div className="notice error" style={{ marginBottom: 20 }}>
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
        </main>
      </div>
    </div>
  );
}

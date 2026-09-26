// pages/SharePage.jsx — public read-only lens view at /share/:id

import { useState, useEffect } from 'react';
import { api } from '../lib/api.js';

export default function SharePage({ shareId }) {
  const [share, setShare] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!shareId) { setError('No share ID provided.'); setLoading(false); return; }
    api.getShare(shareId)
      .then(data => setShare(data))
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [shareId]);

  if (loading) {
    return (
      <div className="share-page">
        <div className="share-header">
          <span className="app-logo">Dev<span>Lens</span></span>
        </div>
        <div className="loading" style={{ padding: '48px 32px' }}>Loading…</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="share-page">
        <div className="share-header">
          <span className="app-logo">Dev<span>Lens</span></span>
        </div>
        <div className="notice error" style={{ margin: '40px 32px', maxWidth: 480 }}>
          {error === 'Share not found' ? 'This share link has expired or does not exist.' : error}
        </div>
      </div>
    );
  }

  const snap = share.snapshot;

  return (
    <div className="share-page">
      <div className="share-header">
        <span className="app-logo">Dev<span>Lens</span></span>
        <span className="share-header-label">Developer Lens — Public View</span>
      </div>

      <div className="share-body">
        {share.label && (
          <div className="share-title">{share.label}</div>
        )}
        <div className="share-meta">
          Published {share.created_at ? new Date(share.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : '—'}
          &nbsp;· Read only
        </div>

        <hr className="divider" style={{ margin: '20px 0' }} />

        <LensSection title="Investigation Style" content={snap.investigation_style} />
        <LensSection title="Explanation Style" content={snap.explanation_style} />
        {snap.developer_notes && (
          <LensSection title="Global Developer Notes" content={snap.developer_notes} />
        )}
      </div>

      <div className="share-footer">
        Powered by <strong>DevLens</strong>
      </div>
    </div>
  );
}

function LensSection({ title, content }) {
  if (!content) return null;
  return (
    <div className="share-section">
      <div className="share-section-title">{title}</div>
      <div className="share-section-body">{content}</div>
    </div>
  );
}

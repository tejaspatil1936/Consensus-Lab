import { useState } from 'react';
import CreateKeyModal from './CreateKeyModal.jsx';

function relativeTime(ts) {
  if (!ts) return 'Never';
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

const envBadge = (env) => {
  const m = { production: 'badge-prod', staging: 'badge-staging', development: 'badge-dev' };
  return m[env] || 'badge-dev';
};

export default function APIKeyList({ apiKeys, onSelectKey, onRefresh, showNotification }) {
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);

  const filtered = apiKeys.filter(k =>
    k.name.toLowerCase().includes(search.toLowerCase()) ||
    k.prefix.toLowerCase().includes(search.toLowerCase())
  );

  const handleCreate = (newKey) => {
    onRefresh();
    showNotification(`Key "${newKey.name}" created!`, 'success');
  };

  return (
    <div>
      <div className="section-header">
        <div className="section-title">API Keys</div>
        <div style={{ display: 'flex', gap: 12 }}>
          <input
            className="search-input"
            placeholder="Search keys..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
            + Create New Key
          </button>
        </div>
      </div>

      <div className="card" style={{ padding: 0 }}>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Key</th>
                <th>Environment</th>
                <th>Status</th>
                <th>Last Used</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={6} style={{ textAlign: 'center', padding: 24, color: 'var(--muted)' }}>No keys found</td></tr>
              )}
              {filtered.map(key => (
                <tr key={key.id}>
                  <td><strong>{key.name}</strong></td>
                  <td><span className="key-prefix">{key.prefix}</span></td>
                  <td><span className={`badge ${envBadge(key.environment)}`}>{key.environment}</span></td>
                  <td><span className={`badge badge-${key.status}`}>{key.status}</span></td>
                  <td style={{ color: 'var(--muted)' }}>{relativeTime(key.lastUsed)}</td>
                  <td>
                    <button className="btn btn-secondary btn-sm" onClick={() => onSelectKey(key)}>
                      View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showCreate && (
        <CreateKeyModal
          onClose={() => setShowCreate(false)}
          onCreate={handleCreate}
          showNotification={showNotification}
        />
      )}
    </div>
  );
}

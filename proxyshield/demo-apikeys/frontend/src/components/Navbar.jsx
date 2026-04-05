export default function Navbar({ user, onLogout }) {
  return (
    <div className="navbar">
      <div>
        <div className="navbar-title">🔑 KeyVault</div>
        <div className="navbar-sub">Protected by ProxyShield</div>
      </div>
      {user && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 13, color: 'var(--text-light)' }}>{user.name}</span>
          <button className="btn btn-secondary btn-sm" onClick={onLogout}>Sign out</button>
        </div>
      )}
    </div>
  );
}

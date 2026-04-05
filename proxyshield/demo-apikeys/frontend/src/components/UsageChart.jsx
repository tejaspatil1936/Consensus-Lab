export default function UsageChart({ data, keyStatus }) {
  if (!data || data.length === 0) return null;

  const max = Math.max(...data.map(d => d.requests), 1);
  const isRevoked = keyStatus === 'revoked';

  const labels = data.map(d => {
    const h = new Date(d.hour).getHours();
    return h === 0 ? '12A' : h === 12 ? '12P' : h > 12 ? `${h - 12}P` : `${h}A`;
  });

  return (
    <div className="chart-container">
      <div className="chart-title">Last 24 Hours</div>
      <div className="chart-bars">
        {data.map((d, i) => (
          <div
            key={i}
            className={`chart-bar ${isRevoked ? 'revoked' : 'active'}`}
            style={{ height: `${(d.requests / max) * 100}%` }}
            title={`${labels[i]}: ${d.requests} req`}
          />
        ))}
      </div>
      <div className="chart-labels">
        {labels.map((l, i) => (
          <div key={i} className="chart-label">{i % 4 === 0 ? l : ''}</div>
        ))}
      </div>
    </div>
  );
}

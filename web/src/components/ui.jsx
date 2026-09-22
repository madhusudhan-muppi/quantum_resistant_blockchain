import React from 'react';

export function Panel({ title, note, section, children, right }) {
  return (
    <div className="panel">
      {title && (
        <h3 className="panel-title">
          <span>{title}</span>
          {section && <span className="section-ref">§{section}</span>}
          {right && <span style={{ marginLeft: 'auto' }}>{right}</span>}
        </h3>
      )}
      {note && <p className="panel-note">{note}</p>}
      {children}
    </div>
  );
}

export function Stat({ label, value, unit, sub, tone }) {
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className={`stat-value ${tone || ''}`}>
        {value}
        {unit && <span className="stat-unit">{unit}</span>}
      </div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );
}

export function Badge({ tone = 'dim', children }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

export function Alert({ tone = 'info', title, children }) {
  return (
    <div className={`alert alert-${tone}`}>
      {title && <div className="alert-title">{title}</div>}
      <div>{children}</div>
    </div>
  );
}

export function KV({ k, v }) {
  return (
    <div className="kv">
      <span className="kv-k">{k}</span>
      <span className="kv-v">{v}</span>
    </div>
  );
}

export function Empty({ icon = '○', children }) {
  return (
    <div className="empty">
      <div className="empty-icon">{icon}</div>
      {children}
    </div>
  );
}

export function Formula({ children }) {
  return <div className="formula">{children}</div>;
}

export function Progress({ value, total, failed }) {
  const pct = total > 0 ? Math.min(100, (value / total) * 100) : 0;
  return (
    <div className="progress">
      <div className={`progress-bar ${failed ? 'fail' : ''}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function bytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KiB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(2)} MiB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GiB`;
}

export function gas(n) {
  return n.toLocaleString('en-US');
}

export function ms(n) {
  if (n < 1) return `${(n * 1000).toFixed(0)} µs`;
  if (n < 1000) return `${n.toFixed(2)} ms`;
  return `${(n / 1000).toFixed(2)} s`;
}

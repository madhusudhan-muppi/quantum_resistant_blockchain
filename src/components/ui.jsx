import React, { useState } from 'react';

/* ------------------------------------------------------------------ */
/* icons                                                               */
/* ------------------------------------------------------------------ */

export function Icon({ name, style }) {
  return <span className="mi" style={style}>{name}</span>;
}

/* ------------------------------------------------------------------ */
/* panels — 36px header, lower divider, right-aligned chip + epoch      */
/* ------------------------------------------------------------------ */

export function Panel({ icon, title, chip, epoch, note, children, foot, flush }) {
  return (
    <div className="panel">
      {(title || chip) && (
        <div className="panel-head">
          <div className="panel-head-title">
            {icon && <Icon name={icon} />}
            <span className="t-headline-sm">{title}</span>
          </div>
          <div className="panel-head-right">
            {epoch && <span className="panel-epoch">{epoch}</span>}
            {chip}
          </div>
        </div>
      )}
      <div className={`panel-body ${flush ? 'flush' : ''}`}>
        {note && <p className="panel-note">{note}</p>}
        {children}
      </div>
      {foot && <div className="panel-foot">{foot}</div>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* academic citation pill — § [SCHEME]-[PARAM]                          */
/* ------------------------------------------------------------------ */

export function Academic({ children, tone = 'pqc', dot }) {
  return (
    <span className={`pill-academic ${tone === 'data' ? 'data' : ''}`}>
      {dot && <span className="dot" />}
      § {children}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* cryptographic health pill — 6px dot + uppercase state                */
/* ------------------------------------------------------------------ */

export function Health({ state = 'idle', pulse, children }) {
  return (
    <span className={`health health-${state}`}>
      <span className={`dot ${pulse ? 'pulse' : ''}`} />
      {children}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* hash capsule — middle truncation, click to copy                      */
/* ------------------------------------------------------------------ */

export function truncate(hex, head = 6, tail = 4) {
  const h = hex.startsWith('0x') ? hex : '0x' + hex;
  if (h.length <= head + tail + 4) return h;
  return `${h.slice(0, head + 2)}…${h.slice(-tail)}`;
}

function copy(text) {
  try {
    navigator.clipboard?.writeText(text);
  } catch {
    /* clipboard unavailable — the value is still visible on screen */
  }
}

export function HashBox({ value, tone, full }) {
  const [copied, setCopied] = useState(false);
  const text = value.startsWith('0x') ? value : '0x' + value;

  return (
    <div
      className={`hashbox ${tone === 'pqc' ? 'pqc' : ''}`}
      onClick={() => { copy(text); setCopied(true); setTimeout(() => setCopied(false), 1200); }}
      title="Click to copy"
    >
      <span>{full ? text : truncate(value, 30, 14)}</span>
      <Icon name={copied ? 'check' : 'content_copy'} />
    </div>
  );
}

export function Hash({ value, tone, head = 6, tail = 4 }) {
  const [copied, setCopied] = useState(false);
  if (!value) return <span className="hash-inline muted">—</span>;
  const text = value.startsWith('0x') ? value : '0x' + value;

  return (
    <span
      className={`hash-inline ${tone || ''}`}
      title={`${text} — click to copy`}
      onClick={() => { copy(text); setCopied(true); setTimeout(() => setCopied(false), 1200); }}
    >
      {copied ? 'copied' : truncate(value, head, tail)}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* data cells                                                          */
/* ------------------------------------------------------------------ */

export function Cell({ label, value, sub, tone, right }) {
  return (
    <div className="cell">
      <div className="label-caps">
        {label}
        {right && <span style={{ float: 'right' }}>{right}</span>}
      </div>
      <div className={`cell-value ${tone ? 'v-' + tone : ''}`}>{value}</div>
      {sub && <div className="cell-sub">{sub}</div>}
    </div>
  );
}

export function Stat({ label, value, unit, sub, tone }) {
  return (
    <div className="stat">
      <div className="label-caps">{label}</div>
      <div className={`stat-value ${tone ? 'v-' + tone : ''}`}>
        {value}
        {unit && <span className="stat-unit">{unit}</span>}
      </div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );
}

export function KVMatrix({ rows }) {
  return (
    <div className="kvm">
      {rows.map((r, i) => (
        <div className="kvm-row" key={i}>
          <span className="kvm-k">{r.k}</span>
          <span className="kvm-v">{r.v}</span>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* feedback                                                            */
/* ------------------------------------------------------------------ */

export function Alert({ tone = 'data', icon, title, children }) {
  const fallback = {
    pass: 'verified', fail: 'error', caution: 'warning', data: 'info', pqc: 'shield_lock',
  }[tone];

  return (
    <div className={`alert alert-${tone}`}>
      <Icon name={icon || fallback} />
      <div>
        {title && <div className="alert-title">{title}</div>}
        <div>{children}</div>
      </div>
    </div>
  );
}

export function Empty({ icon = 'database', children }) {
  return (
    <div className="empty">
      <Icon name={icon} />
      {children}
    </div>
  );
}

export function Formula({ children }) {
  return <div className="formula">{children}</div>;
}

export function Progress({ value, total, tone }) {
  const pct = total > 0 ? Math.min(100, (value / total) * 100) : 0;
  return (
    <div className="progress">
      <div className={`progress-bar ${tone || ''}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

/**
 * Quantum entropy meter — segmented bar across NIST PQC categories 1/3/5.
 * ML-DSA-65 sits at Category 3, so two of three segments illuminate.
 */
export function EntropyMeter({ category = 3 }) {
  const levels = [1, 3, 5];
  const filled = levels.indexOf(category) + 1;
  return (
    <div className="entropy">
      {levels.map((l, i) => (
        <div key={l} className={`entropy-seg ${i < filled ? 'on' : ''}`} />
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* formatters                                                          */
/* ------------------------------------------------------------------ */

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
  if (n < 1000) return `${n.toFixed(1)} ms`;
  return `${(n / 1000).toFixed(2)} s`;
}

export function epochNow() {
  return `T+${new Date().toISOString().slice(11, 19)}Z`;
}

/* ------------------------------------------------------------------ */
/* page header — meta pills, title, right-aligned instrument readouts   */
/* ------------------------------------------------------------------ */

export function PageHead({ section, sectionTone, standard, id, title, children, stats }) {
  return (
    <div className="page-head">
      <div className="page-meta">
        {section && <Academic tone={sectionTone || 'data'} dot>{section}</Academic>}
        {standard && (
          <span className="health health-pass">
            <Icon name="shield" style={{ fontSize: 12 }} />
            {standard}
          </span>
        )}
        {id && <span className="pill-id">ID: {id}</span>}
      </div>

      <div className="page-head-row">
        <div className="page-head-text">
          <h1 className="t-headline-xl" style={{ margin: 0 }}>{title}</h1>
          {children && <p className="t-body-lg">{children}</p>}
        </div>

        {stats && (
          <div className="head-stats">
            {stats.map((s, i) => (
              <div className="head-stat" key={i}>
                <div className="label-caps">{s.label}</div>
                <div className={`t-code-lg ${s.tone ? 'v-' + s.tone : ''}`}>{s.value}</div>
                {s.sub && <div className="t-code-sm" style={{ color: 'var(--text-2)' }}>{s.sub}</div>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

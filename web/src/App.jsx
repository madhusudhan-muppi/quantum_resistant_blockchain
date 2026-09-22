import React, { useState, useEffect } from 'react';
import { useStore } from './lib/store.jsx';
import Overview from './pages/Overview.jsx';
import Publish from './pages/Publish.jsx';
import Verify from './pages/Verify.jsx';
import Lineage from './pages/Lineage.jsx';
import Faults from './pages/Faults.jsx';
import Benchmarks from './pages/Benchmarks.jsx';
import Governance from './pages/Governance.jsx';
import ThreatModel from './pages/ThreatModel.jsx';

const NAV = [
  {
    group: 'Framework',
    items: [
      { key: 'overview', icon: '◈', label: 'Overview', page: Overview },
      { key: 'threat', icon: '⚠', label: 'Threat model', page: ThreatModel },
    ],
  },
  {
    group: 'Pipeline',
    items: [
      { key: 'publish', icon: '↑', label: 'Register model', page: Publish },
      { key: 'verify', icon: '✓', label: 'Verify artefact', page: Verify },
      { key: 'lineage', icon: '⑂', label: 'Lineage', page: Lineage },
    ],
  },
  {
    group: 'Evaluation',
    items: [
      { key: 'faults', icon: '⚡', label: 'Fault injection', page: Faults },
      { key: 'bench', icon: '▱', label: 'Benchmarks', page: Benchmarks },
      { key: 'gov', icon: '⚿', label: 'Governance', page: Governance },
    ],
  },
];

const ALL = NAV.flatMap((g) => g.items);

export default function App() {
  const store = useStore();
  const [route, setRoute] = useState('overview');

  useEffect(() => {
    store.boot();
  }, [store]);

  if (!store.booted) {
    return (
      <div className="boot">
        <div className="brand-mark" style={{ fontSize: 22 }}>
          <span className="brand-dot" />
          QRB
        </div>
        <div style={{ color: 'var(--text-dim)', fontSize: 13 }}>
          {store.bootMessage || 'Initialising…'}
        </div>
        <span className="spinner" />
        <div style={{ color: 'var(--text-faint)', fontSize: 11, fontFamily: 'var(--mono)', maxWidth: 380 }}>
          Generating real ML-DSA-65 keypairs in the browser. Key generation is the slow step — a
          4,032-byte private key is sampled from a module lattice.
        </div>
      </div>
    );
  }

  const active = ALL.find((i) => i.key === route) || ALL[0];
  const Page = active.page;

  const recordCount = store.fabric?.allRecords().length || 0;
  const anchorCount = store.anchor?.registry.size || 0;

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">
            <span className="brand-dot" />
            QRB
          </div>
          <div className="brand-sub">
            Quantum-Resistant Blockchain Framework for Secure AI Model Distribution and Provenance
          </div>
        </div>

        <nav className="nav">
          {NAV.map((group) => (
            <div key={group.group}>
              <div className="nav-group-label">{group.group}</div>
              {group.items.map((item) => (
                <button
                  key={item.key}
                  className={`nav-item ${route === item.key ? 'active' : ''}`}
                  onClick={() => setRoute(item.key)}
                >
                  <span className="nav-icon">{item.icon}</span>
                  <span>{item.label}</span>
                  {item.key === 'lineage' && recordCount > 0 && (
                    <span className="nav-badge">{recordCount}</span>
                  )}
                  {item.key === 'gov' && anchorCount > 0 && (
                    <span className="nav-badge">{anchorCount}</span>
                  )}
                </button>
              ))}
            </div>
          ))}
        </nav>

        <div className="sidebar-footer">
          FIPS 204 · ML-DSA-65
          <br />
          Fabric v2.5 · channel "mlops"
          <br />
          chainId 31337 · Kubo v0.28
        </div>
      </aside>

      <main className="main">
        <Page navigate={setRoute} />
      </main>

      <div className="toasts">
        {store.toasts.map((t) => (
          <div key={t.id} className={`toast ${t.kind}`}>
            {t.message}
          </div>
        ))}
      </div>
    </div>
  );
}

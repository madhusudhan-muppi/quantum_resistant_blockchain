import React, { useState, useEffect } from 'react';
import { useStore } from './lib/store.jsx';
import { Icon, Hash } from './components/ui.jsx';
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
      { key: 'overview', icon: 'radar', label: 'Overview', page: Overview, crumb: 'qrb://node-01/lattice', spec: '3.1 System Architecture' },
      { key: 'threat', icon: 'gpp_maybe', label: 'Threat Model', page: ThreatModel, crumb: 'qrb://node-01/stride', spec: '3.8 Residual Risk' },
    ],
  },
  {
    group: 'Pipeline',
    items: [
      { key: 'publish', icon: 'input', label: 'Register Model', page: Publish, crumb: 'qrb://node-01/ingest', spec: '3.3 Per-Tensor Merkle' },
      { key: 'verify', icon: 'verified_user', label: 'Verify Artefact', page: Verify, crumb: 'qrb://node-01/verify', spec: '3.6 Consumer SDK' },
      { key: 'lineage', icon: 'account_tree', label: 'Lineage', page: Lineage, crumb: 'qrb://node-01/lineage', spec: '3.3 Delta Provenance' },
    ],
  },
  {
    group: 'Evaluation',
    items: [
      { key: 'faults', icon: 'bug_report', label: 'Fault Injection', page: Faults, crumb: 'qrb://node-01/faults', spec: '3.7 Fault Injection' },
      { key: 'bench', icon: 'speed', label: 'Benchmarks', page: Benchmarks, crumb: 'qrb://node-01/bench', spec: '3.7 Evaluation' },
      { key: 'gov', icon: 'key', label: 'Governance', page: Governance, crumb: 'qrb://node-01/msp', spec: '3.5 Publisher Mgmt' },
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
        <div className="brand" style={{ justifyContent: 'center' }}>
          <span className="brand-glyph"><Icon name="deployed_code" /></span>
          <span className="brand-name" style={{ fontSize: 20 }}>QRB</span>
          <span className="status-dot" />
        </div>
        <div className="t-code-lg" style={{ color: 'var(--data)' }}>
          {store.bootMessage || 'Initialising lattice…'}
        </div>
        <span className="spinner" />
        <div className="t-code-sm" style={{ color: 'var(--text-muted)', maxWidth: 420 }}>
          Sampling real ML-DSA-65 keypairs from a module lattice. Key generation is the slow
          step — a 4,032-byte private key per identity, per FIPS 204.
        </div>
      </div>
    );
  }

  const active = ALL.find((i) => i.key === route) || ALL[0];
  const Page = active.page;

  const records = store.fabric?.allRecords() || [];
  const anchors = store.anchor?.registry.size || 0;
  const primary = store.identities[0];

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="sidebar-head">
          <div className="brand">
            <span className="brand-glyph"><Icon name="deployed_code" /></span>
            <span className="brand-name">QRB</span>
          </div>
          <span className="status-dot" />
        </div>

        <div className="pq-banner">
          <Icon name="shield_lock" />
          <span>PQ-SAFE · ML-DSA-65</span>
        </div>

        <nav className="nav">
          {NAV.map((group) => (
            <div className="nav-group" key={group.group}>
              <div className="label-caps">{group.group}</div>
              {group.items.map((item) => (
                <button
                  key={item.key}
                  className={`nav-item ${route === item.key ? 'active' : ''}`}
                  onClick={() => setRoute(item.key)}
                  title={item.label}
                >
                  <Icon name={item.icon} />
                  <span>{item.label}</span>
                  {item.key === 'lineage' && records.length > 0 && (
                    <span className="nav-count">{records.length}</span>
                  )}
                  {item.key === 'gov' && anchors > 0 && <span className="nav-count">{anchors}</span>}
                </button>
              ))}
            </div>
          ))}
        </nav>

        <div className="sidebar-foot">
          <div className="foot-row">
            <span className="label-caps">Fingerprint</span>
            <span className="health health-pass"><span className="dot" />ENROLLED</span>
          </div>
          <div className="foot-row">
            <span className="t-code-sm" style={{ color: 'var(--text-muted)' }}>pkHash</span>
            <Hash value={primary.pkHashHex} tone="pqc" head={6} tail={4} />
          </div>
          <div className="foot-row">
            <span className="t-code-sm" style={{ color: 'var(--text-muted)' }}>KEM</span>
            <span className="t-code-sm" style={{ color: 'var(--text-2)' }}>ML-KEM-768</span>
          </div>
        </div>
      </aside>

      <div className="main-col">
        <header className="topbar">
          <div className="crumb">
            <Icon name="terminal" />
            <span>{active.crumb}</span>
          </div>
          <span className="pill-academic">{active.spec}</span>

          <div className="topbar-right">
            <span className="chain-chip">
              <span className="dot" style={{ background: 'var(--classical)' }} />
              L1: Hardhat 31337
            </span>
            <span className="chain-chip">
              <span className="dot" style={{ background: 'var(--pqc)' }} />
              Fabric: mlops
            </span>
            <span className="avatar"><Icon name="person" /></span>
          </div>
        </header>

        <main className="main">
          <Page navigate={setRoute} />
        </main>
      </div>

      <div className="toasts">
        {store.toasts.map((t) => (
          <div key={t.id} className={`toast ${t.kind}`}>{t.message}</div>
        ))}
      </div>
    </div>
  );
}

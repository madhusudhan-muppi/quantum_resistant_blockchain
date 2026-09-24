import React from 'react';
import {
  Panel, PageHead, Academic, Health, Icon, Empty, Alert, Hash, Stat,
} from '../components/ui.jsx';
import { useStore } from '../lib/store.jsx';

/**
 * Lineage DAG — Section 3.3, delta provenance.
 * A derivative re-signs only the changed leaves and points at its parent root.
 */
export default function Lineage({ navigate }) {
  const store = useStore();
  const records = store.fabric?.allRecords() || [];

  const byModel = records.reduce((acc, r) => {
    (acc[r.modelId] ||= []).push(r);
    return acc;
  }, {});

  if (records.length === 0) {
    return (
      <div>
        <PageHead
          section="3.3 DELTA PROVENANCE & LINEAGE DAG"
          standard="NIST FIPS 204 L3"
          id="0x4d18_lineage"
          title="Model Lineage"
        >
          Parent-pointer DAG across versions and derivatives.
        </PageHead>
        <Panel icon="account_tree" title="No Lineage Recorded">
          <Empty icon="account_tree">
            Register a model to begin a lineage chain.
            <div className="btn-row" style={{ justifyContent: 'center', marginTop: 'var(--s-md)' }}>
              <button className="btn btn-primary" onClick={() => navigate('publish')}>
                <Icon name="input" /> REGISTER A MODEL
              </button>
            </div>
          </Empty>
        </Panel>
      </div>
    );
  }

  const derivatives = records.filter((r) => r.parentRootHex).length;
  const revoked = records.filter((r) => r.revoked).length;

  return (
    <div>
      <PageHead
        section="3.3 DELTA PROVENANCE & LINEAGE DAG"
        standard="NIST FIPS 204 L3"
        id="0x4d18_lineage"
        title="Model Lineage"
        stats={[
          { label: 'Distinct Models', value: Object.keys(byModel).length, tone: 'data' },
          { label: 'Total Versions', value: records.length, sub: `${derivatives} derivative(s)` },
        ]}
      >
        Each version stores the Merkle root of its parent. A derivative re-signs only the leaves it
        changed, so provenance forms a DAG instead of a flat list of unrelated artefacts.
      </PageHead>

      <Alert tone="data" icon="hub" title="Why delta provenance is cheap">
        Because the tree is per-tensor, a fine-tune that touches a handful of adapter matrices
        changes only those leaves. The unchanged subtrees — and their inclusion proofs — carry over
        from the parent, so re-signing a derivative does not mean re-hashing the whole artefact.
      </Alert>

      <div className="grid-4">
        <Stat label="Base Models" value={records.length - derivatives} tone="pqc" sub="parentRoot = 0x0" />
        <Stat label="Derivatives" value={derivatives} tone="data" sub="parent-pointer set" />
        <Stat label="Revoked" value={revoked} tone={revoked ? 'critical' : 'valid'} sub="flagged, not erased" />
        <Stat label="Max Depth" value={Math.max(...Object.values(byModel).map((v) => v.length))} sub="versions in a chain" />
      </div>

      {Object.entries(byModel).map(([modelId, versions]) => (
        <Panel
          key={modelId}
          icon="account_tree"
          title={modelId}
          chip={<Health state="data">{versions.length} VERSION{versions.length > 1 ? 'S' : ''}</Health>}
        >
          <div className="lineage-strip">
            {versions.map((r, i) => (
              <React.Fragment key={i}>
                {i > 0 && (
                  <div className="lineage-link">
                    <Icon name="arrow_forward" />
                  </div>
                )}
                <Node record={r} isBase={!r.parentRootHex} />
              </React.Fragment>
            ))}
          </div>
        </Panel>
      ))}

      <Panel icon="table_rows" title="Lineage Registry" chip={<Academic>3.5 World State</Academic>} flush>
        <table className="table dense">
          <thead>
            <tr>
              <th>Model</th>
              <th style={{ textAlign: 'right' }}>Ver</th>
              <th>Publisher</th>
              <th>Merkle Root</th>
              <th>Parent Root</th>
              <th style={{ textAlign: 'right' }}>Tensors</th>
              <th style={{ textAlign: 'right' }}>Block</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {records.map((r, i) => (
              <tr key={i}>
                <td className="mono"><strong>{r.modelId}</strong></td>
                <td className="num">{r.version}</td>
                <td>{r.publisher}</td>
                <td><Hash value={r.merkleRootHex} head={8} tail={6} /></td>
                <td>
                  {r.parentRootHex
                    ? <Hash value={r.parentRootHex} head={8} tail={6} />
                    : <Health state="pqc">BASE</Health>}
                </td>
                <td className="num">{r.tensorMeta?.length ?? '—'}</td>
                <td className="num">#{r.blockNumber}</td>
                <td>
                  {r.revoked
                    ? <Health state="fail">REVOKED</Health>
                    : <Health state="pass">VALID</Health>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </div>
  );
}

function Node({ record, isBase }) {
  return (
    <div className={`lineage-node ${record.revoked ? 'revoked' : isBase ? 'base' : ''}`}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <span className="t-code-lg" style={{ color: 'var(--text)' }}>v{record.version}</span>
        {record.revoked
          ? <Health state="fail">REVOKED</Health>
          : isBase
            ? <Health state="pqc">BASE</Health>
            : <Health state="pass">DERIVATIVE</Health>}
      </div>
      <div className="t-body-sm" style={{ color: 'var(--text-2)', marginBottom: 6 }}>{record.publisher}</div>
      <div style={{ marginBottom: 4 }}>
        <Hash value={record.merkleRootHex} head={10} tail={8} />
      </div>
      <div className="t-code-sm" style={{ color: 'var(--text-muted)' }}>
        {record.tensorMeta?.length ?? 0} tensors · block #{record.blockNumber}
      </div>
    </div>
  );
}

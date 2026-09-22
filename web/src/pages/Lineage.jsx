import React from 'react';
import { Panel, Badge, Empty, Alert, bytes } from '../components/ui.jsx';
import { useStore } from '../lib/store.jsx';
import { shortHex } from '../lib/crypto.js';

/**
 * Lineage DAG — Section 3.3 "delta provenance".
 *
 * A derivative (a LoRA adapter, a fine-tune) re-signs only the changed leaves
 * and records a pointer to its parent root. The result is a lineage DAG rather
 * than a flat list of unrelated artefacts.
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
        <div className="page-head">
          <h1 className="page-title">Model lineage</h1>
          <p className="page-sub">Parent-pointer DAG across versions and derivatives.</p>
        </div>
        <Panel>
          <Empty icon="⑂">
            No lineage to draw yet.
            <div style={{ marginTop: 14 }}>
              <button className="btn btn-primary btn-sm" onClick={() => navigate('publish')}>
                Register a model →
              </button>
            </div>
          </Empty>
        </Panel>
      </div>
    );
  }

  return (
    <div>
      <div className="page-head">
        <h1 className="page-title">Model lineage</h1>
        <p className="page-sub">
          Each version stores the Merkle root of its parent. A derivative re-signs only the leaves
          it changed, so provenance forms a DAG instead of a flat list.
        </p>
      </div>

      <Alert tone="info" title="Delta provenance">
        Because the tree is per-tensor, a fine-tune that touches a handful of adapter matrices
        changes only those leaves. The unchanged subtrees — and their proofs — carry over from the
        parent, which is why re-signing a derivative is cheap.
      </Alert>

      {Object.entries(byModel).map(([modelId, versions]) => (
        <Panel key={modelId} title={modelId} section="3.3" right={<Badge tone="info">{versions.length} version{versions.length > 1 ? 's' : ''}</Badge>}>
          <div style={{ overflowX: 'auto', paddingBottom: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', minWidth: 'min-content' }}>
              {versions.map((r, i) => (
                <React.Fragment key={i}>
                  {i > 0 && <div className="lineage-connector" />}
                  <LineageNode record={r} isRoot={!r.parentRootHex} />
                </React.Fragment>
              ))}
            </div>
          </div>
        </Panel>
      ))}

      <Panel title="Lineage table">
        <table className="table">
          <thead>
            <tr>
              <th>Model</th>
              <th>Ver</th>
              <th>Publisher</th>
              <th>Merkle root</th>
              <th>Parent root</th>
              <th>Tensors</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {records.map((r, i) => (
              <tr key={i}>
                <td className="mono">{r.modelId}</td>
                <td className="num">{r.version}</td>
                <td>{r.publisher}</td>
                <td><span className="hash">{shortHex(r.merkleRootHex, 8, 6)}</span></td>
                <td>
                  {r.parentRootHex ? (
                    <span className="hash dim">{shortHex(r.parentRootHex, 8, 6)}</span>
                  ) : (
                    <Badge tone="quantum">base</Badge>
                  )}
                </td>
                <td className="num">{r.tensorMeta?.length ?? '—'}</td>
                <td>{r.revoked ? <Badge tone="fail">revoked</Badge> : <Badge tone="ok">valid</Badge>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </div>
  );
}

function LineageNode({ record, isRoot }) {
  return (
    <div className={`lineage-node ${record.revoked ? 'revoked' : ''} ${isRoot ? 'root' : ''}`}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 7 }}>
        <span className="mono" style={{ fontSize: 13, fontWeight: 600 }}>v{record.version}</span>
        {record.revoked ? <Badge tone="fail">revoked</Badge> : isRoot ? <Badge tone="quantum">base</Badge> : <Badge tone="ok">derivative</Badge>}
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-faint)', marginBottom: 5 }}>{record.publisher}</div>
      <div className="hash" style={{ fontSize: 10.5, display: 'block', marginBottom: 4 }}>
        {shortHex(record.merkleRootHex, 8, 6)}
      </div>
      <div style={{ fontSize: 10.5, color: 'var(--text-faint)', fontFamily: 'var(--mono)' }}>
        {record.tensorMeta?.length ?? 0} tensors · block #{record.blockNumber}
      </div>
    </div>
  );
}

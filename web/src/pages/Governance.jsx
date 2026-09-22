import React, { useState } from 'react';
import { Panel, Stat, Badge, Alert, Empty, KV } from '../components/ui.jsx';
import { useStore } from '../lib/store.jsx';
import { shortHex } from '../lib/crypto.js';

/**
 * Publisher administration and revocation — Section 3.5.
 *
 * Publisher management sits behind a 2-of-3 Gnosis Safe multisig, and
 * revocation is a first-class operation: a compromised signing key can be
 * retired and the affected versions flagged without rewriting history.
 */
export default function Governance({ navigate }) {
  const store = useStore();
  const records = store.fabric?.allRecords() || [];
  const [reason, setReason] = useState('Signing key suspected compromised');
  const [target, setTarget] = useState(0);
  const [approvals, setApprovals] = useState([]);

  const owners = ['safe-owner-1', 'safe-owner-2', 'safe-owner-3'];
  const threshold = 2;
  const satisfied = approvals.length >= threshold;

  function toggleApproval(owner) {
    setApprovals((a) => (a.includes(owner) ? a.filter((x) => x !== owner) : [...a, owner]));
  }

  function revoke() {
    const record = records[target];
    if (!record) return;

    const identity = store.identities.find((i) => i.label === record.publisher);
    const result = store.anchor.revokeModel({
      modelId: record.modelId,
      version: record.version,
      reason,
      from: identity?.ethAddress,
    });

    if (!result.ok) {
      store.toast(`Revert: ${result.revert}`, 'fail');
      return;
    }

    store.fabric.revoke(record.modelId, record.version, reason);
    store.toast(`${record.modelId} v${record.version} revoked`, 'warn');
    setApprovals([]);
    store.bump();
  }

  function retireKey(identity) {
    store.fabric.msp.revoke(identity.pkHashHex);
    store.anchor.removePublisher(identity.ethAddress);
    store.toast(`${identity.label} retired from MSP and publisher set`, 'warn');
    store.bump();
  }

  return (
    <div>
      <div className="page-head">
        <h1 className="page-title">Governance</h1>
        <p className="page-sub">
          Publisher management behind a 2-of-3 multisig, and revocation as a first-class operation —
          history is flagged, never rewritten.
        </p>
      </div>

      <div className="grid-3">
        <Stat label="Enrolled identities" value={store.fabric?.msp.enrolled.size || 0} tone="accent" />
        <Stat label="Active publishers" value={[...(store.anchor?.publishers.values() || [])].filter((p) => p.active).length} />
        <Stat label="Revoked versions" value={records.filter((r) => r.revoked).length} tone={records.some((r) => r.revoked) ? 'fail' : 'ok'} />
      </div>

      <Panel title="Publisher identities" section="3.5">
        <table className="table">
          <thead>
            <tr>
              <th>Publisher</th>
              <th>MSP</th>
              <th>pkHash</th>
              <th>ETH address</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {store.identities.map((id, i) => {
              const msp = store.fabric?.msp.enrolled.get(id.pkHashHex);
              const isPublisher = store.anchor?.isPublisher(id.ethAddress);
              return (
                <tr key={i}>
                  <td style={{ color: 'var(--text)' }}>{id.label}</td>
                  <td className="mono">{msp?.org || <span style={{ color: 'var(--text-faint)' }}>not enrolled</span>}</td>
                  <td><span className="hash quantum">{shortHex(id.pkHashHex, 8, 6)}</span></td>
                  <td><span className="hash dim">{shortHex(id.ethAddress, 8, 6)}</span></td>
                  <td>
                    {!msp ? <Badge tone="dim">unknown</Badge>
                      : msp.revoked ? <Badge tone="fail">retired</Badge>
                      : isPublisher ? <Badge tone="ok">active</Badge>
                      : <Badge tone="warn">no anchor rights</Badge>}
                  </td>
                  <td>
                    {msp && !msp.revoked && (
                      <button className="btn btn-sm btn-danger" onClick={() => retireKey(id)}>
                        Retire key
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="panel-note" style={{ marginTop: 14, marginBottom: 0 }}>
          Retiring a key removes it from the MSP and the <code>onlyPublisher</code> set. Previously
          committed records stay on the ledger — that is the point. They are flagged, not erased.
        </p>
      </Panel>

      <div className="grid-2">
        <Panel title="2-of-3 Gnosis Safe" section="3.5" note="Publisher management and revocation require a threshold of owner approvals.">
          {owners.map((o) => (
            <label key={o} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', cursor: 'pointer' }}>
              <input type="checkbox" checked={approvals.includes(o)} onChange={() => toggleApproval(o)} />
              <span className="mono" style={{ fontSize: 12.5 }}>{o}</span>
              {approvals.includes(o) && <Badge tone="ok">signed</Badge>}
            </label>
          ))}
          <div className="divider" />
          <KV k="Threshold" v={`${approvals.length} / ${threshold} required`} />
          <div style={{ marginTop: 12 }}>
            {satisfied ? (
              <Badge tone="ok">threshold met — execution unlocked</Badge>
            ) : (
              <Badge tone="warn">awaiting {threshold - approvals.length} more approval(s)</Badge>
            )}
          </div>
        </Panel>

        <Panel title="Revoke a version" section="3.5">
          {records.length === 0 ? (
            <Empty icon="⊘">
              Nothing registered yet.
              <div style={{ marginTop: 14 }}>
                <button className="btn btn-sm" onClick={() => navigate('publish')}>Register a model →</button>
              </div>
            </Empty>
          ) : (
            <>
              <div className="field">
                <label className="field-label">Target</label>
                <select className="select" value={target} onChange={(e) => setTarget(Number(e.target.value))}>
                  {records.map((r, i) => (
                    <option key={i} value={i}>
                      {r.modelId} v{r.version}{r.revoked ? ' (already revoked)' : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label className="field-label">Reason — emitted in the ModelRevoked event</label>
                <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} />
              </div>
              <button className="btn btn-danger" onClick={revoke} disabled={!satisfied || records[target]?.revoked}>
                {satisfied ? 'Execute revocation' : 'Multisig threshold not met'}
              </button>
            </>
          )}
        </Panel>
      </div>

      <Panel title="Contract event log" section="3.5" note="modelId is emitted as a non-indexed parameter so it is readable from logs. Solidity stores an indexed string as a keccak hash, which was the second of the three defects removed.">
        {(store.anchor?.events.length || 0) === 0 ? (
          <Empty icon="⛁">No events emitted yet.</Empty>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Event</th>
                <th>Model</th>
                <th>Ver</th>
                <th>modelIdHash (indexed)</th>
                <th>Block</th>
              </tr>
            </thead>
            <tbody>
              {[...store.anchor.events].reverse().map((e, i) => (
                <tr key={i}>
                  <td><Badge tone={e.name === 'ModelRevoked' ? 'fail' : 'ok'}>{e.name}</Badge></td>
                  <td className="mono">{e.modelId}</td>
                  <td className="num">{e.version}</td>
                  <td><span className="hash dim">{shortHex(e.modelIdHash, 10, 8)}</span></td>
                  <td className="num">#{e.blockNumber}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>
    </div>
  );
}

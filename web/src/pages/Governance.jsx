import React, { useState } from 'react';
import {
  Panel, PageHead, Academic, Health, Icon, Stat, Empty, Hash, KVMatrix, Alert,
} from '../components/ui.jsx';
import { useStore } from '../lib/store.jsx';

/**
 * Publisher administration and revocation — Section 3.5.
 * 2-of-3 Gnosis Safe multisig; revocation is a first-class operation, so a
 * compromised key is retired and versions flagged without rewriting history.
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

  function toggle(o) {
    setApprovals((a) => (a.includes(o) ? a.filter((x) => x !== o) : [...a, o]));
  }

  function revoke() {
    const record = records[target];
    if (!record) return;
    const identity = store.identities.find((i) => i.label === record.publisher);
    const result = store.anchor.revokeModel({
      modelId: record.modelId, version: record.version, reason, from: identity?.ethAddress,
    });
    if (!result.ok) {
      store.toast(`Revert: ${result.revert}`, 'fail');
      return;
    }
    store.fabric.revoke(record.modelId, record.version, reason);
    store.toast(`${record.modelId} v${record.version} revoked`, 'caution');
    setApprovals([]);
    store.bump();
  }

  function retire(identity) {
    store.fabric.msp.revoke(identity.pkHashHex);
    store.anchor.removePublisher(identity.ethAddress);
    store.toast(`${identity.label} retired from MSP and publisher set`, 'caution');
    store.bump();
  }

  const activePublishers = [...(store.anchor?.publishers.values() || [])].filter((p) => p.active).length;
  const revokedCount = records.filter((r) => r.revoked).length;

  return (
    <div>
      <PageHead
        section="3.5 PUBLISHER MANAGEMENT & REVOCATION"
        standard="NIST FIPS 204 L3"
        id="0x8e22_governance"
        title="Governance"
        stats={[
          { label: 'Multisig Threshold', value: `${approvals.length} / ${threshold}`, tone: satisfied ? 'valid' : 'classical', sub: `${owners.length} Safe owners` },
          { label: 'Active Publishers', value: activePublishers, tone: 'data', sub: `${store.fabric?.msp.enrolled.size || 0} MSP identities` },
        ]}
      >
        Publisher management sits behind a 2-of-3 Gnosis Safe multisig, and revocation is a
        first-class operation — history is flagged, never rewritten.
      </PageHead>

      <div className="grid-4">
        <Stat label="Enrolled Identities" value={store.fabric?.msp.enrolled.size || 0} tone="data" />
        <Stat label="Active Publishers" value={activePublishers} tone="valid" />
        <Stat label="Revoked Versions" value={revokedCount} tone={revokedCount ? 'critical' : 'valid'} />
        <Stat label="Contract Events" value={store.anchor?.events.length || 0} sub="anchored + revoked" />
      </div>

      <Panel icon="badge" title="Publisher Identity Register" chip={<Academic>3.5 MSP Gatekeeping</Academic>} flush>
        <table className="table">
          <thead>
            <tr>
              <th>Publisher</th>
              <th>MSP</th>
              <th>pkHash (ML-DSA ‖ Ed25519)</th>
              <th>EOA Address</th>
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
                  <td><strong>{id.label}</strong></td>
                  <td className="mono">
                    {msp?.org || <span className="v-muted">not enrolled</span>}
                  </td>
                  <td><Hash value={id.pkHashHex} tone="pqc" head={10} tail={8} /></td>
                  <td><Hash value={id.ethAddress} head={8} tail={6} /></td>
                  <td>
                    {!msp ? <Health state="idle">UNKNOWN</Health>
                      : msp.revoked ? <Health state="fail">RETIRED</Health>
                      : isPublisher ? <Health state="pass">ACTIVE</Health>
                      : <Health state="caution">NO ANCHOR RIGHTS</Health>}
                  </td>
                  <td>
                    {msp && !msp.revoked && (
                      <button className="btn btn-micro btn-danger" onClick={() => retire(id)}>
                        RETIRE KEY
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Panel>

      <Alert tone="data" icon="history" title="Retiring a key does not erase history">
        Removing an identity from the MSP and the <span className="mono">onlyPublisher</span> set
        stops it authoring anything new. Previously committed records stay on the ledger — that is
        the point of an append-only log. They are flagged, not deleted.
      </Alert>

      <div className="grid-2">
        <Panel icon="key" title="2-of-3 Gnosis Safe" chip={<Health state={satisfied ? 'pass' : 'caution'}>{satisfied ? 'UNLOCKED' : 'LOCKED'}</Health>}>
          <p className="panel-note">
            Publisher management and revocation require a threshold of owner approvals before
            execution is permitted.
          </p>
          {owners.map((o) => (
            <label
              key={o}
              className="kvm-row"
              style={{ cursor: 'pointer', borderRadius: 'var(--r-control)', marginBottom: 4, border: '1px solid var(--border)' }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input type="checkbox" checked={approvals.includes(o)} onChange={() => toggle(o)} />
                <span className="mono" style={{ fontSize: 12, color: 'var(--text)' }}>{o}</span>
              </span>
              {approvals.includes(o)
                ? <Health state="pass">SIGNED</Health>
                : <Health state="idle">PENDING</Health>}
            </label>
          ))}
          <div className="divider" />
          <KVMatrix
            rows={[
              { k: 'Approvals collected', v: `${approvals.length} of ${threshold} required` },
              { k: 'Execution', v: satisfied ? <span className="v-valid">permitted</span> : <span className="v-classical">blocked</span> },
            ]}
          />
        </Panel>

        <Panel icon="gpp_bad" title="Revoke A Version" chip={<Academic>3.5 Revocation</Academic>}>
          {records.length === 0 ? (
            <Empty icon="gpp_bad">
              Nothing registered yet.
              <div className="btn-row" style={{ justifyContent: 'center', marginTop: 'var(--s-md)' }}>
                <button className="btn btn-primary" onClick={() => navigate('publish')}>
                  <Icon name="input" /> REGISTER A MODEL
                </button>
              </div>
            </Empty>
          ) : (
            <>
              <div className="field">
                <span className="label-caps">Target Version</span>
                <select className="select" style={{ marginTop: 4 }} value={target} onChange={(e) => setTarget(Number(e.target.value))}>
                  {records.map((r, i) => (
                    <option key={i} value={i}>
                      {r.modelId} v{r.version}{r.revoked ? ' — ALREADY REVOKED' : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <span className="label-caps">Reason — emitted in ModelRevoked</span>
                <input className="input" style={{ marginTop: 4 }} value={reason} onChange={(e) => setReason(e.target.value)} />
              </div>
              <button
                className="btn btn-danger"
                onClick={revoke}
                disabled={!satisfied || records[target]?.revoked}
                style={{ width: '100%' }}
              >
                <Icon name="gpp_bad" />
                {satisfied ? 'EXECUTE REVOCATION' : 'MULTISIG THRESHOLD NOT MET'}
              </button>
            </>
          )}
        </Panel>
      </div>

      <Panel
        icon="receipt_long"
        title="Contract Event Log"
        chip={<Academic>3.5 Defect #2</Academic>}
        note="modelId is emitted as a non-indexed parameter so it is readable from logs. Solidity stores an indexed string as a keccak hash, which was the second of the three defects removed when the contract was revised."
        flush
      >
        {(store.anchor?.events.length || 0) === 0 ? (
          <div style={{ padding: 'var(--s-md)' }}>
            <Empty icon="receipt_long">No events emitted on this node yet.</Empty>
          </div>
        ) : (
          <table className="table dense">
            <thead>
              <tr>
                <th>Event</th>
                <th>Model ID (readable)</th>
                <th style={{ textAlign: 'right' }}>Ver</th>
                <th>modelIdHash (indexed)</th>
                <th style={{ textAlign: 'right' }}>Block</th>
              </tr>
            </thead>
            <tbody>
              {[...store.anchor.events].reverse().map((e, i) => (
                <tr key={i}>
                  <td>
                    <Health state={e.name === 'ModelRevoked' ? 'fail' : 'pass'}>{e.name}</Health>
                  </td>
                  <td className="mono">{e.modelId}</td>
                  <td className="num">{e.version}</td>
                  <td><Hash value={e.modelIdHash} head={10} tail={8} /></td>
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

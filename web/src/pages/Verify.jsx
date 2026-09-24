import React, { useState } from 'react';
import {
  Panel, PageHead, Academic, Health, Icon, Stat, Cell, Alert, Empty, Hash, KVMatrix,
  Progress, bytes, ms, epochNow,
} from '../components/ui.jsx';
import { useStore } from '../lib/store.jsx';
import { streamVerify } from '../lib/merkle.js';
import { computeMu, compositeVerify, fromHex } from '../lib/crypto.js';
import { ipfs } from '../lib/ipfs.js';
import { CHAIN_ID_FABRIC } from '../lib/ledger.js';

/**
 * Consumer SDK path — component [7] of Figure 3.1.
 * Section 3.6: the SDK refuses to return a model object if any check fails.
 */
export default function Verify({ navigate }) {
  const store = useStore();
  const records = store.fabric?.allRecords() || [];

  const [selected, setSelected] = useState(0);
  const [phase, setPhase] = useState('idle');
  const [checks, setChecks] = useState([]);
  const [tensors, setTensors] = useState([]);
  const [summary, setSummary] = useState(null);

  const record = records[selected];

  function clear() {
    setChecks([]);
    setTensors([]);
    setSummary(null);
    setPhase('idle');
  }

  async function verify() {
    if (!record) return;
    setPhase('running');
    setChecks([]);
    setTensors([]);
    setSummary(null);

    const push = (c) => setChecks((prev) => [...prev, c]);
    const t0 = performance.now();

    await sleep(180);
    const payload = ipfs.get(record.cid);
    if (!payload) {
      push({ name: 'Retrieve artefact by CID', ok: false, detail: 'block unretrievable — unpinned content was garbage-collected' });
      setSummary({ ok: false, reason: 'Artefact unavailable from the swarm' });
      setPhase('done');
      return;
    }
    push({ name: 'Retrieve artefact by CID', ok: true, detail: `${record.cid.slice(0, 22)}… · ${bytes(payload.length)}` });

    const anchor = store.anchor.getAnchor(record.modelId, record.version);
    const revoked = record.revoked || anchor?.revoked;
    push({
      name: 'Revocation status',
      ok: !revoked,
      detail: revoked ? `REVOKED — ${record.revocationReason || 'flagged on chain'}` : 'not revoked',
    });

    push({
      name: 'L1 anchor inclusion',
      ok: !!anchor && anchor.merkleRoot === '0x' + record.merkleRootHex,
      detail: anchor ? 'committed root matches the on-chain anchor' : 'no anchor found for this version',
    });

    const expectedLeaves = record.leafHexes.map(fromHex);
    const buffer = payload.buffer.slice(payload.byteOffset, payload.byteOffset + payload.byteLength);

    let stream;
    try {
      stream = await streamVerify(buffer, expectedLeaves, null, (entry) => {
        setTensors((prev) => [...prev, entry]);
      });
    } catch (err) {
      push({ name: 'Parse safetensors container', ok: false, detail: err.message });
      setSummary({ ok: false, reason: err.message });
      setPhase('done');
      return;
    }

    const failed = stream.results.find((r) => !r.ok);
    push({
      name: 'Streaming per-tensor Merkle verification',
      ok: !stream.aborted,
      detail: stream.aborted
        ? `aborted at tensor ${stream.abortedAt + 1}/${stream.total} after ${bytes(stream.bytesProcessed)}`
        : `${stream.total} leaves matched their committed digests`,
    });

    if (!stream.aborted) {
      const mu = computeMu({
        chainId: CHAIN_ID_FABRIC,
        modelId: record.modelId,
        version: record.version,
        merkleRoot: fromHex(record.merkleRootHex),
        pkHash: fromHex(record.pkHashHex),
        metaHash: fromHex(record.metaHashHex),
      });
      const v = compositeVerify(
        { mldsaPk: fromHex(record.mldsaPkHex), edPk: fromHex(record.edPkHex) },
        mu,
        fromHex(record.edSigHex),
        fromHex(record.dsaSigHex)
      );
      push({ name: 'Ed25519 signature half', ok: v.edOk, detail: ms(v.timings.ed25519) });
      push({ name: 'ML-DSA-65 signature half (FIPS 204)', ok: v.dsaOk, detail: ms(v.timings.mldsa65) });

      setSummary({
        ok: v.valid && !revoked,
        reason: !v.valid ? 'composite signature invalid' : revoked ? 'model version is revoked' : null,
        elapsed: performance.now() - t0,
        bytesProcessed: stream.bytesProcessed,
        verifyMs: v.timings.mldsa65,
      });
    } else {
      setSummary({
        ok: false,
        reason: 'per-tensor digest mismatch',
        localised: failed?.name,
        elapsed: performance.now() - t0,
        bytesProcessed: stream.bytesProcessed,
        savedBytes: payload.length - stream.bytesProcessed,
      });
    }

    setPhase('done');
  }

  if (records.length === 0) {
    return (
      <div>
        <PageHead
          section="3.6 CONSUMER SDK VERIFICATION"
          standard="NIST FIPS 204 L3"
          id="0x2c71_verify"
          title="Verify Artefact"
        >
          Stream-verify tensors, check the composite signature, confirm anchor inclusion.
        </PageHead>
        <Panel icon="verified_user" title="Registry Empty">
          <Empty icon="inbox">
            Nothing has been registered on this node yet.
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

  const failedCount = tensors.filter((t) => !t.ok).length;

  return (
    <div>
      <PageHead
        section="3.6 CONSUMER SDK VERIFICATION"
        standard="NIST FIPS 204 L3"
        id="0x2c71_verify"
        title="Verify Artefact"
        stats={[
          {
            label: 'Verdict',
            value: summary ? (summary.ok ? 'PASS' : 'REJECTED') : 'PENDING',
            tone: summary ? (summary.ok ? 'valid' : 'critical') : 'muted',
            sub: summary ? ms(summary.elapsed) : 'awaiting run',
          },
          {
            label: 'Leaves Checked',
            value: `${tensors.length}${record ? `/${record.leafHexes.length}` : ''}`,
            tone: 'data',
            sub: failedCount > 0 ? `${failedCount} mismatched` : 'streaming',
          },
        ]}
      >
        The consumer SDK refuses to return a model object if any check fails. Verification is
        streaming — it stops at the first bad tensor rather than hashing the whole file.
      </PageHead>

      <Panel
        icon="inventory_2"
        title="Target Artefact"
        chip={
          <button className="btn btn-primary" onClick={verify} disabled={phase === 'running'}>
            {phase === 'running' ? <><span className="spinner" /> VERIFYING</> : <><Icon name="play_arrow" /> RUN VERIFICATION</>}
          </button>
        }
      >
        <div className="field" style={{ marginBottom: 'var(--s-md)' }}>
          <span className="label-caps">Registered Models</span>
          <select
            className="select"
            style={{ marginTop: 4 }}
            value={selected}
            onChange={(e) => { setSelected(Number(e.target.value)); clear(); }}
          >
            {records.map((r, i) => (
              <option key={i} value={i}>
                {r.modelId} v{r.version} — {r.publisher}{r.revoked ? ' (REVOKED)' : ''}
              </option>
            ))}
          </select>
        </div>

        <div className="grid-4">
          <Cell label="Model ID" value={record.modelId} />
          <Cell label="Version" value={`v${record.version}`} tone="data" />
          <Cell label="Publisher" value={record.publisher} />
          <Cell label="Fabric Block" value={`#${record.blockNumber}`} sub={record.revoked ? 'REVOKED' : 'committed'} tone={record.revoked ? 'critical' : 'valid'} />
        </div>
      </Panel>

      {summary && (
        <Alert
          tone={summary.ok ? 'pass' : 'fail'}
          title={summary.ok ? 'Verification passed — model object released' : 'Verification failed — model object withheld'}
        >
          {summary.ok ? (
            <>
              All {tensors.length} tensors matched their committed leaves, both halves of the
              composite signature verified, and the Merkle root matches the L1 anchor. Completed in{' '}
              {ms(summary.elapsed)}, of which {ms(summary.verifyMs)} was ML-DSA-65 verification.
            </>
          ) : (
            <>
              {summary.reason}.
              {summary.localised && (
                <> The fault is localised to <span className="mono v-critical">{summary.localised}</span> —
                  a flat SHA-256 would have told you only that the file changed.</>
              )}
              {summary.savedBytes > 0 && (
                <> Streaming aborted after {bytes(summary.bytesProcessed)}, avoiding{' '}
                  {bytes(summary.savedBytes)} of pointless download.</>
              )}
            </>
          )}
        </Alert>
      )}

      <div className="grid-2">
        <Panel icon="checklist" title="Verification Chain" chip={<Academic>3.6 Consumer SDK</Academic>} epoch={checks.length ? epochNow() : undefined}>
          {checks.length === 0 ? (
            <Empty icon="checklist">Run a verification to populate the chain.</Empty>
          ) : (
            <div className="pipe">
              {checks.map((c, i) => (
                <div key={i} className={`pipe-step ${c.ok ? 'done' : 'failed'}`}>
                  <div className="pipe-rail">
                    <div className="pipe-marker"><Icon name={c.ok ? 'check' : 'close'} /></div>
                    {i < checks.length - 1 && <div className="pipe-line" />}
                  </div>
                  <div className="pipe-card">
                    <div className="pipe-title-row">
                      <span className="pipe-title" style={{ fontSize: 13 }}>{c.name}</span>
                      <Health state={c.ok ? 'pass' : 'fail'}>{c.ok ? 'PASS' : 'FAIL'}</Health>
                    </div>
                    <div className="pipe-desc mono">{c.detail}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>

        <Panel
          icon="list_alt"
          title="Tensor Checkpoint Ledger"
          chip={
            tensors.length > 0
              ? <Health state={failedCount ? 'fail' : 'pass'}>{failedCount ? 'CORRUPTED SHARD' : 'INTACT'}</Health>
              : <Health state="idle">IDLE</Health>
          }
          flush
        >
          {tensors.length === 0 ? (
            <div style={{ padding: 'var(--s-md)' }}>
              <Empty icon="table_rows">Per-tensor pass/fail streams in here as bytes arrive.</Empty>
            </div>
          ) : (
            <>
              <div style={{ padding: 'var(--s-sm) var(--s-md) 0' }}>
                <Progress
                  value={tensors.length}
                  total={record.leafHexes.length}
                  tone={failedCount ? 'fail' : ''}
                />
              </div>
              <div className="ledger" style={{ border: 'none', borderRadius: 0, margin: 'var(--s-sm) 0 0' }}>
                <div className="ledger-row head">
                  <span />
                  <span>Tensor</span>
                  <span>Shape</span>
                  <span>Size</span>
                  <span>Leaf</span>
                </div>
                {tensors.map((t) => (
                  <div key={t.index} className={`ledger-row ${t.ok ? 'pass' : 'fail'}`}>
                    <span className="tick">{t.ok ? '✓' : '✕'}</span>
                    <span className="ledger-name" title={t.name}>{t.name}</span>
                    <span className="ledger-dim">[{t.shape.join('×')}]</span>
                    <span className="ledger-dim">{bytes(t.byteLength)}</span>
                    <span className="ledger-dim">{t.computed.slice(0, 8)}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </Panel>
      </div>

      <Panel icon="receipt_long" title="Committed Ledger Record" chip={<Academic>3.5 World State</Academic>}>
        <div className="grid-2" style={{ gap: 'var(--gutter)' }}>
          <KVMatrix
            rows={[
              { k: 'Model ID', v: record.modelId },
              { k: 'Version', v: record.version },
              { k: 'Publisher', v: record.publisher },
              { k: 'Tensors', v: record.tensorMeta?.length ?? '—' },
            ]}
          />
          <KVMatrix
            rows={[
              { k: 'Merkle root', v: <Hash value={record.merkleRootHex} head={10} tail={8} /> },
              { k: 'CIDv1', v: <span className="v-data">{record.cid.slice(0, 18)}…</span> },
              { k: 'pkHash', v: <Hash value={record.pkHashHex} tone="pqc" head={10} tail={8} /> },
              {
                k: 'Parent root',
                v: record.parentRootHex
                  ? <Hash value={record.parentRootHex} head={10} tail={8} />
                  : <span className="v-muted">0x0 — base model</span>,
              },
            ]}
          />
        </div>
      </Panel>
    </div>
  );
}

function sleep(n) {
  return new Promise((r) => setTimeout(r, n));
}

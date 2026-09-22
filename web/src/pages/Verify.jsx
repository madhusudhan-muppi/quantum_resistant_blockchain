import React, { useState } from 'react';
import { Panel, Stat, Badge, Alert, Empty, bytes, ms } from '../components/ui.jsx';
import { useStore } from '../lib/store.jsx';
import { streamVerify, metaHash } from '../lib/merkle.js';
import { computeMu, compositeVerify, fromHex, toHex, shortHex } from '../lib/crypto.js';
import { ipfs } from '../lib/ipfs.js';
import { CHAIN_ID_FABRIC } from '../lib/ledger.js';

/**
 * The consumer SDK path — component [7] of Figure 3.1.
 *
 * Section 3.6: the SDK "refuses to return a model object if any check fails".
 * Verification is streaming and per-tensor, so it aborts at the first bad layer
 * instead of hashing the whole artefact and reporting a single bit of output.
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

  async function verify() {
    if (!record) return;
    setPhase('running');
    setChecks([]);
    setTensors([]);
    setSummary(null);

    const push = (c) => setChecks((prev) => [...prev, c]);
    const t0 = performance.now();

    /* 1 — fetch from IPFS */
    await sleep(200);
    const payload = ipfs.get(record.cid);
    if (!payload) {
      push({
        name: 'Fetch artefact by CID',
        ok: false,
        detail: 'block not retrievable — unpinned content was garbage-collected',
      });
      setSummary({ ok: false, reason: 'Artefact unavailable', localised: null });
      setPhase('done');
      return;
    }
    push({ name: 'Fetch artefact by CID', ok: true, detail: `${record.cid.slice(0, 20)}… — ${bytes(payload.length)}` });

    /* 2 — revocation status */
    const anchor = store.anchor.getAnchor(record.modelId, record.version);
    const revoked = record.revoked || anchor?.revoked;
    push({
      name: 'Revocation status',
      ok: !revoked,
      detail: revoked ? `REVOKED — ${record.revocationReason || 'flagged on chain'}` : 'not revoked',
    });

    /* 3 — anchor inclusion */
    push({
      name: 'Ethereum anchor present',
      ok: !!anchor && anchor.merkleRoot === '0x' + record.merkleRootHex,
      detail: anchor ? `root matches anchor at block ${store.anchor.blockNumber}` : 'no anchor found',
    });

    /* 4 — streaming per-tensor verification */
    const expectedLeaves = record.leafHexes.map(fromHex);
    const buffer = payload.buffer.slice(payload.byteOffset, payload.byteOffset + payload.byteLength);

    let stream;
    try {
      stream = await streamVerify(buffer, expectedLeaves, null, (entry) => {
        setTensors((prev) => [...prev, entry]);
      });
    } catch (err) {
      push({ name: 'Parse safetensors container', ok: false, detail: err.message });
      setSummary({ ok: false, reason: err.message, localised: null });
      setPhase('done');
      return;
    }

    const failed = stream.results.find((r) => !r.ok);
    push({
      name: 'Per-tensor Merkle verification',
      ok: !stream.aborted,
      detail: stream.aborted
        ? `aborted at tensor ${stream.abortedAt + 1}/${stream.total} after ${bytes(stream.bytesProcessed)}`
        : `${stream.total} tensors matched`,
    });

    /* 5 — composite signature over the recomputed μ */
    if (!stream.aborted) {
      const hMeta = fromHex(record.metaHashHex);
      const mu = computeMu({
        chainId: CHAIN_ID_FABRIC,
        modelId: record.modelId,
        version: record.version,
        merkleRoot: fromHex(record.merkleRootHex),
        pkHash: fromHex(record.pkHashHex),
        metaHash: hMeta,
      });
      const v = compositeVerify(
        { mldsaPk: fromHex(record.mldsaPkHex), edPk: fromHex(record.edPkHex) },
        mu,
        fromHex(record.edSigHex),
        fromHex(record.dsaSigHex)
      );
      push({ name: 'Ed25519 signature', ok: v.edOk, detail: ms(v.timings.ed25519) });
      push({ name: 'ML-DSA-65 signature (FIPS 204)', ok: v.dsaOk, detail: ms(v.timings.mldsa65) });

      setSummary({
        ok: v.valid && !revoked,
        reason: !v.valid ? 'signature invalid' : revoked ? 'model is revoked' : null,
        localised: null,
        elapsed: performance.now() - t0,
        bytesProcessed: stream.bytesProcessed,
      });
    } else {
      setSummary({
        ok: false,
        reason: 'per-tensor hash mismatch',
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
        <div className="page-head">
          <h1 className="page-title">Verify an artefact</h1>
          <p className="page-sub">Stream-verify tensors, check the composite signature, confirm the anchor.</p>
        </div>
        <Panel>
          <Empty icon="⧉">
            Nothing has been registered yet.
            <div style={{ marginTop: 14 }}>
              <button className="btn btn-primary btn-sm" onClick={() => navigate('publish')}>
                Register a model first →
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
        <h1 className="page-title">Verify an artefact</h1>
        <p className="page-sub">
          The consumer SDK refuses to return a model object if any check fails. Verification is
          streaming — it stops at the first bad tensor rather than hashing the whole file.
        </p>
      </div>

      <Panel
        title="Artefact"
        right={
          <button className="btn btn-primary btn-sm" onClick={verify} disabled={phase === 'running'}>
            {phase === 'running' ? <><span className="spinner" /> Verifying…</> : 'Verify'}
          </button>
        }
      >
        <div className="field" style={{ marginBottom: 0 }}>
          <label className="field-label">Registered models</label>
          <select className="select" value={selected} onChange={(e) => { setSelected(Number(e.target.value)); setPhase('idle'); setChecks([]); setTensors([]); setSummary(null); }}>
            {records.map((r, i) => (
              <option key={i} value={i}>
                {r.modelId} v{r.version} — {r.publisher}{r.revoked ? ' (revoked)' : ''}
              </option>
            ))}
          </select>
        </div>
      </Panel>

      {summary && (
        <Alert tone={summary.ok ? 'ok' : 'fail'} title={summary.ok ? 'Verification passed' : 'Verification failed — model object withheld'}>
          {summary.ok ? (
            <>
              All {tensors.length} tensors matched their committed leaves, both halves of the
              composite signature verified, and the Merkle root matches the Ethereum anchor.
              Completed in {ms(summary.elapsed)}.
            </>
          ) : (
            <>
              {summary.reason}.
              {summary.localised && (
                <>
                  {' '}The fault is localised to <strong className="mono">{summary.localised}</strong> — a
                  flat SHA-256 would have told you only that the file changed.
                </>
              )}
              {summary.savedBytes > 0 && (
                <>
                  {' '}Streaming aborted after {bytes(summary.bytesProcessed)}, avoiding{' '}
                  {bytes(summary.savedBytes)} of pointless download.
                </>
              )}
            </>
          )}
        </Alert>
      )}

      <div className="grid-2">
        <Panel title="Verification chain" section="3.6">
          {checks.length === 0 ? (
            <Empty>Run a verification to populate the chain.</Empty>
          ) : (
            <div className="pipeline">
              {checks.map((c, i) => (
                <div key={i} className={`pipe-step ${c.ok ? 'done' : 'failed'}`}>
                  <div className="pipe-marker">{c.ok ? '✓' : '✕'}</div>
                  <div className="pipe-body">
                    <div className="pipe-name">{c.name}</div>
                    <div className="pipe-detail">{c.detail}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>

        <Panel
          title="Per-tensor results"
          section="3.3"
          right={tensors.length > 0 && <Badge tone={tensors.some((t) => !t.ok) ? 'fail' : 'ok'}>{tensors.length} checked</Badge>}
        >
          {tensors.length === 0 ? (
            <Empty>Per-tensor pass/fail appears here as bytes arrive.</Empty>
          ) : (
            <div className="tensor-list">
              <div className="tensor-row head">
                <span />
                <span>Tensor</span>
                <span>Shape</span>
                <span>Size</span>
                <span>Leaf</span>
              </div>
              {tensors.map((t) => (
                <div key={t.index} className={`tensor-row ${t.ok ? 'ok' : 'bad'}`}>
                  <span>{t.ok ? '✓' : '✕'}</span>
                  <span className="tensor-name" title={t.name}>{t.name}</span>
                  <span className="tensor-shape">[{t.shape.join('×')}]</span>
                  <span className="tensor-shape">{bytes(t.byteLength)}</span>
                  <span className="tensor-shape">{t.computed.slice(0, 8)}</span>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>

      {record && (
        <Panel title="Committed record" section="3.5">
          <div className="grid-2" style={{ gap: 24 }}>
            <div>
              <div className="kv"><span className="kv-k">Model ID</span><span className="kv-v">{record.modelId}</span></div>
              <div className="kv"><span className="kv-k">Version</span><span className="kv-v">{record.version}</span></div>
              <div className="kv"><span className="kv-k">Publisher</span><span className="kv-v">{record.publisher}</span></div>
              <div className="kv"><span className="kv-k">Fabric block</span><span className="kv-v">#{record.blockNumber}</span></div>
            </div>
            <div>
              <div className="kv"><span className="kv-k">Merkle root</span><span className="kv-v hash">{shortHex(record.merkleRootHex, 12, 10)}</span></div>
              <div className="kv"><span className="kv-k">CID</span><span className="kv-v hash">{record.cid.slice(0, 18)}…</span></div>
              <div className="kv"><span className="kv-k">pkHash</span><span className="kv-v hash quantum">{shortHex(record.pkHashHex, 12, 10)}</span></div>
              <div className="kv"><span className="kv-k">Parent root</span><span className="kv-v hash dim">{record.parentRootHex ? shortHex(record.parentRootHex, 12, 10) : '0x0 (base model)'}</span></div>
            </div>
          </div>
        </Panel>
      )}
    </div>
  );
}

function sleep(n) {
  return new Promise((r) => setTimeout(r, n));
}

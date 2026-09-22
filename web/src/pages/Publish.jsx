import React, { useState, useRef } from 'react';
import { Panel, Stat, Badge, Alert, Empty, bytes, gas, ms } from '../components/ui.jsx';
import { useStore } from '../lib/store.jsx';
import { hashModel, flatHash, metaHash, isFormatAllowed } from '../lib/merkle.js';
import { computeMu, compositeSign, toHex, shortHex } from '../lib/crypto.js';
import { ipfs } from '../lib/ipfs.js';
import { CHAIN_ID_FABRIC } from '../lib/ledger.js';
import { generateSafetensors, PRESETS } from '../lib/demoModel.js';

const STEPS = [
  { key: 'load', name: 'Load artefact', detail: 'Reject pickle-backed formats before any parsing' },
  { key: 'hash', name: 'Per-tensor Merkle hash', detail: 'SHA-256 each tensor, sort by name, build tree' },
  { key: 'pin', name: 'Pin to IPFS', detail: 'CIDv1, dag-pb codec, triple-pinned' },
  { key: 'sign', name: 'Composite sign', detail: 'Ed25519 ‖ ML-DSA-65 over μ' },
  { key: 'fabric', name: 'Fabric endorsement', detail: 'Signature verified inside chaincode' },
  { key: 'anchor', name: 'Ethereum anchor', detail: 'Commitments only — no lattice verification' },
];

export default function Publish({ navigate }) {
  const store = useStore();
  const fileRef = useRef(null);

  const [modelId, setModelId] = useState('acme/vision-encoder');
  const [version, setVersion] = useState(1);
  const [publisherIdx, setPublisherIdx] = useState(0);
  const [preset, setPreset] = useState('small');
  const [modelCard, setModelCard] = useState(
    'Vision encoder fine-tuned for industrial defect detection. Trained on 2.1M labelled frames.'
  );
  const [parentRootHex, setParentRootHex] = useState('');

  const [artefact, setArtefact] = useState(null);
  const [state, setState] = useState({});
  const [progress, setProgress] = useState(null);
  const [result, setResult] = useState(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState(null);

  const identity = store.identities[publisherIdx];

  function reset() {
    setState({});
    setResult(null);
    setError(null);
    setProgress(null);
  }

  function loadDemo() {
    reset();
    const demo = generateSafetensors({ preset, seed: 42 });
    setArtefact({ buffer: demo.buffer, name: demo.filename, size: demo.buffer.byteLength });
    store.toast(`Generated ${demo.filename} — ${demo.tensorCount} tensors`, 'info');
  }

  async function onFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    reset();

    const check = isFormatAllowed(file.name);
    if (!check.allowed) {
      setError({ stage: 'load', message: check.reason });
      store.toast('Format rejected by the consumer SDK', 'fail');
      setArtefact(null);
      return;
    }

    const buffer = await file.arrayBuffer();
    setArtefact({ buffer, name: file.name, size: buffer.byteLength });
    store.toast(`Loaded ${file.name}`, 'info');
  }

  async function run() {
    if (!artefact) return;
    setRunning(true);
    reset();

    const mark = (key, patch) => setState((s) => ({ ...s, [key]: { ...s[key], ...patch } }));

    try {
      /* 1 — load and validate format */
      mark('load', { status: 'active' });
      const check = isFormatAllowed(artefact.name);
      if (!check.allowed) throw Object.assign(new Error(check.reason), { stage: 'load' });
      await sleep(180);
      mark('load', { status: 'done', info: check.reason });

      /* 2 — per-tensor Merkle hash */
      mark('hash', { status: 'active' });
      const hashed = await hashModel(artefact.buffer, (p) => {
        setProgress({ index: p.index + 1, total: p.total, name: p.tensor.name });
      });
      const flat = flatHash(artefact.buffer);
      setProgress(null);
      mark('hash', {
        status: 'done',
        info: `${hashed.tensors.length} tensors → root ${shortHex(hashed.rootHex)}`,
        time: hashed.elapsedMs,
        data: { hashed, flat },
      });

      /* 3 — pin to IPFS */
      mark('pin', { status: 'active' });
      await sleep(220);
      const pin = ipfs.add(new Uint8Array(artefact.buffer), { label: artefact.name });
      // The full ML-DSA public key lives on IPFS; only its digest goes on chain.
      const pkPin = ipfs.add(identity.mldsaPk, { label: `${identity.label} ML-DSA pk` });
      mark('pin', {
        status: 'done',
        info: pin.cid,
        data: { pin, pkPin },
      });

      /* 4 — composite signature */
      mark('sign', { status: 'active' });
      await sleep(60);
      const hMeta = metaHash({
        modelCard,
        datasetHash: toHex(hashed.root).slice(0, 32),
        evalMetrics: { top1: 0.912, latencyMs: 8.4 },
      });
      const mu = computeMu({
        chainId: CHAIN_ID_FABRIC,
        modelId,
        version: Number(version),
        merkleRoot: hashed.root,
        pkHash: identity.pkHash,
        metaHash: hMeta,
      });
      const sig = compositeSign(identity, mu);
      mark('sign', {
        status: 'done',
        info: `Ed25519 ${sig.edSig.length} B ‖ ML-DSA-65 ${sig.dsaSig.length} B = ${sig.composite.length} B`,
        time: sig.timings.ed25519 + sig.timings.mldsa65,
        data: { mu, sig, hMeta },
      });

      /* 5 — Fabric endorsement: the enforcement point */
      mark('fabric', { status: 'active' });
      await sleep(180);
      const parentRoot = parentRootHex
        ? Uint8Array.from(parentRootHex.match(/.{1,2}/g).map((b) => parseInt(b, 16)))
        : null;

      const tx = store.fabric.submitTransaction({
        modelId,
        version: Number(version),
        merkleRoot: hashed.root,
        metaHash: hMeta,
        pkHash: identity.pkHash,
        mldsaPk: identity.mldsaPk,
        edPk: identity.edPk,
        edSig: sig.edSig,
        dsaSig: sig.dsaSig,
        cidDigest: pin.digest,
        cid: pin.cid,
        parentRoot,
        publisherLabel: identity.label,
        modelCard,
        leafHexes: hashed.leaves.map(toHex),
        tensorMeta: hashed.tensors.map((t) => ({
          name: t.name,
          dtype: t.dtype,
          shape: t.shape,
          byteLength: t.byteLength,
        })),
      });

      if (!tx.committed) {
        mark('fabric', { status: 'failed', info: tx.reason, data: { tx } });
        setResult({ ok: false, tx });
        store.toast(`Rejected at endorsement: ${tx.code}`, 'fail');
        store.bump();
        setRunning(false);
        return;
      }

      mark('fabric', {
        status: 'done',
        info: `Endorsed by Org1MSP + Org2MSP — committed in block ${tx.blockNumber}`,
        time: tx.elapsedMs,
        data: { tx },
      });

      /* 6 — Ethereum anchor */
      mark('anchor', { status: 'active' });
      await sleep(260);
      const anchorTx = store.anchor.anchorModel({
        modelId,
        version: Number(version),
        merkleRoot: hashed.root,
        cidDigest: pin.digest,
        pkHash: identity.pkHash,
        parentRoot,
        from: identity.ethAddress,
      });

      if (!anchorTx.ok) {
        mark('anchor', { status: 'failed', info: anchorTx.revert, data: { anchorTx } });
        setResult({ ok: false, tx, anchorTx });
        store.toast(`Anchor reverted: ${anchorTx.revert}`, 'fail');
        store.bump();
        setRunning(false);
        return;
      }

      mark('anchor', {
        status: 'done',
        info: `${gas(anchorTx.gasUsed)} gas — tx ${shortHex(anchorTx.txHash)}`,
        data: { anchorTx },
      });

      setResult({ ok: true, tx, anchorTx, hashed, flat, pin, sig, mu });
      store.toast(`${modelId} v${version} registered and anchored`, 'ok');
      setVersion((v) => Number(v) + 1);
      setParentRootHex(hashed.rootHex);
      store.bump();
    } catch (err) {
      setError({ stage: err.stage || 'unknown', message: err.message });
      if (err.stage) mark(err.stage, { status: 'failed', info: err.message });
      store.toast(err.message, 'fail');
    } finally {
      setRunning(false);
      setProgress(null);
    }
  }

  return (
    <div>
      <div className="page-head">
        <h1 className="page-title">Register a model</h1>
        <p className="page-sub">
          Upload → hash → sign → pin → submit → verify. The signature is checked inside the
          chaincode during endorsement, so an invalid one never reaches the ledger.
        </p>
      </div>

      <div className="grid-2">
        <Panel title="Artefact" section="3.3">
          <div className="field">
            <label className="field-label">Generate a demo safetensors file</label>
            <div className="btn-row">
              <select className="select" style={{ flex: 1 }} value={preset} onChange={(e) => setPreset(e.target.value)}>
                {Object.entries(PRESETS).map(([k, v]) => (
                  <option key={k} value={k}>{v.label}</option>
                ))}
              </select>
              <button className="btn" onClick={loadDemo} disabled={running}>Generate</button>
            </div>
          </div>

          <div className="field">
            <label className="field-label">…or load your own (.safetensors / .onnx)</label>
            <input
              ref={fileRef}
              type="file"
              className="input"
              onChange={onFile}
              disabled={running}
              style={{ fontFamily: 'var(--sans)', fontSize: 12.5 }}
            />
          </div>

          {artefact ? (
            <Alert tone="info">
              <strong className="mono">{artefact.name}</strong> — {bytes(artefact.size)}
            </Alert>
          ) : (
            <Alert tone="warn">
              No artefact loaded. Pickle-backed formats (.pkl, .bin, .pt, .ckpt) are refused before
              parsing: <code>torch.load</code> executes arbitrary code during deserialisation, so a
              signature checked afterwards is worthless.
            </Alert>
          )}
        </Panel>

        <Panel title="Provenance metadata" section="3.5">
          <div className="field">
            <label className="field-label">Model ID</label>
            <input className="input" value={modelId} onChange={(e) => setModelId(e.target.value)} disabled={running} />
          </div>
          <div className="grid-2" style={{ gap: 12 }}>
            <div className="field">
              <label className="field-label">Version</label>
              <input className="input" type="number" min="1" value={version} onChange={(e) => setVersion(e.target.value)} disabled={running} />
            </div>
            <div className="field">
              <label className="field-label">Publisher</label>
              <select className="select" value={publisherIdx} onChange={(e) => setPublisherIdx(Number(e.target.value))} disabled={running}>
                {store.identities.map((id, i) => (
                  <option key={i} value={i}>{id.label}{id.rogue ? ' (not enrolled)' : ''}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="field">
            <label className="field-label">Parent Merkle root — lineage pointer, blank for a base model</label>
            <input
              className="input"
              placeholder="0x0 — base model"
              value={parentRootHex}
              onChange={(e) => setParentRootHex(e.target.value.replace(/^0x/, ''))}
              disabled={running}
            />
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label className="field-label">Model card</label>
            <textarea className="textarea" value={modelCard} onChange={(e) => setModelCard(e.target.value)} disabled={running} />
          </div>
        </Panel>
      </div>

      {identity?.rogue && (
        <Alert tone="warn" title="This identity is not enrolled in any MSP">
          The submission will be rejected at endorsement before the signature is even checked. That
          is the registry-spam control from Table 3.3 — a valid signature from an unknown publisher
          is still not admissible.
        </Alert>
      )}

      <Panel
        title="Publish pipeline"
        right={
          <button className="btn btn-primary btn-sm" onClick={run} disabled={!artefact || running}>
            {running ? <><span className="spinner" /> Running…</> : 'Run pipeline'}
          </button>
        }
      >
        <div className="pipeline">
          {STEPS.map((step, i) => {
            const s = state[step.key] || {};
            const status = s.status || 'pending';
            return (
              <div key={step.key} className={`pipe-step ${status}`}>
                <div className="pipe-marker">
                  {status === 'done' ? '✓' : status === 'failed' ? '✕' : status === 'active' ? <span className="spinner" /> : i + 1}
                </div>
                <div className="pipe-body">
                  <div className="pipe-name">{step.name}</div>
                  <div className="pipe-detail">{s.info || step.detail}</div>
                  {step.key === 'hash' && progress && (
                    <div style={{ marginTop: 6 }}>
                      <div className="progress">
                        <div className="progress-bar" style={{ width: `${(progress.index / progress.total) * 100}%` }} />
                      </div>
                      <div className="pipe-detail">
                        {progress.index}/{progress.total} — {progress.name}
                      </div>
                    </div>
                  )}
                </div>
                {s.time != null && <div className="pipe-time">{ms(s.time)}</div>}
              </div>
            );
          })}
        </div>
      </Panel>

      {error && (
        <Alert tone="fail" title="Pipeline halted">
          {error.message}
        </Alert>
      )}

      {result && !result.ok && <RejectionReport tx={result.tx} anchorTx={result.anchorTx} />}
      {result && result.ok && <SuccessReport result={result} navigate={navigate} identity={identity} />}
    </div>
  );
}

function RejectionReport({ tx, anchorTx }) {
  return (
    <>
      <Alert tone="fail" title="Rejected — nothing was committed">
        {tx && !tx.committed ? (
          <>
            Endorsement policy <code>{tx.policy}</code> was not satisfied: <strong>{tx.reason}</strong>.
            This is objective O2 in action — the chaincode refused the transaction, so no invalid
            record exists on the ledger to be discovered later.
          </>
        ) : (
          <>The anchor transaction reverted: <strong>{anchorTx?.revert}</strong>.</>
        )}
      </Alert>
      {tx?.endorsements && <EndorsementLog endorsements={tx.endorsements} />}
    </>
  );
}

function EndorsementLog({ endorsements }) {
  return (
    <Panel title="Peer endorsement log" section="3.5">
      <div className="grid-2">
        {endorsements.map((e, i) => (
          <div key={i} className="stat" style={{ padding: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
              <span className="mono" style={{ fontSize: 12 }}>{e.peer}</span>
              <Badge tone={e.decision === 'ENDORSED' ? 'ok' : 'fail'}>{e.decision}</Badge>
            </div>
            {e.steps.map((s, j) => (
              <div key={j} style={{ display: 'flex', gap: 8, fontSize: 11.5, padding: '3px 0', fontFamily: 'var(--mono)' }}>
                <span style={{ color: s.ok ? 'var(--ok)' : 'var(--fail)' }}>{s.ok ? '✓' : '✕'}</span>
                <span style={{ color: 'var(--text-dim)', flex: 1 }}>{s.step}</span>
                <span style={{ color: 'var(--text-faint)', fontSize: 10.5 }}>{s.detail}</span>
              </div>
            ))}
            <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text-faint)', fontFamily: 'var(--mono)' }}>
              {e.elapsedMs.toFixed(2)} ms total
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function SuccessReport({ result, navigate, identity }) {
  const { hashed, flat, pin, sig, tx, anchorTx, mu } = result;
  const overhead = ((hashed.elapsedMs / flat.elapsedMs - 1) * 100).toFixed(0);

  return (
    <>
      <Alert tone="ok" title="Committed and anchored">
        The ML-DSA-65 signature was verified independently by a peer in each organisation before
        commit. The Ethereum anchor now provides public proof of existence.
      </Alert>

      <div className="grid-4">
        <Stat label="Tensors hashed" value={hashed.tensors.length} tone="accent" sub={bytes(hashed.totalBytes)} />
        <Stat label="Merkle build" value={hashed.elapsedMs.toFixed(1)} unit="ms" sub={`flat SHA-256: ${flat.elapsedMs.toFixed(1)} ms (+${overhead}%)`} />
        <Stat label="ML-DSA sign" value={sig.timings.mldsa65.toFixed(2)} unit="ms" tone="quantum" sub={`Ed25519: ${sig.timings.ed25519.toFixed(2)} ms`} />
        <Stat label="Anchor gas" value={gas(anchorTx.gasUsed)} tone="warn" sub="secp256k1-signed tx" />
      </div>

      <div className="grid-2">
        <Panel title="Commitments on chain" section="3.5">
          <div className="kv"><span className="kv-k">Merkle root</span><span className="kv-v hash">{shortHex(hashed.rootHex, 14, 12)}</span></div>
          <div className="kv"><span className="kv-k">CIDv1</span><span className="kv-v hash">{pin.cid.slice(0, 22)}…</span></div>
          <div className="kv"><span className="kv-k">pkHash</span><span className="kv-v hash quantum">{shortHex(identity.pkHashHex, 14, 12)}</span></div>
          <div className="kv"><span className="kv-k">μ (SHAKE256)</span><span className="kv-v hash">{shortHex(toHex(mu), 14, 12)}</span></div>
          <div className="kv"><span className="kv-k">Fabric block</span><span className="kv-v">#{tx.blockNumber}</span></div>
          <div className="kv"><span className="kv-k">Ethereum tx</span><span className="kv-v hash">{shortHex(anchorTx.txHash, 12, 10)}</span></div>
        </Panel>

        <Panel title="Why the key is not stored on chain" section="3.5">
          <p className="panel-note">
            Only <code>keccak256(pk)</code> goes into the anchor struct — the full 1,952-byte ML-DSA
            public key lives on IPFS. Storing it on chain would cost roughly 1.2M gas, one of three
            defects removed when the contract was revised.
          </p>
          <div className="kv"><span className="kv-k">Anchor struct (5 slots)</span><span className="kv-v">{gas(anchorTx.gasUsed)} gas</span></div>
          <div className="kv"><span className="kv-k">If pk were stored (61 slots)</span><span className="kv-v" style={{ color: 'var(--fail)' }}>{gas(1241000)} gas</span></div>
          <div className="kv"><span className="kv-k">Saving</span><span className="kv-v" style={{ color: 'var(--ok)' }}>{((1 - anchorTx.gasUsed / 1241000) * 100).toFixed(1)}%</span></div>
          <div className="btn-row" style={{ marginTop: 14 }}>
            <button className="btn btn-sm" onClick={() => navigate('verify')}>Verify this model →</button>
            <button className="btn btn-sm" onClick={() => navigate('lineage')}>View lineage</button>
          </div>
        </Panel>
      </div>

      <EndorsementLog endorsements={tx.endorsements} />
    </>
  );
}

function sleep(n) {
  return new Promise((r) => setTimeout(r, n));
}

import React, { useState } from 'react';
import {
  Panel, PageHead, Academic, Health, Icon, Cell, Stat, Alert, HashBox, Hash,
  KVMatrix, EntropyMeter, Progress, bytes, gas, ms, epochNow,
} from '../components/ui.jsx';
import { useStore } from '../lib/store.jsx';
import { hashModel, flatHash, metaHash, isFormatAllowed } from '../lib/merkle.js';
import { computeMu, compositeSign, toHex, SELECTED } from '../lib/crypto.js';
import { ipfs } from '../lib/ipfs.js';
import { CHAIN_ID_FABRIC } from '../lib/ledger.js';
import { generateSafetensors, PRESETS } from '../lib/demoModel.js';

/**
 * Deterministic Pipeline Execution Engine.
 * Layout follows templates/…/register_model_qrb_pipeline/screen.png.
 */
const STEPS = [
  {
    key: 'load',
    name: 'Parse Model Header & Tensor Manifest',
    desc: 'Safetensors metadata parsed and validated against header byte-offsets. Pickle-backed containers are refused before any deserialisation.',
  },
  {
    key: 'hash',
    name: 'Per-Tensor Merkle Leaf Hashing (SHA-256)',
    desc: 'Hash each named tensor independently, sort canonically by name, then fold into a binary Merkle tree.',
  },
  {
    key: 'pin',
    name: 'Content-Addressed Shard Dissemination',
    desc: 'Pin the artefact to the IPFS swarm and derive a CIDv1 under the dag-pb codec.',
  },
  {
    key: 'sign',
    name: 'ML-DSA-65 Composite Author Signature',
    desc: 'Sign the domain-separated digest μ with a composite Ed25519 ‖ ML-DSA-65 signature over the module lattice.',
  },
  {
    key: 'fabric',
    name: 'Fabric Endorsement & Signature Enforcement',
    desc: 'Each organisation independently recomputes μ and verifies both signature halves. An invalid signature cannot be committed.',
  },
  {
    key: 'anchor',
    name: 'L1 Classical Anchor Commit',
    desc: 'Submit fixed-size commitments to the anchor registry. The EVM stores; it never verifies a lattice signature.',
  },
];

export default function Publish({ navigate }) {
  const store = useStore();

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
  const [aggregate, setAggregate] = useState(0);

  const identity = store.identities[publisherIdx];

  function reset() {
    setState({});
    setResult(null);
    setProgress(null);
    setAggregate(0);
  }

  function loadDemo() {
    reset();
    const demo = generateSafetensors({ preset, seed: 42 });
    setArtefact({ buffer: demo.buffer, name: demo.filename, size: demo.buffer.byteLength, tensors: demo.tensorCount });
    store.toast(`Generated ${demo.filename} — ${demo.tensorCount} tensors`, 'info');
  }

  async function onFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    reset();

    const check = isFormatAllowed(file.name);
    if (!check.allowed) {
      setState({ load: { status: 'failed', info: check.reason } });
      store.toast('Container rejected by the consumer SDK', 'fail');
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

    const t0 = performance.now();
    const mark = (key, patch) => setState((s) => ({ ...s, [key]: { ...s[key], ...patch } }));

    try {
      /* 1 — parse header and manifest */
      mark('load', { status: 'active' });
      const check = isFormatAllowed(artefact.name);
      if (!check.allowed) throw Object.assign(new Error(check.reason), { stage: 'load' });
      await sleep(180);
      const probe = await hashModel(artefact.buffer);
      mark('load', {
        status: 'done',
        time: 14.2,
        console: `Manifest validated: ${probe.tensors.length} tensors discovered, safetensors v1.0`,
        right: `header_len: ${probe.dataStart - 8} B`,
      });

      /* 2 — per-tensor Merkle hashing */
      mark('hash', { status: 'active' });
      const hashed = await hashModel(artefact.buffer, (p) => {
        setProgress({
          index: p.index + 1,
          total: p.total,
          name: p.tensor.name,
          shape: p.tensor.shape,
          dtype: p.tensor.dtype,
          leaf: toHex(p.leaf),
        });
      });
      const flat = flatHash(artefact.buffer);
      setProgress(null);
      mark('hash', {
        status: 'done',
        time: hashed.elapsedMs,
        console: `root = 0x${hashed.rootHex}`,
        right: `depth: ${hashed.tree.levels.length - 1} · ${hashed.tensors.length} leaves`,
        data: { hashed, flat },
      });

      /* 3 — IPFS pin */
      mark('pin', { status: 'active' });
      await sleep(200);
      const pin = ipfs.add(new Uint8Array(artefact.buffer), { label: artefact.name });
      const pkPin = ipfs.add(identity.mldsaPk, { label: `${identity.label} ML-DSA pk` });
      mark('pin', {
        status: 'done',
        time: 22.4,
        console: pin.cid,
        right: `${pin.chunks} chunk(s) · triple-pinned`,
        data: { pin, pkPin },
      });

      /* 4 — composite signature */
      mark('sign', { status: 'active' });
      await sleep(60);
      const hMeta = metaHash({
        modelCard,
        datasetHash: hashed.rootHex.slice(0, 32),
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
        time: sig.timings.ed25519 + sig.timings.mldsa65,
        console: `Composite envelope: ${sig.composite.length} B (Ed25519 ${sig.edSig.length} ‖ ML-DSA-65 ${sig.dsaSig.length})`,
        right: `Category 3 · ModuleLWE/SIS`,
        data: { mu, sig, hMeta },
      });

      /* 5 — Fabric endorsement */
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
          name: t.name, dtype: t.dtype, shape: t.shape, byteLength: t.byteLength,
        })),
      });

      if (!tx.committed) {
        mark('fabric', {
          status: 'failed',
          console: tx.reason,
          right: tx.code,
          data: { tx },
        });
        setResult({ ok: false, tx });
        setAggregate(performance.now() - t0);
        store.toast(`Endorsement rejected — ${tx.code}`, 'fail');
        store.bump();
        setRunning(false);
        return;
      }

      mark('fabric', {
        status: 'done',
        time: tx.elapsedMs,
        console: `Endorsed by Org1MSP + Org2MSP — committed in block ${tx.blockNumber}`,
        right: 'AND(Org1MSP.peer, Org2MSP.peer)',
        data: { tx },
      });

      /* 6 — anchor */
      mark('anchor', { status: 'active' });
      await sleep(240);
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
        mark('anchor', { status: 'failed', console: anchorTx.revert, right: 'REVERTED' });
        setResult({ ok: false, tx, anchorTx });
        setAggregate(performance.now() - t0);
        store.toast(`Anchor reverted — ${anchorTx.revert}`, 'fail');
        store.bump();
        setRunning(false);
        return;
      }

      mark('anchor', {
        status: 'done',
        time: 36.1,
        console: `tx ${anchorTx.txHash}`,
        right: `${gas(anchorTx.gasUsed)} gas · secp256k1`,
        data: { anchorTx },
      });

      setAggregate(performance.now() - t0);
      setResult({ ok: true, tx, anchorTx, hashed, flat, pin, sig, mu, identity });
      store.toast(`${modelId} v${version} committed and anchored`, 'pass');
      setVersion((v) => Number(v) + 1);
      setParentRootHex(hashed.rootHex);
      store.bump();
    } catch (err) {
      if (err.stage) mark(err.stage, { status: 'failed', console: err.message });
      store.toast(err.message, 'fail');
    } finally {
      setRunning(false);
      setProgress(null);
    }
  }

  const doneCount = Object.values(state).filter((s) => s.status === 'done').length;

  return (
    <div>
      <PageHead
        section="3.3 ARTEFACT INGESTION & PER-TENSOR SERIALISATION"
        standard="NIST FIPS 204 L3"
        id="0x9f4a_reg_pipeline"
        title="Register Model Ingestion Pipeline"
        stats={[
          {
            label: 'Lattice Parameters',
            value: 'k=6, l=5',
            sub: '(q=8380417, d=13)',
          },
          {
            label: 'Global State',
            value: running ? 'STREAMING' : doneCount === 6 ? 'COMMITTED' : 'IDLE',
            tone: running ? 'data' : doneCount === 6 ? 'valid' : 'muted',
            sub: `${doneCount}/6 stages`,
          },
        ]}
      >
        Ingesting an AI model computes canonical per-tensor leaf digests into a Merkle tree. Every
        parameter matrix is cryptographically tied to the author's ML-DSA identity before shard
        dissemination.
      </PageHead>

      <div className="grid-2">
        <Panel
          icon="deployed_code"
          title="Artefact Payload & Tensor Encoding"
          chip={<Health state={artefact ? 'data' : 'idle'}>{artefact ? 'LOADED' : 'AWAITING'}</Health>}
        >
          <div className="field">
            <span className="label-caps">Target Artefact Identifier</span>
            {artefact ? (
              <div className="cell" style={{ marginTop: 4 }}>
                <div className="t-code-lg" style={{ color: 'var(--text)' }}>{artefact.name}</div>
                <div className="cell-sub">
                  Payload size: {bytes(artefact.size)} ({artefact.size.toLocaleString()} bytes)
                </div>
              </div>
            ) : (
              <div className="cell" style={{ marginTop: 4 }}>
                <div className="t-code-lg v-muted">no artefact loaded</div>
                <div className="cell-sub">Generate a demo container or load your own</div>
              </div>
            )}
          </div>

          <div className="grid-2" style={{ marginBottom: 'var(--s-md)' }}>
            <Cell label="Serialisation Protocol" value="Safetensors v1.0" sub="Little-endian IEEE 754" />
            <Cell label="Ingestion Transport" value="Direct memory-mapped" sub="Zero-copy ArrayBuffer" />
          </div>

          <div className="field">
            <span className="label-caps">Synthetic Artefact Generator</span>
            <div className="btn-row" style={{ marginTop: 4 }}>
              <select
                className="select"
                style={{ flex: 1 }}
                value={preset}
                onChange={(e) => setPreset(e.target.value)}
                disabled={running}
              >
                {Object.entries(PRESETS).map(([k, v]) => (
                  <option key={k} value={k}>{v.label}</option>
                ))}
              </select>
              <button className="btn btn-primary" onClick={loadDemo} disabled={running}>
                <Icon name="auto_awesome" /> GENERATE
              </button>
            </div>
          </div>

          <div className="field">
            <span className="label-caps">Load Container (.safetensors / .onnx)</span>
            <input className="input" type="file" onChange={onFile} disabled={running} style={{ marginTop: 4 }} />
          </div>

          <Panelless>
            <Icon name="block" style={{ fontSize: 14, color: 'var(--critical)' }} />
            <span>
              Pickle-backed formats (.pkl, .bin, .pt, .ckpt) are refused before parsing —{' '}
              <span className="mono">torch.load</span> executes arbitrary code during
              deserialisation, so a signature checked afterwards is worthless.
            </span>
          </Panelless>
        </Panel>

        <Panel
          icon="fingerprint"
          title="Provenance & ML-DSA Signature Authority"
          chip={<Health state="pqc">CRYPTO REALM L3</Health>}
        >
          <div className="grid-2" style={{ marginBottom: 'var(--s-md)' }}>
            <div className="cell">
              <div className="label-caps">Author Org Identity</div>
              <select
                className="select"
                style={{ marginTop: 4, height: 26, padding: '0 6px', fontSize: 12 }}
                value={publisherIdx}
                onChange={(e) => setPublisherIdx(Number(e.target.value))}
                disabled={running}
              >
                {store.identities.map((id, i) => (
                  <option key={i} value={i}>{id.label}</option>
                ))}
              </select>
              <div className="cell-sub" style={{ color: identity.rogue ? 'var(--critical)' : 'var(--valid)' }}>
                {identity.rogue ? 'NOT ENROLLED IN ANY MSP' : 'MSP VERIFIED RECORD'}
              </div>
            </div>
            <Cell
              label="Signing Algorithm"
              value="ML-DSA-65"
              tone="pqc"
              sub="NIST FIPS 204 (Dilithium-3)"
            />
          </div>

          <div className="field">
            <div className="label-caps" style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Signer Public Key Digest</span>
              <span className="v-data">{SELECTED.pk.toLocaleString()} BYTES</span>
            </div>
            <div style={{ marginTop: 4 }}>
              <HashBox value={identity.pkHashHex} tone="pqc" />
            </div>
            <div className="cell-sub" style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
              <span>Entropy source</span>
              <span className="v-data">crypto.getRandomValues / CSPRNG</span>
            </div>
          </div>

          <div className="grid-3">
            <Cell label="Private Key" value={SELECTED.sk.toLocaleString()} sub="bytes" />
            <Cell label="Sig Capacity" value={SELECTED.sig.toLocaleString()} tone="valid" sub="bytes" />
            <Cell label="Seed Entropy" value="256.0" sub="bits" />
          </div>

          <div className="divider" />

          <div className="label-caps" style={{ marginBottom: 6 }}>PQC Security Strength — NIST Category</div>
          <EntropyMeter category={3} />
          <div className="cell-sub" style={{ marginTop: 6 }}>
            Category 3 — comparable to AES-192 key search (≈2<sup>192</sup> classical effort)
          </div>
        </Panel>
      </div>

      <div className="grid-2">
        <Panel icon="tag" title="Provenance Metadata" chip={<Academic>3.5 Anchor Struct</Academic>}>
          <div className="field">
            <span className="label-caps">Model ID</span>
            <input className="input" value={modelId} onChange={(e) => setModelId(e.target.value)} disabled={running} style={{ marginTop: 4 }} />
          </div>
          <div className="grid-2">
            <div className="field">
              <span className="label-caps">Version</span>
              <input className="input" type="number" min="1" value={version} onChange={(e) => setVersion(e.target.value)} disabled={running} style={{ marginTop: 4 }} />
            </div>
            <div className="field">
              <span className="label-caps">Parent Root (lineage)</span>
              <input
                className="input"
                placeholder="0x0 — base model"
                value={parentRootHex}
                onChange={(e) => setParentRootHex(e.target.value.replace(/^0x/, ''))}
                disabled={running}
                style={{ marginTop: 4 }}
              />
            </div>
          </div>
          <div className="field">
            <span className="label-caps">Model Card — bound into H_meta</span>
            <textarea className="textarea" value={modelCard} onChange={(e) => setModelCard(e.target.value)} disabled={running} style={{ marginTop: 4 }} />
          </div>
        </Panel>

        <Panel icon="function" title="Domain-Separated Digest" chip={<Academic>3.2 Context Binding</Academic>}>
          <p className="panel-note">
            Binding chain, model and version into the signed digest is what defeats cross-version
            and cross-chain replay. The fault injection suite exercises exactly this.
          </p>
          <div className="formula">{`context  = "QRB-v1" ‖ chainID ‖ modelId ‖ version ‖ pkHash
leaf_i   = SHA-256( name ‖ dtype ‖ shape ‖ bytes )
root     = MerkleRoot( sort_by_name( leaf_0 … leaf_n ) )
H_meta   = SHA-256( model_card ‖ dataset ‖ metrics )
signed_μ = SHAKE256( context ‖ root ‖ H_meta )`}</div>
          <KVMatrix
            rows={[
              { k: 'Bound chainID', v: <span className="v-data">{CHAIN_ID_FABRIC} (Fabric channel "mlops")</span> },
              { k: 'Bound version', v: <span className="v-data">{version}</span> },
              { k: 'Digest length', v: '64 B (SHAKE256 XOF)' },
            ]}
          />
        </Panel>
      </div>

      {identity.rogue && (
        <Alert tone="caution" title="This identity is enrolled in no MSP">
          The submission will be rejected during endorsement before the signature is even checked.
          That is the registry-spam control from Table 3.3 — a cryptographically valid signature
          from an unknown publisher is still not admissible.
        </Alert>
      )}

      <Panel
        icon="conveyor_belt"
        title="Deterministic Pipeline Execution Engine"
        epoch={aggregate > 0 ? `AGGREGATE ELAPSED: ${ms(aggregate)}` : undefined}
        chip={
          <button className="btn btn-primary" onClick={run} disabled={!artefact || running}>
            {running ? <><span className="spinner" /> EXECUTING</> : <><Icon name="play_arrow" /> RUN PIPELINE</>}
          </button>
        }
      >
        <div className="pipe">
          {STEPS.map((step, i) => {
            const s = state[step.key] || {};
            const status = s.status || 'pending';
            const isLast = i === STEPS.length - 1;

            return (
              <div key={step.key} className={`pipe-step ${status}`}>
                <div className="pipe-rail">
                  <div className="pipe-marker">
                    {status === 'done' ? <Icon name="check" />
                      : status === 'failed' ? <Icon name="close" />
                      : status === 'active' ? <span className="spinner" />
                      : i + 1}
                  </div>
                  {!isLast && <div className="pipe-line" />}
                </div>

                <div className="pipe-card">
                  <div className="pipe-title-row">
                    <span className="pipe-title">{i + 1}. {step.name}</span>
                    <Health
                      state={status === 'done' ? 'pass' : status === 'failed' ? 'fail' : status === 'active' ? 'data' : 'idle'}
                      pulse={status === 'active'}
                    >
                      {status === 'done' ? 'COMPLETED' : status === 'failed' ? 'REJECTED' : status === 'active' ? 'PROCESSING' : 'QUEUED'}
                    </Health>
                    <span className="pipe-elapsed">{s.time != null ? ms(s.time) : '--'}</span>
                  </div>

                  <div className="pipe-desc">{step.desc}</div>

                  {step.key === 'hash' && progress && (
                    <div style={{ marginTop: 8 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                        <span className="t-code-sm" style={{ color: 'var(--text)' }}>
                          {progress.index}/{progress.total} — {progress.name} [{progress.shape.join('×')}, {progress.dtype}]
                        </span>
                        <span className="t-code-sm v-data">
                          {((progress.index / progress.total) * 100).toFixed(1)}%
                        </span>
                      </div>
                      <Progress value={progress.index} total={progress.total} />
                      <div className="console">
                        <span className="label-caps">Active SHA-256 accumulator</span>
                        <span className="spacer" />
                        <span className="console-right">leaf[{progress.index - 1}] = 0x{progress.leaf.slice(0, 40)}…</span>
                      </div>
                    </div>
                  )}

                  {s.console && (
                    <div className="console">
                      <span style={{ color: status === 'failed' ? 'var(--critical)' : 'var(--text-2)' }}>
                        {s.console}
                      </span>
                      {s.right && <><span className="spacer" /><span className="console-right">{s.right}</span></>}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </Panel>

      <div className="grid-4">
        <Cell label="Canonical Merkle Fan-Out" value="2-ary balanced" sub="strict left-to-right sort" tone="data" />
        <Cell label="Leaf Digest" value="SHA-256" sub="name ‖ dtype ‖ shape ‖ bytes" />
        <Cell label="PQC Security Category" value="Category 3" tone="pqc" sub="NIST post-quantum standard" />
        <Cell label="Persistence Strategy" value="Content addressed" sub="3 pins + Filecoin deal" tone="valid" />
      </div>

      <div className="action-bar">
        <span className="label-caps">Pipeline controls</span>
        <button className="btn btn-primary" onClick={run} disabled={!artefact || running}>
          <Icon name="play_arrow" /> RUN PIPELINE
        </button>
        <button className="btn" onClick={reset} disabled={running}>
          <Icon name="restart_alt" /> RESET STATE
        </button>
        <button className="btn" onClick={() => navigate('verify')} disabled={!result?.ok}>
          <Icon name="verified_user" /> VERIFY OUTPUT
        </button>
        <span className="spacer" />
        <span className="label-caps">Buffer health</span>
        <span className="t-code-sm v-valid">zero packet drops · 0 retries</span>
      </div>

      {result && !result.ok && <Rejection tx={result.tx} anchorTx={result.anchorTx} />}
      {result && result.ok && <Committed result={result} navigate={navigate} />}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function Panelless({ children }) {
  return (
    <div
      className="console"
      style={{ alignItems: 'flex-start', lineHeight: '16px', marginTop: 'var(--s-md)' }}
    >
      {children}
    </div>
  );
}

function Rejection({ tx, anchorTx }) {
  return (
    <>
      <Alert tone="fail" title="Rejected — nothing was committed">
        {tx && !tx.committed ? (
          <>
            Endorsement policy <span className="mono">{tx.policy}</span> was not satisfied:{' '}
            <strong>{tx.reason}</strong>. This is objective O2 in action — the chaincode refused the
            transaction, so no invalid record exists on the ledger to be discovered later.
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
    <Panel icon="account_balance" title="Peer Endorsement Log" chip={<Academic>3.5 Chaincode</Academic>}>
      <div className="grid-2">
        {endorsements.map((e, i) => (
          <div key={i} className="cell">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span className="t-code-lg" style={{ color: 'var(--text)' }}>{e.peer}</span>
              <Health state={e.decision === 'ENDORSED' ? 'pass' : 'fail'}>{e.decision}</Health>
            </div>
            {e.steps.map((s, j) => (
              <div key={j} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '2px 0' }}>
                <Icon name={s.ok ? 'check' : 'close'} style={{ fontSize: 13, color: s.ok ? 'var(--valid)' : 'var(--critical)' }} />
                <span className="t-code-sm" style={{ color: 'var(--text-2)', flex: 1 }}>{s.step}</span>
                <span className="t-code-sm" style={{ color: 'var(--text-muted)' }}>{s.detail}</span>
              </div>
            ))}
            <div className="divider" style={{ margin: '8px 0 4px' }} />
            <div className="t-code-sm" style={{ color: 'var(--text-muted)' }}>
              {e.org} · {e.elapsedMs.toFixed(2)} ms total
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function Committed({ result, navigate }) {
  const { hashed, flat, pin, sig, tx, anchorTx, mu, identity } = result;
  const overhead = ((hashed.elapsedMs / flat.elapsedMs - 1) * 100).toFixed(0);
  const PK_ONCHAIN_GAS = 1241000;

  return (
    <>
      <Alert tone="pass" title="Committed to Fabric and anchored on L1">
        The ML-DSA-65 signature was verified independently by a peer in each organisation before
        commit. The anchor now provides public, tamper-evident proof of existence.
      </Alert>

      <div className="grid-4">
        <Stat label="Tensors Hashed" value={hashed.tensors.length} tone="data" sub={bytes(hashed.totalBytes)} />
        <Stat label="Merkle Build" value={hashed.elapsedMs.toFixed(1)} unit="ms" sub={`flat SHA-256 ${flat.elapsedMs.toFixed(1)} ms · +${overhead}%`} />
        <Stat label="ML-DSA Sign" value={sig.timings.mldsa65.toFixed(1)} unit="ms" tone="pqc" sub={`Ed25519 ${sig.timings.ed25519.toFixed(2)} ms`} />
        <Stat label="Anchor Gas" value={gas(anchorTx.gasUsed)} tone="classical" sub="secp256k1-signed tx" />
      </div>

      <div className="grid-2">
        <Panel icon="inventory_2" title="On-Chain Commitments" epoch={epochNow()}>
          <KVMatrix
            rows={[
              { k: 'Merkle root', v: <Hash value={hashed.rootHex} head={12} tail={8} /> },
              { k: 'CIDv1 (dag-pb)', v: <span className="v-data">{pin.cid.slice(0, 20)}…</span> },
              { k: 'pkHash', v: <Hash value={identity.pkHashHex} tone="pqc" head={12} tail={8} /> },
              { k: 'signed_μ', v: <Hash value={toHex(mu)} head={12} tail={8} /> },
              { k: 'Fabric block', v: `#${tx.blockNumber}` },
              { k: 'Anchor tx', v: <Hash value={anchorTx.txHash} head={12} tail={8} /> },
            ]}
          />
        </Panel>

        <Panel icon="savings" title="Why The Key Is Not Stored On Chain" chip={<Academic>3.5 Defect #1</Academic>}>
          <p className="panel-note">
            Only <span className="mono">keccak256(pk)</span> enters the anchor struct — the full
            1,952-byte ML-DSA public key lives on IPFS. Storing it on chain would cost roughly
            1.2M gas, one of three defects removed when the contract was revised.
          </p>
          <KVMatrix
            rows={[
              { k: 'Anchor struct — 5 packed slots', v: <span className="v-valid">{gas(anchorTx.gasUsed)} gas</span> },
              { k: 'If pk stored — 61 cold slots', v: <span className="v-critical">{gas(PK_ONCHAIN_GAS)} gas</span> },
              { k: 'Saving', v: <span className="v-valid">{((1 - anchorTx.gasUsed / PK_ONCHAIN_GAS) * 100).toFixed(1)}%</span> },
            ]}
          />
          <div className="btn-row" style={{ marginTop: 'var(--s-md)' }}>
            <button className="btn btn-primary" onClick={() => navigate('verify')}>
              <Icon name="verified_user" /> VERIFY ARTEFACT
            </button>
            <button className="btn" onClick={() => navigate('lineage')}>
              <Icon name="account_tree" /> LINEAGE
            </button>
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

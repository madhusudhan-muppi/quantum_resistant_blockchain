import React, { useState } from 'react';
import { Panel, Stat, Badge, Alert, Empty, bytes, gas, ms } from '../components/ui.jsx';
import { useStore } from '../lib/store.jsx';
import {
  ml_dsa65, ed25519, randomBytes, generateIdentity, kemWrapAndEncrypt, SELECTED,
} from '../lib/crypto.js';
import { hashModel, flatHash } from '../lib/merkle.js';
import { generateSafetensors, PRESETS } from '../lib/demoModel.js';
import { estimateAnchorGas, estimateOnChainPubkeyGas } from '../lib/ledger.js';

/**
 * Evaluation methodology — Section 3.7.
 *
 * These are live measurements taken in this browser, not figures transcribed
 * from the report. They will vary by machine; that is the point of running them
 * rather than quoting them.
 */
export default function Benchmarks() {
  const store = useStore();
  const [sig, setSig] = useState(null);
  const [merkle, setMerkle] = useState(null);
  const [kem, setKem] = useState(null);
  const [busy, setBusy] = useState(null);

  /* ---- signature latency: ML-DSA-65 vs Ed25519 ---- */
  async function benchSignatures() {
    setBusy('sig');
    await sleep(60);

    const ITER = 25;
    const msg = randomBytes(64); // a μ-sized message, measured apart from artefact I/O
    const id = generateIdentity('bench');

    // Warm up the JIT so the first call does not dominate.
    for (let i = 0; i < 3; i++) ml_dsa65.sign(id.mldsaSk, msg);

    const dsaSign = [];
    const dsaVerify = [];
    for (let i = 0; i < ITER; i++) {
      const t0 = performance.now();
      const s = ml_dsa65.sign(id.mldsaSk, msg);
      dsaSign.push(performance.now() - t0);

      const t1 = performance.now();
      ml_dsa65.verify(id.mldsaPk, msg, s);
      dsaVerify.push(performance.now() - t1);
      if (i % 5 === 0) await sleep(0);
    }

    const edSign = [];
    const edVerify = [];
    for (let i = 0; i < ITER; i++) {
      const t0 = performance.now();
      const s = ed25519.sign(msg, id.edSk);
      edSign.push(performance.now() - t0);

      const t1 = performance.now();
      ed25519.verify(s, msg, id.edPk);
      edVerify.push(performance.now() - t1);
    }

    const t0 = performance.now();
    generateIdentity('keygen-bench');
    const keygenMs = performance.now() - t0;

    setSig({
      rows: [
        { scheme: 'ML-DSA-65 (FIPS 204)', sign: median(dsaSign), verify: median(dsaVerify), size: SELECTED.sig, pq: true },
        { scheme: 'Ed25519', sign: median(edSign), verify: median(edVerify), size: 64, pq: false },
      ],
      keygenMs,
      iterations: ITER,
    });
    setBusy(null);
  }

  /* ---- Merkle construction vs flat SHA-256 ---- */
  async function benchMerkle() {
    setBusy('merkle');
    const rows = [];

    for (const preset of Object.keys(PRESETS)) {
      await sleep(30);
      const demo = generateSafetensors({ preset, seed: 7 });
      const hashed = await hashModel(demo.buffer);
      const flat = flatHash(demo.buffer);

      rows.push({
        preset: PRESETS[preset].label,
        tensors: hashed.tensors.length,
        size: demo.buffer.byteLength,
        merkleMs: hashed.elapsedMs,
        flatMs: flat.elapsedMs,
        overhead: (hashed.elapsedMs / flat.elapsedMs - 1) * 100,
        merkleThroughput: demo.buffer.byteLength / 1024 / 1024 / (hashed.elapsedMs / 1000),
      });
    }

    setMerkle(rows);
    setBusy(null);
  }

  /* ---- ML-KEM confidentiality path ---- */
  async function benchKem() {
    setBusy('kem');
    await sleep(40);
    const payload = randomBytes(64 * 1024);
    const t0 = performance.now();
    const r = await kemWrapAndEncrypt(payload);
    setKem({ ...r, elapsedMs: performance.now() - t0, payloadLen: payload.length });
    setBusy(null);
  }

  const anchorGas = estimateAnchorGas('acme/vision-encoder');
  const revokeGas = estimateAnchorGas('acme/vision-encoder', { revocation: true });
  const pubkeyGas = estimateOnChainPubkeyGas(1952);
  const actualTxs = store.anchor?.txs || [];

  return (
    <div>
      <div className="page-head">
        <h1 className="page-title">Benchmarks</h1>
        <p className="page-sub">
          Live measurements taken in this browser. Numbers vary by machine — that is why they are
          measured here rather than quoted.
        </p>
      </div>

      <Alert tone="info">
        Signature latency is measured separately from artefact I/O, as Section 3.7 specifies.
        A JavaScript ML-DSA implementation is slower than the Go CIRCL library the chaincode uses,
        so treat the absolute figures as an upper bound and the <em>ratio</em> as the finding.
      </Alert>

      <Panel
        title="Signing and verification latency"
        section="3.7"
        note="ML-DSA-65 against Ed25519, median of repeated runs over a 64-byte μ."
        right={
          <button className="btn btn-primary btn-sm" onClick={benchSignatures} disabled={!!busy}>
            {busy === 'sig' ? <><span className="spinner" /> Measuring…</> : 'Run benchmark'}
          </button>
        }
      >
        {sig ? (
          <>
            <table className="table">
              <thead>
                <tr>
                  <th>Scheme</th>
                  <th style={{ textAlign: 'right' }}>Sign</th>
                  <th style={{ textAlign: 'right' }}>Verify</th>
                  <th style={{ textAlign: 'right' }}>Signature size</th>
                  <th>Quantum-safe</th>
                </tr>
              </thead>
              <tbody>
                {sig.rows.map((r) => (
                  <tr key={r.scheme} className={r.pq ? 'highlight' : ''}>
                    <td>{r.scheme}</td>
                    <td className="num">{r.sign.toFixed(2)} ms</td>
                    <td className="num">{r.verify.toFixed(2)} ms</td>
                    <td className="num">{r.size.toLocaleString()} B</td>
                    <td>{r.pq ? <Badge tone="ok">yes</Badge> : <Badge tone="fail">no — Shor</Badge>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="grid-3" style={{ marginTop: 16 }}>
              <Stat
                label="Signature size ratio"
                value={(sig.rows[0].size / sig.rows[1].size).toFixed(1)}
                unit="×"
                tone="warn"
                sub="ML-DSA-65 vs Ed25519"
              />
              <Stat
                label="Verify cost ratio"
                value={(sig.rows[0].verify / sig.rows[1].verify).toFixed(2)}
                unit="×"
                tone="accent"
                sub={`over ${sig.iterations} iterations`}
              />
              <Stat label="Composite overhead" value="+64" unit="B" sub="the Ed25519 half" />
            </div>
          </>
        ) : (
          <Empty icon="▱">Run the benchmark to measure this machine.</Empty>
        )}
      </Panel>

      <Panel
        title="Per-tensor Merkle vs flat SHA-256"
        section="3.7"
        note="The overhead column is the price paid for tamper localisation and streaming verification."
        right={
          <button className="btn btn-primary btn-sm" onClick={benchMerkle} disabled={!!busy}>
            {busy === 'merkle' ? <><span className="spinner" /> Hashing…</> : 'Run benchmark'}
          </button>
        }
      >
        {merkle ? (
          <table className="table">
            <thead>
              <tr>
                <th>Artefact</th>
                <th style={{ textAlign: 'right' }}>Tensors</th>
                <th style={{ textAlign: 'right' }}>Size</th>
                <th style={{ textAlign: 'right' }}>Flat SHA-256</th>
                <th style={{ textAlign: 'right' }}>Per-tensor Merkle</th>
                <th style={{ textAlign: 'right' }}>Overhead</th>
                <th style={{ textAlign: 'right' }}>Throughput</th>
              </tr>
            </thead>
            <tbody>
              {merkle.map((r) => (
                <tr key={r.preset}>
                  <td>{r.preset}</td>
                  <td className="num">{r.tensors}</td>
                  <td className="num">{bytes(r.size)}</td>
                  <td className="num">{r.flatMs.toFixed(2)} ms</td>
                  <td className="num">{r.merkleMs.toFixed(2)} ms</td>
                  <td className="num" style={{ color: r.overhead > 100 ? 'var(--warn)' : 'var(--ok)' }}>
                    {r.overhead > 0 ? '+' : ''}{r.overhead.toFixed(0)}%
                  </td>
                  <td className="num">{r.merkleThroughput.toFixed(0)} MiB/s</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <Empty icon="▱">Run the benchmark to compare hashing strategies.</Empty>
        )}
      </Panel>

      <Panel
        title="Gas consumption"
        section="3.5"
        note="Computed from the EVM cost model rather than hardcoded: 21,000 base, 20,000 per cold SSTORE, 16 per non-zero calldata byte, plus log and execution costs."
      >
        <div className="grid-3">
          <Stat label="anchorModel()" value={gas(anchorGas)} unit="gas" tone="accent" sub="5 storage slots" />
          <Stat label="revokeModel()" value={gas(revokeGas)} unit="gas" tone="ok" sub="warm slot update" />
          <Stat label="If pk were on chain" value={gas(pubkeyGas)} unit="gas" tone="fail" sub="1,952 B = 61 cold slots" />
        </div>

        <div className="divider" />

        <p className="panel-note">
          Storing the ML-DSA public key on chain was one of three defects removed when the contract
          was revised. Keeping only <code>keccak256(pk)</code> and putting the key itself on IPFS
          saves <strong style={{ color: 'var(--ok)' }}>{((1 - anchorGas / pubkeyGas) * 100).toFixed(1)}%</strong>{' '}
          of the anchoring cost.
        </p>

        {actualTxs.length > 0 && (
          <>
            <div className="divider" />
            <table className="table">
              <thead>
                <tr>
                  <th>Tx</th>
                  <th>Method</th>
                  <th style={{ textAlign: 'right' }}>Gas used</th>
                  <th>Signed with</th>
                </tr>
              </thead>
              <tbody>
                {actualTxs.map((t) => (
                  <tr key={t.hash}>
                    <td><span className="hash">{t.hash.slice(0, 14)}…</span></td>
                    <td className="mono">{t.method}</td>
                    <td className="num">{gas(t.gasUsed)}</td>
                    <td><Badge tone="warn">{t.signedWith}</Badge></td>
                  </tr>
                ))}
                <tr className="highlight">
                  <td colSpan={2}><strong>Total across session</strong></td>
                  <td className="num"><strong>{gas(store.anchor.totalGas())}</strong></td>
                  <td />
                </tr>
              </tbody>
            </table>
          </>
        )}
      </Panel>

      <Panel
        title="ML-KEM-768 confidentiality path"
        section="3.2"
        note="Wrapping an AES-256-GCM content key with ML-KEM-768 instead of ECDH. This addresses harvest-now-decrypt-later, which no signature scheme touches."
        right={
          <button className="btn btn-primary btn-sm" onClick={benchKem} disabled={!!busy}>
            {busy === 'kem' ? <><span className="spinner" /> Running…</> : 'Run KEM round-trip'}
          </button>
        }
      >
        {kem ? (
          <>
            <div className="grid-4">
              <Stat label="KEM public key" value={kem.kemPkLen.toLocaleString()} unit="B" tone="quantum" />
              <Stat label="Ciphertext" value={kem.kemCtLen.toLocaleString()} unit="B" />
              <Stat label="Shared secret" value={kem.sharedSecretLen} unit="B" sub="→ AES-256 key" />
              <Stat label="Round trip" value={kem.elapsedMs.toFixed(1)} unit="ms" sub={`${bytes(kem.payloadLen)} payload`} />
            </div>
            <Alert tone={kem.roundTripOk ? 'ok' : 'fail'} >
              {kem.roundTripOk
                ? 'Decapsulation recovered the same shared secret and AES-256-GCM decrypted the payload byte-for-byte.'
                : 'Round-trip mismatch.'}
            </Alert>
          </>
        ) : (
          <Empty icon="▱">Run the round-trip to exercise encapsulate → AES-GCM → decapsulate.</Empty>
        )}
      </Panel>
    </div>
  );
}

function median(xs) {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

function sleep(n) {
  return new Promise((r) => setTimeout(r, n));
}

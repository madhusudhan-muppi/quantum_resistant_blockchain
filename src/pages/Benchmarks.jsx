import React, { useState } from 'react';
import {
  Panel, PageHead, Academic, Health, Icon, Stat, Cell, Alert, Empty, Hash,
  KVMatrix, bytes, gas, ms,
} from '../components/ui.jsx';
import { useStore } from '../lib/store.jsx';
import {
  ml_dsa65, ed25519, randomBytes, generateIdentity, kemWrapAndEncrypt, SELECTED,
} from '../lib/crypto.js';
import { hashModel, flatHash } from '../lib/merkle.js';
import { generateSafetensors, PRESETS } from '../lib/demoModel.js';
import { estimateAnchorGas, estimateOnChainPubkeyGas } from '../lib/ledger.js';

/**
 * Evaluation methodology — Section 3.7.
 * Live measurements taken in this browser, not figures transcribed from the report.
 */
export default function Benchmarks() {
  const store = useStore();
  const [sig, setSig] = useState(null);
  const [merkle, setMerkle] = useState(null);
  const [kem, setKem] = useState(null);
  const [busy, setBusy] = useState(null);

  async function benchSignatures() {
    setBusy('sig');
    await sleep(60);

    const ITER = 25;
    const msg = randomBytes(64);
    const id = generateIdentity('bench');

    for (let i = 0; i < 3; i++) ml_dsa65.sign(id.mldsaSk, msg);

    const dsaSign = [], dsaVerify = [], edSign = [], edVerify = [];
    for (let i = 0; i < ITER; i++) {
      let t = performance.now();
      const s = ml_dsa65.sign(id.mldsaSk, msg);
      dsaSign.push(performance.now() - t);
      t = performance.now();
      ml_dsa65.verify(id.mldsaPk, msg, s);
      dsaVerify.push(performance.now() - t);
      if (i % 5 === 0) await sleep(0);
    }
    for (let i = 0; i < ITER; i++) {
      let t = performance.now();
      const s = ed25519.sign(msg, id.edSk);
      edSign.push(performance.now() - t);
      t = performance.now();
      ed25519.verify(s, msg, id.edPk);
      edVerify.push(performance.now() - t);
    }

    const t0 = performance.now();
    generateIdentity('keygen-bench');
    const keygenMs = performance.now() - t0;

    setSig({
      rows: [
        { scheme: 'ML-DSA-65', standard: 'NIST FIPS 204', sign: median(dsaSign), verify: median(dsaVerify), size: SELECTED.sig, pq: true },
        { scheme: 'Ed25519', standard: 'RFC 8032', sign: median(edSign), verify: median(edVerify), size: 64, pq: false },
      ],
      keygenMs,
      iterations: ITER,
    });
    setBusy(null);
  }

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
        throughput: demo.buffer.byteLength / 1024 / 1024 / (hashed.elapsedMs / 1000),
      });
    }
    setMerkle(rows);
    setBusy(null);
  }

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
  const txs = store.anchor?.txs || [];

  return (
    <div>
      <PageHead
        section="3.7 EVALUATION METHODOLOGY"
        standard="NIST FIPS 204 L3"
        id="0x5a90_bench"
        title="Benchmarks"
        stats={[
          { label: 'Measurement Host', value: 'This browser', sub: 'WASM-free pure JS' },
          {
            label: 'Anchor Cost',
            value: `${gas(anchorGas)} gas`,
            tone: 'classical',
            sub: `${(pubkeyGas / anchorGas).toFixed(1)}× cheaper than on-chain pk`,
          },
        ]}
      >
        Live measurements taken in this browser. Numbers vary by machine — that is precisely why
        they are measured here rather than quoted.
      </PageHead>

      <Alert tone="caution" icon="info" title="Read the ratio, not the absolute">
        Signature latency is measured separately from artefact I/O, as Section 3.7 specifies. A
        JavaScript ML-DSA implementation is slower than the Go CIRCL library the chaincode uses, so
        treat these absolute figures as an upper bound and the ratio between schemes as the finding.
      </Alert>

      <Panel
        icon="speed"
        title="Signing & Verification Latency"
        chip={
          <button className="btn btn-pqc" onClick={benchSignatures} disabled={!!busy}>
            {busy === 'sig' ? <><span className="spinner" /> MEASURING</> : <><Icon name="play_arrow" /> RUN</>}
          </button>
        }
      >
        {sig ? (
          <>
            <table className="table dense">
              <thead>
                <tr>
                  <th>Scheme</th>
                  <th>Standard</th>
                  <th style={{ textAlign: 'right' }}>Sign</th>
                  <th style={{ textAlign: 'right' }}>Verify</th>
                  <th style={{ textAlign: 'right' }}>Signature</th>
                  <th>Quantum-Safe</th>
                </tr>
              </thead>
              <tbody>
                {sig.rows.map((r) => (
                  <tr key={r.scheme} className={r.pq ? 'selected' : ''}>
                    <td><strong className="mono">{r.scheme}</strong></td>
                    <td className="mono">{r.standard}</td>
                    <td className="num">{r.sign.toFixed(2)} ms</td>
                    <td className="num">{r.verify.toFixed(2)} ms</td>
                    <td className="num">{r.size.toLocaleString()} B</td>
                    <td>
                      {r.pq
                        ? <Health state="pass">PQ-SAFE</Health>
                        : <Health state="caution">CLASSICAL EXP</Health>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="grid-4" style={{ marginTop: 'var(--s-md)' }}>
              <Stat label="Signature Size Ratio" value={(sig.rows[0].size / sig.rows[1].size).toFixed(1)} unit="×" tone="classical" sub="ML-DSA-65 vs Ed25519" />
              <Stat label="Verify Cost Ratio" value={(sig.rows[0].verify / sig.rows[1].verify).toFixed(2)} unit="×" tone="data" sub={`median of ${sig.iterations}`} />
              <Stat label="Keygen" value={sig.keygenMs.toFixed(1)} unit="ms" tone="pqc" sub="both keypairs" />
              <Stat label="Composite Overhead" value="+64" unit="B" sub="the Ed25519 half" />
            </div>
          </>
        ) : (
          <Empty icon="speed">Run the benchmark to measure this machine.</Empty>
        )}
      </Panel>

      <Panel
        icon="account_tree"
        title="Per-Tensor Merkle vs Flat SHA-256"
        chip={
          <button className="btn btn-primary" onClick={benchMerkle} disabled={!!busy}>
            {busy === 'merkle' ? <><span className="spinner" /> HASHING</> : <><Icon name="play_arrow" /> RUN</>}
          </button>
        }
        foot={
          <>
            <Icon name="info" />
            <span>The overhead column is the price paid for tamper localisation and streaming verification</span>
          </>
        }
      >
        {merkle ? (
          <table className="table dense">
            <thead>
              <tr>
                <th>Artefact</th>
                <th style={{ textAlign: 'right' }}>Tensors</th>
                <th style={{ textAlign: 'right' }}>Size</th>
                <th style={{ textAlign: 'right' }}>Flat SHA-256</th>
                <th style={{ textAlign: 'right' }}>Per-Tensor Merkle</th>
                <th style={{ textAlign: 'right' }}>Overhead</th>
                <th style={{ textAlign: 'right' }}>Throughput</th>
              </tr>
            </thead>
            <tbody>
              {merkle.map((r) => (
                <tr key={r.preset}>
                  <td><strong>{r.preset}</strong></td>
                  <td className="num">{r.tensors}</td>
                  <td className="num">{bytes(r.size)}</td>
                  <td className="num">{r.flatMs.toFixed(2)} ms</td>
                  <td className="num">{r.merkleMs.toFixed(2)} ms</td>
                  <td className="num" style={{ color: r.overhead > 100 ? 'var(--classical)' : 'var(--valid)' }}>
                    {r.overhead > 0 ? '+' : ''}{r.overhead.toFixed(0)}%
                  </td>
                  <td className="num">{r.throughput.toFixed(0)} MiB/s</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <Empty icon="account_tree">Run the benchmark to compare hashing strategies.</Empty>
        )}
      </Panel>

      <Panel
        icon="local_gas_station"
        title="Gas Consumption"
        chip={<Academic>3.5 Contract Design</Academic>}
        note="Computed from the EVM cost model rather than hardcoded: 21,000 base, 20,000 per cold SSTORE, 16 per non-zero calldata byte, plus log and execution costs."
      >
        <div className="grid-3">
          <Stat label="anchorModel()" value={gas(anchorGas)} unit="gas" tone="data" sub="5 packed storage slots" />
          <Stat label="revokeModel()" value={gas(revokeGas)} unit="gas" tone="valid" sub="warm slot update" />
          <Stat label="If pk Were On Chain" value={gas(pubkeyGas)} unit="gas" tone="critical" sub="1,952 B = 61 cold slots" />
        </div>

        <div className="divider" />

        <KVMatrix
          rows={[
            { k: 'Saving from keeping pk off chain', v: <span className="v-valid">{((1 - anchorGas / pubkeyGas) * 100).toFixed(1)}%</span> },
            { k: 'Session total', v: `${gas(store.anchor?.totalGas() || 0)} gas across ${txs.length} tx` },
          ]}
        />

        {txs.length > 0 && (
          <>
            <div className="divider" />
            <table className="table dense">
              <thead>
                <tr>
                  <th>Tx Hash</th>
                  <th>Method</th>
                  <th style={{ textAlign: 'right' }}>Gas Used</th>
                  <th>Signed With</th>
                </tr>
              </thead>
              <tbody>
                {txs.map((t) => (
                  <tr key={t.hash}>
                    <td><Hash value={t.hash} head={10} tail={8} /></td>
                    <td className="mono">{t.method}</td>
                    <td className="num">{gas(t.gasUsed)}</td>
                    <td><Health state="caution">SECP256K1</Health></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </Panel>

      <Panel
        icon="lock"
        title="ML-KEM-768 Confidentiality Path"
        chip={
          <button className="btn btn-pqc" onClick={benchKem} disabled={!!busy}>
            {busy === 'kem' ? <><span className="spinner" /> RUNNING</> : <><Icon name="play_arrow" /> RUN ROUND-TRIP</>}
          </button>
        }
        note="Wrapping an AES-256-GCM content key with ML-KEM-768 instead of ECDH. This addresses harvest-now-decrypt-later, which no signature scheme touches."
      >
        {kem ? (
          <>
            <div className="grid-4">
              <Stat label="KEM Public Key" value={kem.kemPkLen.toLocaleString()} unit="B" tone="pqc" />
              <Stat label="Encapsulation" value={kem.kemCtLen.toLocaleString()} unit="B" sub="ciphertext" />
              <Stat label="Shared Secret" value={kem.sharedSecretLen} unit="B" tone="data" sub="→ AES-256 key" />
              <Stat label="Round Trip" value={kem.elapsedMs.toFixed(1)} unit="ms" sub={bytes(kem.payloadLen)} />
            </div>
            <div style={{ marginTop: 'var(--s-md)' }}>
              <Alert tone={kem.roundTripOk ? 'pass' : 'fail'}>
                {kem.roundTripOk
                  ? 'Decapsulation recovered the same shared secret and AES-256-GCM decrypted the payload byte-for-byte.'
                  : 'Round-trip mismatch — the recovered plaintext differs.'}
              </Alert>
            </div>
          </>
        ) : (
          <Empty icon="lock">Run the round-trip to exercise encapsulate → AES-GCM → decapsulate.</Empty>
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

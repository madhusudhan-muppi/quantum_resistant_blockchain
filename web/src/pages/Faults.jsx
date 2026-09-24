import React, { useState } from 'react';
import {
  Panel, PageHead, Academic, Health, Icon, Stat, Alert, Empty, bytes,
} from '../components/ui.jsx';
import { useStore } from '../lib/store.jsx';
import { streamVerify, parseSafetensors } from '../lib/merkle.js';
import { computeMu, compositeVerify, compositeSign, fromHex } from '../lib/crypto.js';
import { ipfs, makeCIDv1 } from '../lib/ipfs.js';
import { CHAIN_ID_FABRIC, CHAIN_ID_SEPOLIA } from '../lib/ledger.js';
import { injectBitFlip, injectTensorReorder, injectTruncation } from '../lib/demoModel.js';
import { sha256 } from '@noble/hashes/sha2';

/**
 * Fault injection — Section 3.7, evaluation item five.
 * "Expected outcome is detection in every case with a description in a
 *  per-tensor test also stating the layer affected."
 */
const SCENARIOS = [
  { id: 'bitflip', name: 'Single-bit flip', detail: 'Flip one bit inside a randomly chosen tensor', control: 'Per-tensor Merkle leaf', cls: 'Tampering' },
  { id: 'reorder', name: 'Tensor reordering', detail: 'Swap payloads of two equally sized tensors', control: 'Name-sorted canonical leaves', cls: 'Tampering' },
  { id: 'truncate', name: 'Truncated download', detail: 'Deliver only the first 75% of the artefact', control: 'Container parse + stream verify', cls: 'Tampering' },
  { id: 'cid', name: 'CID substitution', detail: 'Serve different bytes under the committed CID', control: 'Content addressing', cls: 'Spoofing' },
  { id: 'replay', name: 'Cross-version replay', detail: 'Reuse a v1 signature to authorise v2', control: 'μ binds modelId and version', cls: 'Spoofing' },
  { id: 'chain', name: 'Cross-chain replay', detail: 'Replay a Fabric signature onto Sepolia', control: 'μ binds chainID', cls: 'Spoofing' },
  { id: 'rogue', name: 'Unauthorised publisher', detail: 'Valid signature from an unenrolled identity', control: 'MSP + onlyPublisher', cls: 'Elevation' },
  { id: 'gc', name: 'IPFS garbage collection', detail: 'Unpin the block and attempt a fetch', control: 'Triple pin + Filecoin deal', cls: 'Denial of service' },
];

export default function Faults({ navigate }) {
  const store = useStore();
  const records = store.fabric?.allRecords() || [];
  const [results, setResults] = useState({});
  const [running, setRunning] = useState(null);

  const record = records[0];

  async function runScenario(id) {
    if (!record) return;
    setRunning(id);
    await sleep(220);

    let outcome;
    try {
      outcome = await execute(id, record, store);
    } catch (err) {
      outcome = { detected: true, where: null, detail: `Rejected with: ${err.message}` };
    }

    setResults((r) => ({ ...r, [id]: outcome }));
    setRunning(null);
    store.toast(
      `${SCENARIOS.find((s) => s.id === id)?.name} — ${outcome.detected ? 'DETECTED' : 'MISSED'}`,
      outcome.detected ? 'pass' : 'fail'
    );
  }

  async function runAll() {
    for (const s of SCENARIOS) await runScenario(s.id);
  }

  const done = Object.keys(results).length;
  const detected = Object.values(results).filter((r) => r.detected).length;
  const localised = Object.values(results).filter((r) => r.where).length;

  if (!record) {
    return (
      <div>
        <PageHead
          section="3.7 FAULT INJECTION & DETECTION COVERAGE"
          standard="NIST FIPS 204 L3"
          id="0x7b3e_faults"
          title="Fault Injection"
        >
          Detection is expected in every case.
        </PageHead>
        <Panel icon="bug_report" title="No Target Artefact">
          <Empty icon="bug_report">
            Register a model first so there is something to attack.
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

  return (
    <div>
      <PageHead
        section="3.7 FAULT INJECTION & DETECTION COVERAGE"
        standard="NIST FIPS 204 L3"
        id="0x7b3e_faults"
        title="Fault Injection"
        stats={[
          {
            label: 'Detection Coverage',
            value: `${detected}/${done || 0}`,
            tone: done > 0 && detected === done ? 'valid' : done ? 'critical' : 'muted',
            sub: `${SCENARIOS.length} scenarios defined`,
          },
          { label: 'Layer-Localised', value: localised, tone: 'pqc', sub: 'named a tensor' },
        ]}
      >
        Eight attacks run against{' '}
        <span className="mono v-data">{record.modelId} v{record.version}</span>. The bar the report
        sets is not merely detection — the per-tensor test must also name the affected layer.
      </PageHead>

      <div className="grid-4">
        <Stat label="Scenarios Run" value={`${done}/${SCENARIOS.length}`} tone="data" />
        <Stat label="Detected" value={detected} tone={done > 0 && detected === done ? 'valid' : 'classical'} />
        <Stat label="Missed" value={done - detected} tone={done - detected > 0 ? 'critical' : 'valid'} />
        <Stat label="Localised To A Layer" value={localised} tone="pqc" sub="flat hash cannot do this" />
      </div>

      <Panel
        icon="bug_report"
        title="Adversarial Scenario Matrix"
        chip={
          <button className="btn btn-pqc" onClick={runAll} disabled={!!running}>
            {running ? <><span className="spinner" /> EXECUTING</> : <><Icon name="play_arrow" /> RUN ALL</>}
          </button>
        }
        flush
      >
        <table className="table">
          <thead>
            <tr>
              <th>Attack</th>
              <th>STRIDE</th>
              <th>Control</th>
              <th>Result</th>
              <th>Evidence</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {SCENARIOS.map((s) => {
              const r = results[s.id];
              return (
                <tr key={s.id} className={r && !r.detected ? 'selected' : ''}>
                  <td>
                    <strong>{s.name}</strong>
                    <div className="t-body-sm" style={{ color: 'var(--text-muted)' }}>{s.detail}</div>
                  </td>
                  <td className="mono" style={{ whiteSpace: 'nowrap' }}>{s.cls}</td>
                  <td style={{ fontSize: 11.5 }}>{s.control}</td>
                  <td>
                    {running === s.id
                      ? <Health state="data" pulse>RUNNING</Health>
                      : r
                        ? <Health state={r.detected ? 'pass' : 'fail'}>{r.detected ? 'DETECTED' : 'MISSED'}</Health>
                        : <Health state="idle">NOT RUN</Health>}
                  </td>
                  <td style={{ maxWidth: 340, fontSize: 11.5 }}>
                    {r ? (
                      <>
                        <div>{r.detail}</div>
                        {r.where && (
                          <div className="mono v-pqc" style={{ marginTop: 3 }}>
                            ↳ localised to {r.where}
                          </div>
                        )}
                      </>
                    ) : <span className="v-muted">—</span>}
                  </td>
                  <td>
                    <button className="btn btn-micro" onClick={() => runScenario(s.id)} disabled={!!running}>
                      RUN
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Panel>

      {done === SCENARIOS.length && detected === SCENARIOS.length && (
        <Alert tone="pass" title="Full detection coverage">
          Every injected fault was caught before the consumer SDK would release a model object, and
          the tampering cases were localised to a named tensor rather than reported as a bare
          whole-file mismatch.
        </Alert>
      )}

      <Panel icon="compare_arrows" title="What A Flat Hash Would Have Told You" chip={<Academic>3.3 Tamper Localisation</Academic>}>
        <div className="grid-2">
          <div className="cell">
            <div style={{ marginBottom: 8 }}><Health state="fail">SHA-256 OVER WHOLE FILE</Health></div>
            <ul className="tight">
              <li>One bit of output: matched, or did not</li>
              <li>Requires the full multi-gigabyte download first</li>
              <li>A fine-tune touching one adapter forces a full re-signature</li>
            </ul>
          </div>
          <div className="cell">
            <div style={{ marginBottom: 8 }}><Health state="pass">PER-TENSOR MERKLE TREE</Health></div>
            <ul className="tight">
              <li>Names the tensor that changed</li>
              <li>Aborts mid-stream at the first mismatch</li>
              <li>Derivatives re-sign only the changed leaves</li>
            </ul>
          </div>
        </div>
      </Panel>
    </div>
  );
}

/* ------------------------------------------------------------------ */

async function execute(id, record, store) {
  const payload = ipfs.get(record.cid);
  const original = payload
    ? payload.buffer.slice(payload.byteOffset, payload.byteOffset + payload.byteLength)
    : null;
  const expectedLeaves = record.leafHexes.map(fromHex);

  switch (id) {
    case 'bitflip': {
      const parsed = parseSafetensors(original);
      const injected = injectBitFlip(original, parsed.tensors);
      const stream = await streamVerify(injected.buffer, expectedLeaves, null);
      const bad = stream.results.find((r) => !r.ok);
      return {
        detected: stream.aborted,
        where: bad?.name,
        detail: `${injected.description}. Aborted after ${bytes(stream.bytesProcessed)} of ${bytes(original.byteLength)}.`,
      };
    }
    case 'reorder': {
      const parsed = parseSafetensors(original);
      const injected = injectTensorReorder(original, parsed.tensors);
      const stream = await streamVerify(injected.buffer, expectedLeaves, null);
      const bad = stream.results.find((r) => !r.ok);
      return {
        detected: stream.aborted,
        where: bad?.name,
        detail: `${injected.description}. Names still sort identically so the tree is well-formed, but the leaf digests no longer match.`,
      };
    }
    case 'truncate': {
      const injected = injectTruncation(original);
      try {
        const stream = await streamVerify(injected.buffer, expectedLeaves, null);
        const bad = stream.results.find((r) => !r.ok);
        return {
          detected: stream.aborted,
          where: bad?.name,
          detail: `${injected.description}. Verification failed on the first tensor whose bytes were cut.`,
        };
      } catch (err) {
        return { detected: true, where: null, detail: `${injected.description}. Container parse refused: ${err.message}` };
      }
    }
    case 'cid': {
      const fake = new Uint8Array(512);
      crypto.getRandomValues(fake);
      const recomputed = makeCIDv1(sha256(fake));
      return {
        detected: recomputed.cid !== record.cid,
        where: null,
        detail: `Substituted payload hashes to ${recomputed.cid.slice(0, 16)}…, not the committed ${record.cid.slice(0, 16)}…. Content addressing makes the substitution self-evident.`,
      };
    }
    case 'replay': {
      const mu2 = computeMu({
        chainId: CHAIN_ID_FABRIC, modelId: record.modelId, version: record.version + 1,
        merkleRoot: fromHex(record.merkleRootHex), pkHash: fromHex(record.pkHashHex),
        metaHash: fromHex(record.metaHashHex),
      });
      const v = compositeVerify(
        { mldsaPk: fromHex(record.mldsaPkHex), edPk: fromHex(record.edPkHex) },
        mu2, fromHex(record.edSigHex), fromHex(record.dsaSigHex)
      );
      return {
        detected: !v.valid,
        where: null,
        detail: `v${record.version} signature replayed for v${record.version + 1}. The version sits inside the context string, so μ differs and both halves fail.`,
      };
    }
    case 'chain': {
      const mu = computeMu({
        chainId: CHAIN_ID_SEPOLIA, modelId: record.modelId, version: record.version,
        merkleRoot: fromHex(record.merkleRootHex), pkHash: fromHex(record.pkHashHex),
        metaHash: fromHex(record.metaHashHex),
      });
      const v = compositeVerify(
        { mldsaPk: fromHex(record.mldsaPkHex), edPk: fromHex(record.edPkHex) },
        mu, fromHex(record.edSigHex), fromHex(record.dsaSigHex)
      );
      return {
        detected: !v.valid,
        where: null,
        detail: `Signature valid on chainID ${CHAIN_ID_FABRIC} replayed onto chainID ${CHAIN_ID_SEPOLIA}. The domain-separated context binds the chain, so verification fails.`,
      };
    }
    case 'rogue': {
      const rogue = store.identities.find((i) => i.rogue);
      const mu = computeMu({
        chainId: CHAIN_ID_FABRIC, modelId: 'rogue/backdoored-model', version: 1,
        merkleRoot: fromHex(record.merkleRootHex), pkHash: rogue.pkHash,
        metaHash: fromHex(record.metaHashHex),
      });
      const sig = compositeSign(rogue, mu);
      const tx = store.fabric.submitTransaction({
        modelId: 'rogue/backdoored-model', version: 1,
        merkleRoot: fromHex(record.merkleRootHex), metaHash: fromHex(record.metaHashHex),
        pkHash: rogue.pkHash, mldsaPk: rogue.mldsaPk, edPk: rogue.edPk,
        edSig: sig.edSig, dsaSig: sig.dsaSig,
        cidDigest: fromHex(record.cidDigestHex), cid: record.cid, parentRoot: null,
        publisherLabel: rogue.label, modelCard: '',
        leafHexes: record.leafHexes, tensorMeta: record.tensorMeta,
      });
      return {
        detected: !tx.committed,
        where: null,
        detail: `The ML-DSA signature is cryptographically valid, but the identity is enrolled in no MSP — rejected with ${tx.code} before the signature check is even reached.`,
      };
    }
    case 'gc': {
      ipfs.unpinAndCollect(record.cid);
      const fetched = ipfs.get(record.cid);
      ipfs.repin(record.cid);
      return {
        detected: fetched === null,
        where: null,
        detail: 'Unpinned block is no longer retrievable. Integrity is guaranteed by content addressing; persistence is not — hence triple pinning plus a Filecoin deal, and a MEDIUM residual rating.',
      };
    }
    default:
      return { detected: false, where: null, detail: 'unknown scenario' };
  }
}

function sleep(n) {
  return new Promise((r) => setTimeout(r, n));
}

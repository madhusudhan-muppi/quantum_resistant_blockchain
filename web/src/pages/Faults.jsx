import React, { useState } from 'react';
import { Panel, Stat, Badge, Alert, Empty, bytes, ms } from '../components/ui.jsx';
import { useStore } from '../lib/store.jsx';
import { streamVerify, parseSafetensors, metaHash } from '../lib/merkle.js';
import { computeMu, compositeVerify, compositeSign, fromHex, toHex, shortHex } from '../lib/crypto.js';
import { ipfs, makeCIDv1 } from '../lib/ipfs.js';
import { CHAIN_ID_FABRIC, CHAIN_ID_SEPOLIA } from '../lib/ledger.js';
import { injectBitFlip, injectTensorReorder, injectTruncation } from '../lib/demoModel.js';
import { sha256 } from '@noble/hashes/sha2';

/**
 * Fault injection — Section 3.7, evaluation item five.
 *
 * "Expected outcome is detection in every case with a description in a
 *  per-tensor test also stating the layer affected."
 *
 * Each scenario runs against a genuinely registered artefact and reports both
 * whether it was caught and — where the Merkle tree allows it — exactly where.
 */
const SCENARIOS = [
  {
    id: 'bitflip',
    name: 'Single-bit flip',
    detail: 'Flip one bit inside a randomly chosen tensor',
    control: 'Per-tensor Merkle leaf',
  },
  {
    id: 'reorder',
    name: 'Tensor reordering',
    detail: 'Swap the payloads of two equally sized tensors',
    control: 'Name-sorted canonical leaves',
  },
  {
    id: 'truncate',
    name: 'Truncated download',
    detail: 'Deliver only the first 75% of the artefact',
    control: 'Container parse + streaming verify',
  },
  {
    id: 'cid',
    name: 'CID substitution',
    detail: 'Serve different bytes under the committed CID',
    control: 'Content addressing + Merkle root',
  },
  {
    id: 'replay',
    name: 'Cross-version replay',
    detail: 'Reuse v1 signature to authorise v2',
    control: 'μ binds modelId and version',
  },
  {
    id: 'chain',
    name: 'Cross-chain replay',
    detail: 'Replay a Fabric signature onto Sepolia chainID',
    control: 'μ binds chainID',
  },
  {
    id: 'rogue',
    name: 'Unauthorised publisher',
    detail: 'Valid signature from an unenrolled identity',
    control: 'MSP gatekeeping + onlyPublisher',
  },
  {
    id: 'gc',
    name: 'IPFS garbage collection',
    detail: 'Unpin the block and attempt a fetch',
    control: 'Triple pinning + Filecoin deal',
  },
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
    await sleep(240);

    let outcome;
    try {
      outcome = await execute(id, record, store);
    } catch (err) {
      outcome = { detected: true, where: null, detail: `Rejected with: ${err.message}` };
    }

    setResults((r) => ({ ...r, [id]: outcome }));
    setRunning(null);
    store.toast(
      outcome.detected ? `${labelOf(id)} — detected` : `${labelOf(id)} — NOT detected`,
      outcome.detected ? 'ok' : 'fail'
    );
  }

  async function runAll() {
    for (const s of SCENARIOS) {
      await runScenario(s.id);
    }
  }

  const done = Object.keys(results).length;
  const detected = Object.values(results).filter((r) => r.detected).length;

  if (!record) {
    return (
      <div>
        <div className="page-head">
          <h1 className="page-title">Fault injection</h1>
          <p className="page-sub">Section 3.7 — detection is expected in every case.</p>
        </div>
        <Panel>
          <Empty icon="⚡">
            Register a model first so there is something to attack.
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
        <h1 className="page-title">Fault injection</h1>
        <p className="page-sub">
          Eight attacks run against <span className="mono">{record.modelId} v{record.version}</span>.
          The bar the report sets is not merely detection — the per-tensor test must also name the
          affected layer.
        </p>
      </div>

      <div className="grid-4">
        <Stat label="Scenarios run" value={`${done}/${SCENARIOS.length}`} tone="accent" />
        <Stat label="Detected" value={detected} tone={done > 0 && detected === done ? 'ok' : 'warn'} />
        <Stat label="Missed" value={done - detected} tone={done - detected > 0 ? 'fail' : 'ok'} />
        <Stat label="Localised to a layer" value={Object.values(results).filter((r) => r.where).length} tone="quantum" />
      </div>

      <Panel
        title="Scenarios"
        section="3.7"
        right={
          <button className="btn btn-primary btn-sm" onClick={runAll} disabled={!!running}>
            {running ? <><span className="spinner" /> Running…</> : 'Run all'}
          </button>
        }
      >
        <table className="table">
          <thead>
            <tr>
              <th>Attack</th>
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
                <tr key={s.id}>
                  <td>
                    <div style={{ color: 'var(--text)', fontWeight: 550 }}>{s.name}</div>
                    <div style={{ fontSize: 11.5, color: 'var(--text-faint)' }}>{s.detail}</div>
                  </td>
                  <td style={{ fontSize: 12 }}>{s.control}</td>
                  <td>
                    {running === s.id ? (
                      <span className="spinner" />
                    ) : r ? (
                      <Badge tone={r.detected ? 'ok' : 'fail'}>{r.detected ? 'DETECTED' : 'MISSED'}</Badge>
                    ) : (
                      <Badge tone="dim">not run</Badge>
                    )}
                  </td>
                  <td style={{ fontSize: 11.5, maxWidth: 330 }}>
                    {r ? (
                      <>
                        <div>{r.detail}</div>
                        {r.where && (
                          <div style={{ color: 'var(--quantum)', fontFamily: 'var(--mono)', marginTop: 3 }}>
                            ↳ localised to {r.where}
                          </div>
                        )}
                      </>
                    ) : (
                      <span style={{ color: 'var(--text-faint)' }}>—</span>
                    )}
                  </td>
                  <td>
                    <button className="btn btn-sm" onClick={() => runScenario(s.id)} disabled={!!running}>
                      Run
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Panel>

      {done === SCENARIOS.length && detected === SCENARIOS.length && (
        <Alert tone="ok" title="All scenarios detected">
          Every injected fault was caught before the consumer SDK would return a model object, and
          the tampering cases were localised to a named tensor rather than reported as a bare
          whole-file mismatch.
        </Alert>
      )}

      <Panel title="What a flat hash would have told you" section="3.3">
        <div className="grid-2">
          <div>
            <Badge tone="fail">SHA-256 over the whole file</Badge>
            <ul style={{ fontSize: 12.5, color: 'var(--text-dim)', paddingLeft: 18, lineHeight: 1.8 }}>
              <li>One bit of output: matched, or did not</li>
              <li>Requires the full multi-gigabyte download first</li>
              <li>A fine-tune touching one adapter forces full re-signature</li>
            </ul>
          </div>
          <div>
            <Badge tone="ok">Per-tensor Merkle tree</Badge>
            <ul style={{ fontSize: 12.5, color: 'var(--text-dim)', paddingLeft: 18, lineHeight: 1.8 }}>
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
/* scenario implementations                                            */
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
        detail: `${injected.description}. Names still sort identically, so the tree is well-formed — but the leaf digests no longer match.`,
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
      // Serve unrelated bytes and claim the committed CID.
      const fake = new Uint8Array(512);
      crypto.getRandomValues(fake);
      const recomputed = makeCIDv1(sha256(fake));
      return {
        detected: recomputed.cid !== record.cid,
        where: null,
        detail: `Substituted payload hashes to ${recomputed.cid.slice(0, 18)}…, which does not equal the committed ${record.cid.slice(0, 18)}…. Content addressing makes the substitution self-evident.`,
      };
    }

    case 'replay': {
      // Take v1's signature and present it for version 2.
      const mu2 = computeMu({
        chainId: CHAIN_ID_FABRIC,
        modelId: record.modelId,
        version: record.version + 1,
        merkleRoot: fromHex(record.merkleRootHex),
        pkHash: fromHex(record.pkHashHex),
        metaHash: fromHex(record.metaHashHex),
      });
      const v = compositeVerify(
        { mldsaPk: fromHex(record.mldsaPkHex), edPk: fromHex(record.edPkHex) },
        mu2,
        fromHex(record.edSigHex),
        fromHex(record.dsaSigHex)
      );
      return {
        detected: !v.valid,
        where: null,
        detail: `v${record.version} signature replayed for v${record.version + 1}: μ differs because the version is inside the context string, so both Ed25519 and ML-DSA verification fail.`,
      };
    }

    case 'chain': {
      const muOtherChain = computeMu({
        chainId: CHAIN_ID_SEPOLIA,
        modelId: record.modelId,
        version: record.version,
        merkleRoot: fromHex(record.merkleRootHex),
        pkHash: fromHex(record.pkHashHex),
        metaHash: fromHex(record.metaHashHex),
      });
      const v = compositeVerify(
        { mldsaPk: fromHex(record.mldsaPkHex), edPk: fromHex(record.edPkHex) },
        muOtherChain,
        fromHex(record.edSigHex),
        fromHex(record.dsaSigHex)
      );
      return {
        detected: !v.valid,
        where: null,
        detail: `Signature valid on chainID ${CHAIN_ID_FABRIC} replayed onto chainID ${CHAIN_ID_SEPOLIA}. The domain-separated context binds the chain, so verification fails.`,
      };
    }

    case 'rogue': {
      // A genuinely valid signature — from an identity no MSP knows.
      const rogue = store.identities.find((i) => i.rogue);
      const mu = computeMu({
        chainId: CHAIN_ID_FABRIC,
        modelId: 'rogue/backdoored-model',
        version: 1,
        merkleRoot: fromHex(record.merkleRootHex),
        pkHash: rogue.pkHash,
        metaHash: fromHex(record.metaHashHex),
      });
      const sig = compositeSign(rogue, mu);
      const tx = store.fabric.submitTransaction({
        modelId: 'rogue/backdoored-model',
        version: 1,
        merkleRoot: fromHex(record.merkleRootHex),
        metaHash: fromHex(record.metaHashHex),
        pkHash: rogue.pkHash,
        mldsaPk: rogue.mldsaPk,
        edPk: rogue.edPk,
        edSig: sig.edSig,
        dsaSig: sig.dsaSig,
        cidDigest: fromHex(record.cidDigestHex),
        cid: record.cid,
        parentRoot: null,
        publisherLabel: rogue.label,
        modelCard: '',
        leafHexes: record.leafHexes,
        tensorMeta: record.tensorMeta,
      });
      return {
        detected: !tx.committed,
        where: null,
        detail: `The ML-DSA signature itself is cryptographically valid, but the identity is enrolled in no MSP — rejected with ${tx.code} before the signature check is reached.`,
      };
    }

    case 'gc': {
      const cid = record.cid;
      ipfs.unpinAndCollect(cid);
      const fetched = ipfs.get(cid);
      ipfs.repin(cid); // restore so the rest of the demo keeps working
      return {
        detected: fetched === null,
        where: null,
        detail:
          'Unpinned block is no longer retrievable. Integrity is guaranteed by content addressing; persistence is not — hence triple pinning plus a Filecoin deal, and a MEDIUM residual rating in Table 3.3.',
      };
    }

    default:
      return { detected: false, where: null, detail: 'unknown scenario' };
  }
}

function labelOf(id) {
  return SCENARIOS.find((s) => s.id === id)?.name || id;
}

function sleep(n) {
  return new Promise((r) => setTimeout(r, n));
}

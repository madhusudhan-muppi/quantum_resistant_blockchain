import React from 'react';
import { Panel, Stat, Badge, Alert, Formula, bytes } from '../components/ui.jsx';
import Architecture from '../components/Architecture.jsx';
import { FIPS204_PARAMS } from '../lib/crypto.js';
import { useStore } from '../lib/store.jsx';

export default function Overview({ navigate }) {
  const store = useStore();
  const records = store.fabric?.allRecords() || [];
  const anchors = store.anchor?.registry.size || 0;

  return (
    <div>
      <div className="page-head">
        <h1 className="page-title">Quantum-Resistant Blockchain Framework</h1>
        <p className="page-sub">
          Secure AI model distribution and provenance — a hybrid ledger combining NIST FIPS 204
          (ML-DSA), Hyperledger Fabric, Ethereum anchoring and IPFS content addressing.
        </p>
      </div>

      <Alert tone="quantum" title="The immutability paradox">
        A signature made today is written permanently across thousands of replicated nodes. When a
        cryptographically relevant quantum computer arrives, an adversary lifts the historic public
        key off the ledger, recovers the private key with Shor's algorithm, and forges provenance
        for a backdoored model that appears to predate the break. The chain cannot rewrite that
        history without breaking consensus — so the property that makes a blockchain trustworthy is
        exactly what makes the damage permanent.
      </Alert>

      <Panel title="End-to-end architecture" section="3.1">
        <Architecture />
        <p className="panel-note" style={{ marginTop: 14, marginBottom: 0 }}>
          Fabric handles high-frequency MLOps state transitions with signature enforcement and no
          gas cost. Ethereum receives periodic commitments that give public, tamper-evident proof of
          existence without exposing proprietary metadata.
        </p>
      </Panel>

      <div className="grid-4">
        <Stat label="Signature scheme" value="ML-DSA-65" tone="quantum" sub="FIPS 204, Category 3" />
        <Stat label="Models registered" value={records.length} tone="accent" sub="Fabric world state" />
        <Stat label="Public anchors" value={anchors} sub="Ethereum registry" />
        <Stat
          label="Classical equivalent"
          value="2"
          unit="192"
          sub="comparable to AES-192 key search"
        />
      </div>

      <div className="grid-2">
        <Panel title="What makes this different" section="1.4">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <Objective
              tag="O2"
              title="Enforced, not advertised"
              body="The post-quantum signature is checked as an endorsement condition inside Fabric chaincode. An invalid signature cannot be committed — rather than merely storing the public key on chain for optional client-side checking."
            />
            <Objective
              tag="O3"
              title="Tamper localisation"
              body="A per-tensor Merkle tree replaces flat whole-file hashing, so a failed proof names the layer that changed. It also enables streaming verification and cheap delta-signing of fine-tuned derivatives."
            />
            <Objective
              tag="O4"
              title="Honest residual risk"
              body="The boundary of the quantum guarantee is documented, not hidden — including the secp256k1 dependency of the Ethereum anchor transaction and the non-persistence of unpinned IPFS content."
            />
          </div>
        </Panel>

        <Panel title="Context binding" section="3.2 / 3.3">
          <p className="panel-note">
            Every signature is bound to one chain, one model identifier and one version, which is
            what defeats cross-version and cross-chain replay.
          </p>
          <Formula>
            context = "QRB-v1" ‖ chainID ‖ modelId ‖ version ‖ pkHash
            {'\n'}
            leaf_i&nbsp;&nbsp;= SHA-256( name_i ‖ dtype_i ‖ shape_i ‖ bytes_i )
            {'\n'}
            root&nbsp;&nbsp;&nbsp;&nbsp;= MerkleRoot( sort_by_name( leaf_0 … leaf_n ) )
            {'\n'}
            H_meta&nbsp;&nbsp;= SHA-256( model_card ‖ dataset_hash ‖ eval_metrics )
            {'\n'}
            signed_μ = SHAKE256( context ‖ root ‖ H_meta )
          </Formula>
          <p className="panel-note" style={{ marginBottom: 0 }}>
            The composite signature concatenates Ed25519 and ML-DSA-65 and requires both to verify.
            During the migration window that hedges against an unforeseen break in lattice
            cryptanalysis, at a cost of 64 extra bytes.
          </p>
        </Panel>
      </div>

      <Panel
        title="FIPS 204 parameter sets"
        section="3.1"
        note="Sizes are taken from FIPS 204 as standardised. Several published surveys still quote the superseded Round-3 Dilithium signature sizes, so both are shown."
      >
        <table className="table">
          <thead>
            <tr>
              <th>Parameter set</th>
              <th>NIST level</th>
              <th style={{ textAlign: 'right' }}>Public key</th>
              <th style={{ textAlign: 'right' }}>Private key</th>
              <th style={{ textAlign: 'right' }}>Signature</th>
              <th style={{ textAlign: 'right' }}>Round-3 sig</th>
            </tr>
          </thead>
          <tbody>
            {FIPS204_PARAMS.map((p) => (
              <tr key={p.name} className={p.selected ? 'highlight' : ''}>
                <td>
                  {p.name} {p.selected && <Badge tone="quantum">selected</Badge>}
                </td>
                <td>{p.level}</td>
                <td className="num">{p.pk.toLocaleString()} B</td>
                <td className="num">{p.sk.toLocaleString()} B</td>
                <td className="num">{p.sig.toLocaleString()} B</td>
                <td className="num" style={{ color: p.sig !== p.round3 ? 'var(--warn)' : undefined }}>
                  {p.round3.toLocaleString()} B
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>

      <Panel title="Two different attacks, two different answers" section="1.2">
        <div className="grid-2">
          <div>
            <Badge tone="info">HNDL — confidentiality</Badge>
            <p className="panel-note" style={{ marginTop: 10 }}>
              Harvest-now-decrypt-later. The adversary stores ciphertext today and reads it once the
              key-exchange primitive falls. It targets one communication at a time and is defeated by{' '}
              <strong>ML-KEM-768</strong> wrapping an AES-256-GCM content key.
            </p>
          </div>
          <div>
            <Badge tone="quantum">Retrospective forgery — integrity</Badge>
            <p className="panel-note" style={{ marginTop: 10 }}>
              The adversary recovers a private key from a published verification key and mints
              signatures that appear historical. It is not limited to one target and is defeated by{' '}
              <strong>ML-DSA-65</strong>. Conflating the two is common; they need different tools.
            </p>
          </div>
        </div>
      </Panel>

      <Panel title="Try the pipeline">
        <div className="btn-row">
          <button className="btn btn-primary" onClick={() => navigate('publish')}>
            Register a model →
          </button>
          <button className="btn" onClick={() => navigate('faults')}>
            Run fault injection
          </button>
          <button className="btn" onClick={() => navigate('bench')}>
            Benchmark ML-DSA vs Ed25519
          </button>
        </div>
      </Panel>
    </div>
  );
}

function Objective({ tag, title, body }) {
  return (
    <div style={{ display: 'flex', gap: 12 }}>
      <Badge tone="info">{tag}</Badge>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 3 }}>{title}</div>
        <div style={{ fontSize: 12.5, color: 'var(--text-dim)', lineHeight: 1.6 }}>{body}</div>
      </div>
    </div>
  );
}

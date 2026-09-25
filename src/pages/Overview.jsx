import React from 'react';
import {
  Panel, PageHead, Academic, Health, Icon, Stat, Cell, Alert, KVMatrix, EntropyMeter,
} from '../components/ui.jsx';
import Architecture from '../components/Architecture.jsx';
import { FIPS204_PARAMS } from '../lib/crypto.js';
import { useStore } from '../lib/store.jsx';

export default function Overview({ navigate }) {
  const store = useStore();
  const records = store.fabric?.allRecords() || [];
  const anchors = store.anchor?.registry.size || 0;

  return (
    <div>
      <PageHead
        section="1.1 BACKGROUND & SYSTEM POSITIONING"
        standard="NIST FIPS 204 L3"
        id="0x0001_overview"
        title="Quantum-Resistant Blockchain Framework"
        stats={[
          { label: 'Ledger Topology', value: 'Hybrid', sub: 'Fabric + Ethereum' },
          {
            label: 'Registry State',
            value: `${records.length} model${records.length === 1 ? '' : 's'}`,
            tone: 'data',
            sub: `${anchors} L1 anchor${anchors === 1 ? '' : 's'}`,
          },
        ]}
      >
        Secure AI model distribution and provenance — a hybrid ledger combining NIST FIPS 204
        (ML-DSA), Hyperledger Fabric, Ethereum anchoring and IPFS content addressing.
      </PageHead>

      <Alert tone="pqc" icon="history_toggle_off" title="The immutability paradox">
        A signature made today is written permanently across thousands of replicated nodes. When a
        cryptographically relevant quantum computer arrives, an adversary lifts the historic public
        key off the ledger, recovers the private key with Shor's algorithm, and forges provenance
        for a backdoored model that appears to predate the break. The chain cannot rewrite that
        history without breaking consensus — so the property that makes a blockchain trustworthy is
        exactly what makes the damage permanent.
      </Alert>

      <Panel
        icon="schema"
        title="End-to-End Architecture"
        chip={<Academic>3.1 System Architecture</Academic>}
        foot={
          <>
            <Icon name="bolt" style={{ color: 'var(--valid)' }} />
            <span>Verification occurs at component [5], not only at [7]</span>
            <span className="spacer" />
            <span>6 components · publish-then-verify</span>
          </>
        }
      >
        <Architecture />
        <p className="panel-note" style={{ marginTop: 'var(--s-md)', marginBottom: 0 }}>
          Fabric handles high-frequency MLOps state transitions with signature enforcement and no
          gas cost. Ethereum receives periodic commitments that give public, tamper-evident proof of
          existence without exposing proprietary metadata.
        </p>
      </Panel>

      <div className="grid-4">
        <Stat label="Signature Scheme" value="ML-DSA-65" tone="pqc" sub="FIPS 204 · Category 3" />
        <Stat label="Models Registered" value={records.length} tone="data" sub="Fabric world state" />
        <Stat label="Public Anchors" value={anchors} sub="L1 anchor registry" />
        <Stat label="Classical Effort" value="2¹⁹²" sub="≈ AES-192 key search" />
      </div>

      <div className="grid-2">
        <Panel icon="target" title="What Makes This Different" chip={<Academic>1.4 Objectives</Academic>}>
          <Objective
            tag="O2"
            title="Enforced, not advertised"
            body="The post-quantum signature is checked as an endorsement condition inside Fabric chaincode. An invalid signature cannot be committed — rather than merely storing the public key on chain for optional client-side checking."
          />
          <Objective
            tag="O3"
            title="AI-specific tamper localisation"
            body="A per-tensor Merkle tree replaces flat whole-file hashing, so a failed proof names the layer that changed. It also enables streaming verification and cheap delta-signing of fine-tuned derivatives."
          />
          <Objective
            tag="O4"
            title="Honest residual-risk accounting"
            body="The boundary of the quantum guarantee is documented, not hidden — including the secp256k1 dependency of the Ethereum anchor transaction and the non-persistence of unpinned IPFS content."
          />
        </Panel>

        <Panel icon="shield_lock" title="Two Attacks, Two Answers" chip={<Academic>1.2 Terminology</Academic>}>
          <p className="panel-note">
            Conflating these is common. They are different attacks and need different primitives —
            the paper addresses both.
          </p>
          <div className="cell" style={{ marginBottom: 'var(--s-sm)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <span className="t-code-lg v-data">HNDL</span>
              <Health state="data">CONFIDENTIALITY</Health>
            </div>
            <div className="t-body-sm" style={{ color: 'var(--text-2)' }}>
              Harvest-now-decrypt-later. The adversary stores ciphertext today and reads it once the
              key-exchange primitive falls. Targets one communication at a time. Defeated by{' '}
              <span className="mono v-pqc">ML-KEM-768</span> wrapping an AES-256-GCM content key.
            </div>
          </div>
          <div className="cell">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <span className="t-code-lg v-pqc">RETROSPECTIVE FORGERY</span>
              <Health state="pqc">INTEGRITY</Health>
            </div>
            <div className="t-body-sm" style={{ color: 'var(--text-2)' }}>
              The adversary recovers a private key from a published verification key and mints
              signatures that appear historical. Not limited to one target. Defeated by{' '}
              <span className="mono v-pqc">ML-DSA-65</span>.
            </div>
          </div>
        </Panel>
      </div>

      <Panel
        icon="table_chart"
        title="FIPS 204 Parameter Sets"
        chip={<Academic>3.2 Cryptographic Design</Academic>}
        foot={
          <>
            <Icon name="warning" style={{ color: 'var(--classical)' }} />
            <span>
              Several published surveys still quote the superseded Round-3 Dilithium signature
              sizes — both columns are shown so the discrepancy is visible
            </span>
          </>
        }
      >
        <table className="table dense">
          <thead>
            <tr>
              <th>Parameter Set</th>
              <th>NIST Level</th>
              <th style={{ textAlign: 'right' }}>Public Key</th>
              <th style={{ textAlign: 'right' }}>Private Key</th>
              <th style={{ textAlign: 'right' }}>Signature</th>
              <th style={{ textAlign: 'right' }}>Round-3 Sig</th>
              <th>Strength</th>
            </tr>
          </thead>
          <tbody>
            {FIPS204_PARAMS.map((p) => (
              <tr key={p.name} className={p.selected ? 'selected' : ''}>
                <td>
                  <strong className="mono">{p.name}</strong>{' '}
                  {p.selected && <Health state="pqc">SELECTED</Health>}
                </td>
                <td className="mono">{p.level}</td>
                <td className="num">{p.pk.toLocaleString()} B</td>
                <td className="num">{p.sk.toLocaleString()} B</td>
                <td className="num">{p.sig.toLocaleString()} B</td>
                <td className="num" style={{ color: p.sig !== p.round3 ? 'var(--classical)' : 'var(--text-muted)' }}>
                  {p.round3.toLocaleString()} B
                </td>
                <td style={{ width: 90 }}>
                  <EntropyMeter category={p.level.includes('2') ? 1 : p.level.includes('3') ? 3 : 5} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>

      <div className="action-bar">
        <span className="label-caps">Operator actions</span>
        <button className="btn btn-primary" onClick={() => navigate('publish')}>
          <Icon name="input" /> REGISTER A MODEL
        </button>
        <button className="btn btn-pqc" onClick={() => navigate('faults')}>
          <Icon name="bug_report" /> RUN FAULT INJECTION
        </button>
        <button className="btn" onClick={() => navigate('bench')}>
          <Icon name="speed" /> BENCHMARK ML-DSA
        </button>
        <span className="spacer" />
        <span className="t-code-sm" style={{ color: 'var(--text-muted)' }}>
          all cryptography executes locally in this browser
        </span>
      </div>
    </div>
  );
}

function Objective({ tag, title, body }) {
  return (
    <div style={{ display: 'flex', gap: 'var(--s-md)', marginBottom: 'var(--s-md)' }}>
      <span className="health health-data" style={{ height: 22 }}>{tag}</span>
      <div style={{ flex: 1 }}>
        <div className="t-headline-sm" style={{ marginBottom: 2 }}>{title}</div>
        <div className="t-body-sm" style={{ color: 'var(--text-2)' }}>{body}</div>
      </div>
    </div>
  );
}

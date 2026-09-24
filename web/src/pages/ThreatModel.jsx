import React from 'react';
import {
  Panel, PageHead, Academic, Health, Icon, Alert, Stat, KVMatrix,
} from '../components/ui.jsx';

/**
 * STRIDE assessment — Table 3.3, plus the stated limitation of Section 3.10.
 * Two risks are rated MEDIUM deliberately rather than argued down to LOW.
 */
const STRIDE = [
  {
    cls: 'Spoofing',
    threat: 'Adversary publishes a malicious model under a trusted vendor identity',
    control: 'Composite Ed25519 + ML-DSA-65 verified during Fabric endorsement',
    residual: 'LOW',
  },
  {
    cls: 'Tampering',
    threat: 'Weight modification in transit or at an IPFS gateway',
    control: 'Per-tensor Merkle root; streaming verification with layer-level localisation',
    residual: 'LOW',
  },
  {
    cls: 'Repudiation',
    threat: 'Vendor denies authoring a model that later failed',
    control: 'Non-repudiable ML-DSA signature anchored to Ethereum. Note block.timestamp is miner-influenceable by seconds',
    residual: 'LOW',
  },
  {
    cls: 'Information disclosure',
    threat: 'Leakage of proprietary architecture through public metadata',
    control: 'Weights encrypted under ML-KEM-768-wrapped AES-256-GCM; metadata confined to Fabric private data collections',
    residual: 'LOW',
  },
  {
    cls: 'Denial of service',
    threat: 'Unpinned IPFS content garbage-collected; registry spam',
    control: 'Triple pinning plus Filecoin deal; onlyPublisher modifier and Fabric MSP gatekeeping',
    residual: 'MEDIUM',
  },
  {
    cls: 'Elevation of privilege',
    threat: 'CRQC recovers the publisher’s secp256k1 key and anchors forged records',
    control: '2-of-3 multisig on publisher management; Fabric-side ML-DSA check still fails, so forged anchors are detectable but not preventable',
    residual: 'MEDIUM',
  },
];

export default function ThreatModel() {
  const medium = STRIDE.filter((r) => r.residual === 'MEDIUM').length;

  return (
    <div>
      <PageHead
        section="3.8 THREAT MODEL & RESIDUAL RISK"
        standard="STRIDE ASSESSMENT"
        id="0x3f07_stride"
        title="Threat Model & Residual Risk"
        stats={[
          { label: 'Residual LOW', value: STRIDE.length - medium, tone: 'valid', sub: 'mitigated' },
          { label: 'Residual MEDIUM', value: medium, tone: 'classical', sub: 'deliberately not argued down' },
        ]}
      >
        Two risks are rated MEDIUM deliberately rather than argued down to LOW. Documenting the
        boundary of the guarantee is objective O4.
      </PageHead>

      <Panel icon="gpp_maybe" title="STRIDE Assessment" chip={<Academic>3.8 Table 3.3</Academic>} flush>
        <table className="table">
          <thead>
            <tr>
              <th>Class</th>
              <th>Threat</th>
              <th>Control</th>
              <th>Residual</th>
            </tr>
          </thead>
          <tbody>
            {STRIDE.map((r) => (
              <tr key={r.cls} className={r.residual === 'MEDIUM' ? 'selected' : ''}>
                <td style={{ whiteSpace: 'nowrap' }}><strong>{r.cls}</strong></td>
                <td>{r.threat}</td>
                <td style={{ fontSize: 11.5 }}>{r.control}</td>
                <td>
                  <Health state={r.residual === 'LOW' ? 'pass' : 'caution'}>{r.residual}</Health>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>

      <Alert tone="caution" icon="warning" title="Stated limitation — the anchor transaction is not quantum-safe">
        The Ethereum anchoring transaction is authorised by <span className="mono">msg.sender</span>{' '}
        and therefore signed with secp256k1. A quantum adversary who recovers a publisher's
        externally owned account key can write anchors — even though they cannot forge the ML-DSA
        signature those anchors reference. Forged anchors therefore{' '}
        <strong>fail verification but can still be committed</strong>. That is a denial-of-service
        and confusion risk, not a forgery-of-provenance risk, and the framework does not claim
        otherwise.
      </Alert>

      <div className="grid-2">
        <Panel icon="construction" title="Closing The Gap" chip={<Academic>3.10 Future Work</Academic>}>
          <p className="panel-note">
            Two directions are identified for continued work. Neither is claimed as implemented.
          </p>
          <div className="cell" style={{ marginBottom: 'var(--s-sm)' }}>
            <div style={{ marginBottom: 6 }}><Health state="pqc">ERC-4337</Health></div>
            <div className="t-body-sm" style={{ color: 'var(--text-2)' }}>
              A smart account carrying an ML-DSA verifier module, removing the dependency on an
              externally owned account signed with secp256k1.
            </div>
          </div>
          <div className="cell">
            <div style={{ marginBottom: 6 }}><Health state="pqc">ZK-SNARK</Health></div>
            <div className="t-body-sm" style={{ color: 'var(--text-2)' }}>
              Prove correct off-chain lattice verification so the EVM checks only a succinct proof,
              avoiding the prohibitive cost of ML-DSA in EVM opcodes.
            </div>
          </div>
        </Panel>

        <Panel icon="rule" title="Where Verification Actually Happens" chip={<Academic>3.1 Enforcement</Academic>}>
          <p className="panel-note">
            The distinction the framework rests on: Fabric enforces, Ethereum records.
          </p>
          <div className="formula">{`Fabric chaincode  → verify(ML-DSA) as endorsement condition
  invalid ⇒ never committed

Ethereum contract → store(bytes32 commitments)
  invalid ⇒ committed, detectable later`}</div>
          <KVMatrix
            rows={[
              { k: 'Chaincode verify (Go CIRCL)', v: <span className="v-valid">≈0.3 ms, no gas metering</span> },
              { k: 'Equivalent in EVM opcodes', v: <span className="v-critical">prohibitive</span> },
              { k: 'Anchor stores', v: '5 packed bytes32 slots' },
            ]}
          />
        </Panel>
      </div>

      <Panel icon="fact_check" title="Scope" chip={<Academic>1.5 Scope</Academic>}>
        <div className="grid-2">
          <div className="cell">
            <div style={{ marginBottom: 8 }}><Health state="pass">IN SCOPE</Health></div>
            <ul className="tight">
              <li>Fabric v2.5 network provisioning</li>
              <li>Go chaincode with embedded ML-DSA verification</li>
              <li>Solidity anchor contract — Hardhat and Sepolia</li>
              <li>React + ethers.js frontend</li>
              <li>Kubo IPFS node; per-tensor Merkle hasher</li>
              <li>Unit and fault-injection test suites</li>
              <li>Gas and latency benchmarks</li>
            </ul>
          </div>
          <div className="cell">
            <div style={{ marginBottom: 8 }}><Health state="fail">OUT OF SCOPE</Health></div>
            <ul className="tight">
              <li>Ethereum mainnet deployment with real value</li>
              <li>FPGA/ASIC acceleration of lattice polynomial arithmetic</li>
              <li>Physical quantum hardware benchmarking</li>
              <li>Zero-knowledge circuits for on-chain ML-DSA verification</li>
            </ul>
          </div>
        </div>
      </Panel>
    </div>
  );
}

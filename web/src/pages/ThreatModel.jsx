import React from 'react';
import { Panel, Badge, Alert, Formula } from '../components/ui.jsx';

/**
 * STRIDE assessment — Table 3.3, and the stated limitation of Section 3.10.
 *
 * Two risks are deliberately rated MEDIUM rather than argued down to LOW. The
 * report's objective O4 is to document the boundary of the quantum guarantee
 * rather than overstate it, so this page reproduces that boundary plainly.
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
  return (
    <div>
      <div className="page-head">
        <h1 className="page-title">Threat model and residual risk</h1>
        <p className="page-sub">
          Two risks are rated MEDIUM deliberately rather than argued down to LOW. Documenting the
          boundary of the guarantee is objective O4.
        </p>
      </div>

      <Panel title="STRIDE assessment" section="3.8">
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
              <tr key={r.cls} className={r.residual === 'MEDIUM' ? 'highlight' : ''}>
                <td style={{ color: 'var(--text)', whiteSpace: 'nowrap' }}>{r.cls}</td>
                <td>{r.threat}</td>
                <td>{r.control}</td>
                <td>
                  <Badge tone={r.residual === 'LOW' ? 'ok' : 'warn'}>{r.residual}</Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>

      <Alert tone="warn" title="Stated limitation — the anchor transaction is not quantum-safe">
        The Ethereum anchoring transaction is authorised by <code>msg.sender</code> and therefore
        signed with secp256k1. A quantum adversary who recovers a publisher's externally owned
        account key can write anchors — even though they cannot forge the ML-DSA signature those
        anchors reference. Forged anchors therefore <strong>fail verification but can still be
        committed</strong>. This is a denial-of-service and confusion risk, not a forgery-of-provenance
        risk, and the framework does not claim otherwise.
      </Alert>

      <div className="grid-2">
        <Panel title="Closing the gap" section="3.10">
          <p className="panel-note">
            Two directions are identified for continued work. Neither is claimed as implemented.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <Badge tone="quantum">ERC-4337</Badge>
              <p className="panel-note" style={{ marginTop: 8, marginBottom: 0 }}>
                A smart account with an ML-DSA verifier module, removing the dependency on an
                externally owned account signed with secp256k1.
              </p>
            </div>
            <div>
              <Badge tone="quantum">zk-SNARK</Badge>
              <p className="panel-note" style={{ marginTop: 8, marginBottom: 0 }}>
                Prove correct off-chain lattice verification so the EVM checks only a succinct
                proof, avoiding the prohibitive cost of ML-DSA in EVM opcodes.
              </p>
            </div>
          </div>
        </Panel>

        <Panel title="Where verification actually happens" section="3.1">
          <p className="panel-note">
            The distinction the framework rests on: Fabric enforces, Ethereum records.
          </p>
          <Formula>
            Fabric chaincode&nbsp;&nbsp;→ verify(ML-DSA) as endorsement condition
            {'\n'}
            &nbsp;&nbsp;invalid ⇒ <span style={{ color: 'var(--ok)' }}>never committed</span>
            {'\n\n'}
            Ethereum contract → store(bytes32 commitments)
            {'\n'}
            &nbsp;&nbsp;invalid ⇒ <span style={{ color: 'var(--warn)' }}>committed, detectable later</span>
          </Formula>
          <p className="panel-note" style={{ marginBottom: 0 }}>
            A 3,309-byte signature check costs roughly 0.3 ms in Go with CIRCL and carries no gas
            metering inside Fabric. The same check in EVM opcodes would be prohibitive, which is why
            the anchor layer stores commitments and nothing more.
          </p>
        </Panel>
      </div>

      <Panel title="Scope" section="1.5">
        <div className="grid-2">
          <div>
            <Badge tone="ok">In scope</Badge>
            <ul style={{ fontSize: 12.5, color: 'var(--text-dim)', paddingLeft: 18, lineHeight: 1.85 }}>
              <li>Fabric v2.5 network provisioning</li>
              <li>Go chaincode with embedded ML-DSA verification</li>
              <li>Solidity anchor contract — Hardhat and Sepolia</li>
              <li>React + ethers.js frontend</li>
              <li>Kubo IPFS node; per-tensor Merkle hasher</li>
              <li>Unit and fault-injection test suites</li>
              <li>Gas and latency benchmarks</li>
            </ul>
          </div>
          <div>
            <Badge tone="fail">Out of scope</Badge>
            <ul style={{ fontSize: 12.5, color: 'var(--text-dim)', paddingLeft: 18, lineHeight: 1.85 }}>
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

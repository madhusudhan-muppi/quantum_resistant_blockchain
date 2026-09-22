/**
 * Dual-layer ledger — Sections 3.5 and 3.6 of the DA2 report.
 *
 * Two distinct machines live here:
 *
 *   1. Fabric chaincode  — verifies the composite ML-DSA signature as an
 *      ENDORSEMENT CONDITION. This is objective O2: a bad signature is rejected
 *      before commit, not merely stored for optional client-side checking.
 *      Endorsement policy: AND(Org1MSP.peer, Org2MSP.peer).
 *
 *   2. Ethereum anchor contract — stores only fixed-size commitments. It never
 *      verifies a lattice signature, because doing so in EVM opcodes is
 *      prohibitively expensive. It provides public proof of existence.
 *
 * The simulation is faithful to the *decision logic* of the report — every
 * require(), the MSP gatekeeping, the gas arithmetic — while running in the
 * browser instead of against a live peer. The cryptography it checks is real.
 */

import { computeMu, compositeVerify, toHex, fromHex } from './crypto.js';
import { sha256 } from '@noble/hashes/sha2';
import { keccak_256 } from '@noble/hashes/sha3';

export const CHAIN_ID_FABRIC = 0; // channel "mlops"
export const CHAIN_ID_HARDHAT = 31337;
export const CHAIN_ID_SEPOLIA = 11155111;

/* ------------------------------------------------------------------ */
/* gas model — Section 3.5                                             */
/* ------------------------------------------------------------------ */

const GAS = {
  TX_BASE: 21000,
  SSTORE_SET: 20000, // cold, zero -> non-zero
  SSTORE_RESET: 2900, // warm update
  CALLDATA_NONZERO: 16,
  CALLDATA_ZERO: 4,
  LOG_BASE: 375,
  LOG_TOPIC: 375,
  LOG_DATA_BYTE: 8,
  KECCAK_WORD: 6,
  EXEC_OVERHEAD: 4200, // require checks, mapping lookups, modifier
};

/**
 * Estimate anchorModel() gas.
 *
 * The Anchor struct packs into 5 slots: four bytes32 plus one slot holding
 * version (uint64), timestamp (uint64) and revoked (bool) — 17 bytes together.
 */
export function estimateAnchorGas(modelId, { revocation = false } = {}) {
  const calldataBytes = 4 + 32 + Math.ceil(modelId.length / 32) * 32 + 32 * 5;
  const calldataGas = calldataBytes * GAS.CALLDATA_NONZERO * 0.85;

  const storageGas = revocation ? GAS.SSTORE_RESET : GAS.SSTORE_SET * 5;
  const logGas =
    GAS.LOG_BASE + GAS.LOG_TOPIC * 2 + (revocation ? 64 : 128) * GAS.LOG_DATA_BYTE;

  return Math.round(
    GAS.TX_BASE + calldataGas + storageGas + logGas + GAS.KECCAK_WORD * 4 + GAS.EXEC_OVERHEAD
  );
}

/**
 * The design that was rejected: storing the 1,952-byte ML-DSA public key on
 * chain. 1952 bytes = 61 words, each a cold SSTORE. Section 3.5 lists this as
 * one of three defects removed in revision.
 */
export function estimateOnChainPubkeyGas(pkBytes = 1952) {
  const words = Math.ceil(pkBytes / 32);
  return GAS.TX_BASE + words * GAS.SSTORE_SET;
}

/* ------------------------------------------------------------------ */
/* Fabric chaincode                                                    */
/* ------------------------------------------------------------------ */

/**
 * The Membership Service Provider. Section 3.8 lists MSP gatekeeping as the
 * control against registry spam, alongside the onlyPublisher modifier.
 */
export class MSP {
  constructor() {
    this.enrolled = new Map(); // pkHashHex -> { label, org, revoked }
  }

  enroll(identity, org) {
    this.enrolled.set(identity.pkHashHex, {
      label: identity.label,
      org,
      revoked: false,
      enrolledAt: Date.now(),
    });
  }

  revoke(pkHashHex) {
    const entry = this.enrolled.get(pkHashHex);
    if (entry) entry.revoked = true;
  }

  check(pkHashHex) {
    const entry = this.enrolled.get(pkHashHex);
    if (!entry) return { ok: false, reason: 'identity not enrolled in any MSP' };
    if (entry.revoked) return { ok: false, reason: `MSP identity ${entry.label} has been revoked` };
    return { ok: true, org: entry.org };
  }
}

/**
 * A single Fabric peer. Each peer independently recomputes μ from the ledger
 * state it holds and verifies both halves of the composite signature. It does
 * NOT trust a μ supplied by the client — recomputation is the whole point.
 */
class Peer {
  constructor(name, org, msp) {
    this.name = name;
    this.org = org;
    this.msp = msp;
    this.log = [];
  }

  endorse(proposal, worldState) {
    const t0 = performance.now();
    const steps = [];

    const {
      modelId,
      version,
      merkleRoot,
      metaHash,
      pkHash,
      mldsaPk,
      edPk,
      edSig,
      dsaSig,
      cidDigest,
      parentRoot,
    } = proposal;

    // 1. MSP identity check.
    const mspResult = this.msp.check(toHex(pkHash));
    steps.push({
      step: 'MSP identity',
      ok: mspResult.ok,
      detail: mspResult.ok ? `enrolled in ${mspResult.org}` : mspResult.reason,
    });
    if (!mspResult.ok) {
      return this.reject(steps, 'MSP_DENIED', mspResult.reason, t0);
    }

    // 2. Version rules — mirrors the two require() statements in the contract.
    const existing = worldState.get(`${modelId}:${version}`);
    steps.push({
      step: 'version not already anchored',
      ok: !existing,
      detail: existing ? `version ${version} already committed` : `version ${version} is free`,
    });
    if (existing) {
      return this.reject(steps, 'DUPLICATE_VERSION', 'version already anchored', t0);
    }

    const priorOk = version === 1 || worldState.has(`${modelId}:${version - 1}`);
    steps.push({
      step: 'lineage continuity',
      ok: priorOk,
      detail: priorOk ? 'no gap' : `version ${version - 1} missing — gap in lineage`,
    });
    if (!priorOk) {
      return this.reject(steps, 'LINEAGE_GAP', 'gap in lineage', t0);
    }

    // 3. Recompute μ from the proposal's own fields. A replayed signature from
    //    another version or chain will not match this μ.
    const mu = computeMu({
      chainId: CHAIN_ID_FABRIC,
      modelId,
      version,
      merkleRoot,
      pkHash,
      metaHash,
    });
    steps.push({ step: 'recompute μ (SHAKE256)', ok: true, detail: toHex(mu).slice(0, 32) + '…' });

    // 4. Bind the presented public keys to the claimed pkHash.
    const derivedPkHash = sha256(new Uint8Array([...mldsaPk, ...edPk]));
    const pkBound = toHex(derivedPkHash) === toHex(pkHash);
    steps.push({
      step: 'public key binds to pkHash',
      ok: pkBound,
      detail: pkBound ? 'SHA-256(mldsaPk ‖ edPk) matches' : 'presented key does not match pkHash',
    });
    if (!pkBound) {
      return this.reject(steps, 'KEY_MISMATCH', 'public key does not match pkHash', t0);
    }

    // 5. THE ENFORCEMENT POINT — objective O2.
    const verification = compositeVerify({ mldsaPk, edPk }, mu, edSig, dsaSig);
    steps.push({
      step: 'Ed25519 signature',
      ok: verification.edOk,
      detail: `${verification.timings.ed25519.toFixed(2)} ms`,
    });
    steps.push({
      step: 'ML-DSA-65 signature (FIPS 204)',
      ok: verification.dsaOk,
      detail: `${verification.timings.mldsa65.toFixed(2)} ms`,
    });

    if (!verification.valid) {
      const which = !verification.dsaOk ? 'ML-DSA-65' : 'Ed25519';
      return this.reject(
        steps,
        'SIGNATURE_INVALID',
        `${which} verification failed — proposal rejected at endorsement, never committed`,
        t0
      );
    }

    const elapsed = performance.now() - t0;
    const entry = {
      peer: this.name,
      org: this.org,
      decision: 'ENDORSED',
      steps,
      elapsedMs: elapsed,
      verifyMs: verification.timings.mldsa65,
      at: Date.now(),
    };
    this.log.push(entry);
    return entry;
  }

  reject(steps, code, reason, t0) {
    const entry = {
      peer: this.name,
      org: this.org,
      decision: 'REJECTED',
      code,
      reason,
      steps,
      elapsedMs: performance.now() - t0,
      at: Date.now(),
    };
    this.log.push(entry);
    return entry;
  }
}

/**
 * The Fabric network: 2 organisations × 2 peers, 3-node Raft orderer,
 * channel "mlops" (Table 3.2).
 */
export class FabricNetwork {
  constructor() {
    this.msp = new MSP();
    this.peers = [
      new Peer('peer0.org1', 'Org1MSP', this.msp),
      new Peer('peer1.org1', 'Org1MSP', this.msp),
      new Peer('peer0.org2', 'Org2MSP', this.msp),
      new Peer('peer1.org2', 'Org2MSP', this.msp),
    ];
    this.worldState = new Map();
    this.blocks = [];
    this.channel = 'mlops';
  }

  /** Endorsement policy AND(Org1MSP.peer, Org2MSP.peer). */
  submitTransaction(proposal) {
    const t0 = performance.now();

    // One peer per org endorses; the policy needs both.
    const endorsers = [this.peers[0], this.peers[2]];
    const endorsements = endorsers.map((p) => p.endorse(proposal, this.worldState));

    const org1Ok = endorsements.some((e) => e.org === 'Org1MSP' && e.decision === 'ENDORSED');
    const org2Ok = endorsements.some((e) => e.org === 'Org2MSP' && e.decision === 'ENDORSED');
    const policySatisfied = org1Ok && org2Ok;

    if (!policySatisfied) {
      const failure = endorsements.find((e) => e.decision === 'REJECTED');
      return {
        committed: false,
        policySatisfied: false,
        endorsements,
        code: failure?.code,
        reason: failure?.reason,
        policy: 'AND(Org1MSP.peer, Org2MSP.peer)',
        elapsedMs: performance.now() - t0,
      };
    }

    // Orderer cuts a block; the committing peer writes world state.
    const key = `${proposal.modelId}:${proposal.version}`;
    const record = {
      modelId: proposal.modelId,
      version: proposal.version,
      merkleRootHex: toHex(proposal.merkleRoot),
      metaHashHex: toHex(proposal.metaHash),
      pkHashHex: toHex(proposal.pkHash),
      cidDigestHex: toHex(proposal.cidDigest),
      cid: proposal.cid,
      parentRootHex: proposal.parentRoot ? toHex(proposal.parentRoot) : null,
      publisher: proposal.publisherLabel,
      leafHexes: proposal.leafHexes,
      tensorMeta: proposal.tensorMeta,
      mldsaPkHex: toHex(proposal.mldsaPk),
      edPkHex: toHex(proposal.edPk),
      edSigHex: toHex(proposal.edSig),
      dsaSigHex: toHex(proposal.dsaSig),
      modelCard: proposal.modelCard,
      revoked: false,
      committedAt: Date.now(),
      blockNumber: this.blocks.length + 1,
    };

    this.worldState.set(key, record);
    this.blocks.push({
      number: this.blocks.length + 1,
      txCount: 1,
      key,
      at: Date.now(),
      orderer: 'raft-3node',
    });

    return {
      committed: true,
      policySatisfied: true,
      endorsements,
      record,
      policy: 'AND(Org1MSP.peer, Org2MSP.peer)',
      blockNumber: record.blockNumber,
      elapsedMs: performance.now() - t0,
    };
  }

  get(modelId, version) {
    return this.worldState.get(`${modelId}:${version}`) || null;
  }

  allRecords() {
    return [...this.worldState.values()].sort((a, b) => a.committedAt - b.committedAt);
  }

  versionsOf(modelId) {
    return this.allRecords().filter((r) => r.modelId === modelId);
  }

  revoke(modelId, version, reason) {
    const record = this.get(modelId, version);
    if (!record) return null;
    record.revoked = true;
    record.revocationReason = reason;
    record.revokedAt = Date.now();
    return record;
  }
}

/* ------------------------------------------------------------------ */
/* Ethereum anchor contract                                            */
/* ------------------------------------------------------------------ */

function randomTxHash() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return '0x' + toHex(bytes);
}

/**
 * ModelAnchorRegistry — the Solidity contract of Section 3.5, in JS.
 *
 * Note what it does NOT do: it never verifies the ML-DSA signature. It stores
 * commitments. This is the honest boundary the report insists on — and the
 * reason a quantum adversary who steals the publisher's secp256k1 key can
 * write a forged anchor that later fails verification but still commits.
 */
export class AnchorRegistry {
  constructor(chainId = CHAIN_ID_HARDHAT) {
    this.chainId = chainId;
    this.address = '0x' + toHex(sha256(new Uint8Array([chainId]))).slice(0, 40);
    this.registry = new Map(); // "modelIdHash:version" -> Anchor
    this.events = [];
    this.txs = [];
    this.blockNumber = 1;
    this.publishers = new Map(); // address -> { label, active }
    this.multisig = { threshold: 2, owners: 3, pending: [] };
  }

  addPublisher(address, label) {
    this.publishers.set(address.toLowerCase(), { label, active: true, addedAt: Date.now() });
  }

  removePublisher(address) {
    const p = this.publishers.get(address.toLowerCase());
    if (p) p.active = false;
  }

  isPublisher(address) {
    const p = this.publishers.get((address || '').toLowerCase());
    return !!(p && p.active);
  }

  /** modelIdHash = keccak256(bytes(modelId)) */
  idHash(modelId) {
    return '0x' + toHex(keccak_256(new TextEncoder().encode(modelId)));
  }

  anchorModel({ modelId, version, merkleRoot, cidDigest, pkHash, parentRoot, from }) {
    // onlyPublisher modifier.
    if (!this.isPublisher(from)) {
      return { ok: false, revert: 'onlyPublisher: caller is not an authorised publisher', gasUsed: 0 };
    }

    const k = this.idHash(modelId);
    const key = `${k}:${version}`;

    // require(registry[k][version].merkleRoot == 0, "version already anchored")
    if (this.registry.has(key)) {
      return { ok: false, revert: 'version already anchored', gasUsed: 24000 };
    }

    // require(version == 1 || registry[k][version-1].merkleRoot != 0, "gap in lineage")
    if (version !== 1 && !this.registry.has(`${k}:${version - 1}`)) {
      return { ok: false, revert: 'gap in lineage', gasUsed: 24500 };
    }

    const anchor = {
      merkleRoot: '0x' + toHex(merkleRoot),
      cidDigest: '0x' + toHex(cidDigest),
      pkHash: '0x' + toHex(pkHash),
      parentRoot: parentRoot ? '0x' + toHex(parentRoot) : '0x' + '0'.repeat(64),
      version,
      timestamp: Math.floor(Date.now() / 1000),
      revoked: false,
    };

    this.registry.set(key, anchor);
    const gasUsed = estimateAnchorGas(modelId);
    const txHash = randomTxHash();
    this.blockNumber++;

    const event = {
      name: 'ModelAnchored',
      modelIdHash: k,
      modelId, // non-indexed, so it is readable from logs (Section 3.5 defect #2)
      version,
      merkleRoot: anchor.merkleRoot,
      cidDigest: anchor.cidDigest,
      blockNumber: this.blockNumber,
      txHash,
      at: Date.now(),
    };
    this.events.push(event);
    this.txs.push({
      hash: txHash,
      method: 'anchorModel',
      from,
      gasUsed,
      blockNumber: this.blockNumber,
      signedWith: 'secp256k1 (ECDSA)', // the stated residual risk
      at: Date.now(),
    });

    return { ok: true, anchor, gasUsed, txHash, blockNumber: this.blockNumber, event };
  }

  revokeModel({ modelId, version, reason, from }) {
    if (!this.isPublisher(from)) {
      return { ok: false, revert: 'onlyPublisher: caller is not an authorised publisher', gasUsed: 0 };
    }
    const k = this.idHash(modelId);
    const anchor = this.registry.get(`${k}:${version}`);
    if (!anchor) return { ok: false, revert: 'no such anchor', gasUsed: 23000 };

    anchor.revoked = true;
    const gasUsed = estimateAnchorGas(modelId, { revocation: true });
    const txHash = randomTxHash();
    this.blockNumber++;

    const event = {
      name: 'ModelRevoked',
      modelIdHash: k,
      modelId,
      version,
      reason,
      blockNumber: this.blockNumber,
      txHash,
      at: Date.now(),
    };
    this.events.push(event);
    this.txs.push({
      hash: txHash,
      method: 'revokeModel',
      from,
      gasUsed,
      blockNumber: this.blockNumber,
      signedWith: 'secp256k1 (ECDSA)',
      at: Date.now(),
    });

    return { ok: true, gasUsed, txHash, event };
  }

  getAnchor(modelId, version) {
    return this.registry.get(`${this.idHash(modelId)}:${version}`) || null;
  }

  totalGas() {
    return this.txs.reduce((n, t) => n + t.gasUsed, 0);
  }
}

export { keccak_256 };

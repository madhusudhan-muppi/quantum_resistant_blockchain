# QRB — Quantum-Resistant Blockchain Framework

Reference frontend for **"Quantum-Resistant Blockchain Framework for Secure AI Model
Distribution and Provenance" (DA2)** — a hybrid ledger combining NIST FIPS 204 (ML-DSA),
Hyperledger Fabric, Ethereum anchoring and IPFS content addressing.

Madhusudhan (25BCE1176) · Mahathi Shri G (25BCE5747)

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
npm run test:all   # 45 logic assertions + 16 page renders
```

## What is actually real

The cryptography is not simulated. It runs in your browser.

| Component | Status | Library |
|---|---|---|
| ML-DSA-65 signing and verification | **Real** — FIPS 204 | `@noble/post-quantum` |
| Ed25519 (composite half) | **Real** | `@noble/curves` |
| SHAKE256 context binding, SHA-256 leaves | **Real** | `@noble/hashes` |
| ML-KEM-768 + AES-256-GCM | **Real** | `@noble/post-quantum` + WebCrypto |
| safetensors parsing, per-tensor Merkle tree | **Real** | this repo |
| CIDv1 (dag-pb, sha2-256, base32) | **Real** encoding | this repo |
| Fabric peers, MSP, endorsement policy | Simulated in JS | `src/lib/ledger.js` |
| Ethereum anchor contract, gas model | Simulated in JS | `src/lib/ledger.js` |
| IPFS node | In-memory | `src/lib/ipfs.js` |

Key and signature lengths are asserted against Table 3.1 at runtime: public key 1,952 B,
private key 4,032 B, signature 3,309 B. The composite signature is 3,373 B — the extra 64
bytes are the Ed25519 half.

The ledger simulation is faithful to the *decision logic* of the report — every `require()`,
the MSP gatekeeping, the endorsement policy `AND(Org1MSP.peer, Org2MSP.peer)`, the EVM gas
arithmetic — but runs in the browser rather than against a live peer. **The signatures it
checks are genuine**, so a corrupted signature is genuinely rejected, not theatrically rejected.

## The four user journeys

Section 3.6 of the report specifies four. All four are implemented:

1. **Register model** — upload → per-tensor hash → pin → composite sign → Fabric endorsement → Ethereum anchor
2. **Lineage** — parent-pointer DAG across versions and derivatives
3. **Verify artefact** — streaming per-tensor pass/fail, signature check, anchor inclusion
4. **Governance** — publisher administration behind a 2-of-3 multisig, and revocation

Plus two pages that exercise the evaluation methodology of Section 3.7:

5. **Fault injection** — eight attacks, each expected to be detected
6. **Benchmarks** — live ML-DSA vs Ed25519 latency, Merkle vs flat SHA-256, gas costs

## Where the interesting code lives

| Path | Report section |
|---|---|
| [src/lib/crypto.js](src/lib/crypto.js) | 3.2 — ML-DSA-65, composite signatures, μ context binding, ML-KEM |
| [src/lib/merkle.js](src/lib/merkle.js) | 3.3 — safetensors parsing, per-tensor leaves, streaming verification |
| [src/lib/ipfs.js](src/lib/ipfs.js) | 3.4 — CIDv1 construction, pinning and garbage collection |
| [src/lib/ledger.js](src/lib/ledger.js) | 3.5 — chaincode endorsement, anchor contract, gas model |
| [src/pages/Faults.jsx](src/pages/Faults.jsx) | 3.7 — fault injection scenarios |
| [src/pages/ThreatModel.jsx](src/pages/ThreatModel.jsx) | 3.8 — STRIDE table and residual risk |

## Honest limitations

These follow objective O4 — document the boundary rather than overstate it.

- **The Ethereum anchor transaction is signed with secp256k1.** A quantum adversary who
  recovers a publisher's EOA key can write anchors. Those anchors fail ML-DSA verification,
  so forged provenance is *detectable but not preventable*. Rated MEDIUM in Table 3.3.
- **CID chunking is simplified.** This node treats the artefact as a single UnixFS block, so
  the DAG root equals the flat SHA-256. A real Kubo node chunks at 256 KiB and the roots
  diverge — which is precisely why the per-tensor Merkle root is recorded separately.
- **JavaScript ML-DSA is slower than Go CIRCL.** Treat the benchmark's absolute numbers as an
  upper bound; the ratio between schemes is the meaningful result.
- **No live Fabric peer, Hardhat node or Kubo daemon.** State lives in memory and resets on
  reload.

## Stack

React 18 · Vite 6 · @noble/post-quantum · @noble/curves · @noble/hashes. No backend.

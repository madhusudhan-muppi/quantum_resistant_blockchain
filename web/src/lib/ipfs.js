/**
 * Storage layer — Section 3.4 of the DA2 report.
 *
 * Model binaries are content-addressed. The CID is produced with the real
 * CIDv1 encoding rather than a placeholder string, because the report makes a
 * point of the identifier being commonly misreported:
 *
 *   CID = CIDv1( codec = dag-pb, multihash = SHA-256( UnixFS DAG root ) )
 *
 * Simplification, stated plainly: this in-browser node treats the artefact as a
 * single UnixFS block, so the DAG root equals the SHA-256 of the file bytes.
 * For any file above the 256 KiB default chunk size a real Kubo node chunks
 * first, and the DAG root then differs from the flat digest — which is exactly
 * why Section 3.3's per-tensor Merkle root is computed and recorded separately
 * instead of being derived from the CID.
 */

import { sha256 } from '@noble/hashes/sha2';
import { toHex, concat } from './crypto.js';

export const UNIXFS_CHUNK_SIZE = 256 * 1024;

const BASE32_ALPHABET = 'abcdefghijklmnopqrstuvwxyz234567';

/** RFC 4648 base32, lowercase, unpadded — the 'b' multibase used by CIDv1. */
function base32Encode(bytes) {
  let bits = 0;
  let value = 0;
  let output = '';

  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += BASE32_ALPHABET[(value << (5 - bits)) & 31];

  return output;
}

/** Unsigned LEB128 varint, as used by multiformats. */
function varint(n) {
  const out = [];
  let v = n;
  while (v >= 0x80) {
    out.push((v & 0x7f) | 0x80);
    v >>>= 7;
  }
  out.push(v);
  return new Uint8Array(out);
}

/**
 * Build a CIDv1: multibase('b') ‖ version ‖ codec ‖ multihash
 * multihash = 0x12 (sha2-256) ‖ 0x20 (32 bytes) ‖ digest
 */
export function makeCIDv1(digest, codec = 0x70 /* dag-pb */) {
  const multihash = concat(new Uint8Array([0x12, 0x20]), digest);
  const bytes = concat(varint(0x01), varint(codec), multihash);
  return {
    cid: 'b' + base32Encode(bytes),
    digest,
    digestHex: toHex(digest),
    codec: codec === 0x70 ? 'dag-pb' : `0x${codec.toString(16)}`,
    multihash: 'sha2-256',
  };
}

/**
 * In-browser stand-in for a Kubo node. Holds the artefact plus the full
 * ML-DSA public key — Section 3.5 keeps only keccak256(pk) on chain because
 * storing the 1,952-byte key itself costs roughly 1.2M gas.
 */
class IPFSNode {
  constructor() {
    this.blocks = new Map();
    this.pins = new Map();
  }

  add(bytes, { pin = true, label = '' } = {}) {
    const digest = sha256(bytes);
    const { cid, digestHex, codec, multihash } = makeCIDv1(digest);

    const chunks = Math.max(1, Math.ceil(bytes.length / UNIXFS_CHUNK_SIZE));
    this.blocks.set(cid, { bytes, size: bytes.length, chunks, label, addedAt: Date.now() });

    if (pin) {
      // Section 3.4: three pinning nodes plus a Filecoin deal. Unpinned blocks
      // are garbage-collected — integrity is guaranteed, persistence is not.
      this.pins.set(cid, { nodes: ['pin-node-1', 'pin-node-2', 'pin-node-3'], filecoinDeal: true });
    }

    return {
      cid,
      digest,
      digestHex,
      codec,
      multihash,
      size: bytes.length,
      chunks,
      chunked: bytes.length > UNIXFS_CHUNK_SIZE,
      pinned: pin,
    };
  }

  get(cid) {
    const block = this.blocks.get(cid);
    if (!block) return null;
    if (!this.pins.has(cid)) return null; // garbage-collected
    return block.bytes;
  }

  has(cid) {
    return this.blocks.has(cid);
  }

  isPinned(cid) {
    return this.pins.has(cid);
  }

  /** Simulate the DoS risk rated MEDIUM in Table 3.3. */
  unpinAndCollect(cid) {
    this.pins.delete(cid);
  }

  repin(cid) {
    if (this.blocks.has(cid)) {
      this.pins.set(cid, { nodes: ['pin-node-1', 'pin-node-2', 'pin-node-3'], filecoinDeal: true });
    }
  }

  stats() {
    let bytes = 0;
    for (const b of this.blocks.values()) bytes += b.size;
    return { blocks: this.blocks.size, pinned: this.pins.size, bytes };
  }
}

export const ipfs = new IPFSNode();

/**
 * Per-tensor Merkle hashing — Section 3.3 of the DA2 report.
 *
 * A flat SHA-256 over a serialised file tells you *that* something changed but
 * never *where*, needs the whole multi-gigabyte download before verification can
 * begin, and forces a full re-signature when a fine-tune touches a handful of
 * adapter matrices. This module replaces it with:
 *
 *   leaf_i = SHA-256( name_i ‖ dtype_i ‖ shape_i ‖ tensor_bytes_i )
 *   root   = MerkleRoot( sort_by_name( leaf_0 … leaf_n ) )
 *
 * yielding tamper localisation, streaming verification, and delta provenance.
 */

import { sha256 } from '@noble/hashes/sha2';
import { concat, te, toHex } from './crypto.js';

/* ------------------------------------------------------------------ */
/* safetensors container parsing                                       */
/* ------------------------------------------------------------------ */

/**
 * Parse a real .safetensors buffer.
 *
 * Layout: [ u64 little-endian header length ][ JSON header ][ raw tensor data ]
 * Each header entry carries dtype, shape and data_offsets relative to the start
 * of the data segment.
 *
 * Section 3.3 notes the SDK refuses pickle-backed formats outright: the most
 * common real supply-chain attack on AI today is arbitrary code execution via
 * torch.load deserialisation, and a signature checked *after* loading is
 * worthless. Only safetensors and ONNX are accepted.
 */
export function parseSafetensors(buffer) {
  const view = new DataView(buffer);
  if (buffer.byteLength < 8) throw new Error('File too small to be a safetensors container');

  const headerLen = Number(view.getBigUint64(0, true));
  if (headerLen <= 0 || headerLen + 8 > buffer.byteLength) {
    throw new Error('Invalid safetensors header length — not a safetensors file');
  }

  const headerBytes = new Uint8Array(buffer, 8, headerLen);
  let header;
  try {
    header = JSON.parse(new TextDecoder().decode(headerBytes));
  } catch {
    throw new Error('safetensors header is not valid JSON');
  }

  const dataStart = 8 + headerLen;
  const tensors = [];

  for (const [name, info] of Object.entries(header)) {
    if (name === '__metadata__') continue;
    const [start, end] = info.data_offsets;
    tensors.push({
      name,
      dtype: info.dtype,
      shape: info.shape,
      byteStart: dataStart + start,
      byteEnd: dataStart + end,
      byteLength: end - start,
    });
  }

  // Section 3.3: sort tensor names so the tree is canonical regardless of the
  // order the producer happened to serialise them in.
  tensors.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

  return { header, metadata: header.__metadata__ || {}, tensors, dataStart };
}

/** Rejected by the consumer SDK before any bytes are deserialised. */
export const BANNED_EXTENSIONS = ['.pkl', '.pickle', '.bin', '.pt', '.pth', '.ckpt'];

export function isFormatAllowed(filename) {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.safetensors') || lower.endsWith('.onnx')) {
    return { allowed: true, reason: 'safetensors / ONNX — no code execution on load' };
  }
  const banned = BANNED_EXTENSIONS.find((ext) => lower.endsWith(ext));
  if (banned) {
    return {
      allowed: false,
      reason: `${banned} is a pickle-backed format — torch.load executes arbitrary code during deserialisation, before any signature could be checked (Section 3.3)`,
    };
  }
  return { allowed: false, reason: 'Unrecognised container; only safetensors and ONNX are accepted' };
}

/* ------------------------------------------------------------------ */
/* leaf and tree construction                                          */
/* ------------------------------------------------------------------ */

/** leaf_i = SHA-256( name_i ‖ dtype_i ‖ shape_i ‖ tensor_bytes_i ) */
export function tensorLeaf(tensor, bytes) {
  return sha256(
    concat(
      te.encode(tensor.name),
      te.encode(tensor.dtype),
      te.encode(JSON.stringify(tensor.shape)),
      bytes
    )
  );
}

/**
 * Build a binary Merkle tree over the sorted leaves. An odd node at any level
 * is promoted (hashed with itself) so the tree stays balanced.
 * Returns every level so the UI can draw the tree and derive inclusion proofs.
 */
export function buildMerkleTree(leaves) {
  if (leaves.length === 0) throw new Error('Cannot build a Merkle tree over zero tensors');

  const levels = [leaves];
  let current = leaves;

  while (current.length > 1) {
    const next = [];
    for (let i = 0; i < current.length; i += 2) {
      const left = current[i];
      const right = i + 1 < current.length ? current[i + 1] : current[i];
      next.push(sha256(concat(left, right)));
    }
    levels.push(next);
    current = next;
  }

  return { root: current[0], levels };
}

/**
 * Inclusion proof for leaf `index`: the sibling at each level plus its side.
 * A failed proof is what localises tampering to a single tensor.
 */
export function merkleProof(levels, index) {
  const proof = [];
  let idx = index;

  for (let level = 0; level < levels.length - 1; level++) {
    const nodes = levels[level];
    const isRight = idx % 2 === 1;
    const siblingIdx = isRight ? idx - 1 : idx + 1 < nodes.length ? idx + 1 : idx;
    proof.push({ hash: nodes[siblingIdx], position: isRight ? 'left' : 'right' });
    idx = Math.floor(idx / 2);
  }

  return proof;
}

export function verifyProof(leaf, proof, root) {
  let computed = leaf;
  for (const step of proof) {
    computed =
      step.position === 'left'
        ? sha256(concat(step.hash, computed))
        : sha256(concat(computed, step.hash));
  }
  return toHex(computed) === toHex(root);
}

/* ------------------------------------------------------------------ */
/* hashing pipelines                                                   */
/* ------------------------------------------------------------------ */

/**
 * Hash every tensor and build the tree. `onProgress` is called per tensor so
 * the UI can show the streaming behaviour rather than a single spinner.
 */
export async function hashModel(buffer, onProgress) {
  const parsed = parseSafetensors(buffer);
  const leaves = [];
  const t0 = performance.now();

  for (let i = 0; i < parsed.tensors.length; i++) {
    const t = parsed.tensors[i];
    const bytes = new Uint8Array(buffer, t.byteStart, t.byteLength);
    const leaf = tensorLeaf(t, bytes);
    leaves.push(leaf);

    if (onProgress) {
      onProgress({ index: i, total: parsed.tensors.length, tensor: t, leaf });
      // Yield to the event loop so progress actually paints.
      if (i % 4 === 0) await new Promise((r) => setTimeout(r, 0));
    }
  }

  const tree = buildMerkleTree(leaves);
  const elapsed = performance.now() - t0;

  return {
    ...parsed,
    leaves,
    tree,
    root: tree.root,
    rootHex: toHex(tree.root),
    elapsedMs: elapsed,
    totalBytes: parsed.tensors.reduce((n, t) => n + t.byteLength, 0),
  };
}

/** Flat SHA-256 over the whole file — the baseline Section 3.3 argues against. */
export function flatHash(buffer) {
  const t0 = performance.now();
  const digest = sha256(new Uint8Array(buffer));
  return { digest, hex: toHex(digest), elapsedMs: performance.now() - t0 };
}

/**
 * H_meta = SHA-256( model_card ‖ dataset_hash ‖ eval_metrics )
 * Binds the documentation to the weights, so a Model Card cannot be swapped
 * independently of the artefact it describes.
 */
export function metaHash({ modelCard, datasetHash, evalMetrics }) {
  return sha256(
    concat(
      te.encode(modelCard || ''),
      te.encode(datasetHash || ''),
      te.encode(JSON.stringify(evalMetrics || {}))
    )
  );
}

/* ------------------------------------------------------------------ */
/* streaming verification — Section 3.3                                */
/* ------------------------------------------------------------------ */

/**
 * Verify tensor by tensor as bytes "arrive", aborting at the first mismatch
 * instead of downloading the whole artefact first. Each failure names the
 * layer, which is the tamper-localisation property a flat hash cannot offer.
 */
export async function streamVerify(buffer, expectedLeaves, tree, onTensor) {
  const parsed = parseSafetensors(buffer);
  const results = [];
  let bytesProcessed = 0;

  for (let i = 0; i < parsed.tensors.length; i++) {
    const t = parsed.tensors[i];
    const bytes = new Uint8Array(buffer, t.byteStart, t.byteLength);
    const leaf = tensorLeaf(t, bytes);
    const expected = expectedLeaves[i];
    const ok = expected && toHex(leaf) === toHex(expected);

    bytesProcessed += t.byteLength;

    const entry = {
      index: i,
      name: t.name,
      dtype: t.dtype,
      shape: t.shape,
      byteLength: t.byteLength,
      computed: toHex(leaf),
      expected: expected ? toHex(expected) : null,
      ok,
      bytesProcessed,
    };

    // On failure, run the inclusion proof to prove the tree localises the fault.
    if (!ok && tree) {
      const proof = merkleProof(tree.levels, i);
      entry.proofHolds = verifyProof(leaf, proof, tree.root);
    }

    results.push(entry);
    if (onTensor) {
      onTensor(entry);
      await new Promise((r) => setTimeout(r, 12));
    }

    if (!ok) {
      return { results, aborted: true, abortedAt: i, bytesProcessed, total: parsed.tensors.length };
    }
  }

  return { results, aborted: false, bytesProcessed, total: parsed.tensors.length };
}

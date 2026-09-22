/**
 * Cryptographic core — Section 3.2 of the DA2 report.
 *
 * Everything in this file is REAL cryptography running in the browser:
 *   - ML-DSA-65  (NIST FIPS 204, Security Category 3)  via @noble/post-quantum
 *   - Ed25519    (classical half of the composite signature) via @noble/curves
 *   - SHAKE256   (domain-separated context binding)          via @noble/hashes
 *   - ML-KEM-768 (FIPS 203, confidentiality path)            via @noble/post-quantum
 *
 * No signature is mocked. Key and signature lengths are asserted against the
 * FIPS 204 values reproduced in Table 3.1 of the report.
 */

import { ml_dsa65 } from '@noble/post-quantum/ml-dsa';
import { ml_kem768 } from '@noble/post-quantum/ml-kem';
import { ed25519 } from '@noble/curves/ed25519';
import { shake256 } from '@noble/hashes/sha3';
import { sha256 } from '@noble/hashes/sha2';
import { randomBytes } from '@noble/hashes/utils';

/** FIPS 204 parameter sets — Table 3.1. Final column is the superseded Round-3 value. */
export const FIPS204_PARAMS = [
  { name: 'ML-DSA-44', level: 'Category 2', pk: 1312, sk: 2560, sig: 2420, round3: 2420 },
  { name: 'ML-DSA-65', level: 'Category 3', pk: 1952, sk: 4032, sig: 3309, round3: 3293, selected: true },
  { name: 'ML-DSA-87', level: 'Category 5', pk: 2592, sk: 4896, sig: 4627, round3: 4595 },
];

export const SELECTED = FIPS204_PARAMS.find((p) => p.selected);

/* ------------------------------------------------------------------ */
/* byte helpers                                                        */
/* ------------------------------------------------------------------ */

export const te = new TextEncoder();

export function toHex(bytes) {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function fromHex(hex) {
  const clean = hex.replace(/^0x/, '');
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export function concat(...arrays) {
  const total = arrays.reduce((n, a) => n + a.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const a of arrays) {
    out.set(a, off);
    off += a.length;
  }
  return out;
}

/** Truncated hex for display: 0x1a2b3c…9f8e7d */
export function shortHex(hex, head = 8, tail = 6) {
  const h = hex.startsWith('0x') ? hex : '0x' + hex;
  if (h.length <= head + tail + 3) return h;
  return `${h.slice(0, head + 2)}…${h.slice(-tail)}`;
}

/** u64 big-endian — used inside the context string so version binding is unambiguous. */
function u64be(n) {
  const out = new Uint8Array(8);
  const v = BigInt(n);
  for (let i = 7; i >= 0; i--) out[i] = Number((v >> BigInt((7 - i) * 8)) & 0xffn);
  return out;
}

/* ------------------------------------------------------------------ */
/* key management                                                      */
/* ------------------------------------------------------------------ */

/**
 * Generate a publisher identity: an ML-DSA-65 keypair plus an Ed25519 keypair.
 * The pair together forms the composite signer of Section 3.2.
 */
export function generateIdentity(label) {
  const seed = randomBytes(32);
  const dsa = ml_dsa65.keygen(seed);

  // @noble/curves renamed randomPrivateKey -> randomSecretKey across versions.
  const edSk = ed25519.utils.randomSecretKey
    ? ed25519.utils.randomSecretKey()
    : ed25519.utils.randomPrivateKey();
  const edPk = ed25519.getPublicKey(edSk);

  if (dsa.publicKey.length !== SELECTED.pk || dsa.secretKey.length !== SELECTED.sk) {
    throw new Error('ML-DSA-65 key length does not match FIPS 204');
  }

  const pkHash = sha256(concat(dsa.publicKey, edPk));

  return {
    label,
    createdAt: Date.now(),
    mldsaPk: dsa.publicKey,
    mldsaSk: dsa.secretKey,
    edPk,
    edSk,
    pkHash,
    pkHashHex: toHex(pkHash),
    sizes: {
      mldsaPk: dsa.publicKey.length,
      mldsaSk: dsa.secretKey.length,
      edPk: edPk.length,
      edSk: edSk.length,
    },
  };
}

/* ------------------------------------------------------------------ */
/* context binding — Section 3.2                                       */
/* ------------------------------------------------------------------ */

/**
 * signed_μ = SHAKE256( context ‖ root ‖ H_meta ),  where
 * context  = "QRB-v1" ‖ chainID ‖ modelId ‖ version ‖ pkHash
 *
 * Binding every signature to one chain, model id and version is what stops
 * cross-version and cross-chain replay. The fault-injection page exercises
 * exactly this by replaying a prior version's signature.
 */
export function computeMu({ chainId, modelId, version, merkleRoot, pkHash, metaHash }) {
  // context = "QRB-v1" ‖ chainID ‖ modelId ‖ version ‖ pkHash   (Section 3.2)
  const context = concat(
    te.encode('QRB-v1'),
    u64be(chainId),
    te.encode(modelId),
    u64be(version),
    pkHash
  );

  // signed_μ = SHAKE256( context ‖ root ‖ H_meta )               (Section 3.3)
  const preimage = concat(context, merkleRoot, metaHash || new Uint8Array(0));

  return shake256(preimage, { dkLen: 64 });
}

/* ------------------------------------------------------------------ */
/* composite signatures — Section 3.2                                  */
/* ------------------------------------------------------------------ */

/**
 * Composite signature = Ed25519 ‖ ML-DSA-65, both over the same μ.
 * The verifier requires BOTH to be valid, so a break of either scheme alone
 * does not yield a forgery during the migration window. Cost: +64 bytes.
 */
export function compositeSign(identity, mu) {
  const t0 = performance.now();
  const edSig = ed25519.sign(mu, identity.edSk);
  const tEd = performance.now() - t0;

  const t1 = performance.now();
  const dsaSig = ml_dsa65.sign(identity.mldsaSk, mu);
  const tDsa = performance.now() - t1;

  if (dsaSig.length !== SELECTED.sig) {
    throw new Error(`ML-DSA-65 signature length ${dsaSig.length} != FIPS 204 ${SELECTED.sig}`);
  }

  return {
    edSig,
    dsaSig,
    composite: concat(edSig, dsaSig),
    timings: { ed25519: tEd, mldsa65: tDsa },
  };
}

/**
 * Verify a composite signature. Returns a per-scheme breakdown so the UI can
 * show which half failed — the chaincode treats any failure as a rejection.
 */
export function compositeVerify({ mldsaPk, edPk }, mu, edSig, dsaSig) {
  let edOk = false;
  let dsaOk = false;
  let tEd = 0;
  let tDsa = 0;

  try {
    const t0 = performance.now();
    edOk = ed25519.verify(edSig, mu, edPk);
    tEd = performance.now() - t0;
  } catch {
    edOk = false;
  }

  try {
    const t1 = performance.now();
    dsaOk = ml_dsa65.verify(mldsaPk, mu, dsaSig);
    tDsa = performance.now() - t1;
  } catch {
    dsaOk = false;
  }

  return { edOk, dsaOk, valid: edOk && dsaOk, timings: { ed25519: tEd, mldsa65: tDsa } };
}

/* ------------------------------------------------------------------ */
/* confidentiality path — Section 3.2                                  */
/* ------------------------------------------------------------------ */

/**
 * Wrap a content-encryption key with ML-KEM-768 instead of ECDH, then encrypt
 * the payload under AES-256-GCM. This is the answer to the HNDL vector of
 * Section 1.2 — a signature alone does nothing for confidentiality.
 */
export async function kemWrapAndEncrypt(plaintext) {
  const { publicKey, secretKey } = ml_kem768.keygen();

  // Encapsulate against the recipient's ML-KEM public key.
  const { cipherText, sharedSecret } = ml_kem768.encapsulate(publicKey);

  // The shared secret becomes the AES-256-GCM content-encryption key.
  const cek = await crypto.subtle.importKey('raw', sharedSecret, 'AES-GCM', false, [
    'encrypt',
    'decrypt',
  ]);
  const iv = randomBytes(12);
  const ct = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, cek, plaintext)
  );

  // Prove the recipient recovers the same secret by decapsulating.
  const recovered = ml_kem768.decapsulate(cipherText, secretKey);
  const cek2 = await crypto.subtle.importKey('raw', recovered, 'AES-GCM', false, ['decrypt']);
  const back = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, cek2, ct));

  return {
    kemPkLen: publicKey.length,
    kemCtLen: cipherText.length,
    sharedSecretLen: sharedSecret.length,
    ivLen: iv.length,
    ciphertextLen: ct.length,
    roundTripOk: back.length === plaintext.length && back.every((b, i) => b === plaintext[i]),
  };
}

export { sha256, shake256, randomBytes, ml_dsa65, ed25519 };

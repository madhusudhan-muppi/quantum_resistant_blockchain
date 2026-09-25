import { generateIdentity, computeMu, compositeSign, compositeVerify, toHex, fromHex, kemWrapAndEncrypt } from '../src/lib/crypto.js';
import { hashModel, flatHash, metaHash, streamVerify, parseSafetensors, isFormatAllowed, buildMerkleTree, merkleProof, verifyProof } from '../src/lib/merkle.js';
import { generateSafetensors, injectBitFlip, injectTensorReorder, injectTruncation } from '../src/lib/demoModel.js';
import { ipfs, makeCIDv1 } from '../src/lib/ipfs.js';
import { FabricNetwork, AnchorRegistry, CHAIN_ID_FABRIC, CHAIN_ID_SEPOLIA, estimateAnchorGas, estimateOnChainPubkeyGas } from '../src/lib/ledger.js';
import { sha256 } from '@noble/hashes/sha2';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  \x1b[32m✓\x1b[0m', m); } else { fail++; console.log('  \x1b[31m✗\x1b[0m', m); } };

console.log('\n\x1b[1m1. safetensors parsing + per-tensor Merkle\x1b[0m');
const demo = generateSafetensors({ preset: 'small', seed: 42 });
const hashed = await hashModel(demo.buffer);
ok(hashed.tensors.length === 30, `parsed ${hashed.tensors.length} tensors`);
const names = hashed.tensors.map(t => t.name);
ok(JSON.stringify(names) === JSON.stringify([...names].sort()), 'tensor names are canonically sorted');
ok(hashed.rootHex.length === 64, `merkle root ${hashed.rootHex.slice(0,16)}…`);
const flat = flatHash(demo.buffer);
ok(flat.hex !== hashed.rootHex, 'merkle root differs from flat SHA-256 (as it must)');

// determinism
const demo2 = generateSafetensors({ preset: 'small', seed: 42 });
const hashed2 = await hashModel(demo2.buffer);
ok(hashed2.rootHex === hashed.rootHex, 'hashing is deterministic across regeneration');

console.log('\n\x1b[1m2. Merkle inclusion proofs\x1b[0m');
const proof = merkleProof(hashed.tree.levels, 7);
ok(verifyProof(hashed.leaves[7], proof, hashed.tree.root), 'valid inclusion proof verifies');
ok(!verifyProof(hashed.leaves[8], proof, hashed.tree.root), 'wrong leaf fails the same proof');

console.log('\n\x1b[1m3. format gatekeeping\x1b[0m');
ok(isFormatAllowed('model.safetensors').allowed, 'safetensors accepted');
ok(isFormatAllowed('model.onnx').allowed, 'onnx accepted');
ok(!isFormatAllowed('model.pkl').allowed, 'pickle rejected');
ok(!isFormatAllowed('pytorch_model.bin').allowed, '.bin rejected');

console.log('\n\x1b[1m4. identity + composite signature\x1b[0m');
const acme = generateIdentity('Acme AI Labs');
acme.ethAddress = '0x' + acme.pkHashHex.slice(0, 40);
ok(acme.sizes.mldsaPk === 1952 && acme.sizes.mldsaSk === 4032, 'ML-DSA-65 key sizes match FIPS 204');
const hMeta = metaHash({ modelCard: 'test', datasetHash: 'abc', evalMetrics: { top1: 0.9 } });
const mu = computeMu({ chainId: CHAIN_ID_FABRIC, modelId: 'acme/enc', version: 1, merkleRoot: hashed.root, pkHash: acme.pkHash, metaHash: hMeta });
ok(mu.length === 64, 'μ is 64 bytes of SHAKE256 output');
const sig = compositeSign(acme, mu);
ok(sig.dsaSig.length === 3309, `ML-DSA-65 sig = ${sig.dsaSig.length} B`);
ok(sig.composite.length === 3373, `composite = ${sig.composite.length} B (+64 for Ed25519)`);
ok(compositeVerify(acme, mu, sig.edSig, sig.dsaSig).valid, 'composite verifies');

console.log('\n\x1b[1m5. replay resistance\x1b[0m');
const muV2 = computeMu({ chainId: CHAIN_ID_FABRIC, modelId: 'acme/enc', version: 2, merkleRoot: hashed.root, pkHash: acme.pkHash, metaHash: hMeta });
ok(!compositeVerify(acme, muV2, sig.edSig, sig.dsaSig).valid, 'cross-version replay fails');
const muChain = computeMu({ chainId: CHAIN_ID_SEPOLIA, modelId: 'acme/enc', version: 1, merkleRoot: hashed.root, pkHash: acme.pkHash, metaHash: hMeta });
ok(!compositeVerify(acme, muChain, sig.edSig, sig.dsaSig).valid, 'cross-chain replay fails');

console.log('\n\x1b[1m6. IPFS CIDv1\x1b[0m');
const pin = ipfs.add(new Uint8Array(demo.buffer), { label: 'demo' });
ok(pin.cid.startsWith('bafy') || pin.cid.startsWith('b'), `CIDv1 ${pin.cid.slice(0, 24)}…`);
ok(pin.codec === 'dag-pb' && pin.multihash === 'sha2-256', 'codec dag-pb, multihash sha2-256');
ok(ipfs.get(pin.cid) !== null, 'pinned block retrievable');
ipfs.unpinAndCollect(pin.cid);
ok(ipfs.get(pin.cid) === null, 'unpinned block is garbage-collected');
ipfs.repin(pin.cid);
ok(ipfs.get(pin.cid) !== null, 'repin restores retrievability');

console.log('\n\x1b[1m7. Fabric endorsement (the enforcement point)\x1b[0m');
const fabric = new FabricNetwork();
const anchor = new AnchorRegistry(31337);
fabric.msp.enroll(acme, 'Org1MSP');
anchor.addPublisher(acme.ethAddress, acme.label);

const proposal = {
  modelId: 'acme/enc', version: 1, merkleRoot: hashed.root, metaHash: hMeta,
  pkHash: acme.pkHash, mldsaPk: acme.mldsaPk, edPk: acme.edPk,
  edSig: sig.edSig, dsaSig: sig.dsaSig, cidDigest: pin.digest, cid: pin.cid,
  parentRoot: null, publisherLabel: acme.label, modelCard: 'test',
  leafHexes: hashed.leaves.map(toHex),
  tensorMeta: hashed.tensors.map(t => ({ name: t.name, dtype: t.dtype, shape: t.shape, byteLength: t.byteLength })),
};
const tx = fabric.submitTransaction(proposal);
ok(tx.committed, `committed in block ${tx.blockNumber} under ${tx.policy}`);

// tamper the signature
const badSig = new Uint8Array(sig.dsaSig); badSig[100] ^= 0xff;
const tx2 = fabric.submitTransaction({ ...proposal, version: 2, dsaSig: badSig });
ok(!tx2.committed && tx2.code === 'SIGNATURE_INVALID', `corrupt ML-DSA sig rejected: ${tx2.code}`);

// duplicate version
const txDup = fabric.submitTransaction(proposal);
ok(!txDup.committed && txDup.code === 'DUPLICATE_VERSION', `duplicate version rejected: ${txDup.code}`);

// lineage gap
const muV5 = computeMu({ chainId: CHAIN_ID_FABRIC, modelId: 'acme/enc', version: 5, merkleRoot: hashed.root, pkHash: acme.pkHash, metaHash: hMeta });
const sigV5 = compositeSign(acme, muV5);
const txGap = fabric.submitTransaction({ ...proposal, version: 5, edSig: sigV5.edSig, dsaSig: sigV5.dsaSig });
ok(!txGap.committed && txGap.code === 'LINEAGE_GAP', `lineage gap rejected: ${txGap.code}`);

// unenrolled publisher with a genuinely valid signature
const rogue = generateIdentity('Unknown Publisher');
rogue.ethAddress = '0x' + rogue.pkHashHex.slice(0, 40);
const muR = computeMu({ chainId: CHAIN_ID_FABRIC, modelId: 'rogue/m', version: 1, merkleRoot: hashed.root, pkHash: rogue.pkHash, metaHash: hMeta });
const sigR = compositeSign(rogue, muR);
const txRogue = fabric.submitTransaction({ ...proposal, modelId: 'rogue/m', pkHash: rogue.pkHash, mldsaPk: rogue.mldsaPk, edPk: rogue.edPk, edSig: sigR.edSig, dsaSig: sigR.dsaSig, publisherLabel: rogue.label });
ok(!txRogue.committed && txRogue.code === 'MSP_DENIED', `unenrolled publisher rejected: ${txRogue.code}`);

console.log('\n\x1b[1m8. Ethereum anchor\x1b[0m');
const a1 = anchor.anchorModel({ modelId: 'acme/enc', version: 1, merkleRoot: hashed.root, cidDigest: pin.digest, pkHash: acme.pkHash, parentRoot: null, from: acme.ethAddress });
ok(a1.ok, `anchored, ${a1.gasUsed.toLocaleString()} gas`);
const a2 = anchor.anchorModel({ modelId: 'acme/enc', version: 1, merkleRoot: hashed.root, cidDigest: pin.digest, pkHash: acme.pkHash, parentRoot: null, from: acme.ethAddress });
ok(!a2.ok && a2.revert === 'version already anchored', `duplicate anchor reverts: "${a2.revert}"`);
const a3 = anchor.anchorModel({ modelId: 'acme/enc', version: 3, merkleRoot: hashed.root, cidDigest: pin.digest, pkHash: acme.pkHash, parentRoot: null, from: acme.ethAddress });
ok(!a3.ok && a3.revert === 'gap in lineage', `lineage gap reverts: "${a3.revert}"`);
const a4 = anchor.anchorModel({ modelId: 'acme/enc', version: 2, merkleRoot: hashed.root, cidDigest: pin.digest, pkHash: acme.pkHash, parentRoot: null, from: rogue.ethAddress });
ok(!a4.ok && a4.revert.includes('onlyPublisher'), `non-publisher reverts: "${a4.revert}"`);
const pkGas = estimateOnChainPubkeyGas(1952);
ok(pkGas > 1_200_000 && pkGas < 1_300_000, `on-chain pk would cost ${pkGas.toLocaleString()} gas (report says ~1.2M)`);
ok(a1.gasUsed < pkGas / 5, `anchor is ${(pkGas/a1.gasUsed).toFixed(1)}× cheaper than storing the pk`);
ok(anchor.events[0].modelId === 'acme/enc', 'modelId readable from the event (non-indexed)');

console.log('\n\x1b[1m9. fault injection\x1b[0m');
const expectedLeaves = hashed.leaves;
const parsed = parseSafetensors(demo.buffer);

const bf = injectBitFlip(demo.buffer, parsed.tensors);
const sv1 = await streamVerify(bf.buffer, expectedLeaves, null);
const badT = sv1.results.find(r => !r.ok);
ok(sv1.aborted && badT, `bit flip detected, localised to "${badT?.name}"`);
ok(badT.name === bf.targetTensor, 'localisation names the correct tensor');
ok(sv1.bytesProcessed < demo.buffer.byteLength, `aborted after ${sv1.bytesProcessed} of ${demo.buffer.byteLength} bytes`);

const ro = injectTensorReorder(demo.buffer, parsed.tensors);
const sv2 = await streamVerify(ro.buffer, expectedLeaves, null);
ok(sv2.aborted, `tensor reorder detected (${ro.description})`);

const tr = injectTruncation(demo.buffer);
let truncDetected = false;
try { const sv3 = await streamVerify(tr.buffer, expectedLeaves, null); truncDetected = sv3.aborted; }
catch { truncDetected = true; }
ok(truncDetected, 'truncation detected');

const fakeBytes = new Uint8Array(512); fakeBytes.fill(7);
ok(makeCIDv1(sha256(fakeBytes)).cid !== pin.cid, 'CID substitution is self-evident');

const clean = await streamVerify(demo.buffer, expectedLeaves, null);
ok(!clean.aborted && clean.results.every(r => r.ok), 'untampered artefact passes all tensors');

console.log('\n\x1b[1m10. ML-KEM-768 confidentiality path\x1b[0m');
const kem = await kemWrapAndEncrypt(new Uint8Array(4096).fill(3));
ok(kem.kemPkLen === 1184, `ML-KEM-768 pk = ${kem.kemPkLen} B`);
ok(kem.sharedSecretLen === 32, 'shared secret = 32 B → AES-256 key');
ok(kem.roundTripOk, 'encapsulate → AES-256-GCM → decapsulate round-trips');

console.log(`\n\x1b[1mResult: ${pass} passed, ${fail} failed\x1b[0m\n`);
process.exit(fail > 0 ? 1 : 0);

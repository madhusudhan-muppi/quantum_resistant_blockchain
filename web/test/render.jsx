/**
 * Server-renders every page against a populated store.
 * Catches component-level runtime errors that a build cannot see.
 */
import React from 'react';
import { renderToString } from 'react-dom/server';
import { StoreContext } from '../src/lib/store.jsx';
import { FabricNetwork, AnchorRegistry, CHAIN_ID_FABRIC } from '../src/lib/ledger.js';
import { ipfs } from '../src/lib/ipfs.js';
import { generateIdentity, computeMu, compositeSign, toHex } from '../src/lib/crypto.js';
import { hashModel, metaHash } from '../src/lib/merkle.js';
import { generateSafetensors } from '../src/lib/demoModel.js';

import Overview from '../src/pages/Overview.jsx';
import Publish from '../src/pages/Publish.jsx';
import Verify from '../src/pages/Verify.jsx';
import Lineage from '../src/pages/Lineage.jsx';
import Faults from '../src/pages/Faults.jsx';
import Benchmarks from '../src/pages/Benchmarks.jsx';
import Governance from '../src/pages/Governance.jsx';
import ThreatModel from '../src/pages/ThreatModel.jsx';

const PAGES = { Overview, Publish, Verify, Lineage, Faults, Benchmarks, Governance, ThreatModel };

async function buildStore({ populated }) {
  const fabric = new FabricNetwork();
  const anchor = new AnchorRegistry(31337);

  const acme = generateIdentity('Acme AI Labs');
  acme.ethAddress = '0x' + acme.pkHashHex.slice(0, 40);
  const north = generateIdentity('Northwind Research');
  north.ethAddress = '0x' + north.pkHashHex.slice(0, 40);
  const rogue = generateIdentity('Unknown Publisher');
  rogue.ethAddress = '0x' + rogue.pkHashHex.slice(0, 40);
  rogue.rogue = true;

  fabric.msp.enroll(acme, 'Org1MSP');
  fabric.msp.enroll(north, 'Org2MSP');
  anchor.addPublisher(acme.ethAddress, acme.label);
  anchor.addPublisher(north.ethAddress, north.label);

  if (populated) {
    const demo = generateSafetensors({ preset: 'tiny', seed: 42 });
    const hashed = await hashModel(demo.buffer);
    const pin = ipfs.add(new Uint8Array(demo.buffer), { label: 'render-test' });
    const hMeta = metaHash({ modelCard: 'card', datasetHash: 'd', evalMetrics: {} });
    const mu = computeMu({
      chainId: CHAIN_ID_FABRIC, modelId: 'acme/enc', version: 1,
      merkleRoot: hashed.root, pkHash: acme.pkHash, metaHash: hMeta,
    });
    const sig = compositeSign(acme, mu);
    const tx = fabric.submitTransaction({
      modelId: 'acme/enc', version: 1, merkleRoot: hashed.root, metaHash: hMeta,
      pkHash: acme.pkHash, mldsaPk: acme.mldsaPk, edPk: acme.edPk,
      edSig: sig.edSig, dsaSig: sig.dsaSig, cidDigest: pin.digest, cid: pin.cid,
      parentRoot: null, publisherLabel: acme.label, modelCard: 'card',
      leafHexes: hashed.leaves.map(toHex),
      tensorMeta: hashed.tensors.map((t) => ({ name: t.name, dtype: t.dtype, shape: t.shape, byteLength: t.byteLength })),
    });
    if (!tx.committed) throw new Error('fixture failed to commit: ' + tx.reason);
    anchor.anchorModel({
      modelId: 'acme/enc', version: 1, merkleRoot: hashed.root,
      cidDigest: pin.digest, pkHash: acme.pkHash, parentRoot: null, from: acme.ethAddress,
    });
  }

  return {
    version: 1, bump() {}, booted: true, bootMessage: '', boot() {},
    toast() {}, toasts: [],
    fabric, anchor, identities: [acme, north, rogue], ipfs,
  };
}

let pass = 0, fail = 0;

for (const populated of [false, true]) {
  const store = await buildStore({ populated });
  console.log(`\n\x1b[1m${populated ? 'Populated ledger' : 'Empty ledger'}\x1b[0m`);

  for (const [name, Page] of Object.entries(PAGES)) {
    try {
      const html = renderToString(
        React.createElement(StoreContext.Provider, { value: store },
          React.createElement(Page, { navigate: () => {} }))
      );
      if (!html || html.length < 60) throw new Error(`suspiciously short output (${html.length} chars)`);
      pass++;
      console.log(`  \x1b[32m✓\x1b[0m ${name.padEnd(12)} ${html.length.toLocaleString()} chars`);
    } catch (err) {
      fail++;
      console.log(`  \x1b[31m✗\x1b[0m ${name.padEnd(12)} ${err.message}`);
    }
  }
}

console.log(`\n\x1b[1mResult: ${pass} rendered, ${fail} failed\x1b[0m\n`);
process.exit(fail > 0 ? 1 : 0);

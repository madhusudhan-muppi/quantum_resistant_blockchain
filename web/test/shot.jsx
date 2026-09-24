/** Renders full standalone HTML documents so the layout can be screenshotted. */
import React from 'react';
import { renderToString } from 'react-dom/server';
import fs from 'node:fs';
import path from 'node:path';
import { StoreContext } from '../src/lib/store.jsx';
import { FabricNetwork, AnchorRegistry, CHAIN_ID_FABRIC } from '../src/lib/ledger.js';
import { ipfs } from '../src/lib/ipfs.js';
import { generateIdentity, computeMu, compositeSign, toHex } from '../src/lib/crypto.js';
import { hashModel, metaHash } from '../src/lib/merkle.js';
import { generateSafetensors } from '../src/lib/demoModel.js';
import App from '../src/App.jsx';

const outDir = process.argv[2];
const cssPath = process.argv[3];
const css = fs.readFileSync(cssPath, 'utf8');

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

const demo = generateSafetensors({ preset: 'small', seed: 42 });
const hashed = await hashModel(demo.buffer);
const pin = ipfs.add(new Uint8Array(demo.buffer), { label: 'shot' });
const hMeta = metaHash({ modelCard: 'card', datasetHash: 'd', evalMetrics: {} });
const mu = computeMu({
  chainId: CHAIN_ID_FABRIC, modelId: 'acme/vision-encoder', version: 1,
  merkleRoot: hashed.root, pkHash: acme.pkHash, metaHash: hMeta,
});
const sig = compositeSign(acme, mu);
fabric.submitTransaction({
  modelId: 'acme/vision-encoder', version: 1, merkleRoot: hashed.root, metaHash: hMeta,
  pkHash: acme.pkHash, mldsaPk: acme.mldsaPk, edPk: acme.edPk,
  edSig: sig.edSig, dsaSig: sig.dsaSig, cidDigest: pin.digest, cid: pin.cid,
  parentRoot: null, publisherLabel: acme.label, modelCard: 'card',
  leafHexes: hashed.leaves.map(toHex),
  tensorMeta: hashed.tensors.map((t) => ({ name: t.name, dtype: t.dtype, shape: t.shape, byteLength: t.byteLength })),
});
anchor.anchorModel({
  modelId: 'acme/vision-encoder', version: 1, merkleRoot: hashed.root,
  cidDigest: pin.digest, pkHash: acme.pkHash, parentRoot: null, from: acme.ethAddress,
});

const store = {
  version: 1, bump() {}, booted: true, bootMessage: '', boot() {},
  toast() {}, toasts: [], fabric, anchor, identities: [acme, north, rogue], ipfs,
};

const doc = (body) => `<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
<link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20,400,0,0&display=swap" rel="stylesheet">
<style>${css}</style></head><body><div id="root">${body}</div></body></html>`;

import Publish from '../src/pages/Publish.jsx';
import Faults from '../src/pages/Faults.jsx';
import Verify from '../src/pages/Verify.jsx';

const html = renderToString(
  React.createElement(StoreContext.Provider, { value: store }, React.createElement(App))
);
fs.writeFileSync(path.join(outDir, 'app.html'), doc(html));

// Individual pages, wrapped in the same shell chrome for realistic width.
for (const [name, Page] of Object.entries({ Publish, Faults, Verify })) {
  const body = renderToString(
    React.createElement(StoreContext.Provider, { value: store },
      React.createElement('div', { className: 'app' },
        React.createElement('aside', { className: 'sidebar' }),
        React.createElement('div', { className: 'main-col' },
          React.createElement('main', { className: 'main' },
            React.createElement(Page, { navigate: () => {} })))))
  );
  fs.writeFileSync(path.join(outDir, name.toLowerCase() + '.html'), doc(body));
}
console.log('wrote app.html + page shots');

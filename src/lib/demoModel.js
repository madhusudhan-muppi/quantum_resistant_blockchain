/**
 * Demo artefact generator.
 *
 * Emits a genuine .safetensors container (u64 header length ‖ JSON header ‖
 * raw data) so the parser and per-tensor Merkle hasher in merkle.js operate on
 * a real file rather than a mock object. The weights themselves are random —
 * only their structure and serialisation need to be authentic.
 */

const DTYPE_SIZES = { F32: 4, F16: 2, I64: 8, U8: 1 };

function productOf(shape) {
  return shape.reduce((a, b) => a * b, 1);
}

/** A small decoder-only transformer layout, which gives a realistic tensor tree. */
function transformerLayout(layers, dModel, vocab) {
  const tensors = [
    { name: 'embedding.weight', dtype: 'F32', shape: [vocab, dModel] },
  ];

  for (let i = 0; i < layers; i++) {
    tensors.push(
      { name: `layer.${i}.attn.q_proj.weight`, dtype: 'F32', shape: [dModel, dModel] },
      { name: `layer.${i}.attn.k_proj.weight`, dtype: 'F32', shape: [dModel, dModel] },
      { name: `layer.${i}.attn.v_proj.weight`, dtype: 'F32', shape: [dModel, dModel] },
      { name: `layer.${i}.attn.o_proj.weight`, dtype: 'F32', shape: [dModel, dModel] },
      { name: `layer.${i}.mlp.up_proj.weight`, dtype: 'F32', shape: [dModel * 2, dModel] },
      { name: `layer.${i}.mlp.down_proj.weight`, dtype: 'F32', shape: [dModel, dModel * 2] },
      { name: `layer.${i}.ln.weight`, dtype: 'F32', shape: [dModel] }
    );
  }

  tensors.push({ name: 'lm_head.weight', dtype: 'F32', shape: [vocab, dModel] });
  return tensors;
}

export const PRESETS = {
  tiny: { label: 'Tiny — 8 tensors', layers: 1, dModel: 32, vocab: 128 },
  small: { label: 'Small — 30 tensors', layers: 4, dModel: 64, vocab: 512 },
  medium: { label: 'Medium — 72 tensors', layers: 10, dModel: 96, vocab: 1024 },
};

/**
 * Build the file. Returns an ArrayBuffer that parseSafetensors() accepts.
 * `seed` makes generation deterministic so a "re-download" yields identical
 * bytes — important for the verification flow to be meaningful.
 */
export function generateSafetensors({ preset = 'small', seed = 42, metadata = {} } = {}) {
  const config = PRESETS[preset] || PRESETS.small;
  const layout = transformerLayout(config.layers, config.dModel, config.vocab);

  // xorshift32 — deterministic, no dependency.
  let state = seed >>> 0 || 1;
  const nextFloat = () => {
    state ^= state << 13;
    state >>>= 0;
    state ^= state >> 17;
    state ^= state << 5;
    state >>>= 0;
    return (state / 0xffffffff) * 2 - 1;
  };

  // Lay out the data segment and record offsets.
  const header = {};
  let offset = 0;
  const plan = [];

  for (const t of layout) {
    const elements = productOf(t.shape);
    const byteLength = elements * DTYPE_SIZES[t.dtype];
    header[t.name] = {
      dtype: t.dtype,
      shape: t.shape,
      data_offsets: [offset, offset + byteLength],
    };
    plan.push({ ...t, elements, byteLength, offset });
    offset += byteLength;
  }

  header.__metadata__ = {
    format: 'pt',
    framework: 'qrb-demo',
    ...Object.fromEntries(Object.entries(metadata).map(([k, v]) => [k, String(v)])),
  };

  // The safetensors spec permits trailing whitespace in the JSON header, and
  // real producers use it to pad so the data segment starts 8-byte aligned.
  // Without this, a Float32Array view over the data segment throws.
  let headerText = JSON.stringify(header);
  while ((8 + new TextEncoder().encode(headerText).length) % 8 !== 0) headerText += ' ';

  const headerJson = new TextEncoder().encode(headerText);
  const dataLength = offset;
  const buffer = new ArrayBuffer(8 + headerJson.length + dataLength);
  const view = new DataView(buffer);

  view.setBigUint64(0, BigInt(headerJson.length), true);
  new Uint8Array(buffer, 8, headerJson.length).set(headerJson);

  const dataStart = 8 + headerJson.length;
  for (const t of plan) {
    const floats = new Float32Array(buffer, dataStart + t.offset, t.elements);
    for (let i = 0; i < t.elements; i++) floats[i] = nextFloat() * 0.1;
  }

  return {
    buffer,
    filename: `${preset}-model.safetensors`,
    tensorCount: layout.length,
    totalBytes: buffer.byteLength,
  };
}

/* ------------------------------------------------------------------ */
/* fault injection — Section 3.7                                       */
/* ------------------------------------------------------------------ */

/**
 * Flip a single bit inside one randomly chosen tensor's data. Detection must
 * name the affected layer, not merely report "the file changed".
 */
export function injectBitFlip(buffer, tensors) {
  const copy = buffer.slice(0);
  const target = tensors[Math.floor(Math.random() * tensors.length)];
  const byteIndex = target.byteStart + Math.floor(Math.random() * target.byteLength);
  const bit = Math.floor(Math.random() * 8);

  const bytes = new Uint8Array(copy);
  const before = bytes[byteIndex];
  bytes[byteIndex] ^= 1 << bit;

  return {
    buffer: copy,
    description: `Flipped bit ${bit} of byte ${byteIndex} inside "${target.name}"`,
    targetTensor: target.name,
    before,
    after: bytes[byteIndex],
  };
}

/**
 * Swap the data of two tensors while leaving the header untouched. Names still
 * sort identically, so the tree is well-formed — but two leaves now mismatch.
 */
export function injectTensorReorder(buffer, tensors) {
  const copy = buffer.slice(0);
  const bytes = new Uint8Array(copy);

  // Find two same-sized tensors so the swap is byte-exact.
  let a = null;
  let b = null;
  for (let i = 0; i < tensors.length && !b; i++) {
    for (let j = i + 1; j < tensors.length; j++) {
      if (tensors[i].byteLength === tensors[j].byteLength) {
        a = tensors[i];
        b = tensors[j];
        break;
      }
    }
  }
  if (!a) {
    return injectBitFlip(buffer, tensors);
  }

  const tmp = bytes.slice(a.byteStart, a.byteEnd);
  bytes.copyWithin(a.byteStart, b.byteStart, b.byteEnd);
  bytes.set(tmp, b.byteStart);

  return {
    buffer: copy,
    description: `Swapped tensor payloads of "${a.name}" and "${b.name}"`,
    targetTensor: a.name,
    secondTensor: b.name,
  };
}

/** Truncate the artefact — a partial or interrupted download. */
export function injectTruncation(buffer) {
  const keep = Math.floor(buffer.byteLength * 0.75);
  return {
    buffer: buffer.slice(0, keep),
    description: `Truncated artefact to ${keep} of ${buffer.byteLength} bytes`,
  };
}

---
name: Quantum-Resistant Cryptographic Workbench
colors:
  surface: '#10131a'
  surface-dim: '#10131a'
  surface-bright: '#363941'
  surface-container-lowest: '#0b0e15'
  surface-container-low: '#191b23'
  surface-container: '#1d1f27'
  surface-container-high: '#272a32'
  surface-container-highest: '#32353d'
  on-surface: '#e1e2ec'
  on-surface-variant: '#bcc9cc'
  inverse-surface: '#e1e2ec'
  inverse-on-surface: '#2d3038'
  outline: '#869396'
  outline-variant: '#3d494c'
  surface-tint: '#5bd6ee'
  primary: '#dcf8ff'
  on-primary: '#00363f'
  primary-container: '#6ee7ff'
  on-primary-container: '#006775'
  inverse-primary: '#006877'
  secondary: '#cebdff'
  on-secondary: '#381385'
  secondary-container: '#4f319c'
  on-secondary-container: '#bea8ff'
  tertiary: '#ceffd4'
  on-tertiary: '#003919'
  tertiary-container: '#60f191'
  on-tertiary-container: '#006b35'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#a3eeff'
  primary-fixed-dim: '#5bd6ee'
  on-primary-fixed: '#001f25'
  on-primary-fixed-variant: '#004e5a'
  secondary-fixed: '#e8ddff'
  secondary-fixed-dim: '#cebdff'
  on-secondary-fixed: '#21005e'
  on-secondary-fixed-variant: '#4f319c'
  tertiary-fixed: '#6dfe9c'
  tertiary-fixed-dim: '#4de082'
  on-tertiary-fixed: '#00210c'
  on-tertiary-fixed-variant: '#005227'
  background: '#10131a'
  on-background: '#e1e2ec'
  surface-variant: '#32353d'
typography:
  headline-xl:
    fontFamily: Inter
    fontSize: 30px
    fontWeight: '600'
    lineHeight: 38px
    letterSpacing: -0.02em
  headline-xl-mobile:
    fontFamily: Inter
    fontSize: 22px
    fontWeight: '600'
    lineHeight: 28px
    letterSpacing: -0.015em
  headline-lg:
    fontFamily: Inter
    fontSize: 22px
    fontWeight: '600'
    lineHeight: 28px
    letterSpacing: -0.015em
  headline-sm:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '600'
    lineHeight: 22px
    letterSpacing: -0.01em
  body-lg:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  body-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 18px
  code-lg:
    fontFamily: JetBrains Mono
    fontSize: 13px
    fontWeight: '500'
    lineHeight: 18px
    letterSpacing: -0.01em
  code-sm:
    fontFamily: JetBrains Mono
    fontSize: 11px
    fontWeight: '400'
    lineHeight: 16px
    letterSpacing: 0em
  label-caps:
    fontFamily: Inter
    fontSize: 10px
    fontWeight: '700'
    lineHeight: 14px
    letterSpacing: 0.08em
  pill-academic:
    fontFamily: JetBrains Mono
    fontSize: 10px
    fontWeight: '600'
    lineHeight: 12px
    letterSpacing: 0.04em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  gutter: 0.75rem
  margin: 1rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 0.75rem
  space-lg: 1.25rem
  space-xl: 2rem
---

## Brand & Style

This design system establishes a high-precision, mission-critical operations environment for researchers, cryptographers, and ML infrastructure engineers verifying model weights against quantum attacks. The visual narrative treats post-quantum security as an uncompromising physical instrument: sober, mathematical, dense, and structurally incorruptible.

The design movement blends **technical instrument brutalism** with **deep terminal minimalism**:
- **Density over decoration**: Maximized information throughput via dense data tables, hex inspectors, Merkle tree visualizations, and discrete parameter matrices. Whitespace is strictly functional, framing computational proofs rather than creating atmospheric emptiness.
- **Diagnostic transparency**: Every element represents verifiable mathematical state. UI surfaces act as diagnostic scopes, using hair-thin 1px borders, localized sub-pixel glows, and discrete telemetry indicators to convey cryptographic integrity.
- **Academic rigor meets developer ergonomics**: Scholarly metadata tags (e.g., `§ 4.2 ML-KEM-768`, `OID 1.3.6.1.4.1...`) coexist with active debugging tools, key derivation flows, and raw tensor pipeline logs.

## Colors

The palette operates in strict dark mode, anchored by deep slate-void surfaces and punctuated by mathematically segregated accent channels.

### Canvas & Surfaces
- **Base Canvas (`#0a0d14`)**: Deepest near-black void. Carries a background SVG/CSS lattice grid overlay at 2% opacity (`rgba(110, 231, 255, 0.02)`) spaced at 24px increments.
- **Surface Secondary (`#0f141f`)**: Recessed modules, terminal viewports, log consoles, and code gutters.
- **Surface Raised (`#141926`)**: Primary inspect cards, panel containers, and dialog shells.
- **Surface Overlay (`#1c2336`)**: Tooltips, context menus, and active hover elevation.
- **Border Structural (`#222b3d`)**: 1px uniform perimeter demarcation across all raised surfaces.
- **Border Subtle (`#192131`)**: Internal dividers, sub-cell borders, and table rows.

### Semantic Accents
- **Primary Data / Telemetry (`#6ee7ff`)**: Merkle roots, public key hashes, payload sizes, latencies, shard manifests, and interactive state triggers.
- **Post-Quantum Cryptography (`#a78bfa`)**: PQC primitives, encapsulation tokens (ML-KEM-512/768/1024), signature tokens (ML-DSA-44/65/87), Dilithium/Kyber indicators, and base model tensor lineage.
- **Status Valid (`#4ade80`)**: Zero-knowledge verifications, valid post-quantum signatures, intact model checkpoints, and consensus quorum.
- **Status Warning / Classical Exposure (`#fbbf24`)**: Classical ECDSA / secp256k1 exposure, deprecation warnings, high verification latency, and non-quantum-safe lineage.
- **Status Critical (`#fb7185`)**: Invalid signature digests, corrupted tensor shards, revoked certificates, and threshold consensus failures.
- **Text Primary (`#f1f5f9`)**: High-contrast labels, primary metric values, and proof headers.
- **Text Secondary (`#94a3b8`)**: Parameter titles, unit indicators, and passive metadata.
- **Text Muted (`#475569`)**: Hex offsets, disabled controls, and lattice grid structures.

## Typography

Typography enforces a bifurcated cognitive hierarchy: **Inter** handles narrative, high-level taxonomy, and structural labels; **JetBrains Mono** governs all mathematical computations, hex arrays, cryptographic signatures, and execution benchmarks.

- Monospace figures (`tabular-nums`) are universally active for all data representation in both fonts.
- Monospace strings exceeding 16 characters (e.g., base64 roots, SHA-3/SHAKE-256 digests) must use middle-truncation (`0x7f8a…9c41`) with hover-to-expand or click-to-copy interactions.
- All structural category labels use `label-caps` in uppercase with expanded tracking (`0.08em`) to mimic instrumentation control plates.
- Academic section identifiers (e.g., `§ NIST PQC FIPS-203`) use `pill-academic` with tight padding and mono styling.

## Layout & Spacing

The layout is built as a high-density, multi-pane cryptographic console utilizing a fluid grid with bounded maximum containers.

### Grid & Density Hierarchy
- **Desktop (≥1440px)**: 12-column or 16-column continuous fluid layout with a rigid 0.75rem (12px) gutter. Outer viewport margins lock at 1rem (16px) to maximize horizontal inspection canvas. Multi-pane operations divide into fixed-width inspection sidebars (360px) and flexible cryptographic visualizer regions.
- **Tablet (768px – 1439px)**: Columns collapse into an 8-column configuration. Inspector sidebars convert to sliding drawers or stack vertically under verification logs.
- **Mobile (<768px)**: Single-column stack. Non-critical telemetry collapses behind discrete tab switches; cryptographic hash inspectors enable horizontal scrolling rather than line-wrapping to preserve digest alignment.

### Internal Spacing Cadence
Component padding runs strictly on a compact 4px rhythm (`0.25rem`, `0.5rem`, `0.75rem`, `1.25rem`). Cards enforce `0.75rem` internal clearance to sustain high data density per vertical inch.

## Elevation & Depth

Visual hierarchy does not use diffuse dropshadows or skeuomorphic bevels. Depth is articulated purely through **1px border definition, tonal surface stepping, and precise luminescence**.

1. **Floor (Base Canvas)**: `#0a0d14` with persistent cyan Cartesian lattice overlay.
2. **Surface Tier 1 (Recessed)**: `#0f141f` with 1px border `#192131`. Used for telemetry logs, terminal readouts, and passive hex displays. Inset 1px line provides zero-elevation visual anchoring.
3. **Surface Tier 2 (Raised Workstations)**: `#141926` with 1px border `#222b3d`. Standard card container.
4. **Surface Tier 3 (Floating Overlays / Modals)**: `#1c2336` with 1px border `#6ee7ff40` (cyan hairline) and an ambient sub-pixel glow: `box-shadow: 0 0 24px rgba(110, 231, 255, 0.06), 0 8px 32px rgba(0, 0, 0, 0.6)`.
5. **Interactive Glow Accentuation**:
   - Focus states on cryptographic input fields trigger a sharp `0 0 0 1px #6ee7ff, 0 0 12px rgba(110, 231, 255, 0.25)` rim-light.
   - PQC-specific interactive items trigger a violet rim-light: `0 0 0 1px #a78bfa, 0 0 12px rgba(167, 139, 250, 0.25)`.

## Shapes

The interface balances sharp technical precision with modern ergonomics:
- **Panels, Cards, and Surface Modules**: Radius locked at `10px` (`0.625rem`), providing a contained perimeter that softens the technical hardness of terminal layouts without appearing playful.
- **Buttons, Form Inputs, and Selectors**: `6px` (`0.375rem`) corner radius to maintain a crisp, surgical tool feel.
- **Pills, Academic Chips, and Hash Capsules**: `4px` (`0.25rem`) corner radius for dense metadata indexing. Circular or pill radii (`9999px`) are prohibited to avoid casual consumer aesthetics.
- **Borders**: Uniform 1px thickness throughout. Double-line borders and heavy 2px outlines are restricted exclusively to terminal selection states.

## Components

### Buttons & Trigger Controls
- **Primary / Telemetry Action**: Background `#6ee7ff15`, border 1px solid `#6ee7ff`, text `#6ee7ff`. Hover state elevates to background `#6ee7ff25` with `box-shadow: 0 0 12px rgba(110, 231, 255, 0.2)`.
- **Quantum Primitive Action**: Background `#a78bfa15`, border 1px solid `#a78bfa`, text `#a78bfa`. Hover state triggers violet luminescence.
- **Ghost / Utility**: Background transparent, border 1px solid `#222b3d`, text `#94a3b8`. Hover shifts border to `#475569` and text to `#f1f5f9`.
- **Sizing**: Default height 32px, micro height 24px (for row-level table actions). JetBrains Mono font at `12px` with uppercase letter spacing.

### Status Indicators & Academic Chips
- **Academic Citation Pill**: Enclosed badge with format `§ [SCHEME]-[PARAM]`. Border 1px solid `#a78bfa40`, background `#a78bfa10`, text `#a78bfa`, font `pill-academic`.
- **Cryptographic Health Pill**: Dot indicator (6px with ambient pulse) coupled with uppercase verification state (`PASS`, `CLASSICAL EXP`, `REJECTED`).
  - Pass: `#4ade80` dot, `#4ade8020` fill, `#4ade8040` border.
  - Caution: `#fbbf24` dot, `#fbbf2420` fill, `#fbbf2440` border.
  - Fail: `#fb7185` dot, `#fb718520` fill, `#fb718540` border.

### Cryptographic Input Fields & Hash Boxes
- **Key/Digest Inputs**: Background `#0f141f`, 1px solid `#222b3d`, text `#6ee7ff`, font `code-lg`. Suffix controls house an inline "Copy Hash", "Verify SHAKE-256", and "Entropy Score" readouts.
- **Focus Mode**: Border shifts to `#6ee7ff`, rendering a subtle cyan glow. Validation status immediately injects an icon within the field's right gutter.

### Cryptographic Proof Cards & Panels
- **Structure**: Raised surface `#141926` with 1px border `#222b3d` and 10px rounded corners.
- **Card Header**: 36px fixed height with lower divider `#192131`. Houses title in `headline-sm`, right-aligned status chip, and cryptographic epoch timestamp in `code-sm`.
- **Internal Content**: Subdivided into key-value data matrices using subtle vertical and horizontal 1px hairline dividers.

### Data Tables & Merkle Audit Logs
- **Row Height**: Dense 32px or standard 40px.
- **Header**: Sticky `#0f141f` surface, `label-caps` in `#94a3b8`, bottom border 1px solid `#222b3d`.
- **Alternating / Hover**: Hover sets row background to `#1c233680`. Active selection demarcated by a 2px left border accent in `#6ee7ff`.
- **Cell Content**: Monospaced fields align right; labels align left; cryptographic signature chips center.

### Domain-Specific Components
- **Tensor Checkpoint Ledger**: Visual card displaying model layer hashes, ML-DSA signature validity, and Dilithium public key footprint with byte size allocations.
- **Quantum Entropy Meter**: Horizontal segmented bar displaying NIST PQC security strength levels (Category 1, 3, 5) with violet progress indicators.
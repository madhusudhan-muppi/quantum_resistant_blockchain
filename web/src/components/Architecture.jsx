import React from 'react';

/**
 * Figure 3.1 — End-to-end architecture.
 * Verification occurs at component [5] (chaincode, enforced), not only at [7]
 * (consumer SDK, advisory). The diagram marks that distinction explicitly.
 */
export default function Architecture({ highlight }) {
  const C = {
    pqc: '#a78bfa',
    data: '#6ee7ff',
    valid: '#4ade80',
    classical: '#fbbf24',
    muted: '#475569',
  };

  const boxes = [
    { id: 1, x: 8, y: 26, label: 'Signer CLI', sub: 'ML-DSA-65 + Ed25519', tone: 'pqc' },
    { id: 2, x: 8, y: 122, label: 'Merkle Hasher', sub: 'per-tensor SHA-256', tone: 'data' },
    { id: 3, x: 214, y: 122, label: 'IPFS (Kubo)', sub: 'CIDv1 dag-pb', tone: 'data' },
    { id: 4, x: 214, y: 26, label: 'Fabric Gateway', sub: 'gRPC submit', tone: 'muted' },
    { id: 5, x: 420, y: 26, label: 'Fabric Chaincode', sub: 'VERIFY — enforced', tone: 'valid' },
    { id: 6, x: 626, y: 26, label: 'Anchor Contract', sub: 'commitments only', tone: 'classical' },
    { id: 7, x: 626, y: 122, label: 'Consumer SDK', sub: 're-verify on fetch', tone: 'valid' },
  ];

  const arrows = [
    [156, 48, 214, 48],
    [156, 144, 214, 144],
    [82, 72, 82, 122],
    [362, 48, 420, 48],
    [362, 145, 626, 145],
    [568, 48, 626, 48],
    [694, 72, 694, 122],
  ];

  return (
    <svg className="arch" viewBox="0 0 786 200" role="img" aria-label="End-to-end architecture">
      <defs>
        <marker id="qrb-arrow" markerWidth="6" markerHeight="6" refX="5.5" refY="3" orient="auto">
          <polygon points="0 0, 6 3, 0 6" fill="#222b3d" />
        </marker>
      </defs>

      {arrows.map(([x1, y1, x2, y2], i) => (
        <line
          key={i}
          x1={x1} y1={y1} x2={x2} y2={y2}
          stroke="#222b3d"
          strokeWidth="1"
          markerEnd="url(#qrb-arrow)"
          strokeDasharray={i === 4 ? '3 3' : undefined}
        />
      ))}

      {boxes.map((b) => {
        const stroke = C[b.tone];
        const enforced = b.id === 5;
        const active = highlight === b.id;
        return (
          <g key={b.id}>
            <rect
              x={b.x} y={b.y} width="148" height="46" rx="6"
              fill={enforced || active ? 'rgba(74,222,128,0.05)' : '#0f141f'}
              stroke={stroke}
              strokeWidth={enforced || active ? 1.4 : 1}
              opacity={enforced || active ? 1 : 0.9}
            />
            <text x={b.x + 11} y={b.y + 19} fill="#f1f5f9" fontSize="11.5" fontWeight="600"
              fontFamily="Inter, sans-serif">
              {b.label}
            </text>
            <text x={b.x + 11} y={b.y + 34} fill={stroke} fontSize="9"
              fontFamily="JetBrains Mono, monospace">
              {b.sub}
            </text>
            <rect x={b.x + 128} y={b.y + 5} width="14" height="14" rx="3"
              fill="#141926" stroke={stroke} strokeWidth="0.8" />
            <text x={b.x + 135} y={b.y + 15} fill={stroke} fontSize="8.5" textAnchor="middle"
              fontFamily="JetBrains Mono, monospace">
              {b.id}
            </text>
          </g>
        );
      })}

      <text x="420" y="90" fill="#4ade80" fontSize="9" fontFamily="JetBrains Mono, monospace">
        ▲ invalid signature rejected here — never committed
      </text>
      <text x="626" y="106" fill="#fbbf24" fontSize="9" fontFamily="JetBrains Mono, monospace">
        ▲ secp256k1-signed tx
      </text>
    </svg>
  );
}

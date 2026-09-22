import React from 'react';

/**
 * Figure 3.1 — End-to-end architecture.
 * The caption in the report makes one point emphatically: verification occurs
 * at component [5] (inside the chaincode, enforced), not only at [7] (the
 * consumer SDK, which is advisory). The diagram marks that distinction.
 */
export default function Architecture({ highlight }) {
  const boxes = [
    { id: 1, x: 20, y: 30, label: 'Signer CLI', sub: 'ML-DSA-65 + Ed25519', tone: 'quantum' },
    { id: 2, x: 20, y: 130, label: 'Merkle Hasher', sub: 'per-tensor SHA-256', tone: 'accent' },
    { id: 3, x: 230, y: 130, label: 'IPFS (Kubo)', sub: 'CIDv1 dag-pb', tone: 'accent' },
    { id: 4, x: 230, y: 30, label: 'Fabric Gateway', sub: 'gRPC submit', tone: 'dim' },
    { id: 5, x: 440, y: 30, label: 'Fabric Chaincode', sub: 'VERIFY — enforced', tone: 'enforce' },
    { id: 6, x: 650, y: 30, label: 'Anchor Contract', sub: 'commitments only', tone: 'warn' },
    { id: 7, x: 650, y: 130, label: 'Consumer SDK', sub: 're-verify on fetch', tone: 'ok' },
  ];

  const colors = {
    quantum: '#a78bfa',
    accent: '#6ee7ff',
    ok: '#4ade80',
    warn: '#fbbf24',
    enforce: '#4ade80',
    dim: '#64718a',
  };

  const arrows = [
    [172, 55, 230, 55],
    [172, 155, 230, 155],
    [100, 80, 100, 130],
    [382, 55, 440, 55],
    [382, 155, 470, 155],
    [592, 55, 650, 55],
    [722, 80, 722, 130],
  ];

  return (
    <svg className="arch" viewBox="0 0 810 215" role="img" aria-label="End-to-end architecture">
      <defs>
        <marker id="ah" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
          <polygon points="0 0, 7 3.5, 0 7" fill="#2f3b52" />
        </marker>
      </defs>

      {arrows.map(([x1, y1, x2, y2], i) => (
        <line
          key={i}
          x1={x1} y1={y1} x2={x2} y2={y2}
          stroke="#2f3b52"
          strokeWidth="1.2"
          markerEnd="url(#ah)"
          strokeDasharray={i === 4 ? '4 3' : undefined}
        />
      ))}

      {boxes.map((b) => {
        const active = highlight === b.id;
        const stroke = colors[b.tone];
        const enforced = b.id === 5;
        return (
          <g key={b.id}>
            <rect
              x={b.x} y={b.y} width="152" height="50" rx="7"
              fill={active ? 'rgba(110,231,255,0.1)' : '#0d1119'}
              stroke={stroke}
              strokeWidth={enforced || active ? 1.6 : 1}
              opacity={active || enforced ? 1 : 0.85}
            />
            <text x={b.x + 12} y={b.y + 21} fill="#e4e9f2" fontSize="12" fontWeight="600">
              {b.label}
            </text>
            <text x={b.x + 12} y={b.y + 37} fill={stroke} fontSize="9.5">
              {b.sub}
            </text>
            <circle cx={b.x + 141} cy={b.y + 11} r="8" fill="#141926" stroke={stroke} strokeWidth="0.9" />
            <text x={b.x + 141} y={b.y + 14.5} fill={stroke} fontSize="9" textAnchor="middle">
              {b.id}
            </text>
          </g>
        );
      })}

      <text x="474" y="100" fill="#4ade80" fontSize="9.5">
        ▲ invalid signature rejected here — never committed
      </text>
      <text x="654" y="100" fill="#fbbf24" fontSize="9.5">
        ▲ secp256k1-signed tx
      </text>
    </svg>
  );
}

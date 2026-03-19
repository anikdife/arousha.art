import React from 'react';

export type ContainerFigureSpec = {
  kind: 'containers';
  labels: Array<{ label: 'A' | 'B' | 'C'; value: string }>;
  ask: 'most' | 'least';
};

export const ContainerCompareSvg: React.FC<{ spec: ContainerFigureSpec }> = ({ spec }) => {
  const w = 520;
  const h = 180;

  const positions = [
    { x: 90, label: 'A' as const },
    { x: 240, label: 'B' as const },
    { x: 390, label: 'C' as const },
  ];

  const getValue = (label: 'A' | 'B' | 'C') => spec.labels.find((l) => l.label === label)?.value ?? '';

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-auto">
      {positions.map((p) => (
        <g key={p.label}>
          <path
            d={`M ${p.x - 35} 40 Q ${p.x} 20 ${p.x + 35} 40 L ${p.x + 28} 140 Q ${p.x} 160 ${p.x - 28} 140 Z`}
            fill="#F9FAFB"
            stroke="#D1D5DB"
            strokeWidth={2}
          />
          <rect x={p.x - 28} y={70} width={56} height={60} rx={10} fill="#E0E7FF" opacity={0.55} />
          <text x={p.x} y={34} textAnchor="middle" fontSize={16} fill="#374151" fontWeight={700}>
            {p.label}
          </text>
          <text x={p.x} y={155} textAnchor="middle" fontSize={12} fill="#6B7280">
            {getValue(p.label)}
          </text>
        </g>
      ))}

      <text x={w / 2} y={18} textAnchor="middle" fontSize={12} fill="#6B7280">
        Compare capacities
      </text>
    </svg>
  );
};

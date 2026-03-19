import React from 'react';

export type BalanceFigureSpec = {
  kind: 'balance';
  maxKg: 4;
  totalKg: number;
  itemLabel: string;
};

export const BalanceScaleSvg: React.FC<{ spec: BalanceFigureSpec }> = ({ spec }) => {
  const w = 520;
  const h = 160;
  const cx = w / 2;
  const cy = 95;
  const r = 70;

  const max = spec.maxKg;
  const t = Math.max(0, Math.min(max, spec.totalKg));
  const angle = (-Math.PI * 0.75) + (t / max) * (Math.PI * 1.5);

  const px = cx + Math.cos(angle) * (r - 10);
  const py = cy + Math.sin(angle) * (r - 10);

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-auto">
      {/* dial */}
      <circle cx={cx} cy={cy} r={r} fill="#F9FAFB" stroke="#D1D5DB" />

      {/* ticks */}
      {Array.from({ length: max + 1 }).map((_, i) => {
        const a = (-Math.PI * 0.75) + (i / max) * (Math.PI * 1.5);
        const x1 = cx + Math.cos(a) * (r - 2);
        const y1 = cy + Math.sin(a) * (r - 2);
        const x2 = cx + Math.cos(a) * (r - 14);
        const y2 = cy + Math.sin(a) * (r - 14);
        const tx = cx + Math.cos(a) * (r + 16);
        const ty = cy + Math.sin(a) * (r + 16);
        return (
          <g key={i}>
            <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#6B7280" strokeWidth={2} />
            <text x={tx} y={ty + 4} textAnchor="middle" fontSize={12} fill="#374151">
              {i}
            </text>
          </g>
        );
      })}

      {/* pointer */}
      <line x1={cx} y1={cy} x2={px} y2={py} stroke="#7C3AED" strokeWidth={4} strokeLinecap="round" />
      <circle cx={cx} cy={cy} r={6} fill="#5B21B6" />

      {/* items */}
      <rect x={cx - 150} y={18} width={70} height={44} rx={10} fill="#DBEAFE" stroke="#93C5FD" />
      <rect x={cx + 80} y={18} width={70} height={44} rx={10} fill="#DBEAFE" stroke="#93C5FD" />
      <text x={cx} y={48} textAnchor="middle" fontSize={12} fill="#374151">
        2 identical {spec.itemLabel}
      </text>

      <text x={cx} y={h - 12} textAnchor="middle" fontSize={12} fill="#6B7280">
        Scale reading: {spec.totalKg} kg
      </text>
    </svg>
  );
};

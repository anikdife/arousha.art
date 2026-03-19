import React from 'react';

export type RulerFigureSpec = {
  kind: 'ruler';
  maxCm: 10 | 20;
  startCm: number;
  endCm: number;
  endFraction?: 0 | 0.2 | 0.8;
};

export const RulerSvg: React.FC<{ spec: RulerFigureSpec }> = ({ spec }) => {
  const w = 520;
  const h = 90;
  const padX = 20;
  const rulerY = 50;
  const rulerH = 26;

  const cmCount = spec.maxCm;
  const tickCount = cmCount * 10; // 0.1cm ticks; we will highlight whole cm.
  const tickW = (w - padX * 2) / tickCount;

  const xForCm = (cm: number) => padX + cm * 10 * tickW;

  const endX = xForCm(spec.endCm) + (spec.endFraction ?? 0) * 10 * tickW;
  const startX = xForCm(spec.startCm);

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-auto">
      <rect x={padX} y={rulerY} width={w - padX * 2} height={rulerH} rx={10} fill="#F9FAFB" stroke="#D1D5DB" />

      {/* ticks */}
      {Array.from({ length: tickCount + 1 }).map((_, i) => {
        const isCm = i % 10 === 0;
        const isHalf = i % 10 === 5;
        const x = padX + i * tickW;
        const y1 = rulerY;
        const len = isCm ? 18 : isHalf ? 12 : 8;
        const y2 = rulerY + len;
        return <line key={i} x1={x} y1={y1} x2={x} y2={y2} stroke="#6B7280" strokeWidth={isCm ? 2 : 1} />;
      })}

      {/* numbers */}
      {Array.from({ length: cmCount + 1 }).map((_, cm) => {
        const x = xForCm(cm);
        return (
          <text key={cm} x={x} y={rulerY - 10} textAnchor="middle" fontSize={12} fill="#374151">
            {cm}
          </text>
        );
      })}

      {/* object bar */}
      <rect x={startX} y={22} width={Math.max(2, endX - startX)} height={14} rx={7} fill="#7C3AED" opacity={0.9} />
      <circle cx={startX} cy={29} r={5} fill="#5B21B6" />
      <circle cx={endX} cy={29} r={5} fill="#5B21B6" />

      <text x={padX} y={h - 10} fontSize={12} fill="#6B7280">
        cm
      </text>
    </svg>
  );
};

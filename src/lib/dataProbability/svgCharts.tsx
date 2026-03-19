// src/lib/dataProbability/svgCharts.tsx

import React from 'react';
import type { BarChartVisual, LineGraphVisual, PictureGraphVisual, SpinnerVisual } from './types';

export const BarChartSvg: React.FC<{ visual: BarChartVisual }> = ({ visual }) => {
  const w = 520;
  const h = 260;
  const pad = { l: 42, r: 16, t: 24, b: 60 };
  const innerW = w - pad.l - pad.r;
  const innerH = h - pad.t - pad.b;

  const maxY = Math.max(1, visual.maxY);
  const step = Math.max(1, Math.ceil(maxY / 6));
  const ticks = Array.from({ length: Math.floor(maxY / step) + 1 }, (_, i) => i * step);

  const barW = innerW / visual.categories.length;

  return (
    <div className="w-full max-w-2xl">
      <div className="text-gray-900 font-semibold mb-2">{visual.title}</div>
      <svg width="100%" viewBox={`0 0 ${w} ${h}`} role="img" aria-label={visual.title} className="text-gray-700">
        <line x1={pad.l} y1={pad.t} x2={pad.l} y2={pad.t + innerH} stroke="currentColor" strokeWidth={2} />
        <line x1={pad.l} y1={pad.t + innerH} x2={pad.l + innerW} y2={pad.t + innerH} stroke="currentColor" strokeWidth={2} />

        {ticks.map((t) => {
          const y = pad.t + innerH - (t / maxY) * innerH;
          return (
            <g key={t}>
              <line x1={pad.l - 6} y1={y} x2={pad.l} y2={y} stroke="currentColor" strokeWidth={2} />
              <text x={pad.l - 10} y={y + 4} fontSize={12} textAnchor="end" fill="currentColor">
                {t}
              </text>
            </g>
          );
        })}

        {visual.categories.map((c, i) => {
          const v = visual.values[i] ?? 0;
          const x = pad.l + i * barW + barW * 0.15;
          const bw = barW * 0.7;
          const bh = (v / maxY) * innerH;
          const y = pad.t + innerH - bh;

          return (
            <g key={c}>
              <rect x={x} y={y} width={bw} height={bh} fill="currentColor" fillOpacity={0.25} stroke="currentColor" strokeWidth={2} />
              <text x={x + bw / 2} y={pad.t + innerH + 18} fontSize={12} textAnchor="middle" fill="currentColor">
                {c}
              </text>
            </g>
          );
        })}

        {visual.yLabel && (
          <text x={12} y={pad.t + innerH / 2} fontSize={12} fill="currentColor" transform={`rotate(-90 12 ${pad.t + innerH / 2})`}>
            {visual.yLabel}
          </text>
        )}
        {visual.xLabel && (
          <text x={pad.l + innerW / 2} y={h - 12} fontSize={12} fill="currentColor" textAnchor="middle">
            {visual.xLabel}
          </text>
        )}
      </svg>
    </div>
  );
};

export const LineGraphSvg: React.FC<{ visual: LineGraphVisual }> = ({ visual }) => {
  const w = 520;
  const h = 260;
  const pad = { l: 42, r: 16, t: 24, b: 60 };
  const innerW = w - pad.l - pad.r;
  const innerH = h - pad.t - pad.b;

  const maxY = Math.max(1, visual.maxY);
  const step = Math.max(1, Math.ceil(maxY / 6));
  const ticks = Array.from({ length: Math.floor(maxY / step) + 1 }, (_, i) => i * step);

  const dx = visual.xCategories.length > 1 ? innerW / (visual.xCategories.length - 1) : innerW;

  const points = visual.points.map((p, i) => {
    const x = pad.l + i * dx;
    const y = pad.t + innerH - (p / maxY) * innerH;
    return { x, y, p, label: visual.xCategories[i] };
  });

  const path = points.length > 1 ? `M ${points.map((pt) => `${pt.x},${pt.y}`).join(' L ')}` : '';

  return (
    <div className="w-full max-w-2xl">
      <div className="text-gray-900 font-semibold mb-2">{visual.title}</div>
      <svg width="100%" viewBox={`0 0 ${w} ${h}`} role="img" aria-label={visual.title} className="text-gray-700">
        <line x1={pad.l} y1={pad.t} x2={pad.l} y2={pad.t + innerH} stroke="currentColor" strokeWidth={2} />
        <line x1={pad.l} y1={pad.t + innerH} x2={pad.l + innerW} y2={pad.t + innerH} stroke="currentColor" strokeWidth={2} />

        {ticks.map((t) => {
          const y = pad.t + innerH - (t / maxY) * innerH;
          return (
            <g key={t}>
              <line x1={pad.l - 6} y1={y} x2={pad.l} y2={y} stroke="currentColor" strokeWidth={2} />
              <text x={pad.l - 10} y={y + 4} fontSize={12} textAnchor="end" fill="currentColor">
                {t}
              </text>
            </g>
          );
        })}

        {path && <path d={path} fill="none" stroke="currentColor" strokeWidth={3} />}

        {points.map((pt, i) => (
          <g key={i}>
            <circle cx={pt.x} cy={pt.y} r={4} fill="currentColor" />
            <text x={pt.x} y={pad.t + innerH + 18} fontSize={12} textAnchor="middle" fill="currentColor">
              {pt.label}
            </text>
          </g>
        ))}

        <text x={12} y={pad.t + innerH / 2} fontSize={12} fill="currentColor" transform={`rotate(-90 12 ${pad.t + innerH / 2})`}>
          {visual.yLabel}
        </text>
      </svg>
    </div>
  );
};

function IconPerson({ x, y }: { x: number; y: number }) {
  return (
    <g>
      <circle cx={x} cy={y} r={6} fill="currentColor" fillOpacity={0.25} stroke="currentColor" strokeWidth={2} />
      <rect x={x - 4} y={y + 6} width={8} height={10} fill="currentColor" fillOpacity={0.15} stroke="currentColor" strokeWidth={2} />
    </g>
  );
}

export const PictureGraphSvg: React.FC<{ visual: PictureGraphVisual }> = ({ visual }) => {
  const w = 520;
  const rowH = 44;
  const h = 60 + visual.categories.length * rowH;

  return (
    <div className="w-full max-w-2xl">
      <div className="text-gray-900 font-semibold mb-1">{visual.title}</div>
      <div className="text-gray-600 text-sm mb-2">{visual.keyLabel}</div>

      <svg width="100%" viewBox={`0 0 ${w} ${h}`} role="img" aria-label={visual.title} className="text-gray-700">
        {visual.categories.map((cat, i) => {
          const count = visual.iconsPerCategory[i] ?? 0;
          const y = 36 + i * rowH;
          return (
            <g key={cat}>
              <text x={12} y={y} fontSize={14} fill="currentColor">
                {cat}
              </text>
              {Array.from({ length: count }).map((_, j) => (
                <IconPerson key={j} x={170 + j * 28} y={y - 6} />
              ))}
            </g>
          );
        })}
      </svg>
    </div>
  );
};

export const SpinnerSvg: React.FC<{ visual: SpinnerVisual }> = ({ visual }) => {
  const size = 260;
  const r = 110;
  const cx = size / 2;
  const cy = size / 2;

  const total = visual.sectors.reduce((s, x) => s + x.weight, 0);

  let start = -Math.PI / 2;

  const sectors = visual.sectors.map((s, idx) => {
    const angle = (s.weight / total) * Math.PI * 2;
    const end = start + angle;

    const x1 = cx + r * Math.cos(start);
    const y1 = cy + r * Math.sin(start);
    const x2 = cx + r * Math.cos(end);
    const y2 = cy + r * Math.sin(end);
    const largeArc = angle > Math.PI ? 1 : 0;

    const d = `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`;

    const mid = start + angle / 2;
    const lx = cx + (r * 0.65) * Math.cos(mid);
    const ly = cy + (r * 0.65) * Math.sin(mid);

    const fillOpacity = 0.12 + (idx % 4) * 0.08;

    start = end;

    return { d, label: s.label, lx, ly, fillOpacity, idx };
  });

  return (
    <div className="w-full max-w-md">
      <div className="text-gray-900 font-semibold mb-2">{visual.title}</div>
      <svg width="100%" viewBox={`0 0 ${size} ${size}`} role="img" aria-label={visual.title} className="text-gray-700">
        {sectors.map((s) => (
          <g key={s.idx}>
            <path d={s.d} fill="currentColor" fillOpacity={s.fillOpacity} stroke="currentColor" strokeWidth={2} />
            <text x={s.lx} y={s.ly} fontSize={12} textAnchor="middle" dominantBaseline="middle" fill="currentColor" fontWeight={700}>
              {s.label}
            </text>
          </g>
        ))}

        {/* pointer */}
        <polygon
          points={`${cx},${cy - r - 8} ${cx - 8},${cy - r + 10} ${cx + 8},${cy - r + 10}`}
          fill="currentColor"
        />
        <circle cx={cx} cy={cy} r={6} fill="currentColor" />
      </svg>
    </div>
  );
};

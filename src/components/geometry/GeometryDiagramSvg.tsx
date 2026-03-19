// src/components/geometry/GeometryDiagramSvg.tsx

import React from 'react';
import type { GeometryDiagram } from '../../lib/geometry/models';

function regularPolygonPoints(cx: number, cy: number, r: number, sides: number, rotationRad: number): string {
  const pts: Array<{ x: number; y: number }> = [];
  for (let i = 0; i < sides; i++) {
    const a = rotationRad + (i * 2 * Math.PI) / sides;
    pts.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
  }
  return pts.map((p) => `${p.x},${p.y}`).join(' ');
}

function drawAngle(svgW: number, svgH: number, kind: 'small' | 'right', x: number, y: number) {
  const len = Math.min(svgW, svgH) * 0.25;
  const a1 = 0;
  const a2 = kind === 'right' ? -Math.PI / 2 : -Math.PI / 4;

  const x1 = x + len * Math.cos(a1);
  const y1 = y + len * Math.sin(a1);
  const x2 = x + len * Math.cos(a2);
  const y2 = y + len * Math.sin(a2);

  return (
    <g>
      <line x1={x} y1={y} x2={x1} y2={y1} stroke="currentColor" strokeWidth={3} />
      <line x1={x} y1={y} x2={x2} y2={y2} stroke="currentColor" strokeWidth={3} />
      {kind === 'right' && (
        <rect x={x + 6} y={y - 22} width={16} height={16} fill="none" stroke="currentColor" strokeWidth={2} />
      )}
    </g>
  );
}

export const GeometryDiagramSvg: React.FC<{ diagram: GeometryDiagram }> = ({ diagram }) => {
  const w = diagram.width;
  const h = diagram.height;

  const shape = (() => {
    const cx = w / 2;
    const cy = h / 2;
    const r = Math.min(w, h) * 0.28;

    switch (diagram.shapeType) {
      case 'circle':
        return <circle cx={cx} cy={cy} r={r} fill="none" stroke="currentColor" strokeWidth={3} />;
      case 'square': {
        const s = r * 2;
        return <rect x={cx - s / 2} y={cy - s / 2} width={s} height={s} fill="none" stroke="currentColor" strokeWidth={3} />;
      }
      case 'rectangle': {
        const rw = r * 2.4;
        const rh = r * 1.6;
        return (
          <rect x={cx - rw / 2} y={cy - rh / 2} width={rw} height={rh} fill="none" stroke="currentColor" strokeWidth={3} />
        );
      }
      case 'triangle': {
        const pts = `${cx},${cy - r} ${cx - r},${cy + r} ${cx + r},${cy + r}`;
        return <polygon points={pts} fill="none" stroke="currentColor" strokeWidth={3} />;
      }
      case 'pentagon':
        return (
          <polygon
            points={regularPolygonPoints(cx, cy, r, 5, -Math.PI / 2)}
            fill="none"
            stroke="currentColor"
            strokeWidth={3}
          />
        );
      case 'hexagon':
        return (
          <polygon
            points={regularPolygonPoints(cx, cy, r, 6, -Math.PI / 2)}
            fill="none"
            stroke="currentColor"
            strokeWidth={3}
          />
        );
      case 'right-angle-corner': {
        const cornerKind = (diagram.data?.cornerKind as 'right' | 'small' | 'wide' | undefined) ?? 'right';
        const kind = cornerKind === 'right' ? 'right' : 'small';
        return <g>{drawAngle(w, h, kind, w * 0.35, h * 0.65)}</g>;
      }
      case 'angle-compare': {
        const a = (diagram.data?.angleA as 'small' | 'right' | undefined) ?? 'small';
        const b = (diagram.data?.angleB as 'small' | 'right' | undefined) ?? 'right';
        return (
          <g>
            {drawAngle(w, h, a, w * 0.25, h * 0.7)}
            <text x={w * 0.22} y={h * 0.9} fontSize={16} fill="currentColor" fontWeight={700}>
              A
            </text>

            {drawAngle(w, h, b, w * 0.65, h * 0.7)}
            <text x={w * 0.62} y={h * 0.9} fontSize={16} fill="currentColor" fontWeight={700}>
              B
            </text>
          </g>
        );
      }
      default:
        return null;
    }
  })();

  return (
    <div className="text-gray-700">
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label="Geometry diagram">
        {shape}

        {(diagram.symmetryLines ?? []).map((ln, idx) => {
          if (ln.orientation === 'vertical') {
            const x = ln.at * w;
            return (
              <line
                key={idx}
                x1={x}
                y1={10}
                x2={x}
                y2={h - 10}
                stroke="currentColor"
                strokeWidth={2}
                strokeDasharray="6 4"
              />
            );
          }

          const y = ln.at * h;
          return (
            <line
              key={idx}
              x1={10}
              y1={y}
              x2={w - 10}
              y2={y}
              stroke="currentColor"
              strokeWidth={2}
              strokeDasharray="6 4"
            />
          );
        })}
      </svg>
    </div>
  );
};

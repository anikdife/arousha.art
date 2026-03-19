// FanMenuLeftSvg.tsx
import React, { useId, useMemo } from "react";

type FanItem = {
  label: string;
  sublabel?: string;
  onClick?: () => void;
};

type FanMenuLeftSvgProps = {
  items?: FanItem[]; // default 5
  radius?: number; // outer radius
  thickness?: number; // ring thickness
  gapDeg?: number; // gap between segments
  title?: string;
  subtitle?: string;
  className?: string;
};

const DEFAULT_ITEMS: FanItem[] = [
  { label: "Option One" },
  { label: "Option Two" },
  { label: "Option Three" },
  { label: "Option Four" },
  { label: "Option Five" },
];

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

function deg2rad(d: number) {
  return (d * Math.PI) / 180;
}

function polar(cx: number, cy: number, r: number, deg: number) {
  const t = deg2rad(deg);
  return { x: cx + r * Math.cos(t), y: cy + r * Math.sin(t) };
}

/**
 * Create a ring-segment path between angles [a0,a1] (degrees), centered at (cx,cy),
 * outer radius R, inner radius r.
 */
function ringSegmentPath(
  cx: number,
  cy: number,
  R: number,
  r: number,
  a0: number,
  a1: number
) {
  const p0 = polar(cx, cy, R, a0);
  const p1 = polar(cx, cy, R, a1);
  const q1 = polar(cx, cy, r, a1);
  const q0 = polar(cx, cy, r, a0);

  const largeArc = Math.abs(a1 - a0) > 180 ? 1 : 0;

  // Sweep direction: 1 means "positive angle" direction in SVG arc (clockwise in screen coords).
  // With our angles in standard math (0°=right, 90°=down), sweep=1 works for increasing angles.
  const sweep = 1;

  return [
    `M ${p0.x.toFixed(3)} ${p0.y.toFixed(3)}`,
    `A ${R} ${R} 0 ${largeArc} ${sweep} ${p1.x.toFixed(3)} ${p1.y.toFixed(3)}`,
    `L ${q1.x.toFixed(3)} ${q1.y.toFixed(3)}`,
    `A ${r} ${r} 0 ${largeArc} ${sweep ? 0 : 1} ${q0.x.toFixed(3)} ${q0.y.toFixed(3)}`,
    "Z",
  ].join(" ");
}

export default function FanMenuLeftSvg({
  items = DEFAULT_ITEMS,
  radius = 220,
  thickness = 72,
  gapDeg = 1.5,
  title = "MENU",
  subtitle = "Select an option",
  className = "",
}: FanMenuLeftSvgProps) {
  const id = useId();

  const list = useMemo(() => {
    const n = clamp(items.length || 5, 3, 9);
    const base = items.slice(0, n);
    while (base.length < n) base.push({ label: `Option ${base.length + 1}` });
    return base;
  }, [items]);

  // Left-facing semicircle:
  // angles from 90° (down) to 270° (up) with center at right side of the viewBox.
  // Using standard screen angle mapping (0° to the right, 90° down).
  const cx = radius;
  const cy = radius;
  const vbW = radius; // show only left half of the full circle (x: 0..R)
  const vbH = radius * 2;

  const R = radius;
  const r = Math.max(0, radius - thickness);

  const start = 90;
  const end = 270;
  const span = end - start; // 180
  const segSpan = span / list.length;

  const segments = useMemo(() => {
    return list.map((it, i) => {
      const a0 = start + i * segSpan + gapDeg / 2;
      const a1 = start + (i + 1) * segSpan - gapDeg / 2;

      const path = ringSegmentPath(cx, cy, R, r, a0, a1);

      const mid = (a0 + a1) / 2;
      const labelR = r + (R - r) * 0.55;
      const lp = polar(cx, cy, labelR, mid);

      // A subtle purple gradient sweep (HSL-ish mapped to two stops)
      const hue = 255 - i * 18;
      const gradId = `grad-${id}-${i}`;

      return { it, i, a0, a1, mid, path, lp, hue, gradId };
    });
  }, [list, cx, cy, R, r, start, segSpan, gapDeg, id]);

  return (
    <div className={`fanSvgWrap ${className}`}>
      <style>{css}</style>

      <svg
        className="fanSvg"
        viewBox={`0 0 ${vbW} ${vbH}`}
        role="img"
        aria-label="Left-opening fan menu"
      >
        <defs>
          <filter id={`shadow-${id}`} x="-30%" y="-30%" width="160%" height="160%">
            <feDropShadow dx="0" dy="10" stdDeviation="14" floodColor="rgba(10,10,30,0.35)" />
            <feDropShadow dx="0" dy="2" stdDeviation="1.5" floodColor="rgba(255,255,255,0.06)" />
          </filter>

          <filter id={`glow-${id}`} x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="10" result="b" />
            <feColorMatrix
              in="b"
              type="matrix"
              values="
                1 0 0 0 0
                0 0.9 0 0 0
                0 0 1 0 0
                0 0 0 .35 0"
              result="c"
            />
            <feMerge>
              <feMergeNode in="c" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

          {/* Background circle gradient */}
          <radialGradient id={`bg-${id}`} cx="70%" cy="50%" r="90%">
            <stop offset="0%" stopColor="rgba(255,255,255,0.22)" />
            <stop offset="55%" stopColor="rgba(255,255,255,0)" />
          </radialGradient>

          {/* Center hole gradient */}
          <radialGradient id={`hole-${id}`} cx="60%" cy="45%" r="90%">
            <stop offset="0%" stopColor="rgba(255,255,255,0.12)" />
            <stop offset="60%" stopColor="rgba(255,255,255,0)" />
          </radialGradient>

          {/* Segment gradients per wedge */}
          {segments.map(({ i, hue, gradId }) => (
            <linearGradient key={gradId} id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor={`hsl(${hue}, 75%, 58%)`} />
              <stop offset="100%" stopColor={`hsl(${hue - 30}, 75%, 36%)`} />
            </linearGradient>
          ))}
        </defs>

        {/* Full circle background, clipped by viewBox to left half */}
        <g filter={`url(#shadow-${id})`}>
          <circle cx={cx} cy={cy} r={R} fill={`url(#bg-${id})`} />
          <circle cx={cx} cy={cy} r={R} fill="rgba(18,16,40,1)" opacity="0.85" />
        </g>

        {/* soft ring glow */}
        <g filter={`url(#glow-${id})`} opacity="0.55">
          <circle cx={cx} cy={cy} r={R - 10} fill="none" stroke="rgba(145,120,255,0.55)" strokeWidth={14} />
        </g>

        {/* segments */}
        {segments.map(({ it, i, path, lp, gradId }) => (
          <g key={i} className="fanSegG">
            <path
              className="fanSegPath"
              d={path}
              fill={`url(#${gradId})`}
              onClick={it.onClick}
              role="button"
              tabIndex={0}
              aria-label={it.label}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") it.onClick?.();
              }}
            />
            {/* subtle separator stroke */}
            <path d={path} fill="none" stroke="rgba(255,255,255,0.10)" strokeWidth={1} opacity={0.45} />

            {/* label */}
            <g className="fanLabelG" transform={`translate(${lp.x.toFixed(2)},${lp.y.toFixed(2)})`}>
              <text className="fanLabelTitle" textAnchor="middle" dominantBaseline="middle">
                {it.label}
              </text>
              {it.sublabel ? (
                <text className="fanLabelSub" y={16} textAnchor="middle" dominantBaseline="middle">
                  {it.sublabel}
                </text>
              ) : null}
            </g>
          </g>
        ))}

        {/* center hole */}
        <g>
          <circle cx={cx} cy={cy} r={r} fill="rgba(12,12,20,.98)" />
          <circle cx={cx} cy={cy} r={r} fill={`url(#hole-${id})`} />
          <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(255,255,255,.06)" strokeWidth={2} />

          {/* center text */}
          <g transform={`translate(${cx},${cy})`}>
            <text className="fanCenterTitle" textAnchor="middle" dominantBaseline="middle" y={-6}>
              {title}
            </text>
            <text className="fanCenterSub" textAnchor="middle" dominantBaseline="middle" y={14}>
              {subtitle}
            </text>
          </g>

          {/* dot row */}
          <g transform={`translate(${cx - r * 0.25},${cy + r * 0.12})`} opacity={0.9}>
            {Array.from({ length: 5 }).map((_, k) => (
              <circle
                key={k}
                cx={k * 14}
                cy={0}
                r={3.6}
                fill="rgba(255,255,255,0.35)"
                stroke="rgba(120,90,255,0.22)"
                strokeWidth={2}
              />
            ))}
          </g>
        </g>
      </svg>
    </div>
  );
}

const css = `
.fanSvgWrap{
  display:inline-flex;
  align-items:center;
  justify-content:center;
}

.fanSvg{
  width: min(520px, 92vw);
  height: auto;
  overflow: visible;
}

.fanSegPath{
  cursor: pointer;
  transition: filter .18s ease, transform .18s ease;
  transform-origin: 220px 220px; /* overridden visually by viewBox; ok for hover */
}

.fanSegG:hover .fanSegPath{
  filter: brightness(1.07) saturate(1.05);
}

.fanSegPath:focus-visible{
  outline: none;
  filter: drop-shadow(0 0 0 rgba(0,0,0,0)) drop-shadow(0 0 12px rgba(140,120,255,.45));
}

.fanLabelTitle{
  font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial, "Noto Sans", "Liberation Sans", sans-serif;
  font-weight: 600;
  font-size: 9px;
  letter-spacing: .1px;
  fill: rgba(255,255,255,.92);
  paint-order: stroke;
  stroke: rgba(0,0,0,.25);
  stroke-width: 2px;
}

.fanLabelSub{
  font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial;
  font-weight: 500;
  font-size: 7px;
  fill: rgba(255,255,255,.72);
  paint-order: stroke;
  stroke: rgba(0,0,0,.18);
  stroke-width: 2px;
}

.fanCenterTitle{
  font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial;
  font-weight: 700;
  font-size: 12px;
  letter-spacing: .5px;
  fill: rgba(255,255,255,.92);
}

.fanCenterSub{
  font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial;
  font-weight: 500;
  font-size: 8px;
  fill: rgba(255,255,255,.65);
}
`;
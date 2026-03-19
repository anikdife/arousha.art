import React, { useMemo } from 'react';
import { useY3HistoryData } from '../../../../hooks/useY3HistoryData';
import { useTopicSessionIndex } from '../../../../hooks/useTopicSessionIndex';
import type { SessionIndexItem } from '../../../../lib/sessionIndexReader';

type PieSlice = {
  key: string;
  label: string;
  color: string;
  count: number;
  percent: number;
};

function clamp01(n: number) {
  return Math.max(0, Math.min(1, n));
}

function polarToCartesian(cx: number, cy: number, r: number, angleRad: number) {
  return { x: cx + r * Math.cos(angleRad), y: cy + r * Math.sin(angleRad) };
}

function darkenHex(hex: string, factor: number) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 0xff;
  const g = (n >> 8) & 0xff;
  const b = n & 0xff;
  const f = Math.max(0, Math.min(1, factor));
  const rr = Math.round(r * f);
  const gg = Math.round(g * f);
  const bb = Math.round(b * f);
  const out = (rr << 16) | (gg << 8) | bb;
  return `#${out.toString(16).padStart(6, '0')}`;
}

function describeDonutSlice(cx: number, cy: number, rOuter: number, rInner: number, startAngleRad: number, endAngleRad: number) {
  const delta = endAngleRad - startAngleRad;
  const largeArc = delta > Math.PI ? 1 : 0;
  const sweepOuter = 1;
  const sweepInner = 0;

  const outerStart = polarToCartesian(cx, cy, rOuter, startAngleRad);
  const outerEnd = polarToCartesian(cx, cy, rOuter, endAngleRad);
  const innerEnd = polarToCartesian(cx, cy, rInner, endAngleRad);
  const innerStart = polarToCartesian(cx, cy, rInner, startAngleRad);

  return [
    `M ${outerStart.x} ${outerStart.y}`,
    `A ${rOuter} ${rOuter} 0 ${largeArc} ${sweepOuter} ${outerEnd.x} ${outerEnd.y}`,
    `L ${innerEnd.x} ${innerEnd.y}`,
    `A ${rInner} ${rInner} 0 ${largeArc} ${sweepInner} ${innerStart.x} ${innerStart.y}`,
    'Z',
  ].join(' ');
}

function toMillis(value: any): number {
  if (!value) return 0;
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }
  if (typeof value === 'string') {
    const t = Date.parse(value);
    return Number.isNaN(t) ? 0 : t;
  }
  if (typeof value?.toDate === 'function') {
    try {
      return value.toDate().getTime();
    } catch {
      return 0;
    }
  }
  if (typeof value?.seconds === 'number') {
    return value.seconds * 1000;
  }
  return 0;
}

function itemMillis(it: SessionIndexItem): number {
  return it.submittedAtMillis ?? toMillis((it as any).submittedAt ?? (it as any).createdAt);
}

function filterByRange(items: SessionIndexItem[], rangeStartMs?: number, rangeEndMs?: number): SessionIndexItem[] {
  if (typeof rangeStartMs !== 'number' || typeof rangeEndMs !== 'number') return items;
  return items.filter((it) => {
    const ms = itemMillis(it);
    if (!ms) return true;
    return ms >= rangeStartMs && ms <= rangeEndMs;
  });
}

export const CategoryShareCardMobile: React.FC<{
  studentUid: string | undefined;
  rangeStartMs?: number;
  rangeEndMs?: number;
}> = ({ studentUid, rangeStartMs, rangeEndMs }) => {
  const numeracy = useY3HistoryData(studentUid);
  const reading = useTopicSessionIndex({ studentUid, topic: 'reading-magazine', enabled: Boolean(studentUid) });
  const language = useTopicSessionIndex({ studentUid, topic: 'language-conventions', enabled: Boolean(studentUid) });
  const writing = useTopicSessionIndex({ studentUid, topic: 'writing', enabled: Boolean(studentUid) });

  const loading = numeracy.loading || reading.loading || language.loading || writing.loading;
  const error = numeracy.error || reading.error || language.error || writing.error;

  const slices = useMemo((): PieSlice[] => {
    const d = numeracy.data;

    const filteredSubtraction = filterByRange(d?.subtraction ?? [], rangeStartMs, rangeEndMs);
    const filteredAddition = filterByRange(d?.addition ?? [], rangeStartMs, rangeEndMs);
    const filteredMultiplication = filterByRange(d?.multiplication ?? [], rangeStartMs, rangeEndMs);
    const filteredMeasurement = filterByRange(d?.measurement ?? [], rangeStartMs, rangeEndMs);
    const filteredGeometry = filterByRange(d?.geometry ?? [], rangeStartMs, rangeEndMs);
    const filteredDataProbability = filterByRange(d?.dataProbability ?? [], rangeStartMs, rangeEndMs);

    const filteredReading = filterByRange(reading.items ?? [], rangeStartMs, rangeEndMs);
    const filteredLanguage = filterByRange(language.items ?? [], rangeStartMs, rangeEndMs);
    const filteredWriting = filterByRange(writing.items ?? [], rangeStartMs, rangeEndMs);

    const raw = [
      { key: 'subtraction', label: 'Subtraction', color: '#2563EB', count: filteredSubtraction.length },
      { key: 'addition', label: 'Addition', color: '#9333EA', count: filteredAddition.length },
      { key: 'multiplication', label: 'Multiplication', color: '#16A34A', count: filteredMultiplication.length },
      { key: 'measurement', label: 'Measurement', color: '#0D9488', count: filteredMeasurement.length },
      { key: 'geometry', label: 'Geometry', color: '#374151', count: filteredGeometry.length },
      { key: 'dataProbability', label: 'Data & Probability', color: '#0891B2', count: filteredDataProbability.length },
      { key: 'reading', label: 'Reading', color: '#059669', count: filteredReading.length },
      { key: 'language', label: 'Language Conventions', color: '#F59E0B', count: filteredLanguage.length },
      { key: 'writing', label: 'Writing', color: '#DC2626', count: filteredWriting.length },
    ];

    const total = raw.reduce((sum, s) => sum + (Number.isFinite(s.count) ? s.count : 0), 0);
    const withPct = raw.map((s) => ({ ...s, percent: total > 0 ? (s.count / total) * 100 : 0 }));
    return withPct.sort((a, b) => b.percent - a.percent);
  }, [
    language.items,
    numeracy.data,
    rangeEndMs,
    rangeStartMs,
    reading.items,
    writing.items,
  ]);

  const total = useMemo(() => slices.reduce((sum, s) => sum + s.count, 0), [slices]);

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-4">
      <div>
        <div className="text-base font-bold text-gray-900">Category Share</div>
        <div className="text-xs text-gray-600 mt-0.5">% of sessions in selected date range</div>
      </div>

      {loading ? (
        <div className="mt-4 flex items-center justify-center py-10">
          <div className="animate-spin rounded-full h-7 w-7 border-b-2 border-purple-600" />
        </div>
      ) : error ? (
        <div className="mt-4 bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-800">{error}</div>
      ) : total > 0 ? (
        <div className="mt-4 flex items-center justify-center">
          <svg className="w-full h-auto" viewBox="0 0 560 400" role="img" aria-label="Session share donut chart">
            {(() => {
              const cx = 280;
              const cy = 175;
              const rOuter = 115;
              const rInner = 52;
              const depth = 26;
              const startAt = -Math.PI / 2;
              let angle = startAt;

              const nonZero = slices.filter((s) => s.count > 0);

              type SliceGeom = {
                s: PieSlice;
                start: number;
                end: number;
                mid: number;
                frac: number;
                topD: string;
                botD: string;
              };

              const geoms: SliceGeom[] = nonZero.map((s) => {
                const frac = clamp01(s.count / total);
                const sweep = frac * Math.PI * 2;
                const start = angle;
                const end = angle + sweep;
                angle = end;

                const topD = describeDonutSlice(cx, cy, rOuter, rInner, start, end);
                const botD = describeDonutSlice(cx, cy + depth, rOuter, rInner, start, end);
                return { s, start, end, mid: (start + end) / 2, frac, topD, botD };
              });

              return (
                <g>
                  <ellipse cx={cx} cy={cy + depth + 18} rx={130} ry={26} fill="#111827" opacity={0.12} />

                  {geoms.map((g) => (
                    <path key={`bot-${g.s.key}`} d={g.botD} fill={darkenHex(g.s.color, 0.72)} stroke="none" />
                  ))}

                  {geoms.map((g) => (
                    <path key={`top-${g.s.key}`} d={g.topD} fill={g.s.color} stroke="#FFFFFF" strokeWidth={2}>
                      <title>
                        {g.s.label}: {Math.round(g.s.percent)}% ({g.s.count} sessions)
                      </title>
                    </path>
                  ))}

                  {geoms.map((g) => {
                    const pct = Math.round(g.s.percent);
                    if (pct <= 0) return null;
                    const labelR = (rInner + rOuter) / 2;
                    const pos = polarToCartesian(cx, cy, labelR, g.mid);
                    return (
                      <text
                        key={`pct-${g.s.key}`}
                        x={pos.x}
                        y={pos.y}
                        textAnchor="middle"
                        dominantBaseline="middle"
                        fontSize={16}
                        fontWeight={800}
                        fill="#FFFFFF"
                        stroke="#000000"
                        strokeOpacity={0.18}
                        strokeWidth={4}
                        paintOrder="stroke"
                      >
                        {pct}%
                      </text>
                    );
                  })}
                </g>
              );
            })()}
          </svg>
        </div>
      ) : (
        <div className="mt-4 text-sm text-gray-600">No sessions for the selected date range.</div>
      )}
    </div>
  );
};

import React, { useMemo, useState } from 'react';
import { useY3HistoryData } from '../../../../hooks/useY3HistoryData';
import type { SessionIndexItem } from '../../../../lib/sessionIndexReader';
import { SeriesLegendSheet, type SeriesEnabledMap } from './SeriesLegendSheet';

type Point = { xMillis: number; yPercent: number; item: SessionIndexItem };

type Domain = {
  minX: number;
  maxX: number;
};

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

function toPoints(items: SessionIndexItem[]): Point[] {
  return items
    .map((it) => ({
      xMillis: it.submittedAtMillis ?? toMillis((it as any).submittedAt ?? (it as any).createdAt),
      yPercent: Math.max(0, Math.min(100, it.score?.percentage ?? 0)),
      item: it,
    }))
    .filter((it) => it.xMillis > 0)
    .sort((a, b) => a.xMillis - b.xMillis);
}

function computeDomain(all: Point[]): Domain {
  if (all.length === 0) {
    const now = Date.now();
    return { minX: now - 6 * 24 * 60 * 60 * 1000, maxX: now };
  }
  const xs = all.map((p) => p.xMillis);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  if (minX === maxX) {
    return { minX: minX - 24 * 60 * 60 * 1000, maxX: maxX + 24 * 60 * 60 * 1000 };
  }
  return { minX, maxX };
}

function formatShortDate(ms: number) {
  try {
    return new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}

const SERIES: Array<{ key: keyof SeriesEnabledMap; label: string; color: string }> = [
  { key: 'subtraction', label: 'Subtraction', color: '#2563EB' },
  { key: 'addition', label: 'Addition', color: '#9333EA' },
  { key: 'multiplication', label: 'Multiplication', color: '#16A34A' },
  { key: 'measurement', label: 'Measurement', color: '#0D9488' },
  { key: 'geometry', label: 'Geometry', color: '#374151' },
  { key: 'dataProbability', label: 'Data & Probability', color: '#0891B2' },
];

export const CombinedProgressCardMobile: React.FC<{
  studentUid: string | undefined;
  rangeStartMs?: number;
  rangeEndMs?: number;
  seriesEnabled: SeriesEnabledMap;
  onSeriesEnabledChange: (next: SeriesEnabledMap) => void;
  onRefresh: () => void;
  onOpenSession?: (item: SessionIndexItem) => void;
}> = ({ studentUid, rangeStartMs, rangeEndMs, seriesEnabled, onSeriesEnabledChange, onRefresh, onOpenSession }) => {
  const { data, loading, error, refresh } = useY3HistoryData(studentUid);
  const [legendOpen, setLegendOpen] = useState(false);

  const range = useMemo(() => {
    if (typeof rangeStartMs !== 'number' || typeof rangeEndMs !== 'number') return null;
    return { start: rangeStartMs, end: rangeEndMs };
  }, [rangeEndMs, rangeStartMs]);

  const filter = (items: SessionIndexItem[]) => {
    if (!range) return items;
    return items.filter((it) => {
      const ms = it.submittedAtMillis ?? toMillis((it as any).submittedAt ?? (it as any).createdAt);
      if (!ms) return true;
      return ms >= range.start && ms <= range.end;
    });
  };

  const subtraction = useMemo(() => filter(data?.subtraction ?? []), [data?.subtraction, range]);
  const addition = useMemo(() => filter(data?.addition ?? []), [data?.addition, range]);
  const multiplication = useMemo(() => filter(data?.multiplication ?? []), [data?.multiplication, range]);
  const measurement = useMemo(() => filter(data?.measurement ?? []), [data?.measurement, range]);
  const geometry = useMemo(() => filter(data?.geometry ?? []), [data?.geometry, range]);
  const dataProbability = useMemo(() => filter(data?.dataProbability ?? []), [data?.dataProbability, range]);

  const pointsByKey = useMemo(() => {
    return {
      subtraction: toPoints(subtraction),
      addition: toPoints(addition),
      multiplication: toPoints(multiplication),
      measurement: toPoints(measurement),
      geometry: toPoints(geometry),
      dataProbability: toPoints(dataProbability),
    };
  }, [addition, dataProbability, geometry, measurement, multiplication, subtraction]);

  const enabledSeries = SERIES.filter((s) => seriesEnabled[s.key]);
  const activePoints = useMemo(() => {
    const out: Point[] = [];
    for (const s of enabledSeries) out.push(...(pointsByKey as any)[s.key]);
    return out;
  }, [enabledSeries, pointsByKey]);

  const domain = useMemo(() => computeDomain(activePoints), [activePoints]);

  const viewW = 1000;
  const viewH = 450;
  const pad = { top: 40, right: 30, bottom: 60, left: 60 };
  const plotW = viewW - pad.left - pad.right;
  const plotH = viewH - pad.top - pad.bottom;

  const xToSvg = (xMillis: number) => {
    const t = (xMillis - domain.minX) / (domain.maxX - domain.minX);
    return pad.left + Math.max(0, Math.min(1, t)) * plotW;
  };

  const yToSvg = (yPercent: number) => {
    const t = yPercent / 100;
    return pad.top + (1 - Math.max(0, Math.min(1, t))) * plotH;
  };

  const makePolyline = (pts: Point[]) => pts.map((p) => `${xToSvg(p.xMillis)},${yToSvg(p.yPercent)}`).join(' ');

  const xTicks: Array<{ x: number; label: string }> = [];
  {
    const tickCount = 5;
    for (let i = 0; i < tickCount; i++) {
      const t = i / (tickCount - 1);
      const ms = domain.minX + t * (domain.maxX - domain.minX);
      xTicks.push({ x: xToSvg(ms), label: formatShortDate(ms) });
    }
  }

  const yTicks = [0, 25, 50, 75, 100].map((v) => ({ v, y: yToSvg(v) }));

  const chips = enabledSeries.slice(0, 3);
  const hasMore = enabledSeries.length > 3 || SERIES.length > 3;

  const missingLabels = enabledSeries
    .filter((s) => ((pointsByKey as any)[s.key] as Point[]).length === 0)
    .map((s) => s.label);

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-base font-bold text-gray-900">Combined Progress</div>
          <div className="text-xs text-gray-600 mt-0.5">Score percentage over time</div>
        </div>
        <button
          type="button"
          aria-label="Refresh"
          onClick={() => {
            refresh();
            onRefresh();
          }}
          className="px-3 py-2 text-xs font-semibold rounded-xl bg-gray-100 text-gray-900"
        >
          Refresh
        </button>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {chips.map((s) => (
          <span key={s.key} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-gray-100 text-xs font-semibold text-gray-800">
            <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: s.color }} />
            {s.label}
          </span>
        ))}
        <button
          type="button"
          onClick={() => setLegendOpen(true)}
          className="px-3 py-1.5 rounded-full border border-gray-200 bg-white text-xs font-semibold text-gray-800"
        >
          More
        </button>
      </div>

      {missingLabels.length > 0 ? (
        <div className="mt-2 text-xs text-gray-600">
          {missingLabels.map((l) => (
            <div key={l}>No {l} data yet.</div>
          ))}
        </div>
      ) : null}

      {loading ? (
        <div className="mt-4 flex items-center justify-center py-10">
          <div className="animate-spin rounded-full h-7 w-7 border-b-2 border-purple-600" />
        </div>
      ) : error ? (
        <div className="mt-4 bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-800">{error}</div>
      ) : (
        <div className="mt-4">
          <div className="w-full overflow-hidden rounded-2xl border border-gray-200 bg-white h-[44vh] max-h-[420px]">
            <svg className="w-full h-full" viewBox={`0 0 ${viewW} ${viewH}`} preserveAspectRatio="xMidYMid meet">
              <line x1={pad.left} y1={pad.top} x2={pad.left} y2={pad.top + plotH} stroke="#111827" strokeWidth={1} />
              <line x1={pad.left} y1={pad.top + plotH} x2={pad.left + plotW} y2={pad.top + plotH} stroke="#111827" strokeWidth={1} />

              {yTicks.map((t) => (
                <g key={t.v}>
                  <line x1={pad.left} y1={t.y} x2={pad.left + plotW} y2={t.y} stroke="#E5E7EB" strokeWidth={1} />
                  <text x={pad.left - 10} y={t.y + 4} textAnchor="end" fontSize={12} fill="#374151">
                    {t.v}%
                  </text>
                </g>
              ))}

              {xTicks.map((t, idx) => (
                <g key={`${t.label}-${idx}`}>
                  <line x1={t.x} y1={pad.top + plotH} x2={t.x} y2={pad.top + plotH + 6} stroke="#111827" strokeWidth={1} />
                  <text x={t.x} y={pad.top + plotH + 26} textAnchor="middle" fontSize={12} fill="#374151">
                    {t.label}
                  </text>
                </g>
              ))}

              {SERIES.map((s) => {
                if (!seriesEnabled[s.key]) return null;
                const pts = (pointsByKey as any)[s.key] as Point[];
                if (pts.length === 0) return null;
                return (
                  <polyline
                    key={s.key}
                    fill="none"
                    stroke={s.color}
                    strokeWidth={3}
                    strokeLinecap="round"
                    points={makePolyline(pts)}
                  />
                );
              })}

              {onOpenSession
                ? SERIES.map((s) => {
                    if (!seriesEnabled[s.key]) return null;
                    const pts = (pointsByKey as any)[s.key] as Point[];
                    return pts.map((p) => (
                      <circle
                        key={`${s.key}-${p.item.sessionId}`}
                        cx={xToSvg(p.xMillis)}
                        cy={yToSvg(p.yPercent)}
                        r={5}
                        fill={s.color}
                        style={{ cursor: 'pointer' }}
                        onClick={() => onOpenSession(p.item)}
                      />
                    ));
                  })
                : null}
            </svg>
          </div>

          {activePoints.length === 0 ? (
            <div className="mt-3 text-sm text-gray-700">No data yet.</div>
          ) : null}
        </div>
      )}

      <SeriesLegendSheet open={legendOpen} onClose={() => setLegendOpen(false)} enabled={seriesEnabled} onChange={onSeriesEnabledChange} />
    </div>
  );
};

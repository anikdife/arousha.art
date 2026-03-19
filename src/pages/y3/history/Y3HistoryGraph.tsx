import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../../auth/AuthProvider';
import { useY3HistoryData } from '../../../hooks/useY3HistoryData';
import { useTopicSessionIndex } from '../../../hooks/useTopicSessionIndex';
import { SessionIndexItem } from '../../../lib/sessionIndexReader';
import { getActiveStudentName, getActiveStudentUid, setActiveStudent } from '../../../lib/activeStudent';
import { loadSessionJsonByStoragePath } from '../../../lib/loadSessionJsonByPath';
import { computeLocalDayRangeMs } from './components/DateRangeSheet';

type Point = { xMillis: number; yPercent: number; item: SessionIndexItem };

type Domain = {
  minX: number;
  maxX: number;
};

type LocalDay = { y: number; m: number; d: number };

type PieSlice = {
  key: string;
  label: string;
  color: string;
  count: number;
  percent: number;
};

function parseLocalDateInput(value: string): LocalDay | null {
  const parts = value.split('-');
  if (parts.length !== 3) return null;
  const y = Number(parts[0]);
  const m = Number(parts[1]);
  const d = Number(parts[2]);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null;
  if (m < 1 || m > 12) return null;
  if (d < 1 || d > 31) return null;
  return { y, m, d };
}

function localDayStartMs(day: LocalDay): number {
  return new Date(day.y, day.m - 1, day.d, 0, 0, 0, 0).getTime();
}

function formatHourLabel(hour: number): string {
  const h = ((hour % 24) + 24) % 24;
  const suffix = h >= 12 ? 'pm' : 'am';
  const base = h % 12;
  const display = base === 0 ? 12 : base;
  return `${display}${suffix}`;
}

function tickLabelForHour(hour: number): string {
  const ticks = new Set([0, 3, 6, 9, 12, 15, 18, 21]);
  return ticks.has(hour) ? formatHourLabel(hour) : '';
}

function tickLabelForHourWide(hour: number): string {
  // Fewer labels when spanning many days.
  const ticks = new Set([0, 6, 12, 18]);
  return ticks.has(hour) ? formatHourLabel(hour) : '';
}

function formatShortDate(ms: number) {
  try {
    return new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}

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

function describeDonutSlice(
  cx: number,
  cy: number,
  rOuter: number,
  rInner: number,
  startAngleRad: number,
  endAngleRad: number
) {
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

function toLocalDateInputValue(date: Date): string {
  const tzOffsetMinutes = date.getTimezoneOffset();
  const local = new Date(date.getTime() - tzOffsetMinutes * 60_000);
  return local.toISOString().slice(0, 10);
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

function toPoints(items: SessionIndexItem[]): Point[] {
  return items
    .map((it) => ({
      xMillis: it.submittedAtMillis ?? toMillis((it as any).submittedAt ?? (it as any).createdAt),
      yPercent: typeof it.score?.percentage === 'number' && Number.isFinite(it.score.percentage) ? it.score.percentage : NaN,
      item: it,
    }))
    .filter((it) => it.xMillis > 0)
    .filter((it) => Number.isFinite(it.yPercent))
    .map((it) => ({ ...it, yPercent: Math.max(0, Math.min(100, it.yPercent)) }))
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

export const Y3HistoryGraph: React.FC<{
  fromDate?: string;
  toDate?: string;
  onDateRangeChange?: (next: { fromDate: string; toDate: string }) => void;
}> = ({ fromDate: controlledFromDate, toDate: controlledToDate, onDateRangeChange }) => {
  const { currentUser, userProfile } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const role = userProfile?.role ?? 'student';
  const isAssessor = role === 'parent' || role === 'teacher' || role === 'owner';

  const today = useMemo(() => toLocalDateInputValue(new Date()), []);
  const [fromDate, setFromDate] = useState<string>(today);
  const [toDate, setToDate] = useState<string>(today);

  const effectiveFromDate = controlledFromDate ?? fromDate;
  const effectiveToDate = controlledToDate ?? toDate;

  const dateRange = useMemo(() => {
    if (!isAssessor) return null;
    return computeLocalDayRangeMs(effectiveFromDate, effectiveToDate);
  }, [effectiveFromDate, effectiveToDate, isAssessor]);

  const fixedTimeWindow = useMemo(() => {
    if (!dateRange) return null;
    const a = parseLocalDateInput(effectiveFromDate);
    const b = parseLocalDateInput(effectiveToDate);
    if (!a || !b) return null;

    const dayMs = 24 * 60 * 60 * 1000;
    const startA = localDayStartMs(a);
    const startB = localDayStartMs(b);
    const start = Math.min(startA, startB);
    const endStart = Math.max(startA, startB);
    const dayCount = Math.round((endStart - start) / dayMs) + 1;
    if (dayCount < 1) return null;

    return {
      startMs: start,
      dayCount,
      endExclusiveMs: start + dayCount * dayMs,
    };
  }, [dateRange, effectiveFromDate, effectiveToDate]);

  const state = (location.state as any) ?? {};
  const stateStudentUid = typeof state.studentUid === 'string' ? state.studentUid : null;
  const stateStudentName = typeof state.studentName === 'string' ? state.studentName : null;

  useEffect(() => {
    if (stateStudentUid) setActiveStudent(stateStudentUid, stateStudentName ?? undefined);
  }, [stateStudentName, stateStudentUid]);

  const studentUid = role === 'student' ? currentUser?.uid ?? undefined : stateStudentUid ?? getActiveStudentUid() ?? undefined;

  const { data, loading, error, refresh } = useY3HistoryData(studentUid);

  // Additional categories (so the combined graph can show all categories, not just numeracy)
  const reading = useTopicSessionIndex({ studentUid, topic: 'reading-magazine', enabled: Boolean(studentUid) });
  const language = useTopicSessionIndex({ studentUid, topic: 'language-conventions', enabled: Boolean(studentUid) });
  const writing = useTopicSessionIndex({ studentUid, topic: 'writing', enabled: Boolean(studentUid) });

  const [openBusyId, setOpenBusyId] = useState<string | null>(null);
  const [openError, setOpenError] = useState<string | null>(null);

  const openSession = useCallback(
    async (item: SessionIndexItem) => {
      setOpenError(null);
      setOpenBusyId(item.sessionId);
      try {
        const sessionJson = await loadSessionJsonByStoragePath(item.storagePath);
        const scoreFromIndex = item.score ?? { correct: 0, total: 0, percentage: 0 };

        const sessionForReview = {
          ...sessionJson,
          sessionId: item.sessionId,
          topic: (sessionJson as any)?.topic ?? item.topic,
          score: (sessionJson as any)?.score ?? scoreFromIndex,
        };

        const topic = item.topic;
        const baseReviewPath =
          topic === 'subtraction'
            ? '/y3/history/review'
            : topic === 'multiplication'
              ? '/y3/history/review/multiplication'
              : topic === 'addition'
                ? '/y3/history/review/addition'
                : topic === 'geometry'
                  ? '/y3/numeracy/geometry'
                  : topic === 'measurement'
                    ? '/y3/numeracy/measurement'
                    : topic === 'data-probability'
                      ? '/y3/numeracy/data-probability'
                      : '/y3/history';

        navigate(baseReviewPath, {
          state:
            topic === 'geometry' || topic === 'measurement' || topic === 'data-probability'
              ? { loadedSession: sessionForReview }
              : { session: sessionForReview, studentUid, studentName: stateStudentName ?? getActiveStudentName() },
        });
      } catch (e) {
        console.error('Failed to open session from graph:', e);
        setOpenError('Failed to open session');
      } finally {
        setOpenBusyId(null);
      }
    },
    [navigate, stateStudentName, studentUid]
  );

  const filterByRange = useMemo(() => {
    if (!dateRange) return null;
    return { start: dateRange.startMs, end: dateRange.endMs };
  }, [dateRange]);

  const filterItems = useCallback(
    (items: SessionIndexItem[]) => {
      if (!filterByRange) return items;
      return items.filter((it) => {
        const ms = it.submittedAtMillis ?? toMillis((it as any).submittedAt ?? (it as any).createdAt);
        return ms >= filterByRange.start && ms <= filterByRange.end;
      });
    },
    [filterByRange]
  );

  const filteredSubtraction = useMemo(() => {
    const items = data?.subtraction ?? [];
    return filterItems(items);
  }, [data?.subtraction, filterItems]);

  const filteredMultiplication = useMemo(() => {
    const items = data?.multiplication ?? [];
    return filterItems(items);
  }, [data?.multiplication, filterItems]);

  const filteredAddition = useMemo(() => {
    const items = data?.addition ?? [];
    return filterItems(items);
  }, [data?.addition, filterItems]);

  const filteredMeasurement = useMemo(() => {
    const items = data?.measurement ?? [];
    return filterItems(items);
  }, [data?.measurement, filterItems]);

  const filteredGeometry = useMemo(() => {
    const items = data?.geometry ?? [];
    return filterItems(items);
  }, [data?.geometry, filterItems]);

  const filteredDataProbability = useMemo(() => {
    const items = data?.dataProbability ?? [];
    return filterItems(items);
  }, [data?.dataProbability, filterItems]);

  const filteredReading = useMemo(() => filterItems(reading.items), [filterItems, reading.items]);
  const filteredLanguage = useMemo(() => filterItems(language.items), [filterItems, language.items]);
  const filteredWriting = useMemo(() => filterItems(writing.items), [filterItems, writing.items]);

  const subtractionPoints = useMemo(() => toPoints(filteredSubtraction), [filteredSubtraction]);
  const multiplicationPoints = useMemo(() => toPoints(filteredMultiplication), [filteredMultiplication]);
  const additionPoints = useMemo(() => toPoints(filteredAddition), [filteredAddition]);
  const measurementPoints = useMemo(() => toPoints(filteredMeasurement), [filteredMeasurement]);
  const geometryPoints = useMemo(() => toPoints(filteredGeometry), [filteredGeometry]);
  const dataProbabilityPoints = useMemo(() => toPoints(filteredDataProbability), [filteredDataProbability]);
  const readingPoints = useMemo(() => toPoints(filteredReading), [filteredReading]);
  const languagePoints = useMemo(() => toPoints(filteredLanguage), [filteredLanguage]);
  const writingPoints = useMemo(() => toPoints(filteredWriting), [filteredWriting]);

  const allPoints = useMemo(
    () => [
      ...subtractionPoints,
      ...multiplicationPoints,
      ...additionPoints,
      ...measurementPoints,
      ...geometryPoints,
      ...dataProbabilityPoints,
      ...readingPoints,
      ...languagePoints,
      ...writingPoints,
    ],
    [
      additionPoints,
      dataProbabilityPoints,
      geometryPoints,
      languagePoints,
      measurementPoints,
      multiplicationPoints,
      readingPoints,
      subtractionPoints,
      writingPoints,
    ]
  );
  const domain = useMemo(() => {
    if (fixedTimeWindow) {
      return { minX: fixedTimeWindow.startMs, maxX: fixedTimeWindow.endExclusiveMs };
    }
    return computeDomain(allPoints);
  }, [allPoints, fixedTimeWindow]);

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

  const makeSmoothPath = (pts: Point[]) => {
    if (pts.length === 0) return '';
    if (pts.length === 1) {
      const p = pts[0];
      return `M ${xToSvg(p.xMillis)} ${yToSvg(p.yPercent)}`;
    }
    if (pts.length === 2) {
      const a = pts[0];
      const b = pts[1];
      return `M ${xToSvg(a.xMillis)} ${yToSvg(a.yPercent)} L ${xToSvg(b.xMillis)} ${yToSvg(b.yPercent)}`;
    }

    const xy = pts.map((p) => ({ x: xToSvg(p.xMillis), y: yToSvg(p.yPercent) }));
    let d = `M ${xy[0].x} ${xy[0].y}`;
    for (let i = 0; i < xy.length - 1; i++) {
      const p0 = i === 0 ? xy[0] : xy[i - 1];
      const p1 = xy[i];
      const p2 = xy[i + 1];
      const p3 = i + 2 < xy.length ? xy[i + 2] : xy[xy.length - 1];

      // Catmull–Rom to cubic Bézier (uniform parameterization)
      const cp1x = p1.x + (p2.x - p0.x) / 6;
      const cp1y = p1.y + (p2.y - p0.y) / 6;
      const cp2x = p2.x - (p3.x - p1.x) / 6;
      const cp2y = p2.y - (p3.y - p1.y) / 6;

      d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
    }
    return d;
  };

  const xTicks: Array<{ x: number; label: string }> = [];
  let xGridPath = '';
  let xGridEmphasisPath = '';
  if (fixedTimeWindow) {
    const hoursTotal = fixedTimeWindow.dayCount * 24;
    const start = fixedTimeWindow.startMs;
    const hourMs = 60 * 60 * 1000;

    const useWideLabels = fixedTimeWindow.dayCount > 2;

    for (let i = 0; i <= hoursTotal; i++) {
      const ms = start + i * hourMs;
      const x = xToSvg(ms);
      const isDayBoundary = i % 24 === 0;

      const y1 = pad.top;
      const y2 = pad.top + plotH;
      if (isDayBoundary) {
        xGridEmphasisPath += `M ${x} ${y1} L ${x} ${y2} `;
      } else {
        xGridPath += `M ${x} ${y1} L ${x} ${y2} `;
      }

      const hourOfDay = i % 24;
      const label = useWideLabels ? tickLabelForHourWide(hourOfDay) : tickLabelForHour(hourOfDay);
      if (!label) continue;
      xTicks.push({ x, label });
    }
  } else {
    const tickCount = 5; // >= 4 ticks
    for (let i = 0; i < tickCount; i++) {
      const t = i / (tickCount - 1);
      const ms = domain.minX + t * (domain.maxX - domain.minX);
      xTicks.push({ x: xToSvg(ms), label: formatShortDate(ms) });
    }
  }

  const yTicks = [0, 25, 50, 75, 100].map((v) => ({ v, y: yToSvg(v) }));

  const missingSub = subtractionPoints.length === 0;
  const missingMul = multiplicationPoints.length === 0;
  const missingAdd = additionPoints.length === 0;
  const missingMeasure = measurementPoints.length === 0;
  const missingGeo = geometryPoints.length === 0;
  const missingDataProb = dataProbabilityPoints.length === 0;
  const missingRead = readingPoints.length === 0;
  const missingLang = languagePoints.length === 0;
  const missingWrite = writingPoints.length === 0;

  const pieSlices = useMemo((): PieSlice[] => {
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
    const slices = raw.map((s) => ({
      ...s,
      percent: total > 0 ? (s.count / total) * 100 : 0,
    }));

    // Order by share (largest first) for readability.
    return slices.sort((a, b) => b.percent - a.percent);
  }, [
    filteredAddition.length,
    filteredDataProbability.length,
    filteredGeometry.length,
    filteredLanguage.length,
    filteredMeasurement.length,
    filteredMultiplication.length,
    filteredReading.length,
    filteredSubtraction.length,
    filteredWriting.length,
  ]);

  const pieTotal = useMemo(() => pieSlices.reduce((sum, s) => sum + s.count, 0), [pieSlices]);
  const zeroPieSlices = useMemo(() => pieSlices.filter((s) => s.count === 0), [pieSlices]);

  const pieRangeLabel = useMemo(() => {
    const a = parseLocalDateInput(effectiveFromDate);
    const b = parseLocalDateInput(effectiveToDate);
    if (!a || !b) return '';
    const aMs = localDayStartMs(a);
    const bMs = localDayStartMs(b);
    const start = Math.min(aMs, bMs);
    const end = Math.max(aMs, bMs);
    return `${formatShortDate(start)} – ${formatShortDate(end)}`;
  }, [effectiveFromDate, effectiveToDate]);

  return (
    <div className="w-full">
      <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-lg font-bold text-gray-900">Combined Progress</div>
            <div className="text-sm text-gray-600">Score percentage over time</div>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-3">
            {isAssessor && (
              <div className="flex flex-wrap items-center gap-2">
                <div className="text-xs font-semibold text-gray-700">From</div>
                <input
                  type="date"
                  value={effectiveFromDate}
                  onChange={(e) => {
                    const next = e.target.value;
                    if (onDateRangeChange) {
                      onDateRangeChange({ fromDate: next, toDate: effectiveToDate });
                    } else {
                      setFromDate(next);
                    }
                  }}
                  className="px-2 py-1 rounded-lg border border-gray-300 bg-white text-sm"
                />
                <div className="text-xs font-semibold text-gray-700">To</div>
                <input
                  type="date"
                  value={effectiveToDate}
                  onChange={(e) => {
                    const next = e.target.value;
                    if (onDateRangeChange) {
                      onDateRangeChange({ fromDate: effectiveFromDate, toDate: next });
                    } else {
                      setToDate(next);
                    }
                  }}
                  className="px-2 py-1 rounded-lg border border-gray-300 bg-white text-sm"
                />
              </div>
            )}
            <button
              type="button"
              onClick={refresh}
              className="px-3 py-2 text-sm font-semibold rounded-lg bg-gray-100 text-gray-800 hover:bg-gray-200"
            >
              Refresh
            </button>
          </div>
        </div>

        {userProfile?.role !== 'student' && !studentUid && (
          <div className="mt-6 text-sm text-gray-700 bg-yellow-50 border border-yellow-200 rounded-lg p-3">
            No student selected. Go back to the parent dashboard and click “View Practice Sessions” for a child.
          </div>
        )}

        {userProfile?.role !== 'student' && studentUid && (
          <div className="mt-3 text-xs text-gray-500">
            Viewing: {stateStudentName ?? getActiveStudentName() ?? 'Selected student'}
          </div>
        )}

        {loading && (
          <div className="mt-6 flex items-center justify-center py-10">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600" />
          </div>
        )}

        {!loading && error && (
          <div className="mt-6 bg-red-50 border border-red-200 rounded-xl p-4">
            <div className="text-red-800 font-medium">{error}</div>
          </div>
        )}

        {!loading && !error && openError && (
          <div className="mt-6 bg-red-50 border border-red-200 rounded-xl p-4">
            <div className="text-red-800 font-medium">{openError}</div>
          </div>
        )}

        {!loading && !error && (
          <div className="mt-6">
            <div className="flex flex-col gap-4 lg:flex lg:flex-row lg:items-start">
              <div className="min-w-0 lg:basis-[55%] lg:flex-none">
                <div className="w-full overflow-hidden rounded-xl border border-gray-200 bg-white h-[60vh] max-h-[520px] flex flex-col">
                  <div className="flex-1 min-h-0">
                    <svg
                      className="w-full h-full"
                      viewBox={`0 0 ${viewW} ${viewH}`}
                      preserveAspectRatio="xMidYMid meet"
                    >
                {/* Axes */}
                <line x1={pad.left} y1={pad.top} x2={pad.left} y2={pad.top + plotH} stroke="#111827" strokeWidth={1} />
                <line x1={pad.left} y1={pad.top + plotH} x2={pad.left + plotW} y2={pad.top + plotH} stroke="#111827" strokeWidth={1} />

                {/* X grid (hour divisions for fixed-day ranges) */}
                {xGridPath && <path d={xGridPath} stroke="#E5E7EB" strokeWidth={1} fill="none" />}
                {xGridEmphasisPath && <path d={xGridEmphasisPath} stroke="#9CA3AF" strokeWidth={2} fill="none" />}

                {/* Y ticks + grid */}
                {yTicks.map((t) => (
                  <g key={t.v}>
                    <line x1={pad.left} y1={t.y} x2={pad.left + plotW} y2={t.y} stroke="#E5E7EB" strokeWidth={1} />
                    <text x={pad.left - 10} y={t.y + 4} textAnchor="end" fontSize={12} fill="#374151">
                      {t.v}%
                    </text>
                  </g>
                ))}

                {/* X ticks */}
                {xTicks.map((t, idx) => (
                  <g key={`${t.label}-${idx}`}>
                    <line x1={t.x} y1={pad.top + plotH} x2={t.x} y2={pad.top + plotH + 6} stroke="#111827" strokeWidth={1} />
                    <text x={t.x} y={pad.top + plotH + 26} textAnchor="middle" fontSize={12} fill="#374151">
                      {t.label}
                    </text>
                  </g>
                ))}

                {/* Lines */}
                {subtractionPoints.length > 0 && (
                  <path
                    fill="none"
                    stroke="#2563EB" /* blue-600 */
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d={makeSmoothPath(subtractionPoints)}
                  />
                )}
                {multiplicationPoints.length > 0 && (
                  <path
                    fill="none"
                    stroke="#16A34A" /* green-600 */
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d={makeSmoothPath(multiplicationPoints)}
                  />
                )}
                {additionPoints.length > 0 && (
                  <path
                    fill="none"
                    stroke="#9333EA" /* purple-600 */
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d={makeSmoothPath(additionPoints)}
                  />
                )}

                {measurementPoints.length > 0 && (
                  <path
                    fill="none"
                    stroke="#0D9488" /* teal-600 */
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d={makeSmoothPath(measurementPoints)}
                  />
                )}

                {geometryPoints.length > 0 && (
                  <path
                    fill="none"
                    stroke="#374151" /* gray-700 */
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d={makeSmoothPath(geometryPoints)}
                  />
                )}

                {dataProbabilityPoints.length > 0 && (
                  <path
                    fill="none"
                    stroke="#0891B2" /* cyan-600 */
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d={makeSmoothPath(dataProbabilityPoints)}
                  />
                )}

                {readingPoints.length > 0 && (
                  <path
                    fill="none"
                    stroke="#059669" /* emerald-600 */
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d={makeSmoothPath(readingPoints)}
                  />
                )}

                {languagePoints.length > 0 && (
                  <path
                    fill="none"
                    stroke="#F59E0B" /* amber-500 */
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d={makeSmoothPath(languagePoints)}
                  />
                )}

                {writingPoints.length > 0 && (
                  <path
                    fill="none"
                    stroke="#DC2626" /* red-600 */
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d={makeSmoothPath(writingPoints)}
                  />
                )}

                {/* Optional points */}
                {subtractionPoints.map((p) => (
                  <circle
                    key={`s-${p.item.sessionId}`}
                    cx={xToSvg(p.xMillis)}
                    cy={yToSvg(p.yPercent)}
                    r={10}
                    fill="transparent"
                    style={{ cursor: openBusyId ? 'wait' : 'pointer' }}
                    onClick={() => (openBusyId ? undefined : void openSession(p.item))}
                  >
                    <title>Open Subtraction session</title>
                  </circle>
                ))}
                {multiplicationPoints.map((p) => (
                  <circle
                    key={`m-${p.item.sessionId}`}
                    cx={xToSvg(p.xMillis)}
                    cy={yToSvg(p.yPercent)}
                    r={10}
                    fill="transparent"
                    style={{ cursor: openBusyId ? 'wait' : 'pointer' }}
                    onClick={() => (openBusyId ? undefined : void openSession(p.item))}
                  >
                    <title>Open Multiplication session</title>
                  </circle>
                ))}
                {additionPoints.map((p) => (
                  <circle
                    key={`a-${p.item.sessionId}`}
                    cx={xToSvg(p.xMillis)}
                    cy={yToSvg(p.yPercent)}
                    r={10}
                    fill="transparent"
                    style={{ cursor: openBusyId ? 'wait' : 'pointer' }}
                    onClick={() => (openBusyId ? undefined : void openSession(p.item))}
                  >
                    <title>Open Addition session</title>
                  </circle>
                ))}
                {measurementPoints.map((p) => (
                  <circle
                    key={`me-${p.item.sessionId}`}
                    cx={xToSvg(p.xMillis)}
                    cy={yToSvg(p.yPercent)}
                    r={10}
                    fill="transparent"
                    style={{ cursor: openBusyId ? 'wait' : 'pointer' }}
                    onClick={() => (openBusyId ? undefined : void openSession(p.item))}
                  >
                    <title>Open Measurement session</title>
                  </circle>
                ))}
                {geometryPoints.map((p) => (
                  <circle
                    key={`g-${p.item.sessionId}`}
                    cx={xToSvg(p.xMillis)}
                    cy={yToSvg(p.yPercent)}
                    r={10}
                    fill="transparent"
                    style={{ cursor: openBusyId ? 'wait' : 'pointer' }}
                    onClick={() => (openBusyId ? undefined : void openSession(p.item))}
                  >
                    <title>Open Geometry session</title>
                  </circle>
                ))}

                {dataProbabilityPoints.map((p) => (
                  <circle
                    key={`dp-${p.item.sessionId}`}
                    cx={xToSvg(p.xMillis)}
                    cy={yToSvg(p.yPercent)}
                    r={10}
                    fill="transparent"
                    style={{ cursor: openBusyId ? 'wait' : 'pointer' }}
                    onClick={() => (openBusyId ? undefined : void openSession(p.item))}
                  >
                    <title>Open Data &amp; Probability session</title>
                  </circle>
                ))}

                {readingPoints.map((p) => (
                  <circle
                    key={`r-${p.item.sessionId}`}
                    cx={xToSvg(p.xMillis)}
                    cy={yToSvg(p.yPercent)}
                    r={6}
                    fill="transparent"
                  >
                    <title>Reading session</title>
                  </circle>
                ))}

                {languagePoints.map((p) => (
                  <circle
                    key={`l-${p.item.sessionId}`}
                    cx={xToSvg(p.xMillis)}
                    cy={yToSvg(p.yPercent)}
                    r={6}
                    fill="transparent"
                  >
                    <title>Language Conventions session</title>
                  </circle>
                ))}

                {writingPoints.map((p) => (
                  <circle
                    key={`w-${p.item.sessionId}`}
                    cx={xToSvg(p.xMillis)}
                    cy={yToSvg(p.yPercent)}
                    r={6}
                    fill="transparent"
                  >
                    <title>Writing session</title>
                  </circle>
                ))}

                {/* Empty state messages */}
                {allPoints.length === 0 && (
                  <text x={viewW / 2} y={viewH / 2} textAnchor="middle" fontSize={16} fill="#6B7280">
                    No sessions for the selected date range.
                  </text>
                )}

                {allPoints.length > 0 &&
                  (missingSub ||
                    missingMul ||
                    missingAdd ||
                    missingMeasure ||
                    missingGeo ||
                    missingDataProb ||
                    missingRead ||
                    missingLang ||
                    missingWrite) && (
                  <text x={pad.left + 10} y={pad.top + 22} textAnchor="start" fontSize={14} fill="#6B7280">
                    {(() => {
                      const missing: string[] = [];
                      if (missingSub) missing.push('Subtraction');
                      if (missingAdd) missing.push('Addition');
                      if (missingMul) missing.push('Multiplication');
                      if (missingMeasure) missing.push('Measurement');
                      if (missingGeo) missing.push('Geometry');
                      if (missingDataProb) missing.push('Data & Probability');
                      if (missingRead) missing.push('Reading');
                      if (missingLang) missing.push('Language Conventions');
                      if (missingWrite) missing.push('Writing');
                      if (missing.length === 9) return 'No data yet.';
                      return `No data for: ${missing.join(', ')}.`;
                    })()}
                  </text>
                )}
                    </svg>
                  </div>

                  <div className="border-t border-gray-200 px-4 py-3">
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-gray-800">
                      <span className="inline-flex items-center gap-2">
                        <span className="inline-block w-6 h-[3px] bg-blue-600 rounded" />
                        <span>Subtraction</span>
                      </span>
                      <span className="inline-flex items-center gap-2">
                        <span className="inline-block w-6 h-[3px] bg-purple-600 rounded" />
                        <span>Addition</span>
                      </span>
                      <span className="inline-flex items-center gap-2">
                        <span className="inline-block w-6 h-[3px] bg-green-600 rounded" />
                        <span>Multiplication</span>
                      </span>
                      <span className="inline-flex items-center gap-2">
                        <span className="inline-block w-6 h-[3px] bg-teal-600 rounded" />
                        <span>Measurement</span>
                      </span>
                      <span className="inline-flex items-center gap-2">
                        <span className="inline-block w-6 h-[3px] bg-gray-700 rounded" />
                        <span>Geometry</span>
                      </span>
                      <span className="inline-flex items-center gap-2">
                        <span className="inline-block w-6 h-[3px] bg-cyan-600 rounded" />
                        <span>Data &amp; Probability</span>
                      </span>
                      <span className="inline-flex items-center gap-2">
                        <span className="inline-block w-6 h-[3px] bg-emerald-600 rounded" />
                        <span>Reading</span>
                      </span>
                      <span className="inline-flex items-center gap-2">
                        <span className="inline-block w-6 h-[3px] bg-amber-500 rounded" />
                        <span>Language Conventions</span>
                      </span>
                      <span className="inline-flex items-center gap-2">
                        <span className="inline-block w-6 h-[3px] bg-red-600 rounded" />
                        <span>Writing</span>
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="min-w-0 w-full lg:basis-[45%] lg:flex-none">
                <div className="w-full overflow-hidden rounded-xl border border-gray-200 bg-white p-4">
                  <div className="text-sm font-bold text-gray-900">Category Share</div>
                  <div className="text-xs text-gray-600">% of sessions in selected date range</div>

                  <div className="mt-4 flex items-center justify-center">
                    {pieTotal > 0 ? (
                      <svg className="w-full h-auto" viewBox="0 0 560 400" role="img" aria-label="Session share donut chart">
                        {(() => {
                          const cx = 280;
                          const cy = 175;
                          const rOuter = 115;
                          const rInner = 52;
                          const depth = 26;
                          const startAt = -Math.PI / 2;
                          let angle = startAt;

                          const nonZero = pieSlices.filter((s) => s.count > 0);

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
                            const frac = clamp01(s.count / pieTotal);
                            const sweep = frac * Math.PI * 2;
                            const start = angle;
                            const end = angle + sweep;
                            angle = end;

                            const topD = describeDonutSlice(cx, cy, rOuter, rInner, start, end);
                            const botD = describeDonutSlice(cx, cy + depth, rOuter, rInner, start, end);
                            return {
                              s,
                              start,
                              end,
                              mid: (start + end) / 2,
                              frac,
                              topD,
                              botD,
                            };
                          });

                          return (
                            <g>
                              {/* shadow */}
                              <ellipse cx={cx} cy={cy + depth + 18} rx={130} ry={26} fill="#111827" opacity={0.12} />

                              {/* bottom (depth) */}
                              {geoms.map((g) => (
                                <path key={`bot-${g.s.key}`} d={g.botD} fill={darkenHex(g.s.color, 0.72)} stroke="none" />
                              ))}

                              {/* top */}
                              {geoms.map((g) => (
                                <path key={`top-${g.s.key}`} d={g.topD} fill={g.s.color} stroke="#FFFFFF" strokeWidth={2}>
                                  <title>
                                    {g.s.label}: {Math.round(g.s.percent)}% ({g.s.count} sessions)
                                  </title>
                                </path>
                              ))}

                              {/* percent labels on slices */}
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

                              {/* callouts */}
                              {geoms.map((g) => {
                                const anchor = polarToCartesian(cx, cy, rOuter + 4, g.mid);
                                const elbow = polarToCartesian(cx, cy, rOuter + 34, g.mid);
                                const onRight = Math.cos(g.mid) >= 0;
                                const endX = onRight ? 520 : 40;
                                const endY = elbow.y;
                                const textX = onRight ? endX - 2 : endX + 2;
                                const textAnchor = onRight ? 'end' : 'start';

                                return (
                                  <g key={`callout-${g.s.key}`}>
                                    <path
                                      d={`M ${anchor.x} ${anchor.y} L ${elbow.x} ${elbow.y} L ${endX} ${endY}`}
                                      fill="none"
                                      stroke="#60A5FA"
                                      strokeWidth={2}
                                    />
                                    <text
                                      x={textX}
                                      y={endY - 6}
                                      textAnchor={textAnchor}
                                      fontSize={14}
                                      fontWeight={700}
                                      fill="#1F2937"
                                    >
                                      {g.s.label}
                                    </text>
                                  </g>
                                );
                              })}
                            </g>
                          );
                        })()}
                      </svg>
                    ) : (
                      <div className="text-sm text-gray-600">No sessions for {pieRangeLabel || 'the selected date range'}.</div>
                    )}
                  </div>

                  {pieTotal > 0 && zeroPieSlices.length > 0 && (
                    <div className="mt-3 text-xs text-gray-700">
                      <span className="font-semibold">0%:</span> {zeroPieSlices.map((s) => s.label).join(', ')}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

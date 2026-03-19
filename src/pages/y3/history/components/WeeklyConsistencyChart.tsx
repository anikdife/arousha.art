import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { SessionIndexItem } from '../../../../lib/sessionIndexReader';
import { aggregateByWeekday, type WeeklyMetric } from '../utils/aggregateByWeekday';

type ActiveBar = {
  index: number;
  label: string;
  value: number;
  metric: WeeklyMetric;
} | null;

function formatMetric(value: number, metric: WeeklyMetric): string {
  if (metric === 'minutes') {
    const rounded = Math.round(value);
    return `${rounded} min`;
  }
  return `${Math.round(value)} sessions`;
}

function formatLocalDateShort(date: Date): string {
  try {
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
}

function computeLocalWeekRangeMs(anchorMs: number): { startMs: number; endMs: number } {
  const d = new Date(anchorMs);
  const jsDay = d.getDay(); // Sun=0..Sat=6
  const mondayIndex = ((jsDay % 7) + 6) % 7; // Mon=0..Sun=6

  const weekStart = new Date(d.getFullYear(), d.getMonth(), d.getDate() - mondayIndex, 0, 0, 0, 0);
  const weekEnd = new Date(d.getFullYear(), d.getMonth(), d.getDate() + (6 - mondayIndex), 23, 59, 59, 999);
  return { startMs: weekStart.getTime(), endMs: weekEnd.getTime() };
}

export const WeeklyConsistencyChart: React.FC<{
  sessions: SessionIndexItem[];
}> = ({ sessions }) => {
  const navigate = useNavigate();

  // Snap to a real local week (Mon–Sun), anchored to the current range end.
  const [weekAnchorMs, setWeekAnchorMs] = useState<number>(() => Date.now());
  const weekRange = useMemo(() => computeLocalWeekRangeMs(weekAnchorMs), [weekAnchorMs]);

  const weekLabel = useMemo(() => {
    const start = new Date(weekRange.startMs);
    const end = new Date(weekRange.endMs);
    return `${formatLocalDateShort(start)} – ${formatLocalDateShort(end)}`;
  }, [weekRange.endMs, weekRange.startMs]);

  const shiftWeek = (direction: -1 | 1) => {
    const dayMs = 24 * 60 * 60 * 1000;
    setWeekAnchorMs(weekRange.startMs + direction * 7 * dayMs);
  };

  const agg = useMemo(
    () => aggregateByWeekday({ sessions, rangeStartMs: weekRange.startMs, rangeEndMs: weekRange.endMs }),
    [sessions, weekRange.endMs, weekRange.startMs]
  );

  const [metric, setMetric] = useState<WeeklyMetric>('sessions');
  const [active, setActive] = useState<ActiveBar>(null);
  const [animate, setAnimate] = useState(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => setAnimate(true));
    return () => cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
    // If switching to minutes but there's no duration data, fall back.
    if (metric === 'minutes' && !agg.hasDuration) setMetric('sessions');
  }, [agg.hasDuration, metric]);

  const values = metric === 'minutes' ? agg.minutesValues : agg.values;
  const totalSessions = useMemo(() => agg.values.reduce((a, b) => a + b, 0), [agg.values]);
  const max = useMemo(() => Math.max(0, ...values), [values]);

  const viewW = 700;
  const viewH = 260;
  const pad = { top: 20, right: 16, bottom: 46, left: 44 };
  const plotW = viewW - pad.left - pad.right;
  const plotH = viewH - pad.top - pad.bottom;

  const slotW = plotW / 7;
  const barW = slotW * 0.62;

  const yForValue = (v: number) => {
    if (max <= 0) return pad.top + plotH;
    const t = Math.max(0, Math.min(1, v / max));
    return pad.top + (1 - t) * plotH;
  };

  const barHeight = (v: number) => {
    const y = yForValue(v);
    return pad.top + plotH - y;
  };

  const yTickMid = max > 0 ? Math.round(max / 2) : 0;

  const showTooltip = (idx: number) => {
    const label = agg.labels[idx];
    const value = values[idx] ?? 0;
    setActive({ index: idx, label, value, metric });
  };

  const hideTooltip = () => setActive(null);

  const tooltipPos = useMemo(() => {
    if (!active) return null;
    const idx = active.index;
    const v = active.value;
    const xCenter = pad.left + idx * slotW + slotW / 2;
    const yTop = yForValue(v);
    return {
      leftPct: (xCenter / viewW) * 100,
      topPct: (yTop / viewH) * 100,
    };
  }, [active, slotW, viewW, viewH, max]);

  if (totalSessions === 0) {
    return (
      <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-5">
        <div className="text-lg font-bold text-gray-900">Weekly Study Consistency</div>
        <div className="text-sm text-gray-600">How often your child studies on each day of the week</div>
        <div className="mt-1 flex items-center justify-between gap-3">
          <div className="text-xs text-gray-500">Week: {weekLabel}</div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => shiftWeek(-1)}
              className="px-2 py-1 text-xs font-semibold rounded-md bg-gray-100 text-gray-800 hover:bg-gray-200"
              aria-label="Previous week"
            >
              Prev
            </button>
            <button
              type="button"
              onClick={() => shiftWeek(1)}
              className="px-2 py-1 text-xs font-semibold rounded-md bg-gray-100 text-gray-800 hover:bg-gray-200"
              aria-label="Next week"
            >
              Next
            </button>
          </div>
        </div>

        <div className="mt-5 text-sm text-gray-700">No study sessions in this date range.</div>
        <button
          type="button"
          onClick={() => navigate('/y3')}
          className="mt-4 px-4 py-2 text-sm font-semibold rounded-lg bg-purple-600 text-white hover:bg-purple-700"
        >
          Start practice
        </button>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-lg font-bold text-gray-900">Weekly Study Consistency</div>
          <div className="text-sm text-gray-600">How often your child studies on each day of the week</div>
          <div className="mt-1 flex items-center justify-between gap-3">
            <div className="text-xs text-gray-500">Week: {weekLabel}</div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => shiftWeek(-1)}
                className="px-2 py-1 text-xs font-semibold rounded-md bg-gray-100 text-gray-800 hover:bg-gray-200"
                aria-label="Previous week"
              >
                Prev
              </button>
              <button
                type="button"
                onClick={() => shiftWeek(1)}
                className="px-2 py-1 text-xs font-semibold rounded-md bg-gray-100 text-gray-800 hover:bg-gray-200"
                aria-label="Next week"
              >
                Next
              </button>
            </div>
          </div>
          <div className="text-xs text-gray-500 mt-1">Taller bars = more sessions</div>
        </div>

        {agg.hasDuration && (
          <div className="flex items-center gap-1 rounded-lg bg-gray-100 p-1">
            <button
              type="button"
              onClick={() => setMetric('sessions')}
              className={
                metric === 'sessions'
                  ? 'px-3 py-1 text-xs font-semibold rounded-md bg-gray-900 text-white'
                  : 'px-3 py-1 text-xs font-semibold rounded-md text-gray-800 hover:bg-gray-200'
              }
            >
              Sessions
            </button>
            <button
              type="button"
              onClick={() => setMetric('minutes')}
              className={
                metric === 'minutes'
                  ? 'px-3 py-1 text-xs font-semibold rounded-md bg-gray-900 text-white'
                  : 'px-3 py-1 text-xs font-semibold rounded-md text-gray-800 hover:bg-gray-200'
              }
            >
              Minutes
            </button>
          </div>
        )}
      </div>

      <div className="mt-5 relative">
        {active && tooltipPos && (
          <div
            className="absolute z-10 px-3 py-2 rounded-lg bg-gray-900 text-white text-xs shadow-lg pointer-events-none"
            style={{ left: `${tooltipPos.leftPct}%`, top: `${tooltipPos.topPct}%`, transform: 'translate(-50%, -110%)' }}
            role="status"
            aria-live="polite"
          >
            {active.label}: {formatMetric(active.value, active.metric)}
          </div>
        )}

        <div className="w-full overflow-hidden rounded-xl border border-gray-200 bg-white">
          <svg
            className="w-full h-[220px] sm:h-[200px]"
            viewBox={`0 0 ${viewW} ${viewH}`}
            preserveAspectRatio="xMidYMid meet"
          >
            {/* baseline */}
            <line
              x1={pad.left}
              y1={pad.top + plotH}
              x2={pad.left + plotW}
              y2={pad.top + plotH}
              stroke="#111827"
              strokeWidth={1}
            />

            {/* y labels: 0, mid, max */}
            {[0, yTickMid, max].map((tick) => {
              const y = yForValue(tick);
              return (
                <g key={`yt-${tick}`}>
                  <line x1={pad.left} y1={y} x2={pad.left + plotW} y2={y} stroke="#E5E7EB" strokeWidth={1} />
                  <text x={pad.left - 10} y={y + 4} textAnchor="end" fontSize={12} fill="#374151">
                    {tick}
                  </text>
                </g>
              );
            })}

            {values.map((v, idx) => {
              const x = pad.left + idx * slotW + (slotW - barW) / 2;
              const y = yForValue(v);
              const h = barHeight(v);

              const ariaDay = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'][idx] ?? agg.labels[idx];
              const aria = `${ariaDay}: ${formatMetric(v, metric)}`;

              return (
                <g key={`bar-${idx}`}>
                  {/* bar */}
                  <rect
                    x={x}
                    y={pad.top}
                    width={barW}
                    height={plotH}
                    fill="#7C3AED"
                    opacity={0.1}
                    rx={8}
                  />
                  <rect
                    x={x}
                    y={y}
                    width={barW}
                    height={h}
                    fill="#7C3AED"
                    rx={8}
                    role="button"
                    tabIndex={0}
                    aria-label={aria}
                    onMouseEnter={() => showTooltip(idx)}
                    onMouseLeave={hideTooltip}
                    onFocus={() => showTooltip(idx)}
                    onBlur={hideTooltip}
                    onClick={() => {
                      setActive((prev) => {
                        if (prev?.index === idx && prev.metric === metric) return null;
                        return { index: idx, label: agg.labels[idx], value: v, metric };
                      });
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        showTooltip(idx);
                      }
                    }}
                    style={{
                      transformBox: 'fill-box',
                      transformOrigin: 'center bottom',
                      transform: animate ? 'scaleY(1)' : 'scaleY(0)',
                      transition: 'transform 650ms ease-out',
                      cursor: 'pointer',
                      outline: 'none',
                    }}
                  />

                  {/* x label */}
                  <text
                    x={pad.left + idx * slotW + slotW / 2}
                    y={pad.top + plotH + 28}
                    textAnchor="middle"
                    fontSize={12}
                    fill="#374151"
                  >
                    {agg.labels[idx]}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
      </div>
    </div>
  );
};

import React, { useId, useMemo, useState } from 'react';
import type { SessionIndexItem } from '../../../../lib/sessionIndexReader';
import { defaultStudyTimeCategories, type StudyTimeCategory, type StudyTimeCategoryKey } from '../utils/aggregateStudyTime';
import { computeLocalDayRangeMs } from './DateRangeSheet';

type ActiveCell = {
  category: StudyTimeCategory;
  whenLabel: string;
  scoreLabel?: string;
  sessionId: string;
} | null;

function toMillis(value: any): number {
  if (!value) return 0;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
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

function toLocalDateInputValue(date: Date): string {
  const tzOffsetMinutes = date.getTimezoneOffset();
  const local = new Date(date.getTime() - tzOffsetMinutes * 60_000);
  return local.toISOString().slice(0, 10);
}

function formatHourLabel(hour: number): string {
  // 0 -> 12am, 12 -> 12pm, 13 -> 1pm
  const h = hour % 24;
  const suffix = h >= 12 ? 'pm' : 'am';
  const base = h % 12;
  const display = base === 0 ? 12 : base;
  return `${display}${suffix}`;
}

function formatHourRange(hour: number): string {
  const start = formatHourLabel(hour);
  const end = formatHourLabel((hour + 1) % 24);
  return `${start}–${end}`;
}

function scoreToDotColorClass(scorePercent: number | null): string {
  if (scorePercent == null || !Number.isFinite(scorePercent)) return 'bg-slate-500/60';
  const s = Math.max(0, Math.min(100, scorePercent));
  // Quantized ramp (Tailwind tokens only): 0% (red) → 100% (green)
  if (s >= 90) return 'bg-green-600/80';
  if (s >= 80) return 'bg-green-500/80';
  if (s >= 70) return 'bg-lime-500/80';
  if (s >= 60) return 'bg-yellow-400/80';
  if (s >= 50) return 'bg-amber-400/80';
  if (s >= 40) return 'bg-orange-500/80';
  if (s >= 30) return 'bg-orange-600/80';
  if (s >= 20) return 'bg-red-500/80';
  return 'bg-red-600/80';
}

function tickLabelForHour(hour: number): string {
  // 3-hour ticks across the day: 12am, 3am, 6am, 9am, 12pm, 3pm, 6pm, 9pm
  const ticks = new Set([0, 3, 6, 9, 12, 15, 18, 21]);
  return ticks.has(hour) ? formatHourLabel(hour) : '';
}

export const StudyTimeHeatmap: React.FC<{
  sessions: SessionIndexItem[];
  categories?: StudyTimeCategory[];
  startHourInclusive?: number;
  endHourInclusive?: number;
  showDateRangeControls?: boolean;
  fromDate?: string;
  toDate?: string;
  onDateRangeChange?: (next: { fromDate: string; toDate: string }) => void;
}> = ({
  sessions,
  categories = defaultStudyTimeCategories(),
  startHourInclusive = 0,
  endHourInclusive = 23,
  showDateRangeControls = false,
  fromDate: controlledFromDate,
  toDate: controlledToDate,
  onDateRangeChange,
}) => {
  const tooltipId = useId();

  const today = useMemo(() => toLocalDateInputValue(new Date()), []);
  const [fromDate, setFromDate] = useState<string>(today);
  const [toDate, setToDate] = useState<string>(today);

  const effectiveFromDate = controlledFromDate ?? fromDate;
  const effectiveToDate = controlledToDate ?? toDate;

  const dateRange = useMemo(() => {
    if (!showDateRangeControls) return null;
    return computeLocalDayRangeMs(effectiveFromDate, effectiveToDate);
  }, [effectiveFromDate, effectiveToDate, showDateRangeControls]);

  const sessionsInDateRange = useMemo(() => {
    if (!dateRange) return sessions;
    const { startMs, endMs } = dateRange;
    return sessions.filter((it) => {
      const ms = (it as any).submittedAtMillis ?? toMillis((it as any).submittedAt ?? (it as any).createdAt);
      if (!ms) return true;
      return ms >= startMs && ms <= endMs;
    });
  }, [dateRange, sessions]);

  const [active, setActive] = useState<ActiveCell>(null);

  const hours = useMemo(() => {
    const start = Math.max(0, Math.min(23, startHourInclusive));
    const end = Math.max(0, Math.min(23, endHourInclusive));
    const a = Math.min(start, end);
    const b = Math.max(start, end);
    const out: number[] = [];
    for (let h = a; h <= b; h++) out.push(h);
    return out;
  }, [endHourInclusive, startHourInclusive]);

  const rangeStartMin = useMemo(() => (hours[0] ?? 0) * 60, [hours]);
  const rangeEndMinExclusive = useMemo(() => ((hours[hours.length - 1] ?? 23) + 1) * 60, [hours]);
  const rangeMinutes = useMemo(() => Math.max(1, rangeEndMinExclusive - rangeStartMin), [rangeEndMinExclusive, rangeStartMin]);

  const timelineWidthRem = useMemo(() => hours.length * 2.25, [hours.length]);

  const timelineWidthRemWide = useMemo(() => hours.length * 3.0, [hours.length]);

  const hourLinePercents = useMemo(() => {
    return hours.map((h) => ((h * 60 - rangeStartMin) / rangeMinutes) * 100);
  }, [hours, rangeMinutes, rangeStartMin]);

  const sessionsByCategory = useMemo(() => {
    const allowed = new Set(categories.map((c) => c.key));
    const by = new Map<StudyTimeCategoryKey, SessionIndexItem[]>();
    for (const cat of categories) by.set(cat.key, []);

    for (const it of sessionsInDateRange) {
      const topic = it.topic as unknown as StudyTimeCategoryKey;
      if (!allowed.has(topic)) continue;
      const ms = (it as any).submittedAtMillis ?? toMillis((it as any).submittedAt ?? (it as any).createdAt);
      if (!ms) continue;
      const d = new Date(ms);
      const minuteOfDay = d.getHours() * 60 + d.getMinutes();
      if (minuteOfDay < rangeStartMin || minuteOfDay >= rangeEndMinExclusive) continue;
      by.get(topic)?.push(it);
    }

    // Stable ordering: chronological within each category.
    by.forEach((arr) => {
      arr.sort((a, b) => {
        const am = (a as any).submittedAtMillis ?? toMillis((a as any).submittedAt ?? (a as any).createdAt);
        const bm = (b as any).submittedAtMillis ?? toMillis((b as any).submittedAt ?? (b as any).createdAt);
        return am - bm;
      });
    });

    return by;
  }, [categories, rangeEndMinExclusive, rangeStartMin, sessionsInDateRange]);

  const selectedSummary = useMemo(() => {
    if (!active) return null;
    const parts = [`${active.category.label}`, active.whenLabel];
    if (active.scoreLabel) parts.push(active.scoreLabel);
    return parts.join(' • ');
  }, [active]);

  return (
    <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-lg font-bold text-gray-900">Study Time Patterns</div>
          <div className="text-sm text-gray-600">When your child studies each subject</div>
        </div>
        <div className="text-sm font-semibold text-gray-700">Sessions: {sessionsInDateRange.length}</div>
      </div>

      {showDateRangeControls && (
        <div className="mt-4 flex flex-col sm:flex-row sm:items-center gap-2">
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

      <div className="mt-4 text-sm text-gray-700">
        This shows the times of day your child usually studies each subject.
      </div>

      <div className="mt-5">
        <div className="overflow-x-auto">
          <div className="min-w-max" role="grid" aria-label="Study time timeline">
            {/* Header */}
            <div className="grid gap-y-1" style={{ gridTemplateColumns: `minmax(8rem, 10rem) ${timelineWidthRemWide}rem` }}>
              <div className="sticky left-0 z-20 bg-white" role="columnheader" />
              <div
                role="columnheader"
                className="h-7 relative text-[10px] text-gray-600"
              >
                {/* vertical hour grid lines */}
                {hourLinePercents.map((leftPct, idx) => (
                  <div
                    key={`hline-header-${hours[idx]}`}
                    className="absolute inset-y-0 border-l border-gray-200"
                    style={{ left: `${leftPct}%` }}
                    aria-hidden="true"
                  />
                ))}
                {hours.map((h) => {
                  const label = tickLabelForHour(h);
                  if (!label) return null;
                  const leftPct = ((h * 60 - rangeStartMin) / rangeMinutes) * 100;
                  return (
                    <div key={`tick-${h}`} className="absolute bottom-0" style={{ left: `${leftPct}%` }}>
                      <span className="block origin-bottom -rotate-45 whitespace-nowrap">{label}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Rows */}
            {categories.map((cat) => {
              const rowSessions = sessionsByCategory.get(cat.key) ?? [];

              return (
                <div
                  key={cat.key}
                  className="grid gap-y-1"
                  style={{ gridTemplateColumns: `minmax(8rem, 10rem) ${timelineWidthRemWide}rem` }}
                  role="row"
                >
                  <div
                    className="sticky left-0 z-10 bg-white pr-1 flex items-center justify-end text-right text-xs font-semibold text-gray-900"
                    role="rowheader"
                  >
                    {cat.label}
                  </div>

                  <div
                    className="relative h-8 border-t border-gray-200"
                  >
                    {/* vertical hour grid lines */}
                    {hourLinePercents.map((leftPct, idx) => (
                      <div
                        key={`hline-${cat.key}-${hours[idx]}`}
                        className="absolute inset-y-0 border-l border-gray-200"
                        style={{ left: `${leftPct}%` }}
                        aria-hidden="true"
                      />
                    ))}
                    {rowSessions.map((it, idx) => {
                      const ms = (it as any).submittedAtMillis ?? toMillis((it as any).submittedAt ?? (it as any).createdAt);
                      if (!ms) return null;
                      const d = new Date(ms);
                      const minuteOfDay = d.getHours() * 60 + d.getMinutes();
                      if (minuteOfDay < rangeStartMin || minuteOfDay >= rangeEndMinExclusive) return null;

                      const leftPct = ((minuteOfDay - rangeStartMin) / rangeMinutes) * 100;

                      // Small deterministic jitter to reduce perfect overlap.
                      const jitter = ((idx % 5) - 2) * 2; // -4..+4 px

                      const scorePct =
                        typeof it.score?.percentage === 'number' && Number.isFinite(it.score.percentage) ? it.score.percentage : null;

                      const whenLabel = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                      const hourRange = formatHourRange(d.getHours());
                      const scoreLabel = scorePct != null ? `Score ${Math.round(scorePct)}%` : undefined;

                      const aria = `${cat.label}, ${whenLabel} (${hourRange})${scoreLabel ? `, ${scoreLabel}` : ''}`;
                      const dotColor = scoreToDotColorClass(scorePct);

                      return (
                        <button
                          key={`${it.sessionId}-${idx}`}
                          type="button"
                          className={`absolute w-[5px] h-[5px] rounded-full ${dotColor} hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-purple-600 focus:ring-offset-1`}
                          style={{ left: `${leftPct}%`, top: `calc(50% + ${jitter}px)`, transform: 'translate(-50%, -50%)' }}
                          aria-label={aria}
                          aria-describedby={tooltipId}
                          onMouseEnter={() => {
                            setActive({ category: cat, whenLabel, scoreLabel, sessionId: it.sessionId });
                          }}
                          onFocus={() => {
                            setActive({ category: cat, whenLabel, scoreLabel, sessionId: it.sessionId });
                          }}
                          onClick={() => {
                            setActive((prev) => {
                              if (prev && prev.sessionId === it.sessionId) return null;
                              return { category: cat, whenLabel, scoreLabel, sessionId: it.sessionId };
                            });
                          }}
                        />
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="mt-3 flex items-center gap-3 text-xs text-gray-600">
          <div>Each dot = one submitted session</div>
          <div className="flex items-center gap-2">
            <div className="text-gray-700">Score</div>
            <div className="w-28 h-[6px] rounded bg-gradient-to-r from-green-500 to-red-500" aria-hidden="true" />
            <div className="flex items-center gap-2">
              <span className="text-gray-700">100%</span>
              <span className="text-gray-500">→</span>
              <span className="text-gray-700">0%</span>
            </div>
          </div>
        </div>

        <div
          id={tooltipId}
          className="mt-3 rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm text-gray-800"
          role="status"
          aria-live="polite"
        >
          {selectedSummary ?? 'Tap, hover, or focus a cell to see details.'}
        </div>
      </div>
    </div>
  );
};

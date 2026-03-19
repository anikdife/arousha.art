import React from 'react';
import { Link } from 'react-router-dom';
import { NAPLAN3DTemplate } from '../../../components/naplan3d/NAPLAN3DTemplate';
import { GrowthMountain3D } from '../../../components/naplan3d/graphs/GrowthMountain3D';
import { loadNaplan3DHistoryFromFirestore } from '../../../lib/gh/naplan3dHistoryService';
import { useGhHistoryStudentUid } from './useGhHistoryStudentUid';

function toLocalDateInputValue(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function parseLocalDateInput(value: string): { y: number; m: number; d: number } | null {
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

function computeLocalDayRangeMs(fromDate: string, toDate: string): { startMs: number; endMs: number } | null {
  const a = parseLocalDateInput(fromDate);
  const b = parseLocalDateInput(toDate);
  if (!a || !b) return null;
  const start = new Date(a.y, a.m - 1, a.d, 0, 0, 0, 0).getTime();
  const end = new Date(b.y, b.m - 1, b.d, 23, 59, 59, 999).getTime();
  const startMs = Math.min(start, end);
  const endMs = Math.max(start, end);
  return { startMs, endMs };
}

export function GhHistoryPage() {
  const studentUid = useGhHistoryStudentUid();
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [docData, setDocData] = React.useState<unknown>(null);

  const [fromDate, setFromDate] = React.useState(() => toLocalDateInputValue(new Date()));
  const [toDate, setToDate] = React.useState(() => toLocalDateInputValue(new Date()));

  const fromInputRef = React.useRef<HTMLInputElement | null>(null);
  const toInputRef = React.useRef<HTMLInputElement | null>(null);

  const tryOpenNativeDatePicker = React.useCallback((ref: React.RefObject<HTMLInputElement | null>) => {
    const el = ref.current;
    if (!el) return false;
    // Chromium supports showPicker(), but it may throw if the browser decides
    // the call is not sufficiently user-initiated. Never let that break clicks.
    try {
      if (typeof (el as any).showPicker === 'function') {
        (el as any).showPicker();
        return true;
      }
    } catch {
      // ignore
    }
    return false;
  }, []);

  React.useEffect(() => {
    let mounted = true;
    const run = async () => {
      if (!studentUid) {
        if (!mounted) return;
        setDocData(null);
        setError('No student selected. Open Year 3 History first to choose an active student.');
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);
      try {
        const data = await loadNaplan3DHistoryFromFirestore({ studentUid });
        if (!mounted) return;
        setDocData(data);
        setLoading(false);
      } catch (e: any) {
        if (!mounted) return;
        setDocData(null);
        setError(String(e?.message ?? e));
        setLoading(false);
      }
    };

    run();
    return () => {
      mounted = false;
    };
  }, [studentUid]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100">
        <div className="max-w-6xl mx-auto px-4 py-10">
          <div className="text-lg font-semibold">Loading NAPLAN history…</div>
          <div className="mt-2 text-sm text-slate-300">Fetching from Firestore.</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100">
        <div className="max-w-6xl mx-auto px-4 py-10">
          <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4">
            <div className="font-semibold">Couldn’t load history</div>
            <div className="mt-1 text-sm text-slate-200">{error}</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <NAPLAN3DTemplate title="NAPLAN 3D History" subtitle="Growth Mountain (Surface Plot)" data={docData}>
      {(parsed) => (
        (() => {
          const range = fromDate && toDate ? computeLocalDayRangeMs(fromDate, toDate) : null;
          const filteredAttempts = range
            ? parsed.attempts.filter((a) => a.dateMs >= range.startMs && a.dateMs <= range.endMs)
            : parsed.attempts;

          return (
        <div className="space-y-6">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <div className="font-semibold">Date range</div>
                <div className="text-xs text-slate-300">Filters all points in the 3D chart.</div>
              </div>

              <div className="flex flex-col sm:flex-row gap-2 sm:items-end">
                <label className="text-xs text-slate-300">
                  From
                  <input
                    type="date"
                    ref={fromInputRef}
                    className="mt-1 block w-full sm:w-[170px] rounded-lg bg-black/30 border border-white/10 px-3 py-2 text-sm text-slate-100"
                    value={fromDate}
                    onPointerDown={(e) => {
                      const opened = tryOpenNativeDatePicker(fromInputRef);
                      if (opened) e.preventDefault();
                    }}
                    onChange={(e) => setFromDate(e.target.value)}
                    onInput={(e) => setFromDate((e.target as HTMLInputElement).value)}
                  />
                </label>

                <label className="text-xs text-slate-300">
                  To
                  <input
                    type="date"
                    ref={toInputRef}
                    className="mt-1 block w-full sm:w-[170px] rounded-lg bg-black/30 border border-white/10 px-3 py-2 text-sm text-slate-100"
                    value={toDate}
                    onPointerDown={(e) => {
                      const opened = tryOpenNativeDatePicker(toInputRef);
                      if (opened) e.preventDefault();
                    }}
                    onChange={(e) => setToDate(e.target.value)}
                    onInput={(e) => setToDate((e.target as HTMLInputElement).value)}
                  />
                </label>

                <button
                  type="button"
                  className="h-[42px] px-3 rounded-lg bg-white/10 hover:bg-white/15 border border-white/10 text-sm font-semibold"
                  onClick={() => {
                    const today = toLocalDateInputValue(new Date());
                    setFromDate(today);
                    setToDate(today);
                  }}
                >
                  Reset
                </button>
              </div>
            </div>

            <div className="mt-3 text-xs text-slate-300">
              {(() => {
                return `Showing ${filteredAttempts.length} of ${parsed.attempts.length} attempts.`;
              })()}
            </div>
          </div>

          {parsed.attempts.length === 0 ? (
            <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
              <div className="text-lg font-semibold">No submitted sessions yet</div>
              <div className="mt-2 text-sm text-slate-300">
                This graph is built from Firestore `practiceSessions` with `status: submitted`.
              </div>
            </div>
          ) : filteredAttempts.length === 0 ? (
            <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
              <div className="text-lg font-semibold">No attempts in this date range</div>
              <div className="mt-2 text-sm text-slate-300">Try widening the range or press Reset.</div>
            </div>
          ) : (
            <GrowthMountain3D
              key={`${fromDate}_${toDate}_${filteredAttempts.length}`}
              attempts={filteredAttempts}
            />
          )}

          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="font-semibold">More 3D views</div>
            <div className="mt-1 text-sm text-slate-300">Click a thumbnail to open a dedicated route.</div>

            <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Thumbnail
                to="/gh/history/delta"
                title="Delta Comparison"
                subtitle="Stacked 3D Bars"
              />
              <Thumbnail
                to="/gh/history/mastery"
                title="Mastery Radar"
                subtitle="3D Spider"
              />
              <Thumbnail
                to="/gh/history/cone"
                title="Achievement Cone"
                subtitle="Scatter + Trajectory"
              />
            </div>
          </div>
        </div>
          );
        })()
      )}
    </NAPLAN3DTemplate>
  );
}

function Thumbnail(props: { to: string; title: string; subtitle: string }) {
  return (
    <Link
      to={props.to}
      className="group rounded-xl border border-white/10 bg-black/20 hover:bg-black/30 transition-colors p-3"
    >
      <div className="h-24 rounded-lg bg-gradient-to-br from-slate-900 to-slate-800 border border-white/5 flex items-center justify-center">
        <div className="text-xs text-slate-300">Preview</div>
      </div>
      <div className="mt-2 font-semibold group-hover:text-white">{props.title}</div>
      <div className="text-xs text-slate-300">{props.subtitle}</div>
    </Link>
  );
}

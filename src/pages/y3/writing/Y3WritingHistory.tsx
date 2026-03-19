import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../../auth/AuthProvider';
import { getActiveStudentName, getActiveStudentUid, setActiveStudent } from '../../../lib/activeStudent';
import {
  downloadWritingAnswerText,
  loadWritingAttemptSummaries,
  loadWritingFeedbackSummaries,
  writingAttemptDocRef,
} from '../../../lib/writing/attemptService';
import type { WritingAttemptSummaryY3, WritingFeedbackSummaryY3 } from '../../../lib/writing/attemptTypes';
import { getDoc } from 'firebase/firestore';
import { loadWritingIndexY3 } from '../../../lib/writing/storageIndex';
import { loadPromptById } from '../../../lib/writing/promptLoader';
import { buildWritingAssessmentPdf } from '../../../lib/writing/writingAssessmentPdf';
import { downloadBytes } from '../../../lib/subtractionPdf';

type HistoryView = 'graph' | 'list';

function getLinkedStudentUids(profile: any): string[] {
  const current = profile?.linkedStudentUids ?? profile?.LinkedStudentUids;
  if (Array.isArray(current)) return current.filter(Boolean);
  const legacy = profile?.linkedStudentIds ?? profile?.LinkedStudentIds;
  if (Array.isArray(legacy)) return legacy.filter(Boolean);
  return [];
}

function tabButtonClass(active: boolean) {
  const base = 'px-3 py-1.5 text-sm font-semibold rounded-md transition-colors';
  return active ? `${base} bg-gray-900 text-white` : `${base} bg-gray-100 text-gray-800 hover:bg-gray-200`;
}

function formatDateTime(ms: number) {
  if (!ms) return 'Date unavailable';
  try {
    return new Date(ms).toLocaleString();
  } catch {
    return 'Date unavailable';
  }
}

function formatShortDate(ms: number) {
  try {
    return new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}

function toDateInputValue(ms: number): string {
  const d = new Date(ms);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function parseDateInputToLocalDayStartMs(value: string): number | undefined {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return undefined;
  const yyyy = Number(m[1]);
  const mm = Number(m[2]);
  const dd = Number(m[3]);
  if (!Number.isFinite(yyyy) || !Number.isFinite(mm) || !Number.isFinite(dd)) return undefined;
  return new Date(yyyy, mm - 1, dd, 0, 0, 0, 0).getTime();
}

function parseDateInputToLocalDayEndMs(value: string): number | undefined {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return undefined;
  const yyyy = Number(m[1]);
  const mm = Number(m[2]);
  const dd = Number(m[3]);
  if (!Number.isFinite(yyyy) || !Number.isFinite(mm) || !Number.isFinite(dd)) return undefined;
  return new Date(yyyy, mm - 1, dd, 23, 59, 59, 999).getTime();
}

type Point = { xMillis: number; yPercent: number };
type Domain = { minX: number; maxX: number };

function toPoints(items: WritingAttemptSummaryY3[]): Point[] {
  return items
    .filter((it) => typeof it.scorePercent === 'number')
    .map((it) => ({ xMillis: it.createdAtMillis, yPercent: Math.max(0, Math.min(100, it.scorePercent ?? 0)) }))
    .filter((p) => p.xMillis > 0)
    .sort((a, b) => a.xMillis - b.xMillis);
}

function computeDomain(points: Point[]): Domain {
  if (points.length === 0) {
    const now = Date.now();
    return { minX: now - 6 * 24 * 60 * 60 * 1000, maxX: now };
  }
  const xs = points.map((p) => p.xMillis);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  if (minX === maxX) {
    return { minX: minX - 24 * 60 * 60 * 1000, maxX: maxX + 24 * 60 * 60 * 1000 };
  }
  return { minX, maxX };
}

export const Y3WritingHistory: React.FC = () => {
  const { currentUser, userProfile } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const role = userProfile?.role ?? 'student';
  const isStudent = role === 'student';
  const linkedStudentUids = useMemo(() => getLinkedStudentUids(userProfile as any), [userProfile]);

  const state = (location.state as any) ?? {};
  const stateStudentUid = typeof state.studentUid === 'string' ? (state.studentUid as string) : undefined;
  const stateStudentName = typeof state.studentName === 'string' ? (state.studentName as string) : undefined;

  useEffect(() => {
    if (!stateStudentUid) return;
    setActiveStudent(stateStudentUid, stateStudentName);
  }, [stateStudentName, stateStudentUid]);

  const studentUid = useMemo(() => {
    if (role === 'student') return currentUser?.uid ?? undefined;
    if (role === 'owner') return currentUser?.uid ?? undefined;
    if (role === 'parent' || role === 'teacher') return stateStudentUid ?? getActiveStudentUid() ?? undefined;
    return undefined;
  }, [currentUser?.uid, role, stateStudentUid]);

  const canView = useMemo(() => {
    if (!studentUid) return false;
    if (role === 'student' || role === 'owner') return currentUser?.uid === studentUid;
    if (role === 'parent' || role === 'teacher') return linkedStudentUids.includes(studentUid);
    return false;
  }, [currentUser?.uid, linkedStudentUids, role, studentUid]);

  const [view, setView] = useState<HistoryView>(() => (isStudent ? 'list' : 'graph'));
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const [openingIds, setOpeningIds] = useState<Set<string>>(() => new Set());
  const [downloadingIds, setDownloadingIds] = useState<Set<string>>(() => new Set());

  const [fromDate, setFromDate] = useState<string>(() => toDateInputValue(Date.now()));
  const [toDate, setToDate] = useState<string>(() => toDateInputValue(Date.now()));

  const fromMs = useMemo(() => parseDateInputToLocalDayStartMs(fromDate), [fromDate]);
  const toMs = useMemo(() => parseDateInputToLocalDayEndMs(toDate), [toDate]);

  const [summaries, setSummaries] = useState<WritingAttemptSummaryY3[]>([]);
  const [feedback, setFeedback] = useState<WritingFeedbackSummaryY3[]>([]);

  const [listAnswers, setListAnswers] = useState<Record<string, string>>({});
  const [listLoading, setListLoading] = useState<boolean>(false);

  const dateFilteredSummaries = useMemo(() => {
    return summaries.filter((s) => {
      const t = s.createdAtMillis ?? 0;
      if (!t) return false;
      if (typeof fromMs === 'number' && t < fromMs) return false;
      if (typeof toMs === 'number' && t > toMs) return false;
      return true;
    });
  }, [fromMs, summaries, toMs]);

  const dateFilteredFeedback = useMemo(() => {
    return feedback.filter((f) => {
      const t = f.assessedAtMillis ?? 0;
      if (!t) return false;
      if (typeof fromMs === 'number' && t < fromMs) return false;
      if (typeof toMs === 'number' && t > toMs) return false;
      return true;
    });
  }, [feedback, fromMs, toMs]);

  useEffect(() => {
    let cancelled = false;
    if (!canView || !studentUid) return;

    setLoading(true);
    setError(null);
    (async () => {
      try {
        if (isStudent) {
          const next = await loadWritingAttemptSummaries({ studentUid, max: 5000 });
          if (!cancelled) setSummaries(next);
        } else if (view === 'list') {
          const next = await loadWritingFeedbackSummaries({ studentUid, max: 10 });
          if (!cancelled) setFeedback(next);
        } else {
          const next = await loadWritingAttemptSummaries({ studentUid });
          if (!cancelled) setSummaries(next);
        }
      } catch (e: any) {
        if (!cancelled) setError(String(e?.message ?? 'Failed to load history'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [canView, isStudent, studentUid, view]);

  // Load answer text for the last 10 attempts (if answer still retained).
  useEffect(() => {
    let cancelled = false;
    if (view !== 'list') return;
    if (!canView) return;

    setListLoading(true);
    setListAnswers({});

    (async () => {
      const out: Record<string, string> = {};
      for (const s of dateFilteredFeedback) {
        if (cancelled) return;
        if (!s.answerStoragePath) {
          out[s.attemptId] = '';
          continue;
        }
        try {
          out[s.attemptId] = await downloadWritingAnswerText(s.answerStoragePath);
        } catch {
          out[s.attemptId] = '';
        }
      }
      if (!cancelled) setListAnswers(out);
      if (!cancelled) setListLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [canView, dateFilteredFeedback, view]);

  const points = useMemo(() => toPoints(dateFilteredSummaries), [dateFilteredSummaries]);
  const domain = useMemo(() => computeDomain(points), [points]);

  const viewW = 1000;
  const viewH = 450;
  const pad = { top: 40, right: 30, bottom: 60, left: 60 };
  const plotW = viewW - pad.left - pad.right;
  const plotH = viewH - pad.top - pad.bottom;

  const xToSvg = useCallback(
    (xMillis: number) => {
      const t = (xMillis - domain.minX) / (domain.maxX - domain.minX);
      return pad.left + Math.max(0, Math.min(1, t)) * plotW;
    },
    [domain.maxX, domain.minX, pad.left, plotW]
  );

  const yToSvg = useCallback(
    (yPercent: number) => {
      const t = yPercent / 100;
      return pad.top + (1 - Math.max(0, Math.min(1, t))) * plotH;
    },
    [pad.top, plotH]
  );

  const makePolyline = (pts: Point[]) => pts.map((p) => `${xToSvg(p.xMillis)},${yToSvg(p.yPercent)}`).join(' ');

  const xTicks = useMemo(() => {
    const tickCount = 5;
    const out: Array<{ x: number; label: string }> = [];
    for (let i = 0; i < tickCount; i++) {
      const t = i / (tickCount - 1);
      const ms = domain.minX + t * (domain.maxX - domain.minX);
      out.push({ x: xToSvg(ms), label: formatShortDate(ms) });
    }
    return out;
  }, [domain.maxX, domain.minX, xToSvg]);

  const yTicks = [0, 25, 50, 75, 100].map((v) => ({ v, y: yToSvg(v) }));

  const dateRangeLabel = useMemo(() => {
    try {
      const from = fromMs ? new Date(fromMs).toLocaleDateString() : fromDate;
      const to = toMs ? new Date(toMs).toLocaleDateString() : toDate;
      return from === to ? from : `${from} – ${to}`;
    } catch {
      return `${fromDate} – ${toDate}`;
    }
  }, [fromDate, fromMs, toDate, toMs]);

  const openAttempt = useCallback(
    async (attemptId: string) => {
      if (!studentUid) return;
      setError(null);
      setOpeningIds((prev) => {
        const next = new Set(prev);
        next.add(attemptId);
        return next;
      });
      try {
        navigate('/y3/history/review/writing', {
          state: { studentUid, attemptId, backgroundLocation: location },
        });
      } finally {
        setOpeningIds((prev) => {
          if (!prev.has(attemptId)) return prev;
          const next = new Set(prev);
          next.delete(attemptId);
          return next;
        });
      }
    },
    [location, navigate, studentUid]
  );

  const downloadAttemptPdf = useCallback(
    async (attemptId: string) => {
      if (!studentUid) return;
      setError(null);

      setDownloadingIds((prev) => {
        const next = new Set(prev);
        next.add(attemptId);
        return next;
      });

      try {
        const snap = await getDoc(writingAttemptDocRef(studentUid, attemptId));
        if (!snap.exists()) throw new Error('Writing attempt not found');
        const data = snap.data() as any;

        const promptId = typeof data.promptId === 'string' ? data.promptId : '';
        const promptTitle = typeof data.promptTitle === 'string' ? data.promptTitle : 'Writing prompt';
        const answerStoragePath = typeof data.answerStoragePath === 'string' ? data.answerStoragePath : '';

        const scorePercent = typeof data.scorePercent === 'number' ? data.scorePercent : 0;
        const comment = typeof data.comment === 'string' ? data.comment : '';
        const assessedAtMillis = typeof data.assessedAt?.toDate === 'function' ? data.assessedAt.toDate().getTime() : null;
        const createdAtMillis = typeof data.createdAt?.toDate === 'function' ? data.createdAt.toDate().getTime() : null;

        const studentName = stateStudentName ?? getActiveStudentName() ?? 'Student';
        const dateLine = (createdAtMillis ?? assessedAtMillis) ? new Date((createdAtMillis ?? assessedAtMillis) as number).toLocaleString() : '';
        const marksLine = typeof data.scorePercent === 'number' ? `${Math.round(scorePercent)}%` : '';

        const index = await loadWritingIndexY3();
        const item = (index.items ?? []).find((it) => it.promptId === promptId);
        if (!item) throw new Error('Prompt not found');

        const loaded = await loadPromptById({ item, expectedPromptId: promptId });
        const answerText = answerStoragePath ? await downloadWritingAnswerText(answerStoragePath) : '';

        const bytes = await buildWritingAssessmentPdf({
          title: 'Writing Practice',
          prompt: loaded.prompt,
          promptImageUrl: loaded.imageUrl,
          answerText,
          feedback: {
            scorePercent,
            comment,
            assessedAt: assessedAtMillis ?? undefined,
          },
          includeCoverPage: true,
          cover: {
            studentName,
            dateLine,
            marksLine,
            sessionId: attemptId,
          },
        });

        downloadBytes(bytes, `Writing_${attemptId}_${promptTitle.replace(/[^a-z0-9]+/gi, '_').slice(0, 40)}.pdf`);
      } catch (e: any) {
        console.error('Failed to generate writing PDF:', e);
        setError(String(e?.message ?? 'Failed to generate PDF'));
      } finally {
        setDownloadingIds((prev) => {
          if (!prev.has(attemptId)) return prev;
          const next = new Set(prev);
          next.delete(attemptId);
          return next;
        });
      }
    },
    [stateStudentName, studentUid]
  );

  if (!currentUser) {
    return (
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm text-sm text-gray-600">Please sign in.</div>
      </div>
    );
  }

  if (!canView) {
    return (
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
          <div className="text-sm font-semibold text-gray-900">History</div>
          <div className="mt-3 text-sm text-red-700">Not authorised.</div>
        </div>
      </div>
    );
  }

  if (isStudent) {
    return (
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-white rounded-xl shadow-lg p-6">
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
            <div>
              <div className="text-gray-900 font-semibold text-lg">History</div>
              <div className="text-gray-600 mt-1">Showing: {dateRangeLabel}</div>
            </div>

            <div className="flex items-end gap-3">
              <div>
                <label className="block text-sm font-semibold text-gray-700">From</label>
                <input
                  type="date"
                  className="mt-1 px-3 py-2 rounded-lg border border-gray-300 bg-white text-gray-900"
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700">To</label>
                <input
                  type="date"
                  className="mt-1 px-3 py-2 rounded-lg border border-gray-300 bg-white text-gray-900"
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                />
              </div>
            </div>
          </div>

          {loading && (
            <div className="mt-6 flex items-center gap-2 text-gray-600">
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-purple-600" />
              Loading history...
            </div>
          )}

          {error && (
            <div className="mt-6 bg-red-50 border border-red-200 rounded-lg p-4 text-red-800 font-medium">{error}</div>
          )}

          {!loading && !error && dateFilteredSummaries.length === 0 && (
            <div className="mt-6 text-gray-600">No writing sessions found for this date range.</div>
          )}

          {!loading && !error && dateFilteredSummaries.length > 0 && (
            <div className="mt-6 space-y-3">
              {dateFilteredSummaries.map((item) => {
                const isOpening = openingIds.has(item.attemptId);
                const isDownloading = downloadingIds.has(item.attemptId);
                const scoreLabel =
                  item.assessed && typeof item.scorePercent === 'number' ? `${item.scorePercent}%` : item.assessed ? 'Assessed' : 'Pending';

                return (
                  <div
                    key={item.attemptId}
                    className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-xl border border-gray-200 bg-white p-4"
                  >
                    <div>
                      <div className="text-gray-900 font-semibold">{item.promptTitle ?? 'Writing practice'}</div>
                      <div className="text-sm text-gray-600">{formatDateTime(item.createdAtMillis)}</div>
                      <div className="text-sm text-gray-700 mt-1">
                        Status: <span className="font-semibold">{scoreLabel}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 justify-end">
                      <button
                        type="button"
                        onClick={() => void openAttempt(item.attemptId)}
                        disabled={isOpening}
                        className={
                          isOpening
                            ? 'px-4 py-2 rounded-lg bg-gray-200 text-gray-700 cursor-not-allowed'
                            : 'px-4 py-2 rounded-lg bg-purple-700 text-white hover:bg-purple-800'
                        }
                      >
                        {isOpening ? 'Opening…' : 'Open'}
                      </button>

                      <button
                        type="button"
                        onClick={() => void downloadAttemptPdf(item.attemptId)}
                        disabled={isDownloading}
                        className={
                          isDownloading
                            ? 'px-4 py-2 rounded-lg bg-gray-200 text-gray-700 cursor-not-allowed'
                            : 'px-4 py-2 rounded-lg bg-purple-700 text-white hover:bg-purple-800'
                        }
                      >
                        {isDownloading ? 'Downloading…' : 'Download'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-hidden">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 h-full overflow-hidden">
        <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden h-full">
          <div className="p-3 sm:p-4 h-full">
            <div className="max-w-4xl mx-auto h-full flex flex-col min-h-0">
              <div className="shrink-0">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-gray-900">History</div>
                    {(role === 'parent' || role === 'teacher') && studentUid && (
                      <div className="mt-1 text-xs text-gray-500">
                        Viewing: {stateStudentName ?? getActiveStudentName() ?? 'Selected student'}
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col sm:flex-row sm:items-end gap-3">
                    <div className="flex items-end gap-2">
                      <div>
                        <label className="block text-xs font-semibold text-gray-700">From</label>
                        <input
                          type="date"
                          className="mt-1 px-3 py-2 rounded-lg border border-gray-300 bg-white text-gray-900 text-sm"
                          value={fromDate}
                          onChange={(e) => setFromDate(e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-gray-700">To</label>
                        <input
                          type="date"
                          className="mt-1 px-3 py-2 rounded-lg border border-gray-300 bg-white text-gray-900 text-sm"
                          value={toDate}
                          onChange={(e) => setToDate(e.target.value)}
                        />
                      </div>
                    </div>

                    <div className="inline-flex rounded-lg bg-gray-100 p-1">
                      <button type="button" className={tabButtonClass(view === 'graph')} onClick={() => setView('graph')}>
                        Graph
                      </button>
                      <button type="button" className={tabButtonClass(view === 'list')} onClick={() => setView('list')}>
                        List
                      </button>
                    </div>
                  </div>
                </div>

                {loading && <div className="mt-2 text-xs text-gray-500">Loading…</div>}
                {!loading && error && <div className="mt-2 text-xs text-red-700">{error}</div>}
              </div>

              <div className="mt-4 flex-1 min-h-0">
                {view === 'graph' && (
                  <div className="h-full min-h-0 flex flex-col">
                    <div className="text-xs text-gray-600 shrink-0">Score percentage over time</div>
                    <div className="mt-3 flex-1 min-h-0 overflow-hidden rounded-xl border border-gray-200 bg-white">
                      <svg className="w-full h-full" viewBox={`0 0 ${viewW} ${viewH}`} preserveAspectRatio="xMidYMid meet">
                        {/* Axes */}
                        <line x1={pad.left} y1={pad.top} x2={pad.left} y2={pad.top + plotH} stroke="#111827" strokeWidth={1} />
                        <line
                          x1={pad.left}
                          y1={pad.top + plotH}
                          x2={pad.left + plotW}
                          y2={pad.top + plotH}
                          stroke="#111827"
                          strokeWidth={1}
                        />

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

                        {points.length > 0 && (
                          <polyline fill="none" stroke="#2563EB" strokeWidth={3} strokeLinecap="round" points={makePolyline(points)} />
                        )}

                        {points.map((p) => (
                          <circle key={p.xMillis} cx={xToSvg(p.xMillis)} cy={yToSvg(p.yPercent)} r={4} fill="#2563EB" />
                        ))}
                      </svg>
                    </div>

                    {points.length === 0 && !loading && !error && (
                      <div className="mt-3 text-sm text-gray-600">No assessed scores in the selected date range.</div>
                    )}
                  </div>
                )}

                {view === 'list' && (
                  <div className="h-full min-h-0 flex flex-col">
                    <div className="text-xs text-gray-600 shrink-0">Last 10 complete feedback</div>
                    <div className="mt-3 flex-1 min-h-0 overflow-auto space-y-4">
                      {listLoading && <div className="text-sm text-gray-600">Loading answers…</div>}

                      {!listLoading && dateFilteredFeedback.length === 0 && (
                        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-sm text-gray-600">No feedback in the selected date range.</div>
                      )}

                      {!listLoading &&
                        dateFilteredFeedback.map((it) => {
                          const answerText = listAnswers[it.attemptId] ?? '';
                          return (
                            <div key={it.attemptId} className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm">
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <div className="text-sm font-semibold text-gray-900">{formatDateTime(it.assessedAtMillis)}</div>
                                  {it.promptTitle && <div className="mt-1 text-xs text-gray-500">Prompt: {it.promptTitle}</div>}
                                </div>
                                <div className="text-sm font-semibold text-gray-900">{it.scorePercent}%</div>
                              </div>

                              <div className="mt-3 rounded-xl border border-gray-200 bg-white p-3">
                                <div className="text-xs font-semibold text-gray-700">Feedback</div>
                                <div className="mt-1 text-sm text-gray-800 whitespace-pre-wrap">{it.comment}</div>
                              </div>

                              <textarea
                                readOnly
                                className="mt-3 w-full h-40 rounded-xl border border-gray-200 bg-gray-50 p-3 text-sm leading-relaxed"
                                value={answerText}
                                placeholder={it.answerStoragePath ? 'Loading…' : 'Answer no longer retained (older than last 10).'}
                              />
                            </div>
                          );
                        })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

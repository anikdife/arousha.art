// src/pages/y3/languageConventions/Y3LanguageConventionsHistory.tsx

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../../auth/AuthProvider';
import { listSessionIndexByTopic, SessionIndexListItem } from '../../../lib/session/sessionIndexReader';
import { loadSessionJsonByStoragePath } from '../../../lib/session/loadSessionJsonByPath';
import { buildLanguageConventionsPdf } from '../../../lib/languageConventions/pdfExport';
import { downloadBytes } from '../../../lib/subtractionPdf';
import type { LCSession } from '../../../lib/languageConventions/types';
import { getActiveStudentName, getActiveStudentUid, setActiveStudent } from '../../../lib/activeStudent';

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

function formatDateTime(value: any): string {
  const ms = toMillis(value);
  if (!ms) return 'Date unavailable';
  const d = new Date(ms);
  return `${d.toLocaleDateString()} at ${d.toLocaleTimeString()}`;
}

export const Y3LanguageConventionsHistory: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { currentUser, userProfile } = useAuth();

  const role = userProfile?.role ?? 'student';

  const selectableStudentIds = useMemo(() => {
    if (role !== 'parent' && role !== 'teacher') return [];
    const current = (userProfile as any)?.linkedStudentUids;
    if (Array.isArray(current)) return current;
    const legacy = (userProfile as any)?.linkedStudentIds;
    return Array.isArray(legacy) ? legacy : [];
  }, [role, userProfile]);

  const studentUidFromNav = (location.state as any)?.studentUid as string | undefined;
  const studentNameFromNav = (location.state as any)?.studentName as string | undefined;

  const [activeStudentUid, setActiveStudentUid] = useState<string | undefined>(() => getActiveStudentUid() ?? undefined);

  useEffect(() => {
    if (role === 'student') return;
    if (!studentUidFromNav) return;
    setActiveStudent(studentUidFromNav, studentNameFromNav);
    setActiveStudentUid(studentUidFromNav);
  }, [role, studentNameFromNav, studentUidFromNav]);

  useEffect(() => {
    if (role !== 'parent' && role !== 'teacher') return;
    if (selectableStudentIds.length === 0) return;

    const candidate = studentUidFromNav ?? activeStudentUid;
    const resolved = candidate && selectableStudentIds.includes(candidate) ? candidate : selectableStudentIds[0];
    if (!resolved) return;

    if (resolved !== activeStudentUid) {
      setActiveStudent(resolved);
      setActiveStudentUid(resolved);
    }
  }, [activeStudentUid, role, selectableStudentIds, studentUidFromNav]);

  const studentUid = useMemo(() => {
    if (role === 'student') return currentUser?.uid ?? undefined;
    if (studentUidFromNav) return studentUidFromNav;
    if (activeStudentUid) return activeStudentUid;
    if (selectableStudentIds.length > 0) return selectableStudentIds[0];
    return currentUser?.uid ?? undefined;
  }, [activeStudentUid, currentUser?.uid, role, selectableStudentIds, studentUidFromNav]);

  const [sessions, setSessions] = useState<SessionIndexListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [downloadingIds, setDownloadingIds] = useState<Set<string>>(() => new Set());

  const [fromDate, setFromDate] = useState<string>(() => toDateInputValue(Date.now()));
  const [toDate, setToDate] = useState<string>(() => toDateInputValue(Date.now()));

  const fromMs = useMemo(() => parseDateInputToLocalDayStartMs(fromDate), [fromDate]);
  const toMs = useMemo(() => parseDateInputToLocalDayEndMs(toDate), [toDate]);

  const dateFilteredSessions = useMemo(() => {
    return sessions.filter((s) => {
      const t =
        (typeof s.submittedAtMillis === 'number' ? s.submittedAtMillis : undefined) ??
        toMillis(s.submittedAt ?? s.createdAt);
      if (!t) return false;
      if (typeof fromMs === 'number' && t < fromMs) return false;
      if (typeof toMs === 'number' && t > toMs) return false;
      return true;
    });
  }, [fromMs, sessions, toMs]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!studentUid) {
        setSessions([]);
        setLoading(false);
        setError('No user selected');
        return;
      }

      setLoading(true);
      setError(null);
      try {
        const items = await listSessionIndexByTopic({ studentUid, topic: 'language-conventions' });
        if (cancelled) return;
        setSessions(items.filter((r) => Boolean(r.storagePath)));
      } catch (e) {
        console.error('Failed to load session index:', e);
        if (cancelled) return;
        setError('Failed to load history');
        setSessions([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [studentUid]);

  const openSession = useCallback(
    (item: SessionIndexListItem) => {
      const studentName =
        studentNameFromNav ??
        getActiveStudentName() ??
        currentUser?.displayName ??
        'Student';

      navigate('/y3/language-conventions/review', {
        state: { indexItem: item, storagePath: item.storagePath, studentUid, studentName },
      });
    },
    [currentUser?.displayName, navigate, studentNameFromNav, studentUid]
  );

  const downloadPdfForSession = useCallback(async (item: SessionIndexListItem, label: string) => {
    setError(null);
    setDownloadingIds((prev) => {
      const next = new Set(prev);
      next.add(item.sessionId);
      return next;
    });

    try {
      const sessionJson = (await loadSessionJsonByStoragePath(item.storagePath)) as LCSession;
      const studentName =
        studentNameFromNav ??
        getActiveStudentName() ??
        currentUser?.displayName ??
        'Student';

      const bytes = await buildLanguageConventionsPdf({
        title: label,
        session: sessionJson,
        studentName,
        createdAtIso: sessionJson.submittedAt ?? sessionJson.createdAt ?? item.submittedAt ?? item.createdAt,
        score: sessionJson.summary,
        sessionId: item.sessionId,
      });
      downloadBytes(bytes, `LanguageConventions_${item.sessionId}.pdf`);
    } catch (e) {
      console.error('Failed to download PDF:', e);
      setError('Failed to generate PDF');
    } finally {
      setDownloadingIds((prev) => {
        const next = new Set(prev);
        next.delete(item.sessionId);
        return next;
      });
    }
  }, [currentUser?.displayName, studentNameFromNav]);

  const dateRangeLabel = useMemo(() => {
    try {
      const from = fromMs ? new Date(fromMs).toLocaleDateString() : fromDate;
      const to = toMs ? new Date(toMs).toLocaleDateString() : toDate;
      return from === to ? from : `${from} – ${to}`;
    } catch {
      return `${fromDate} – ${toDate}`;
    }
  }, [fromDate, fromMs, toDate, toMs]);

  // Chart dimensions and styling (match Subtraction History)
  const chartWidth = 800;
  const chartHeight = 400;
  const margin = { top: 20, right: 30, bottom: 80, left: 60 };
  const innerWidth = chartWidth - margin.left - margin.right;
  const innerHeight = chartHeight - margin.top - margin.bottom;

  const chartSessions = useMemo(() => {
    return dateFilteredSessions
      .slice()
      .filter((s) => {
        const t =
          (typeof s.submittedAtMillis === 'number' ? s.submittedAtMillis : undefined) ??
          toMillis(s.submittedAt ?? s.createdAt);
        return t > 0;
      })
      .sort((a, b) => {
        const ta =
          (typeof a.submittedAtMillis === 'number' ? a.submittedAtMillis : undefined) ??
          toMillis(a.submittedAt ?? a.createdAt);
        const tb =
          (typeof b.submittedAtMillis === 'number' ? b.submittedAtMillis : undefined) ??
          toMillis(b.submittedAt ?? b.createdAt);
        return ta - tb;
      });
  }, [dateFilteredSessions]);

  const chartData = useMemo(() => {
    return chartSessions.map((session, index) => {
      const ms =
        (typeof session.submittedAtMillis === 'number' ? session.submittedAtMillis : undefined) ??
        toMillis(session.submittedAt ?? session.createdAt);
      const date = ms ? new Date(ms) : new Date(0);
      const percentage = session.score?.percentage ?? 0;
      const x = chartSessions.length > 1 ? (index / (chartSessions.length - 1)) * innerWidth : innerWidth / 2;
      const y = innerHeight - (percentage / 100) * innerHeight;
      return {
        x,
        y,
        percentage,
        date: date.toLocaleDateString(),
        session,
      };
    });
  }, [chartSessions, innerHeight, innerWidth]);

  const linePath =
    chartData.length > 1 ? `M ${chartData.map((point) => `${point.x},${point.y}`).join(' L ')}` : '';

  const yTicks = [0, 25, 50, 75, 100].map((percentage) => ({
    percentage,
    y: innerHeight - (percentage / 100) * innerHeight,
  }));

  if (!currentUser) {
    return <div className="bg-white rounded-xl border border-gray-200 p-6">Please sign in to view history.</div>;
  }

  // Student view: match Addition/Multiplication history layout (list + open + download)
  if (role === 'student') {
    return (
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

        {!loading && !error && dateFilteredSessions.length === 0 && (
          <div className="mt-6 text-gray-600">No language conventions practice sessions found for this date range.</div>
        )}

        {!loading && !error && dateFilteredSessions.length > 0 && (
          <div className="mt-6 space-y-3">
            {dateFilteredSessions.map((item) => {
              const ms =
                (typeof item.submittedAtMillis === 'number' ? item.submittedAtMillis : undefined) ??
                toMillis(item.submittedAt ?? item.createdAt);
              const score = item.score;
              const isDownloading = downloadingIds.has(item.sessionId);

              return (
                <div
                  key={item.sessionId}
                  className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-xl border border-gray-200 bg-white p-4"
                >
                  <div>
                    <div className="text-gray-900 font-semibold">Language conventions practice</div>
                    <div className="text-sm text-gray-600">{formatDateTime(ms)}</div>
                    {score && (
                      <div className="text-sm text-gray-700 mt-1">
                        Score: <span className="font-semibold">{score.correct}</span> / {score.total} ({score.percentage}%)
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2 justify-end">
                    <button
                      type="button"
                      onClick={() => openSession(item)}
                      className="px-4 py-2 rounded-lg bg-purple-700 text-white hover:bg-purple-800 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Open
                    </button>
                    <button
                      type="button"
                      onClick={() => downloadPdfForSession(item, 'Language Conventions Practice')}
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
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-green-50">
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <Link to="/y3/language-conventions" className="flex items-center text-blue-600 hover:text-blue-700 transition-colors">
              <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Back to Practice
            </Link>

            <div className="text-center">
              <h1 className="text-3xl font-bold text-gray-900">Language Conventions Practice History</h1>
              <p className="text-gray-600">Track your progress over time</p>
            </div>

            <div className="w-32"></div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm mb-6">
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-end gap-3">
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

        {(role === 'parent' || role === 'teacher') && (
          <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm mb-6">
            <label className="block text-sm font-semibold text-gray-700">Student</label>
            <select
              className="mt-1 px-3 py-2 rounded-lg border border-gray-300 bg-white text-gray-900"
              value={studentUid ?? ''}
              onChange={(e) => {
                const next = e.target.value;
                if (!next) return;
                setActiveStudent(next);
                setActiveStudentUid(next);
              }}
            >
              {selectableStudentIds.length === 0 ? (
                <option value="">No linked students</option>
              ) : (
                selectableStudentIds.map((uid) => (
                  <option key={uid} value={uid}>
                    {uid}
                  </option>
                ))
              )}
            </select>
          </div>
        )}

        {loading && (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <span className="ml-2 text-gray-600">Loading history...</span>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-6 mb-6">
            <div className="flex items-center">
              <svg className="w-5 h-5 text-red-600 mr-2" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                  clipRule="evenodd"
                />
              </svg>
              <span className="text-red-800 font-medium">{error}</span>
            </div>
          </div>
        )}

        {!loading && !error && sessions.length === 0 && (
          <div className="text-center py-12">
            <svg className="w-16 h-16 text-gray-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
              />
            </svg>
            <h3 className="text-lg font-medium text-gray-900 mb-2">No practice sessions found</h3>
            <p className="text-gray-600 mb-4">Start practicing to see your progress!</p>
            <Link
              to="/y3/language-conventions"
              className="btn-start"
            >
              Start
            </Link>
          </div>
        )}

        {!loading && !error && sessions.length > 0 && dateFilteredSessions.length === 0 && (
          <div className="text-center py-12">
            <h3 className="text-lg font-medium text-gray-900 mb-2">No sessions in the selected date range</h3>
            <p className="text-gray-600">Try expanding the date range.</p>
          </div>
        )}

        {!loading && !error && dateFilteredSessions.length > 0 && (
          <>
            <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm mb-6">
              <h2 className="text-xl font-bold text-gray-900 mb-6">Progress Over Time</h2>

              <div className="flex justify-center">
                <svg width={chartWidth} height={chartHeight} className="border border-gray-200 rounded">
                  <g transform={`translate(${margin.left}, ${margin.top})`}>
                    {yTicks.map((tick) => (
                      <g key={tick.percentage}>
                        <line x1={0} y1={tick.y} x2={innerWidth} y2={tick.y} stroke="#e5e7eb" strokeWidth={1} />
                        <text x={-10} y={tick.y + 4} textAnchor="end" fontSize={12} fill="#6b7280">
                          {tick.percentage}%
                        </text>
                      </g>
                    ))}

                    {chartData.length > 1 && (
                      <path
                        d={linePath}
                        fill="none"
                        stroke="#3b82f6"
                        strokeWidth={3}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    )}

                    {chartData.map((point, index) => (
                      <g key={index}>
                        <circle
                          cx={point.x}
                          cy={point.y}
                          r={6}
                          fill="#3b82f6"
                          stroke="#ffffff"
                          strokeWidth={2}
                          className="hover:r-8 cursor-pointer transition-all"
                          onClick={() => openSession(point.session)}
                        />
                        <text
                          x={point.x}
                          y={innerHeight + 15}
                          textAnchor="middle"
                          fontSize={10}
                          fill="#6b7280"
                          transform={`rotate(-45, ${point.x}, ${innerHeight + 15})`}
                        >
                          {point.date}
                        </text>
                        <title>
                          {point.percentage}% on {point.date}
                        </title>
                      </g>
                    ))}
                  </g>

                  <text
                    x={20}
                    y={chartHeight / 2}
                    textAnchor="middle"
                    fontSize={14}
                    fill="#374151"
                    transform={`rotate(-90, 20, ${chartHeight / 2})`}
                  >
                    Percentage Correct (%)
                  </text>

                  <text x={chartWidth / 2} y={chartHeight - 10} textAnchor="middle" fontSize={14} fill="#374151">
                    Date
                  </text>
                </svg>
              </div>

              <p className="text-sm text-gray-600 mt-4 text-center">Click on any point to review that practice session</p>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
              <div className="px-6 py-4 border-b border-gray-200">
                <h2 className="text-xl font-bold text-gray-900">Practice Sessions</h2>
                <p className="text-gray-600">Your complete language conventions practice history</p>
              </div>

              <div className="divide-y divide-gray-200">
                {dateFilteredSessions.map((session, index) => (
                  <div
                    key={session.sessionId}
                    className="px-6 py-4 hover:bg-gray-50 cursor-pointer transition-colors group"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-4" onClick={() => openSession(session)}>
                        <div className="flex-shrink-0">
                          <div
                            className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-white ${
                              (session.score?.percentage ?? 0) >= 90
                                ? 'bg-green-500'
                                : (session.score?.percentage ?? 0) >= 75
                                  ? 'bg-yellow-500'
                                  : (session.score?.percentage ?? 0) >= 60
                                    ? 'bg-orange-500'
                                    : 'bg-red-500'
                            }`}
                          >
                            {(session.score?.percentage ?? 0)}%
                          </div>
                        </div>
                        <div>
                          <div className="font-medium text-gray-900">Practice Session #{dateFilteredSessions.length - index}</div>
                          <div className="text-sm text-gray-600">{formatDateTime(session.submittedAt ?? session.createdAt)}</div>
                        </div>
                      </div>
                      <div className="flex items-center space-x-4">
                        <div className="text-right">
                          <div className="text-sm font-medium text-gray-900">
                            {(session.score?.correct ?? 0)} / {(session.score?.total ?? 0)} correct
                          </div>
                        </div>
                        <button
                          className="ml-4 px-3 py-1 rounded-lg bg-blue-500 text-white text-xs font-semibold shadow hover:bg-blue-600 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-400"
                          title="Download PDF"
                          onClick={async (e) => {
                            e.stopPropagation();
                            await downloadPdfForSession(session, `Practice Session #${dateFilteredSessions.length - index}`);
                          }}
                        >
                          Download PDF
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
};

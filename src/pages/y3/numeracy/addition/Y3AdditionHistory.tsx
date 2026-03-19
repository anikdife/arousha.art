import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { auth } from '../../../../firebase/firebase';
import { listUserSessions } from '../../../../lib/listSessionsFromStorage';
import { loadSessionJsonByStoragePath } from '../../../../lib/loadSessionJsonByPath';
import { listTopicSessionIndex, SessionIndexItem } from '../../../../lib/sessionIndexReader';
import { buildAdditionPdf, downloadBytes } from '../../../../lib/additionPdf';
import { getActiveStudentName } from '../../../../lib/activeStudent';

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

function formatDateTime(value: any): string {
  const ms = toMillis(value);
  if (!ms) return 'Date unavailable';
  try {
    return new Date(ms).toLocaleString();
  } catch {
    return 'Date unavailable';
  }
}

function inferIsoDateFromSessionId(sessionId: string): string | undefined {
  const m = /-(\d{10,})$/.exec(sessionId);
  if (!m) return undefined;
  const ms = Number(m[1]);
  if (!Number.isFinite(ms) || ms <= 0) return undefined;
  try {
    return new Date(ms).toISOString();
  } catch {
    return undefined;
  }
}

export const Y3AdditionHistory: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const studentNameFromNav = (location.state as any)?.studentName as string | undefined;

  const [sessions, setSessions] = useState<SessionIndexItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openingIds, setOpeningIds] = useState<Set<string>>(() => new Set());
  const [downloadingIds, setDownloadingIds] = useState<Set<string>>(() => new Set());

  const [fromDate, setFromDate] = useState<string>(() => toDateInputValue(Date.now()));
  const [toDate, setToDate] = useState<string>(() => toDateInputValue(Date.now()));

  const fromMs = useMemo(() => parseDateInputToLocalDayStartMs(fromDate), [fromDate]);
  const toMs = useMemo(() => parseDateInputToLocalDayEndMs(toDate), [toDate]);

  const uidToLoad = auth.currentUser?.uid;

  useEffect(() => {
    let cancelled = false;

    if (!uidToLoad) {
      setError('No user logged in');
      setSessions([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    setSessions([]);

    (async () => {
      try {
        const items = await listTopicSessionIndex(uidToLoad, 'addition');
        if (items.length > 0) {
          if (!cancelled) setSessions(items);
          return;
        }

        // Back-compat: older sessions may exist in Storage without Firestore index.
        const stored = await listUserSessions(uidToLoad);
        const mapped: SessionIndexItem[] = stored
          .filter((s) => String(s.sessionId).startsWith('addition-'))
          .map((s) => {
            const inferred = inferIsoDateFromSessionId(s.sessionId);
            return {
              sessionId: s.sessionId,
              topic: 'addition' as const,
              createdAt: inferred,
              submittedAt: inferred,
              submittedAtMillis: toMillis(inferred),
              score: undefined,
              storagePath: s.fullPath,
            } satisfies SessionIndexItem;
          })
          .sort((a, b) => (b.submittedAtMillis ?? 0) - (a.submittedAtMillis ?? 0));

        if (!cancelled) setSessions(mapped);
      } catch (e) {
        console.error('Failed to load addition history index:', e);
        if (!cancelled) setError('Failed to load session history');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [uidToLoad]);

  const dateFilteredSessions = useMemo(() => {
    return sessions.filter((s) => {
      const t = (typeof s.submittedAtMillis === 'number' ? s.submittedAtMillis : undefined) ?? toMillis(s.submittedAt ?? s.createdAt);
      if (!t) return false;
      if (typeof fromMs === 'number' && t < fromMs) return false;
      if (typeof toMs === 'number' && t > toMs) return false;
      return true;
    });
  }, [fromMs, sessions, toMs]);

  const openSession = useCallback(
    async (item: SessionIndexItem) => {
      setError(null);
      setOpeningIds((prev) => {
        const next = new Set(prev);
        next.add(item.sessionId);
        return next;
      });
      try {
        const sessionJson = await loadSessionJsonByStoragePath(item.storagePath);
        const scoreFromIndex = item.score ?? { correct: 0, total: 0, percentage: 0 };
        const sessionForReview = {
          ...sessionJson,
          sessionId: item.sessionId,
          topic: sessionJson.topic ?? 'addition',
          score: sessionJson.score ?? scoreFromIndex,
        };

        const studentName =
          studentNameFromNav ??
          getActiveStudentName() ??
          auth.currentUser?.displayName ??
          'Student';

        navigate('/y3/history/review/addition', {
          state: { session: sessionForReview, studentName, backgroundLocation: location },
        });
      } catch (e) {
        console.error('Failed to open session:', e);
        setError('Failed to open session');
      } finally {
        setOpeningIds((prev) => {
          if (!prev.has(item.sessionId)) return prev;
          const next = new Set(prev);
          next.delete(item.sessionId);
          return next;
        });
      }
    },
    [location, navigate]
  );

  const downloadSession = useCallback(async (item: SessionIndexItem) => {
    setError(null);

    setDownloadingIds((prev) => {
      const next = new Set(prev);
      next.add(item.sessionId);
      return next;
    });

    try {
      const sessionJson = await loadSessionJsonByStoragePath(item.storagePath);

      const scoreFromIndex = item.score ?? { correct: 0, total: 0, percentage: 0 };
      const scoreToPrint = sessionJson.score ?? scoreFromIndex;

      const studentName =
        studentNameFromNav ??
        getActiveStudentName() ??
        auth.currentUser?.displayName ??
        'Student';

      const bytes = await buildAdditionPdf({
        title: 'Addition Practice',
        pages: sessionJson.pages,
        createdAtIso:
          sessionJson.submittedAt ??
          sessionJson.createdAt ??
          item.submittedAt ??
          item.createdAt ??
          new Date((item.submittedAtMillis ?? 0) || Date.now()).toISOString(),
        studentName,
        score: scoreToPrint,
        sessionId: item.sessionId,
      });
      downloadBytes(bytes, `PracticeSession_${item.sessionId}.pdf`);
    } catch (e) {
      console.error('Failed to download session:', e);
      setError('Failed to generate PDF');
    } finally {
      setDownloadingIds((prev) => {
        const next = new Set(prev);
        next.delete(item.sessionId);
        return next;
      });
    }
  }, [studentNameFromNav]);

  const dateRangeLabel = useMemo(() => {
    try {
      const from = fromMs ? new Date(fromMs).toLocaleDateString() : fromDate;
      const to = toMs ? new Date(toMs).toLocaleDateString() : toDate;
      return from === to ? from : `${from} – ${to}`;
    } catch {
      return `${fromDate} – ${toDate}`;
    }
  }, [fromDate, fromMs, toDate, toMs]);

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
        <div className="mt-6 text-gray-600">No addition practice sessions found for this date range.</div>
      )}

      {!loading && !error && dateFilteredSessions.length > 0 && (
        <div className="mt-6 space-y-3">
          {dateFilteredSessions.map((item) => {
            const ms = (typeof item.submittedAtMillis === 'number' ? item.submittedAtMillis : undefined) ?? toMillis(item.submittedAt ?? item.createdAt);
            const score = item.score;
            const isOpening = openingIds.has(item.sessionId);
            const isDownloading = downloadingIds.has(item.sessionId);
            return (
              <div
                key={item.sessionId}
                className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-xl border border-gray-200 bg-white p-4"
              >
                <div>
                  <div className="text-gray-900 font-semibold">Addition practice</div>
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
                    onClick={() => downloadSession(item)}
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
};

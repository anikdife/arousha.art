import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { auth } from '../../../../firebase/firebase';
import { getActiveStudentName } from '../../../../lib/activeStudent';
import { listTopicSessionIndex, SessionIndexItem } from '../../../../lib/sessionIndexReader';
import { loadSessionJsonByStoragePath } from '../../../../lib/loadSessionJsonByPath';
import { buildGeometryPdf } from '../../../../lib/geometryPdf';
import { downloadBytes } from '../../../../lib/additionPdf';
import { subscribeHistoryOpenComplete } from '../../../../lib/historyOpenSignal';

type HistoryRow = {
  sessionId: string;
  createdAt?: any;
  storagePath: string;
  score?: { correct: number; total: number; percentage: number };
};

function toMillis(value: any): number {
  if (!value) return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
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
  if (typeof value?.seconds === 'number') return value.seconds * 1000;
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

export const Y3GeometryHistory: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const [rows, setRows] = useState<HistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [openingIds, setOpeningIds] = useState<Set<string>>(() => new Set());
  const [downloadingIds, setDownloadingIds] = useState<Set<string>>(() => new Set());

  const [fromDate, setFromDate] = useState<string>(() => toDateInputValue(Date.now()));
  const [toDate, setToDate] = useState<string>(() => toDateInputValue(Date.now()));

  const fromMs = useMemo(() => parseDateInputToLocalDayStartMs(fromDate), [fromDate]);
  const toMs = useMemo(() => parseDateInputToLocalDayEndMs(toDate), [toDate]);

  useEffect(() => {
    // History stays mounted behind the review modal, so we need to clear
    // row-level loading state when the review finishes opening.
    return subscribeHistoryOpenComplete((sessionId) => {
      setOpeningIds((prev) => {
        if (!prev.has(sessionId)) return prev;
        const next = new Set(prev);
        next.delete(sessionId);
        return next;
      });
    });
  }, []);

  useEffect(() => {
    const run = async () => {
      setLoading(true);
      setError(null);

      const user = auth.currentUser;
      if (!user) {
        setRows([]);
        setLoading(false);
        setError('Not signed in.');
        return;
      }

      try {
        const items = await listTopicSessionIndex(user.uid, 'geometry');
        const mapped: HistoryRow[] = (items as SessionIndexItem[])
          .map((it) => ({
            sessionId: String(it.sessionId),
            createdAt: (typeof it.submittedAtMillis === 'number' ? it.submittedAtMillis : undefined) ?? it.submittedAt ?? it.createdAt,
            storagePath: String(it.storagePath),
            score: it.score,
          }))
          .filter((it) => Boolean(it.storagePath));

        setRows(mapped);
      } catch (e) {
        console.error('Failed to load geometry history:', e);
        setError('Failed to load history.');
      } finally {
        setLoading(false);
      }
    };

    void run();
  }, []);

  const sorted = useMemo(() => {
    const filtered = rows.filter((r) => {
      const t = toMillis(r.createdAt);
      if (!t) return false;
      if (typeof fromMs === 'number' && t < fromMs) return false;
      if (typeof toMs === 'number' && t > toMs) return false;
      return true;
    });
    return filtered.sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
  }, [fromMs, rows, toMs]);

  const open = async (row: HistoryRow) => {
    setError(null);
    if (openingIds.has(row.sessionId)) return;

    setOpeningIds((prev) => {
      const next = new Set(prev);
      next.add(row.sessionId);
      return next;
    });

    try {
      const session = await loadSessionJsonByStoragePath(row.storagePath);

      const scoreFromIndex =
        row.score ??
        ({ correct: 0, total: 0, percentage: 0 } as { correct: number; total: number; percentage: number });

      const sessionForReview = {
        ...session,
        sessionId: row.sessionId,
        topic: session?.topic ?? 'geometry',
        score: session?.score ?? scoreFromIndex,
      };

      const studentName = getActiveStudentName() ?? auth.currentUser?.displayName ?? 'Student';

      navigate('/y3/history/review/geometry', {
        state: { session: sessionForReview, studentName, backgroundLocation: location },
      });
    } catch (e) {
      console.error('Failed to open geometry session:', e);
      setError('Failed to open session.');
    } finally {
      setOpeningIds((prev) => {
        if (!prev.has(row.sessionId)) return prev;
        const next = new Set(prev);
        next.delete(row.sessionId);
        return next;
      });
    }
  };

  const download = async (row: HistoryRow) => {
    setError(null);

    setDownloadingIds((prev) => {
      const next = new Set(prev);
      next.add(row.sessionId);
      return next;
    });

    try {
      const session = await loadSessionJsonByStoragePath(row.storagePath);

      const scoreFromIndex =
        row.score ??
        ({ correct: 0, total: 0, percentage: 0 } as { correct: number; total: number; percentage: number });

      const sessionForPdf = {
        ...session,
        sessionId: row.sessionId,
        topic: session?.topic ?? 'geometry',
        score: session?.score ?? scoreFromIndex,
      };

      const bytes = await buildGeometryPdf({
        title: 'Geometry Practice',
        session: sessionForPdf,
        studentName: getActiveStudentName() ?? auth.currentUser?.displayName ?? 'Student',
      });
      downloadBytes(bytes, `PracticeSession_${row.sessionId}.pdf`);
    } catch (e) {
      console.error('Failed to download geometry session:', e);
      setError('Failed to generate PDF');
    } finally {
      setDownloadingIds((prev) => {
        const next = new Set(prev);
        next.delete(row.sessionId);
        return next;
      });
    }
  };

  return (
    <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-gray-900 font-bold text-xl">Geometry History</div>
          <div className="text-gray-600 text-sm mt-1">Saved practice sets</div>
        </div>

        <div className="flex flex-col items-end gap-3">
          <button
            type="button"
            onClick={() => navigate('/y3/numeracy/geometry')}
            className="px-4 py-2 text-sm font-semibold rounded-lg bg-gray-100 text-gray-800 hover:bg-gray-200"
          >
            Back to Practice
          </button>

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
        </div>
      </div>

      {error && (
        <div className="mt-4 bg-red-50 border border-red-200 rounded-xl p-4">
          <div className="text-red-800 font-medium">{error}</div>
        </div>
      )}

      {loading ? (
        <div className="mt-4 text-gray-600">Loading…</div>
      ) : sorted.length === 0 ? (
        <div className="mt-4 text-gray-600">
          {rows.length === 0 ? 'No geometry sessions yet.' : 'No sessions in the selected date range.'}
        </div>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-gray-600">
                <th className="py-2 pr-4">Date</th>
                <th className="py-2 pr-4">Session</th>
                <th className="py-2 pr-4">Score</th>
                <th className="py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => {
                const opening = openingIds.has(r.sessionId);
                const downloading = downloadingIds.has(r.sessionId);
                const scoreLabel = r.score ? `${r.score.correct}/${r.score.total} (${r.score.percentage}%)` : '-';

                return (
                  <tr key={r.sessionId} className="border-t border-gray-100">
                    <td className="py-2 pr-4 text-gray-700">{formatDateTime(r.createdAt)}</td>
                    <td className="py-2 pr-4 text-gray-700">{r.sessionId}</td>
                    <td className="py-2 pr-4 text-gray-700">{scoreLabel}</td>
                    <td className="py-2">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => void open(r)}
                          disabled={opening}
                          className={
                            opening
                              ? 'px-4 py-2 rounded-lg bg-gray-200 text-gray-700 cursor-not-allowed'
                              : 'px-4 py-2 rounded-lg bg-gray-900 text-white hover:bg-gray-800'
                          }
                        >
                          {opening ? 'Opening…' : 'Open'}
                        </button>

                        <button
                          type="button"
                          onClick={() => void download(r)}
                          disabled={downloading}
                          className={
                            downloading
                              ? 'px-4 py-2 rounded-lg bg-gray-200 text-gray-700 cursor-not-allowed'
                              : 'px-4 py-2 rounded-lg bg-gray-900 text-white hover:bg-gray-800'
                          }
                        >
                          {downloading ? 'Downloading…' : 'Download'}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

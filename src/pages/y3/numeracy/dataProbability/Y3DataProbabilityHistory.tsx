import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../../../auth/AuthProvider';
import { auth } from '../../../../firebase/firebase';
import { listDataProbabilitySessionIndex } from '../../../../lib/sessionIndexReader';
import { loadSessionJsonByStoragePath } from '../../../../lib/loadSessionJsonByPath';
import { buildDataProbabilityPdf } from '../../../../lib/dataProbabilityPdf';
import { downloadBytes } from '../../../../lib/subtractionPdf';
import { getActiveStudentName, getActiveStudentUid, setActiveStudent } from '../../../../lib/activeStudent';

type HistoryRow = {
  sessionId: string;
  createdAt?: any;
  submittedAt?: any;
  submittedAtMillis?: number;
  storagePath: string;
  percentage?: number;
  score?: { correct: number; total: number; percentage: number };
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

export const Y3DataProbabilityHistory: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { currentUser, userProfile } = useAuth();

  const studentUidFromNav = (location.state as any)?.studentUid as string | undefined;
  const studentNameFromNav = (location.state as any)?.studentName as string | undefined;

  const [activeStudentUid, setActiveStudentUid] = useState<string | undefined>(() => getActiveStudentUid() ?? undefined);

  const [rows, setRows] = useState<HistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [openingIds, setOpeningIds] = useState<Set<string>>(() => new Set());
  const [downloadingIds, setDownloadingIds] = useState<Set<string>>(() => new Set());
  const [error, setError] = useState<string | null>(null);

  const [fromDate, setFromDate] = useState<string>(() => toDateInputValue(Date.now()));
  const [toDate, setToDate] = useState<string>(() => toDateInputValue(Date.now()));

  const fromMs = useMemo(() => parseDateInputToLocalDayStartMs(fromDate), [fromDate]);
  const toMs = useMemo(() => parseDateInputToLocalDayEndMs(toDate), [toDate]);

  const role = userProfile?.role ?? 'student';

  const selectableStudentIds = useMemo(() => {
    if (role !== 'parent' && role !== 'teacher') return [];
    const current = (userProfile as any)?.linkedStudentUids;
    if (Array.isArray(current)) return current;
    const legacy = (userProfile as any)?.linkedStudentIds;
    return Array.isArray(legacy) ? legacy : [];
  }, [role, userProfile]);

  useEffect(() => {
    if (!studentUidFromNav) return;
    setActiveStudent(studentUidFromNav, studentNameFromNav);
    setActiveStudentUid(studentUidFromNav);
  }, [studentNameFromNav, studentUidFromNav]);

  const studentUid = useMemo(() => {
    if (studentUidFromNav) return studentUidFromNav;
    if (activeStudentUid) return activeStudentUid;
    if (role === 'student') return currentUser?.uid ?? undefined;
    if (selectableStudentIds.length > 0) return selectableStudentIds[0];
    return currentUser?.uid ?? undefined;
  }, [activeStudentUid, currentUser?.uid, role, selectableStudentIds, studentUidFromNav]);

  useEffect(() => {
    const run = async () => {
      setLoading(true);
      setError(null);

      if (!studentUid) {
        setRows([]);
        setLoading(false);
        setError('No student selected.');
        return;
      }

      try {
        const items = await listDataProbabilitySessionIndex(studentUid);
        const mapped: HistoryRow[] = items
          .map((it: any) => ({
            sessionId: String(it.sessionId),
            createdAt: it.createdAt,
            submittedAt: it.submittedAt,
            submittedAtMillis: it.submittedAtMillis,
            storagePath: String(it.storagePath),
            percentage: it.score?.percentage,
            score: it.score,
          }))
          .filter((it) => Boolean(it.storagePath));

        setRows(mapped);
      } catch (e) {
        console.error('Failed to load data-probability history:', e);
        setError('Failed to load history.');
      } finally {
        setLoading(false);
      }
    };

    void run();
  }, [studentUid]);

  const sorted = useMemo(() => {
    const filtered = rows.filter((r) => {
      const t = r.submittedAtMillis ?? toMillis(r.submittedAt ?? r.createdAt);
      if (!t) return false;
      if (typeof fromMs === 'number' && t < fromMs) return false;
      if (typeof toMs === 'number' && t > toMs) return false;
      return true;
    });
    return filtered.sort((a, b) => {
      const ta = a.submittedAtMillis ?? toMillis(a.submittedAt ?? a.createdAt);
      const tb = b.submittedAtMillis ?? toMillis(b.submittedAt ?? b.createdAt);
      return tb - ta;
    });
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
      navigate('/y3/numeracy/data-probability', { state: { loadedSession: session } });
    } catch (e) {
      console.error('Failed to open data-probability session:', e);
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

  const downloadPdf = async (row: HistoryRow) => {
    setError(null);

    if (downloadingIds.has(row.sessionId)) return;
    setDownloadingIds((prev) => {
      const next = new Set(prev);
      next.add(row.sessionId);
      return next;
    });

    try {
      const session = await loadSessionJsonByStoragePath(row.storagePath);
      const studentName = getActiveStudentName() ?? auth.currentUser?.displayName ?? 'Student';
      const bytes = await buildDataProbabilityPdf({ title: 'Data & Probability Practice', session, studentName });
      downloadBytes(bytes, `PracticeSession_${row.sessionId}.pdf`);
    } catch (e) {
      console.error('Failed to download PDF:', e);
      setError('Failed to generate PDF.');
    } finally {
      setDownloadingIds((prev) => {
        if (!prev.has(row.sessionId)) return prev;
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
          <div className="text-gray-900 font-bold text-xl">Data &amp; Probability History</div>
          <div className="text-gray-600 text-sm mt-1">Saved practice workbooks</div>
        </div>
        <div className="flex flex-col items-end gap-3">
          <button
            type="button"
            onClick={() => navigate('/y3/numeracy/data-probability')}
            className="px-4 py-2 text-sm font-semibold rounded-lg bg-purple-600 text-white hover:bg-purple-700"
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

      {(role === 'parent' || role === 'teacher') && (
        <div className="mt-4">
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

      {error && (
        <div className="mt-4 bg-red-50 border border-red-200 rounded-xl p-4">
          <div className="text-red-800 font-medium">{error}</div>
        </div>
      )}

      {loading ? (
        <div className="mt-4 text-gray-600">Loading...</div>
      ) : sorted.length === 0 ? (
        <div className="mt-4 text-gray-600">{rows.length === 0 ? 'No sessions for the selected date range.' : 'No sessions in the selected date range.'}</div>
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
                const isOpening = openingIds.has(r.sessionId);
                const isDownloading = downloadingIds.has(r.sessionId);
                const ms = r.submittedAtMillis ?? toMillis(r.submittedAt ?? r.createdAt);
                return (
                  <tr key={r.sessionId} className="border-t border-gray-100">
                    <td className="py-2 pr-4 text-gray-700">{ms ? new Date(ms).toLocaleString() : '-'}</td>
                    <td className="py-2 pr-4 text-gray-700">{r.sessionId}</td>
                    <td className="py-2 pr-4 text-gray-700">
                      {typeof r.percentage === 'number' ? `${r.percentage}%` : '-'}
                    </td>
                    <td className="py-2">
                      <div className="flex items-center gap-2 justify-end">
                        <button
                          type="button"
                          onClick={() => void open(r)}
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
                          onClick={() => void downloadPdf(r)}
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
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* keep auth import used for CRA lint parity */}
      <div className="hidden">{String(Boolean(auth.currentUser))}</div>
    </div>
  );
};

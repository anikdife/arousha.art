import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../../auth/AuthProvider';
import { listReadingMagazineSessionIndex, ReadingMagazineSessionIndexItem } from '../../../lib/sessionIndexReader';
import { loadSessionJsonByStoragePath } from '../../../lib/loadSessionJsonByPath';
import { downloadBytes } from '../../../lib/subtractionPdf';
import { buildReadingMagazinePdf } from '../../../lib/readingMagazinePdf';
import { OverlayTarget, ParentSessionOverlay } from '../history/ParentSessionOverlay';

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

function formatDateTime(ms: number) {
  if (!ms) return 'Date unavailable';
  try {
    return new Date(ms).toLocaleString();
  } catch {
    return 'Date unavailable';
  }
}

function getMetaString(meta: unknown, key: string): string | null {
  if (!meta || typeof meta !== 'object') return null;
  const v = (meta as any)[key];
  return typeof v === 'string' ? v : null;
}

export const Y3ReadingHistoryTab: React.FC = () => {
  const { currentUser, userProfile } = useAuth();

  const studentUid = userProfile?.role === 'student' ? currentUser?.uid ?? undefined : undefined;

  const [items, setItems] = useState<ReadingMagazineSessionIndexItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [openingSessionId, setOpeningSessionId] = useState<string | null>(null);
  const [downloadingIds, setDownloadingIds] = useState<Set<string>>(() => new Set());
  const [overlayTarget, setOverlayTarget] = useState<OverlayTarget | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const [fromDate, setFromDate] = useState<string>(() => toDateInputValue(Date.now()));
  const [toDate, setToDate] = useState<string>(() => toDateInputValue(Date.now()));

  const fromMs = useMemo(() => parseDateInputToLocalDayStartMs(fromDate), [fromDate]);
  const toMs = useMemo(() => parseDateInputToLocalDayEndMs(toDate), [toDate]);

  useEffect(() => {
    let cancelled = false;

    if (!studentUid) {
      setItems([]);
      setLoading(false);
      setError('Reading practice history is available for student accounts.');
      return;
    }

    setLoading(true);
    setError(null);

    (async () => {
      try {
        const next = await listReadingMagazineSessionIndex(studentUid);
        if (!cancelled) setItems(next);
      } catch (e) {
        console.error('Failed to load reading-magazine history:', e);
        if (!cancelled) setError('Failed to load history');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [studentUid]);

  const sorted = useMemo(
    () => {
      const filtered = items.filter((it) => {
        const t = it.submittedAtMillis ?? 0;
        if (!t) return false;
        if (typeof fromMs === 'number' && t < fromMs) return false;
        if (typeof toMs === 'number' && t > toMs) return false;
        return true;
      });
      return filtered.sort((a, b) => (b.submittedAtMillis ?? 0) - (a.submittedAtMillis ?? 0));
    },
    [fromMs, items, toMs]
  );

  const openSession = async (item: ReadingMagazineSessionIndexItem) => {
    setActionError(null);
    setOpeningSessionId(item.sessionId);

    try {
      const json = await loadSessionJsonByStoragePath(item.storagePath);
      const bytes = await buildReadingMagazinePdf({
        title: 'Reading Magazine Practice',
        session: json,
        studentName: userProfile?.displayName ?? undefined,
      });
      setOverlayTarget({ kind: 'pdf', title: 'Reading Magazine Practice', bytes });
    } catch (e) {
      console.error('Failed to open reading session PDF overlay:', e);
      setActionError('Failed to open session');
      setOverlayTarget(null);
      setOpeningSessionId(null);
    }
  };

  const downloadSessionJson = async (item: ReadingMagazineSessionIndexItem) => {
    setActionError(null);

    setDownloadingIds((prev) => {
      const next = new Set(prev);
      next.add(item.sessionId);
      return next;
    });

    try {
      const json = await loadSessionJsonByStoragePath(item.storagePath);
      const bytes = await buildReadingMagazinePdf({
        title: 'Reading Magazine Practice',
        session: json,
        studentName: userProfile?.displayName ?? undefined,
      });
      downloadBytes(bytes, `ReadingMagazine_${item.sessionId}.pdf`);
    } catch (e) {
      console.error('Failed to download reading session PDF:', e);
      setActionError('Failed to download');
    } finally {
      setDownloadingIds((prev) => {
        const next = new Set(prev);
        next.delete(item.sessionId);
        return next;
      });
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div>
            <div className="text-sm font-semibold text-gray-900">History</div>
            <div className="text-xs text-gray-600 mt-1">Your completed Reading practice sessions.</div>
          </div>

          {!error && (
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
          )}
        </div>

        {loading && <div className="mt-4 text-sm text-gray-600">Loading…</div>}

        {!loading && error && (
          <div className="mt-4 text-sm text-red-700">{error}</div>
        )}

        {!loading && !error && actionError && (
          <div className="mt-4 text-sm text-red-700">{actionError}</div>
        )}

        {!loading && !error && sorted.length === 0 && (
          <div className="mt-4 text-sm text-gray-600">
            {items.length === 0 ? 'No sessions for the selected date range.' : 'No sessions in the selected date range.'}
          </div>
        )}

        {!loading && !error && sorted.length > 0 && (
          <div className="mt-6 space-y-3">
            {sorted.map((it) => {
              const correct = it.score?.correct ?? 0;
              const total = it.score?.total ?? 0;
              const percent = it.score?.percentage ?? 0;
              const ms = it.submittedAtMillis ?? 0;

              const isOpening = openingSessionId === it.sessionId;
              const isDownloading = downloadingIds.has(it.sessionId);

              const storyTitle = getMetaString(it.meta, 'storyTitle') ?? 'Story';
              const isoDate = getMetaString(it.meta, 'isoDate');

              return (
                <div key={it.sessionId} className="border border-gray-100 rounded-lg p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-gray-900">{storyTitle}</div>
                      <div className="mt-1 text-xs text-gray-600">{isoDate ? `Date: ${isoDate}` : formatDateTime(ms)}</div>
                      <div className="mt-2 text-sm font-bold text-gray-900">
                        {correct} / {total} <span className="text-blue-700">({percent}%)</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => void openSession(it)}
                        disabled={isOpening}
                        className="px-4 py-2 rounded-lg bg-purple-700 text-white hover:bg-purple-800 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {isOpening ? 'Opening…' : 'Open'}
                      </button>
                      <button
                        type="button"
                        onClick={() => void downloadSessionJson(it)}
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
                </div>
              );
            })}
          </div>
        )}
      </div>

      <ParentSessionOverlay
        target={overlayTarget}
        onClose={() => {
          setOverlayTarget(null);
          setOpeningSessionId(null);
        }}
        onOpenComplete={() => {
          setOpeningSessionId(null);
        }}
      />
    </div>
  );
};

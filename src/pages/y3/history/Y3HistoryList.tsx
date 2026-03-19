import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../../auth/AuthProvider';
import { useY3HistoryData } from '../../../hooks/useY3HistoryData';
import { SessionIndexItem, SessionIndexTopic } from '../../../lib/sessionIndexReader';
import { loadSessionJsonByStoragePath } from '../../../lib/loadSessionJsonByPath';
import { buildSubtractionPdf, downloadBytes } from '../../../lib/subtractionPdf';
import { getActiveStudentName, getActiveStudentUid, setActiveStudent } from '../../../lib/activeStudent';

function formatDateTime(ms: number) {
  if (!ms) return 'Date unavailable';
  try {
    return new Date(ms).toLocaleString();
  } catch {
    return 'Date unavailable';
  }
}

export const Y3HistoryList: React.FC<{ topic: SessionIndexTopic }> = ({ topic }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { currentUser, userProfile } = useAuth();

  const state = (location.state as any) ?? {};
  const stateStudentUid = typeof state.studentUid === 'string' ? state.studentUid : null;
  const stateStudentName = typeof state.studentName === 'string' ? state.studentName : null;

  useEffect(() => {
    if (stateStudentUid) setActiveStudent(stateStudentUid, stateStudentName ?? undefined);
  }, [stateStudentName, stateStudentUid]);

  const studentUid =
    userProfile?.role === 'student'
      ? currentUser?.uid ?? undefined
      : stateStudentUid ?? getActiveStudentUid() ?? undefined;

  const { data, loading, error } = useY3HistoryData(studentUid);

  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const openSession = async (item: SessionIndexItem) => {
    setActionError(null);

    setBusyId(item.sessionId);
    try {
      const sessionJson = await loadSessionJsonByStoragePath(item.storagePath);
      const scoreFromIndex = item.score ?? { correct: 0, total: 0, percentage: 0 };

      const sessionForReview = {
        ...sessionJson,
        sessionId: item.sessionId,
        topic: sessionJson.topic ?? 'subtraction',
        score: sessionJson.score ?? scoreFromIndex,
      };
      const baseReviewPath =
        topic === 'subtraction'
          ? '/y3/history/review'
          : topic === 'multiplication'
            ? '/y3/history/review/multiplication'
            : topic === 'addition'
              ? '/y3/history/review/addition'
              : topic === 'measurement'
                ? '/y3/numeracy/measurement'
                : '/y3/numeracy/data-probability';

      navigate(baseReviewPath, {
        state:
          topic === 'measurement' || topic === 'data-probability'
            ? { loadedSession: sessionForReview }
            : { session: sessionForReview, studentUid, studentName: stateStudentName ?? getActiveStudentName() },
      });
    } catch (e) {
      console.error('Failed to open session:', e);
      setActionError('Failed to open session');
    } finally {
      setBusyId(null);
    }
  };

  const items = useMemo(() => {
    const list =
      topic === 'subtraction'
        ? data?.subtraction ?? []
        : topic === 'multiplication'
          ? data?.multiplication ?? []
          : topic === 'addition'
            ? data?.addition ?? []
            : topic === 'measurement'
              ? data?.measurement ?? []
              : data?.dataProbability ?? [];
    return list.slice().sort((a, b) => (b.submittedAtMillis ?? 0) - (a.submittedAtMillis ?? 0));
  }, [data, topic]);

  const downloadPdf = async (item: SessionIndexItem) => {
    setActionError(null);

    if (topic !== 'subtraction') return;

    setBusyId(item.sessionId);
    try {
      const sessionJson = await loadSessionJsonByStoragePath(item.storagePath);
      const studentName = userProfile?.role === 'student'
        ? (userProfile?.displayName ?? undefined)
        : (stateStudentName ?? getActiveStudentName() ?? undefined);
      const bytes = await buildSubtractionPdf({
        title: 'Subtraction Practice',
        pages: sessionJson.pages,
        createdAtIso:
          sessionJson.submittedAt ??
          sessionJson.createdAt ??
          new Date((item.submittedAtMillis ?? 0) || Date.now()).toISOString(),
        studentName,
      });
      downloadBytes(bytes, `PracticeSession_${item.sessionId}.pdf`);
    } catch (e) {
      console.error('Failed to download PDF:', e);
      setActionError('Failed to generate PDF');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="w-full">
      {userProfile?.role !== 'student' && !studentUid && (
        <div className="mb-4 text-sm text-gray-700 bg-yellow-50 border border-yellow-200 rounded-lg p-3">
          No student selected. Go back to the parent dashboard and click “View Practice Sessions” for a child.
        </div>
      )}

      {userProfile?.role !== 'student' && studentUid && (
        <div className="mb-4 text-xs text-gray-500">
          Viewing: {stateStudentName ?? getActiveStudentName() ?? 'Selected student'}
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-10">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600" />
        </div>
      )}

      {!loading && (error || actionError) && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-4">
          <div className="text-red-800 font-medium">{error ?? actionError}</div>
        </div>
      )}

      {!loading && !error && items.length === 0 && (
        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6">
          <div className="text-gray-900 font-bold">No sessions for the selected date range</div>
          <div className="text-gray-600 mt-1">Complete a practice session to see it here.</div>
        </div>
      )}

      {!loading && !error && items.length > 0 && (
        <div className="space-y-4">
          {items.map((item) => {
            const correct = item.score?.correct ?? 0;
            const total = item.score?.total ?? 0;
            const percent = item.score?.percentage ?? 0;
            const isBusy = busyId === item.sessionId;
            const ms = item.submittedAtMillis ?? 0;

            const canOpen = true;

            return (
              <div
                key={item.sessionId}
                className={
                  canOpen
                    ? 'bg-white rounded-2xl shadow-lg border border-gray-100 p-5 cursor-pointer hover:bg-gray-50'
                    : 'bg-white rounded-2xl shadow-lg border border-gray-100 p-5'
                }
                onClick={canOpen && !isBusy ? () => void openSession(item) : undefined}
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-sm text-gray-600">{formatDateTime(ms)}</div>
                    <div className="mt-1 text-xl font-bold text-gray-900">
                      {correct} / {total}{' '}
                      <span className="text-purple-700">({percent}%)</span>
                    </div>
                    {topic === 'addition' && (
                      <div className="mt-2">
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-700">
                          {item.mode === 'word' ? 'Word Problems' : 'Numeric'}
                        </span>
                      </div>
                    )}
                    <div className="mt-2 text-xs text-gray-500 break-all">{item.storagePath}</div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        void openSession(item);
                      }}
                      disabled={!canOpen || isBusy}
                      className={
                        canOpen
                          ? 'px-4 py-2 text-sm font-semibold rounded-lg bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-50'
                          : 'px-4 py-2 text-sm font-semibold rounded-lg bg-gray-100 text-gray-500 cursor-not-allowed'
                      }
                      title={canOpen ? 'Open session' : 'Open is not available yet for this topic'}
                    >
                      Open
                    </button>

                    {topic === 'subtraction' ? (
                      <button
                        type="button"
                        onClick={() => downloadPdf(item)}
                        disabled={isBusy}
                        className="px-4 py-2 text-sm font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
                      >
                        {isBusy ? 'Preparing…' : 'Download PDF'}
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled
                        className="px-4 py-2 text-sm font-semibold rounded-lg bg-gray-100 text-gray-500 cursor-not-allowed"
                      >
                        Download PDF (coming soon)
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

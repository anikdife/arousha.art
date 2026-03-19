import React, { useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../../../auth/AuthProvider';
import { useY3HistoryData } from '../../../../hooks/useY3HistoryData';
import { useTopicSessionIndex } from '../../../../hooks/useTopicSessionIndex';
import type { SessionIndexItem, SessionIndexTopic } from '../../../../lib/sessionIndexReader';
import { getActiveStudentName } from '../../../../lib/activeStudent';
import { loadSessionJsonByStoragePath } from '../../../../lib/loadSessionJsonByPath';

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

function formatDateTime(ms: number) {
  if (!ms) return 'Date unavailable';
  try {
    return new Date(ms).toLocaleString();
  } catch {
    return 'Date unavailable';
  }
}

function topicLabel(topic: SessionIndexTopic): string {
  switch (topic) {
    case 'subtraction':
      return 'Subtraction';
    case 'addition':
      return 'Addition';
    case 'multiplication':
      return 'Multiplication';
    case 'measurement':
      return 'Measurement';
    case 'data-probability':
      return 'Data & Probability';
    case 'geometry':
      return 'Geometry';
    case 'language-conventions':
      return 'Language';
    case 'reading-magazine':
      return 'Reading';
    case 'writing':
      return 'Writing';
    default:
      return topic;
  }
}

type Category = 'numeracy' | 'language-conventions' | 'reading' | 'writing';

export const SessionListMobile: React.FC<{
  category: Category;
  studentUid: string | undefined;
  studentName?: string | null;
  rangeStartMs?: number;
  rangeEndMs?: number;
  onEmptyCta?: () => void;
  onOpenOverlayForParent?: (item: SessionIndexItem) => void | Promise<void>;
}> = ({ category, studentUid, studentName, rangeStartMs, rangeEndMs, onEmptyCta, onOpenOverlayForParent }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { userProfile } = useAuth();
  const role = userProfile?.role ?? 'student';

  const range = useMemo(() => {
    if (typeof rangeStartMs !== 'number' || typeof rangeEndMs !== 'number') return null;
    return { start: rangeStartMs, end: rangeEndMs };
  }, [rangeEndMs, rangeStartMs]);

  const inRange = (it: SessionIndexItem) => {
    if (!range) return true;
    const ms = it.submittedAtMillis ?? toMillis((it as any).submittedAt ?? (it as any).createdAt);
    if (!ms) return true;
    return ms >= range.start && ms <= range.end;
  };

  const { data, loading: numeracyLoading, error: numeracyError } = useY3HistoryData(category === 'numeracy' ? studentUid : undefined);
  const language = useTopicSessionIndex({ studentUid, topic: 'language-conventions', enabled: category === 'language-conventions' });
  const reading = useTopicSessionIndex({ studentUid, topic: 'reading-magazine', enabled: category === 'reading' });

  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const items = useMemo(() => {
    if (category === 'numeracy') {
      const out: Array<SessionIndexItem & { label: string }> = [];
      const add = (label: string, list: SessionIndexItem[]) => {
        for (const it of list) out.push({ ...it, label });
      };
      add('Subtraction', data?.subtraction ?? []);
      add('Addition', data?.addition ?? []);
      add('Multiplication', data?.multiplication ?? []);
      add('Measurement', data?.measurement ?? []);
      add('Geometry', data?.geometry ?? []);
      add('Data & Probability', data?.dataProbability ?? []);

      return out
        .filter((it) => Boolean(it.storagePath))
        .filter(inRange)
        .sort(
          (a, b) =>
            (b.submittedAtMillis ?? toMillis((b as any).submittedAt ?? (b as any).createdAt)) -
            (a.submittedAtMillis ?? toMillis((a as any).submittedAt ?? (a as any).createdAt))
        );
    }

    if (category === 'language-conventions') {
      return (language.items ?? [])
        .filter((it) => Boolean(it.storagePath))
        .filter(inRange)
        .slice()
        .sort((a, b) => (b.submittedAtMillis ?? 0) - (a.submittedAtMillis ?? 0))
        .map((it) => ({ ...it, label: 'Language Conventions' } as any));
    }

    if (category === 'reading') {
      return (reading.items ?? [])
        .filter((it) => Boolean(it.storagePath))
        .filter(inRange)
        .slice()
        .sort((a, b) => (b.submittedAtMillis ?? 0) - (a.submittedAtMillis ?? 0))
        .map((it) => ({ ...it, label: String((it as any)?.meta?.storyTitle ?? 'Reading') } as any));
    }

    return [];
  }, [category, data, language.items, reading.items, range]);

  const loading = category === 'numeracy' ? numeracyLoading : category === 'language-conventions' ? language.loading : category === 'reading' ? reading.loading : false;
  const error = category === 'numeracy' ? numeracyError : category === 'language-conventions' ? language.error : category === 'reading' ? reading.error : null;

  const openItem = async (item: any) => {
    if (!item?.storagePath) return;
    setActionError(null);
    setBusyId(item.sessionId);

    try {
      if (role === 'parent' && onOpenOverlayForParent) {
        await Promise.resolve(onOpenOverlayForParent(item as SessionIndexItem));
        return;
      }

      if (category === 'language-conventions') {
        navigate('/y3/language-conventions/review', {
          state:
            role === 'parent'
              ? {
                  storagePath: item.storagePath,
                  studentUid,
                  backgroundLocation: location,
                  sessionId: item.sessionId,
                }
              : { storagePath: item.storagePath, studentUid },
        });
        return;
      }

      // Numeracy and other storage-based sessions.
      const sessionJson = await loadSessionJsonByStoragePath(item.storagePath);
      const scoreFromIndex = item.score ?? { correct: 0, total: 0, percentage: 0 };

      const sessionForReview = {
        ...sessionJson,
        sessionId: item.sessionId,
        topic: (sessionJson as any)?.topic ?? item.topic,
        score: (sessionJson as any)?.score ?? scoreFromIndex,
      };

      const topic: SessionIndexTopic = item.topic;
      const baseReviewPath =
        topic === 'subtraction'
          ? '/y3/history/review'
          : topic === 'multiplication'
            ? '/y3/history/review/multiplication'
            : topic === 'addition'
              ? '/y3/history/review/addition'
              : topic === 'measurement'
                ? '/y3/numeracy/measurement'
                : topic === 'geometry'
                  ? '/y3/history/review/geometry'
                  : '/y3/numeracy/data-probability';

      const navState =
        topic === 'measurement' || topic === 'data-probability'
          ? { loadedSession: sessionForReview }
          : { session: sessionForReview, studentUid, studentName: studentName ?? getActiveStudentName() };

      navigate(baseReviewPath, {
        state: role === 'parent' ? { ...navState, backgroundLocation: location } : navState,
      });
    } catch (e) {
      console.error('Failed to open session:', e);
      setActionError('Failed to open session');
    } finally {
      setBusyId(null);
    }
  };

  const emptyTitle = 'No data yet';
  const emptyBody = 'Start practice to see sessions here.';

  return (
    <div className="space-y-3">
      {loading ? (
        <div className="flex items-center justify-center py-10">
          <div className="animate-spin rounded-full h-7 w-7 border-b-2 border-purple-600" />
        </div>
      ) : error || actionError ? (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-4 text-sm text-red-800">{error ?? actionError}</div>
      ) : items.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-200 p-4">
          <div className="text-base font-bold text-gray-900">{emptyTitle}</div>
          <div className="text-sm text-gray-600 mt-1">{emptyBody}</div>
          {onEmptyCta ? (
            <button type="button" onClick={onEmptyCta} className="mt-4 w-full px-4 py-2 rounded-xl bg-purple-600 text-white font-semibold">
              Start practice
            </button>
          ) : null}
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((it: any) => {
            const pct = typeof it.score?.percentage === 'number' ? `${it.score.percentage}%` : '—';
            const ms = it.submittedAtMillis ?? toMillis((it as any).submittedAt ?? (it as any).createdAt);
            const date = formatDateTime(ms);
            const label = String(it.label ?? topicLabel(it.topic as SessionIndexTopic));
            const busy = busyId === it.sessionId;

            return (
              <button
                key={it.sessionId}
                type="button"
                onClick={() => void openItem(it)}
                className="w-full text-left bg-white rounded-2xl border border-gray-200 p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-bold text-gray-900 truncate">{label} <span className="text-purple-700">{pct}</span></div>
                    <div className="text-xs text-gray-600 mt-1">{date}</div>
                    <div className="text-xs text-gray-500 mt-1">Status: Submitted</div>
                  </div>
                  <div className="shrink-0 flex items-center gap-2">
                    {busy ? <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-purple-600" /> : <div className="text-gray-400 text-lg">›</div>}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

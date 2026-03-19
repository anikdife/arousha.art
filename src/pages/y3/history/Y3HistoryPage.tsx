import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../../auth/AuthProvider';
import { useY3HistoryData } from '../../../hooks/useY3HistoryData';
import { useTopicSessionIndex } from '../../../hooks/useTopicSessionIndex';
import type { SessionIndexItem, SessionIndexTopic } from '../../../lib/sessionIndexReader';
import { getActiveStudentName, getActiveStudentUid, setActiveStudent } from '../../../lib/activeStudent';
import { loadSessionJsonByStoragePath } from '../../../lib/loadSessionJsonByPath';
import { buildReadingMagazinePdf } from '../../../lib/readingMagazinePdf';
import { subscribeHistoryOpenComplete } from '../../../lib/historyOpenSignal';
import { buildSubtractionPdf, downloadBytes } from '../../../lib/subtractionPdf';
import { buildAdditionPdf } from '../../../lib/additionPdf';
import { buildMultiplicationPdf } from '../../../lib/multiplicationPdf';
import { buildMeasurementPdf } from '../../../lib/measurementPdf';
import { buildGeometryPdf } from '../../../lib/geometryPdf';
import { buildDataProbabilityPdf } from '../../../lib/dataProbabilityPdf';
import { buildLanguageConventionsPdf } from '../../../lib/languageConventions/pdfExport';
import type { LCSession } from '../../../lib/languageConventions/types';
import { Y3HistoryGraph } from './Y3HistoryGraph';
import { OverlayTarget, ParentSessionOverlay } from './ParentSessionOverlay';
import { Year3HistoryMobile } from './Year3HistoryMobile';
import { StudyTimeHeatmap } from './components/StudyTimeHeatmap';
import { WeeklyConsistencyChart } from './components/WeeklyConsistencyChart';
import { defaultStudyTimeCategories } from './utils/aggregateStudyTime';
import { downloadWritingAnswerText, loadWritingAttemptSummaries, writingAttemptDocRef } from '../../../lib/writing/attemptService';
import type { WritingAttemptSummaryY3 } from '../../../lib/writing/attemptTypes';
import { buildWritingAssessmentPdf } from '../../../lib/writing/writingAssessmentPdf';
import { loadWritingIndexY3 } from '../../../lib/writing/storageIndex';
import { loadPromptById } from '../../../lib/writing/promptLoader';
import { getDoc } from 'firebase/firestore';

type HistoryCategory = 'numeracy' | 'language-conventions' | 'reading' | 'writing';
type HistoryView = 'graph' | 'list';

const listCategoryOrder: HistoryCategory[] = ['numeracy', 'writing', 'language-conventions', 'reading'];

function historyCategoryLabel(category: HistoryCategory): string {
  switch (category) {
    case 'numeracy':
      return 'Numeracy';
    case 'writing':
      return 'Writing';
    case 'language-conventions':
      return 'Language Conventions';
    case 'reading':
      return 'Reading';
    default:
      return category;
  }
}

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

function tabButtonClass(active: boolean) {
  const base = 'px-4 py-2 text-sm font-semibold rounded-lg transition-colors border';
  return active
    ? `${base} bg-purple-600 text-white border-purple-600`
    : `${base} bg-white/70 text-gray-800 border-gray-200 hover:bg-white`;
}

function subTabButtonClass(active: boolean) {
  const base = 'px-3 py-1.5 text-sm font-semibold rounded-md transition-colors';
  return active ? `${base} bg-gray-900 text-white` : `${base} bg-gray-100 text-gray-800 hover:bg-gray-200`;
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

function formatDateTime(ms: number) {
  if (!ms) return 'Date unavailable';
  try {
    return new Date(ms).toLocaleString();
  } catch {
    return 'Date unavailable';
  }
}

type Point = { xMillis: number; yPercent: number; item: SessionIndexItem };

type Domain = {
  minX: number;
  maxX: number;
};

function formatShortDate(ms: number) {
  try {
    return new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}

function toPoints(items: SessionIndexItem[]): Point[] {
  return items
    .map((it) => ({
      xMillis: it.submittedAtMillis ?? toMillis(it.submittedAt ?? it.createdAt),
      yPercent: Math.max(0, Math.min(100, it.score?.percentage ?? 0)),
      item: it,
    }))
    .filter((it) => it.xMillis > 0)
    .sort((a, b) => a.xMillis - b.xMillis);
}

function computeDomain(all: Point[]): Domain {
  if (all.length === 0) {
    const now = Date.now();
    return { minX: now - 6 * 24 * 60 * 60 * 1000, maxX: now };
  }
  const xs = all.map((p) => p.xMillis);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  if (minX === maxX) {
    return { minX: minX - 24 * 60 * 60 * 1000, maxX: maxX + 24 * 60 * 60 * 1000 };
  }
  return { minX, maxX };
}

const SingleTopicGraph: React.FC<{
  title: string;
  subtitle: string;
  items: SessionIndexItem[];
  color: string;
  onPointClick?: (item: SessionIndexItem) => void;
  showDateRangeControls?: boolean;
  fromDate?: string;
  toDate?: string;
  onDateRangeChange?: (next: { fromDate: string; toDate: string }) => void;
}> = ({
  title,
  subtitle,
  items,
  color,
  onPointClick,
  showDateRangeControls = false,
  fromDate: controlledFromDate,
  toDate: controlledToDate,
  onDateRangeChange,
}) => {
  const today = useMemo(() => toLocalDateInputValue(new Date()), []);
  const [fromDate, setFromDate] = useState<string>(today);
  const [toDate, setToDate] = useState<string>(today);

  const effectiveFromDate = controlledFromDate ?? fromDate;
  const effectiveToDate = controlledToDate ?? toDate;

  const dateRange = useMemo(() => {
    if (!showDateRangeControls) return null;
    return computeLocalDayRangeMs(effectiveFromDate, effectiveToDate);
  }, [effectiveFromDate, effectiveToDate, showDateRangeControls]);

  const filteredItems = useMemo(() => {
    if (!dateRange) return items;
    const { startMs, endMs } = dateRange;
    return items.filter((it) => {
      const ms = it.submittedAtMillis ?? toMillis(it.submittedAt ?? it.createdAt);
      if (!ms) return true;
      return ms >= startMs && ms <= endMs;
    });
  }, [dateRange, items]);

  const points = useMemo(() => toPoints(filteredItems), [filteredItems]);
  const domain = useMemo(() => computeDomain(points), [points]);

  const viewW = 1000;
  const viewH = 450;
  const pad = { top: 40, right: 30, bottom: 60, left: 60 };
  const plotW = viewW - pad.left - pad.right;
  const plotH = viewH - pad.top - pad.bottom;

  const xToSvg = (xMillis: number) => {
    const t = (xMillis - domain.minX) / (domain.maxX - domain.minX);
    return pad.left + Math.max(0, Math.min(1, t)) * plotW;
  };

  const yToSvg = (yPercent: number) => {
    const t = yPercent / 100;
    return pad.top + (1 - Math.max(0, Math.min(1, t))) * plotH;
  };

  const makePolyline = (pts: Point[]) => pts.map((p) => `${xToSvg(p.xMillis)},${yToSvg(p.yPercent)}`).join(' ');

  const xTicks: Array<{ x: number; label: string }> = [];
  {
    const tickCount = 5;
    for (let i = 0; i < tickCount; i++) {
      const t = i / (tickCount - 1);
      const ms = domain.minX + t * (domain.maxX - domain.minX);
      xTicks.push({ x: xToSvg(ms), label: formatShortDate(ms) });
    }
  }

  const yTicks = [0, 25, 50, 75, 100].map((v) => ({ v, y: yToSvg(v) }));

  return (
    <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-lg font-bold text-gray-900">{title}</div>
          <div className="text-sm text-gray-600">{subtitle}</div>
        </div>
        <div className="text-sm font-semibold text-gray-700">Sessions: {filteredItems.length}</div>
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

      <div className="mt-6">
        <div className="w-full overflow-hidden rounded-xl border border-gray-200 bg-white h-[60vh] max-h-[520px]">
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
                <line
                  x1={t.x}
                  y1={pad.top + plotH}
                  x2={t.x}
                  y2={pad.top + plotH + 6}
                  stroke="#111827"
                  strokeWidth={1}
                />
                <text x={t.x} y={pad.top + plotH + 26} textAnchor="middle" fontSize={12} fill="#374151">
                  {t.label}
                </text>
              </g>
            ))}

            {points.length > 0 && (
              <polyline fill="none" stroke={color} strokeWidth={3} strokeLinecap="round" points={makePolyline(points)} />
            )}

            {points.map((p) => (
              <circle
                key={p.item.sessionId}
                cx={xToSvg(p.xMillis)}
                cy={yToSvg(p.yPercent)}
                r={5}
                fill={color}
                style={{ cursor: onPointClick ? 'pointer' : 'default' }}
                onClick={() => (onPointClick ? onPointClick(p.item) : undefined)}
              >
                <title>Open session</title>
              </circle>
            ))}
          </svg>
        </div>
      </div>

      {items.length === 0 && <div className="mt-4 text-sm text-gray-600">No sessions for the selected date range.</div>}
    </div>
  );
};

const Y3NumeracyCombinedList: React.FC<{
  studentUid: string | undefined;
  studentName?: string;
  rangeStartMs?: number;
  rangeEndMs?: number;
  isParent?: boolean;
  openingSessionId?: string | null;
  onSetOpeningSessionId?: (sessionId: string | null) => void;
  onOpenOverlay?: (target: OverlayTarget) => void;
}> = ({
  studentUid,
  studentName,
  rangeStartMs,
  rangeEndMs,
  isParent,
  openingSessionId,
  onSetOpeningSessionId,
  onOpenOverlay,
}) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { userProfile } = useAuth();
  const derivedIsParent = (userProfile?.role ?? 'student') === 'parent';
  const { data, loading, error } = useY3HistoryData(studentUid);

  const [busy, setBusy] = useState<{ id: string; action: 'open' | 'download' } | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const effectiveIsParent = typeof isParent === 'boolean' ? isParent : derivedIsParent;

  const combined = useMemo(() => {
    const out: Array<SessionIndexItem & { topicLabel: string }> = [];
    const add = (topicLabel: string, list: SessionIndexItem[]) => {
      for (const it of list) out.push({ ...it, topicLabel });
    };

    add('Subtraction', data?.subtraction ?? []);
    add('Addition', data?.addition ?? []);
    add('Multiplication', data?.multiplication ?? []);
    add('Measurement', data?.measurement ?? []);
    add('Geometry', data?.geometry ?? []);
    add('Data & Probability', data?.dataProbability ?? []);

    const sorted = out
      .slice()
      .sort(
        (a, b) =>
          (b.submittedAtMillis ?? toMillis(b.submittedAt ?? b.createdAt)) -
          (a.submittedAtMillis ?? toMillis(a.submittedAt ?? a.createdAt))
      );
    if (typeof rangeStartMs !== 'number' || typeof rangeEndMs !== 'number') return sorted;
    return sorted.filter((it) => {
      const ms = it.submittedAtMillis ?? toMillis(it.submittedAt ?? it.createdAt);
      // If a legacy/partial index item has no timestamp, don't hide it behind the date filter.
      if (!ms) return true;
      return ms >= rangeStartMs && ms <= rangeEndMs;
    });
  }, [data, rangeEndMs, rangeStartMs]);

  const buildPdfForNumeracyItem = async (item: SessionIndexItem): Promise<{ title: string; bytes: Uint8Array }> => {
    const sessionJson = await loadSessionJsonByStoragePath(item.storagePath);

    const scoreFromIndex = item.score ?? { correct: 0, total: 0, percentage: 0 };
    const scoreToPrint = (sessionJson as any)?.score ?? scoreFromIndex;
    const studentNameForPdf = studentName ?? getActiveStudentName() ?? 'Student';

    const createdAtIso =
      (sessionJson as any)?.submittedAt ??
      (sessionJson as any)?.createdAt ??
      item.submittedAt ??
      item.createdAt ??
      new Date((item.submittedAtMillis ?? 0) || Date.now()).toISOString();

    const topic = item.topic as SessionIndexTopic;

    if (topic === 'addition') {
      return {
        title: 'Addition Practice',
        bytes: await buildAdditionPdf({
          title: 'Addition Practice',
          pages: (sessionJson as any)?.pages,
          createdAtIso,
          studentName: studentNameForPdf,
          score: scoreToPrint,
          sessionId: item.sessionId,
        }),
      };
    }

    if (topic === 'subtraction') {
      return {
        title: 'Subtraction Practice',
        bytes: await buildSubtractionPdf({
          title: 'Subtraction Practice',
          pages: (sessionJson as any)?.pages,
          createdAtIso,
          studentName: studentNameForPdf,
          score: scoreToPrint,
          sessionId: item.sessionId,
        }),
      };
    }

    if (topic === 'multiplication') {
      const sessionForPdf = {
        ...(sessionJson as any),
        topic: (sessionJson as any)?.topic ?? 'multiplication',
        score: (sessionJson as any)?.score ?? scoreFromIndex,
      };
      return {
        title: 'Multiplication Practice',
        bytes: await buildMultiplicationPdf({
          title: 'Multiplication Practice',
          session: sessionForPdf,
          createdAtIso,
          studentName: studentNameForPdf,
          score: sessionForPdf.score,
          sessionId: item.sessionId,
        }),
      };
    }

    if (topic === 'measurement') {
      return {
        title: 'Measurement Practice',
        bytes: await buildMeasurementPdf({
          title: 'Measurement Practice',
          session: sessionJson as any,
          createdAtIso: (sessionJson as any)?.submittedAt ?? (sessionJson as any)?.createdAt,
          studentName: studentNameForPdf,
          score: (sessionJson as any)?.score,
          sessionId: item.sessionId,
        }),
      };
    }

    if (topic === 'geometry') {
      return {
        title: 'Geometry Practice',
        bytes: await buildGeometryPdf({
          title: 'Geometry Practice',
          session: sessionJson as any,
          studentName: studentNameForPdf,
        }),
      };
    }

    // data-probability
    return {
      title: 'Data & Probability Practice',
      bytes: await buildDataProbabilityPdf({
        title: 'Data & Probability Practice',
        session: sessionJson as any,
        studentName: studentNameForPdf,
      }),
    };
  };

  const openSession = async (item: SessionIndexItem) => {
    setActionError(null);
    setBusy({ id: item.sessionId, action: 'open' });
    if (effectiveIsParent) onSetOpeningSessionId?.(item.sessionId);

    try {
      if (effectiveIsParent && onOpenOverlay) {
        const { title, bytes } = await buildPdfForNumeracyItem(item);
        onOpenOverlay({ kind: 'pdf', title, bytes });
        return;
      }

      const sessionJson = await loadSessionJsonByStoragePath(item.storagePath);
      const scoreFromIndex = item.score ?? { correct: 0, total: 0, percentage: 0 };

      const sessionForReview = {
        ...sessionJson,
        sessionId: item.sessionId,
        topic: (sessionJson as any).topic ?? item.topic,
        score: (sessionJson as any).score ?? scoreFromIndex,
      };

      const topic = item.topic as SessionIndexTopic;
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
        state: derivedIsParent ? { ...navState, backgroundLocation: location } : navState,
      });
    } catch (e) {
      console.error('Failed to open session:', e);
      setActionError('Failed to open session');
      if (effectiveIsParent) onSetOpeningSessionId?.(null);
    } finally {
      setBusy(null);
    }
  };

  const downloadSessionPdf = async (item: SessionIndexItem & { topicLabel: string }) => {
    setActionError(null);
    setBusy({ id: item.sessionId, action: 'download' });

    try {
      const sessionJson = await loadSessionJsonByStoragePath(item.storagePath);

      const scoreFromIndex = item.score ?? { correct: 0, total: 0, percentage: 0 };
      const scoreToPrint = (sessionJson as any)?.score ?? scoreFromIndex;
      const studentNameForPdf = studentName ?? getActiveStudentName() ?? 'Student';

      const createdAtIso =
        (sessionJson as any)?.submittedAt ??
        (sessionJson as any)?.createdAt ??
        item.submittedAt ??
        item.createdAt ??
        new Date((item.submittedAtMillis ?? 0) || Date.now()).toISOString();

      const topic = item.topic as SessionIndexTopic;
      let bytes: Uint8Array;

      if (topic === 'addition') {
        bytes = await buildAdditionPdf({
          title: 'Addition Practice',
          pages: (sessionJson as any)?.pages,
          createdAtIso,
          studentName: studentNameForPdf,
          score: scoreToPrint,
          sessionId: item.sessionId,
        });
      } else if (topic === 'subtraction') {
        bytes = await buildSubtractionPdf({
          title: 'Subtraction Practice',
          pages: (sessionJson as any)?.pages,
          createdAtIso,
          studentName: studentNameForPdf,
          score: scoreToPrint,
          sessionId: item.sessionId,
        });
      } else if (topic === 'multiplication') {
        const sessionForPdf = {
          ...(sessionJson as any),
          topic: (sessionJson as any)?.topic ?? 'multiplication',
          score: (sessionJson as any)?.score ?? scoreFromIndex,
        };
        bytes = await buildMultiplicationPdf({
          title: 'Multiplication Practice',
          session: sessionForPdf,
          studentName: studentNameForPdf,
          score: sessionForPdf.score,
          sessionId: item.sessionId,
        });
      } else if (topic === 'measurement') {
        bytes = await buildMeasurementPdf({
          title: 'Measurement Practice',
          session: sessionJson as any,
          createdAtIso: (sessionJson as any)?.submittedAt ?? (sessionJson as any)?.createdAt,
          studentName: studentNameForPdf,
          score: (sessionJson as any)?.score,
          sessionId: item.sessionId,
        });
      } else if (topic === 'geometry') {
        const scoreFromRow = scoreFromIndex as any;
        const sessionForPdf = {
          ...(sessionJson as any),
          sessionId: item.sessionId,
          topic: (sessionJson as any)?.topic ?? 'geometry',
          score: (sessionJson as any)?.score ?? scoreFromRow,
        };
        bytes = await buildGeometryPdf({
          title: 'Geometry Practice',
          session: sessionForPdf,
          studentName: studentNameForPdf,
        });
      } else if (topic === 'data-probability') {
        const sessionForPdf = {
          ...(sessionJson as any),
          sessionId: (sessionJson as any)?.sessionId ?? item.sessionId,
        };
        bytes = await buildDataProbabilityPdf({
          title: 'Data & Probability Practice',
          session: sessionForPdf,
          studentName: studentNameForPdf,
        });
      } else {
        throw new Error(`Unsupported topic for PDF download: ${String(topic)}`);
      }

      downloadBytes(bytes, `PracticeSession_${item.sessionId}.pdf`);
    } catch (e) {
      console.error('Failed to download session PDF:', e);
      setActionError('Failed to download');
    } finally {
      setBusy(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600" />
      </div>
    );
  }

  if (error || actionError) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-4">
        <div className="text-red-800 font-medium">{error ?? actionError}</div>
      </div>
    );
  }

  if (combined.length === 0) {
    return (
      <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6">
        <div className="text-gray-900 font-bold">No sessions for the selected date range</div>
        <div className="text-gray-600 mt-1">Complete a practice session to see it here.</div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
      {combined.map((item, idx) => {
        const correct = item.score?.correct ?? 0;
        const total = item.score?.total ?? 0;
        const percent = item.score?.percentage ?? 0;
        const ms = item.submittedAtMillis ?? toMillis(item.submittedAt ?? item.createdAt);
        const isOpening = !!openingSessionId && openingSessionId === item.sessionId;
        const isOpeningBusy = busy?.action === 'open' && busy.id === item.sessionId;
        const isDownloading = busy?.action === 'download' && busy.id === item.sessionId;

        return (
          <div
            key={item.sessionId}
            className={`px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 ${
              idx === combined.length - 1 ? '' : 'border-b border-gray-100'
            }`}
          >
            <div className="min-w-0 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
              <div className="text-sm text-gray-600 whitespace-nowrap">{formatDateTime(ms)}</div>
              <div className="text-sm font-semibold text-gray-900 whitespace-nowrap">{(item as any).topicLabel}</div>
              <div className="text-sm font-semibold text-gray-900 whitespace-nowrap">
                {correct} / {total} <span className="text-purple-700">({percent}%)</span>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => void openSession(item)}
                disabled={isOpeningBusy || isOpening}
                className="px-3 py-2 text-sm font-semibold rounded-lg bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-50 disabled:bg-gray-400 disabled:hover:bg-gray-400"
              >
                {isOpening ? 'Opening' : 'Open'}
              </button>
              <button
                type="button"
                onClick={() => void downloadSessionPdf(item)}
                disabled={isDownloading}
                className="px-3 py-2 text-sm font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
              >
                Download
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
};

const Y3WritingList: React.FC<{
  studentUid: string;
  studentName?: string;
  rangeStartMs?: number;
  rangeEndMs?: number;
  openingSessionId?: string | null;
  onSetOpeningSessionId?: (sessionId: string | null) => void;
  onOpenOverlay?: (target: OverlayTarget) => void;
}> = ({ studentUid, studentName, rangeStartMs, rangeEndMs, openingSessionId, onSetOpeningSessionId, onOpenOverlay }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { currentUser, userProfile } = useAuth();

  const role = userProfile?.role ?? 'student';
  const canView = useMemo(() => {
    if (!currentUser?.uid) return false;
    if (role === 'student' || role === 'owner') return currentUser.uid === studentUid;
    // Parent/teacher access is already guarded at the page level for /y3/history.
    return true;
  }, [currentUser?.uid, role, studentUid]);

  const [summaries, setSummaries] = useState<WritingAttemptSummaryY3[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [busy, setBusy] = useState<{ id: string; action: 'open' | 'download' } | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const buildWritingPdf = async (item: WritingAttemptSummaryY3): Promise<{ title: string; bytes: Uint8Array; fileName: string }> => {
    const snap = await getDoc(writingAttemptDocRef(studentUid, item.attemptId));
    if (!snap.exists()) throw new Error('Writing attempt not found');
    const data = snap.data() as any;

    const promptId = typeof data.promptId === 'string' ? data.promptId : '';
    const promptTitle = typeof data.promptTitle === 'string' ? data.promptTitle : 'Writing prompt';
    const answerStoragePath = typeof data.answerStoragePath === 'string' ? data.answerStoragePath : '';

    const scorePercent = typeof data.scorePercent === 'number' ? data.scorePercent : 0;
    const comment = typeof data.comment === 'string' ? data.comment : '';
    const assessedAtMillis = typeof data.assessedAt?.toDate === 'function' ? data.assessedAt.toDate().getTime() : null;
    const createdAtMillis = typeof data.createdAt?.toDate === 'function' ? data.createdAt.toDate().getTime() : null;

    const resolvedStudentName = studentName ?? getActiveStudentName() ?? 'Student';
    const dateLine = (createdAtMillis ?? assessedAtMillis)
      ? new Date((createdAtMillis ?? assessedAtMillis) as number).toLocaleString()
      : '';
    const marksLine = typeof data.scorePercent === 'number' ? `${Math.round(scorePercent)}%` : '';

    const index = await loadWritingIndexY3();
    const idxItem = (index.items ?? []).find((it) => it.promptId === promptId);
    if (!idxItem) throw new Error('Prompt not found');

    const loaded = await loadPromptById({ item: idxItem, expectedPromptId: promptId });
    const prompt = loaded.prompt;
    const promptImageUrl = loaded.imageUrl;

    const answerText = answerStoragePath ? await downloadWritingAnswerText(answerStoragePath) : '';

    const bytes = await buildWritingAssessmentPdf({
      title: 'Writing Practice',
      prompt,
      promptImageUrl,
      answerText,
      feedback: {
        scorePercent,
        comment,
        assessedAt: assessedAtMillis ?? undefined,
      },
      includeCoverPage: true,
      cover: {
        studentName: resolvedStudentName,
        dateLine,
        marksLine,
        sessionId: item.attemptId,
      },
    });

    return {
      title: `Writing • ${promptTitle}`,
      bytes,
      fileName: `Writing_${item.attemptId}_${promptTitle.replace(/[^a-z0-9]+/gi, '_').slice(0, 40)}.pdf`,
    };
  };

  useEffect(() => {
    let cancelled = false;
    if (!canView) return;

    setLoading(true);
    setError(null);

    (async () => {
      try {
        const result = await loadWritingAttemptSummaries({ studentUid, max: 2000 });
        if (!cancelled) setSummaries(result);
      } catch (e: any) {
        if (!cancelled) setError(String(e?.message ?? 'Failed to load writing history'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [canView, studentUid]);

  const assessed = useMemo(() => {
    const base = summaries
      .filter((s) => s.assessed === true)
      .filter((s) => typeof s.scorePercent === 'number' && Number.isFinite(s.scorePercent))
      .filter((s) => typeof s.assessedAtMillis === 'number' && s.assessedAtMillis > 0)
      .sort((a, b) => b.assessedAtMillis - a.assessedAtMillis);

    if (typeof rangeStartMs !== 'number' || typeof rangeEndMs !== 'number') return base;

    return base.filter((s) => {
      const ms = s.assessedAtMillis;
      if (!ms) return true;
      return ms >= rangeStartMs && ms <= rangeEndMs;
    });
  }, [rangeEndMs, rangeStartMs, summaries]);

  const openAttempt = async (item: WritingAttemptSummaryY3) => {
    setActionError(null);
    setBusy({ id: item.attemptId, action: 'open' });
    try {
      if (role === 'parent' && onOpenOverlay) {
        onSetOpeningSessionId?.(item.attemptId);
        const built = await buildWritingPdf(item);
        onOpenOverlay({ kind: 'pdf', title: built.title, bytes: built.bytes });
        return;
      }

      navigate('/y3/history/review/writing', {
        state: {
          backgroundLocation: location,
          studentUid,
          attemptId: item.attemptId,
        },
      });
    } catch (e) {
      console.error('Failed to open writing review:', e);
      setActionError('Failed to open');
      onSetOpeningSessionId?.(null);
    } finally {
      setBusy(null);
    }
  };

  const downloadAnswer = async (item: WritingAttemptSummaryY3) => {
    setActionError(null);
    setBusy({ id: item.attemptId, action: 'download' });

    try {
      const built = await buildWritingPdf(item);
      downloadBytes(built.bytes, built.fileName);
    } catch (e) {
      console.error('Failed to download writing PDF:', e);
      setActionError('Failed to download');
    } finally {
      setBusy(null);
    }
  };

  if (!canView) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="text-sm font-semibold text-gray-900">Writing</div>
        <div className="mt-2 text-sm text-red-700">Not authorised.</div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600" />
      </div>
    );
  }

  if (error || actionError) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-4">
        <div className="text-red-800 font-medium">{error ?? actionError}</div>
      </div>
    );
  }

  if (assessed.length === 0) {
    return (
      <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6">
        <div className="text-gray-900 font-bold">No sessions for the selected date range</div>
        <div className="text-gray-600 mt-1">Complete a practice session to see it here</div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
      {assessed.map((item, idx) => {
        const score = Math.round(item.scorePercent ?? 0);
        const ms = item.assessedAtMillis;
        const isOpening = (busy?.action === 'open' && busy.id === item.attemptId) || (!!openingSessionId && openingSessionId === item.attemptId);
        const isDownloading = busy?.action === 'download' && busy.id === item.attemptId;

        return (
          <div
            key={item.attemptId}
            className={`px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 ${
              idx === assessed.length - 1 ? '' : 'border-b border-gray-100'
            }`}
          >
            <div className="min-w-0 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
              <div className="text-sm text-gray-600 whitespace-nowrap">{formatDateTime(ms)}</div>
              <div className="text-sm font-semibold text-gray-900 whitespace-nowrap">Writing</div>
              <div className="text-sm font-semibold text-gray-900 whitespace-nowrap">
                {score} / 100 <span className="text-purple-700">({score}%)</span>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => void openAttempt(item)}
                disabled={isOpening}
                className="px-3 py-2 text-sm font-semibold rounded-lg bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-50 disabled:bg-gray-400 disabled:hover:bg-gray-400"
              >
                {isOpening ? 'Opening' : 'Open'}
              </button>
              <button
                type="button"
                onClick={() => void downloadAnswer(item)}
                disabled={isDownloading || !item.answerStoragePath}
                className="px-3 py-2 text-sm font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
              >
                Download
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
};

const TopicList: React.FC<{
  items: SessionIndexItem[];
  loading: boolean;
  error: string | null;
  onOpen?: (item: SessionIndexItem) => void;
  getOpenButtonState?: (item: SessionIndexItem) => { disabled?: boolean; label?: string } | undefined;
  onDownload?: (item: SessionIndexItem) => void;
  sectionText?: (item: SessionIndexItem) => string;
  emptyText: string;
}> = ({ items, loading, error, onOpen, getOpenButtonState, onDownload, sectionText, emptyText }) => {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-10">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-4">
        <div className="text-red-800 font-medium">{error}</div>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6">
        <div className="text-gray-900 font-bold">No sessions for the selected date range</div>
        <div className="text-gray-600 mt-1">{emptyText}</div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
      {items.map((item, idx) => {
        const correct = item.score?.correct ?? 0;
        const total = item.score?.total ?? 0;
        const percent = item.score?.percentage ?? 0;
        const ms = item.submittedAtMillis ?? toMillis(item.submittedAt ?? item.createdAt);
        const section = sectionText ? sectionText(item) : '';
        const openState = getOpenButtonState ? getOpenButtonState(item) : undefined;
        const openDisabled = !onOpen || !!openState?.disabled;
        const openLabel = openState?.label ?? 'Open';

        return (
          <div
            key={item.sessionId}
            className={`px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 ${
              idx === items.length - 1 ? '' : 'border-b border-gray-100'
            }`}
          >
            <div className="min-w-0 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
              <div className="text-sm text-gray-600 whitespace-nowrap">{formatDateTime(ms)}</div>
              {section ? <div className="text-sm font-semibold text-gray-900 whitespace-nowrap">{section}</div> : null}
              <div className="text-sm font-semibold text-gray-900 whitespace-nowrap">
                {correct} / {total} <span className="text-purple-700">({percent}%)</span>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => (onOpen ? onOpen(item) : undefined)}
                disabled={openDisabled}
                className="px-3 py-2 text-sm font-semibold rounded-lg bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-50 disabled:bg-gray-400 disabled:hover:bg-gray-400"
              >
                {openLabel}
              </button>
              <button
                type="button"
                onClick={() => (onDownload ? onDownload(item) : undefined)}
                disabled={!onDownload}
                className="px-3 py-2 text-sm font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
              >
                Download
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
};

const Y3HistoryPageDesktop: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { currentUser, userProfile } = useAuth();

  const role = userProfile?.role ?? 'student';
  const isAssessor = role === 'parent' || role === 'teacher' || role === 'owner';
  const linkedStudentUids = useMemo(() => {
    if (role !== 'parent' && role !== 'teacher' && role !== 'owner') return [];
    const current = (userProfile as any)?.linkedStudentUids;
    if (Array.isArray(current)) return current;
    const legacy = (userProfile as any)?.linkedStudentIds;
    return Array.isArray(legacy) ? legacy : [];
  }, [role, userProfile]);

  const state = (location.state as any) ?? {};
  const stateStudentUid = typeof state.studentUid === 'string' ? (state.studentUid as string) : undefined;
  const stateStudentName = typeof state.studentName === 'string' ? (state.studentName as string) : undefined;

  const [activeStudentUid, setActiveStudentUid] = useState<string | undefined>(() => getActiveStudentUid() ?? undefined);

  useEffect(() => {
    if (!stateStudentUid) return;
    setActiveStudent(stateStudentUid, stateStudentName);
    setActiveStudentUid(stateStudentUid);
  }, [stateStudentName, stateStudentUid]);

  useEffect(() => {
    if (role !== 'parent' && role !== 'teacher') return;
    if (linkedStudentUids.length === 0) return;

    const candidate = stateStudentUid ?? activeStudentUid;
    const resolved = candidate && linkedStudentUids.includes(candidate) ? candidate : linkedStudentUids[0];
    if (!resolved) return;

    if (resolved !== activeStudentUid) {
      setActiveStudent(resolved);
      setActiveStudentUid(resolved);
    }
  }, [activeStudentUid, linkedStudentUids, role, stateStudentUid]);

  const studentUid = useMemo(() => {
    if (role === 'student') return currentUser?.uid ?? undefined;
    if (stateStudentUid) return stateStudentUid;
    if (activeStudentUid) return activeStudentUid;
    // Parents/teachers default to their first linked student.
    if (role === 'parent' || role === 'teacher') {
      if (linkedStudentUids.length > 0) return linkedStudentUids[0];
    }
    // Owners must explicitly select a student from dashboard.
    return undefined;
  }, [activeStudentUid, currentUser?.uid, linkedStudentUids, role, stateStudentUid]);

  const initialView: HistoryView = useMemo(() => {
    const p = location.pathname;
    if (p.endsWith('/list')) return 'list';
    return 'graph';
  }, [location.pathname]);

  const [view, setView] = useState<HistoryView>(initialView);

  const [listCategories, setListCategories] = useState<HistoryCategory[]>(['numeracy']);

  const toggleListCategory = (key: HistoryCategory) => {
    setListCategories((current) => {
      const has = current.includes(key);
      if (has) {
        const next = current.filter((k) => k !== key);
        return next.length > 0 ? next : current;
      }
      return [...current, key];
    });
  };

  const today = useMemo(() => toLocalDateInputValue(new Date()), []);
  const [listFromDate, setListFromDate] = useState<string>(today);
  const [listToDate, setListToDate] = useState<string>(today);

  const isParent = role === 'parent';

  const listDateRange = useMemo(() => {
    if (view !== 'list') return null;
    return computeLocalDayRangeMs(listFromDate, listToDate);
  }, [listFromDate, listToDate, view]);

  const filterIndexItemsForList = useCallback(
    (items: SessionIndexItem[]) => {
      if (!listDateRange) return items;
      const { startMs, endMs } = listDateRange;
      return items.filter((it) => {
        const ms = it.submittedAtMillis ?? toMillis(it.submittedAt ?? it.createdAt);
        if (!ms) return true;
        return ms >= startMs && ms <= endMs;
      });
    },
    [listDateRange]
  );

  const navHintCategory = useMemo(() => {
    const raw = (location.state as any)?.historyCategory;
    return raw === 'numeracy' || raw === 'reading' || raw === 'language-conventions' || raw === 'writing'
      ? (raw as HistoryCategory)
      : null;
  }, [location.state]);

  const openWritingAssessment = useMemo(() => {
    return Boolean((location.state as any)?.openWritingAssessment);
  }, [location.state]);
  const lastAppliedHintRef = useRef<HistoryCategory | null>(null);

  useEffect(() => {
    if (!navHintCategory) return;
    // Only apply when a NEW navigation hint arrives (so user can still switch tabs manually).
    if (lastAppliedHintRef.current === navHintCategory) return;
    lastAppliedHintRef.current = navHintCategory;
    setListCategories([navHintCategory]);
  }, [navHintCategory]);

  useEffect(() => {
    if (!openWritingAssessment) return;
    // Ensure the writing section is visible immediately.
    setView('list');
    setListCategories(['writing']);
  }, [openWritingAssessment]);

  // Load all topics so the Study Time Patterns graph can show ALL categories.
  const language = useTopicSessionIndex({ studentUid, topic: 'language-conventions', enabled: Boolean(studentUid) });
  const reading = useTopicSessionIndex({ studentUid, topic: 'reading-magazine', enabled: Boolean(studentUid) });
  const writingSessions = useTopicSessionIndex({ studentUid, topic: 'writing', enabled: Boolean(studentUid) });
  const numeracy = useY3HistoryData(studentUid);

  const filteredLanguageItemsForList = useMemo(
    () => filterIndexItemsForList(language.items),
    [filterIndexItemsForList, language.items]
  );
  const filteredReadingItemsForList = useMemo(
    () => filterIndexItemsForList(reading.items),
    [filterIndexItemsForList, reading.items]
  );
  // NOTE: writingSessions are included in heatmapSessions; list rendering uses Y3HistoryWritingSection.

  const heatmapSessions = useMemo(() => {
    const out: SessionIndexItem[] = [];
    const d = numeracy.data;
    if (d) out.push(...d.addition, ...d.subtraction, ...d.multiplication, ...d.measurement, ...d.geometry, ...d.dataProbability);
    out.push(...reading.items);
    out.push(...language.items);
    out.push(...writingSessions.items);
    return out;
  }, [language.items, numeracy.data, reading.items, writingSessions.items]);

  const heatmapCategories = useMemo(() => defaultStudyTimeCategories(), []);

  const [overlayTarget, setOverlayTarget] = useState<OverlayTarget | null>(null);
  const [openingSessionId, setOpeningSessionId] = useState<string | null>(null);

  useEffect(() => {
    return subscribeHistoryOpenComplete((sessionId) => {
      setOpeningSessionId((current) => (current && current === sessionId ? null : current));
    });
  }, []);

  const downloadLanguageConventionsPdf = async (item: SessionIndexItem) => {
    try {
      const sessionJson = (await loadSessionJsonByStoragePath(item.storagePath)) as LCSession;
      const pdfStudentName =
        role === 'student'
          ? (userProfile?.displayName ?? undefined)
          : (stateStudentName ?? getActiveStudentName() ?? undefined);

      const bytes = await buildLanguageConventionsPdf({
        title: 'Language Conventions Practice',
        session: sessionJson,
        studentName: pdfStudentName,
        createdAtIso: sessionJson.submittedAt ?? sessionJson.createdAt ?? item.submittedAt ?? item.createdAt,
        score: sessionJson.summary,
        sessionId: item.sessionId,
      });
      downloadBytes(bytes, `LanguageConventions_${item.sessionId}.pdf`);
    } catch (e) {
      console.error('Failed to download language conventions PDF:', e);
    }
  };

  const openLanguageConventionsOverlay = async (item: SessionIndexItem) => {
    const sessionJson = (await loadSessionJsonByStoragePath(item.storagePath)) as LCSession;
    const pdfStudentName =
      role === 'student'
        ? (userProfile?.displayName ?? undefined)
        : (stateStudentName ?? getActiveStudentName() ?? undefined);

    const bytes = await buildLanguageConventionsPdf({
      title: 'Language Conventions Practice',
      session: sessionJson,
      studentName: pdfStudentName,
      createdAtIso: sessionJson.submittedAt ?? sessionJson.createdAt ?? item.submittedAt ?? item.createdAt,
      score: sessionJson.summary,
      sessionId: item.sessionId,
    });

    setOverlayTarget({ kind: 'pdf', title: 'Language Conventions Practice', bytes });
  };

  const downloadReadingPdf = async (item: SessionIndexItem) => {
    try {
      const json = await loadSessionJsonByStoragePath(item.storagePath);
      const pdfStudentName = role === 'student'
        ? (userProfile?.displayName ?? undefined)
        : (stateStudentName ?? getActiveStudentName() ?? undefined);
      const bytes = await buildReadingMagazinePdf({ title: 'Reading Magazine Practice', session: json, studentName: pdfStudentName });
      downloadBytes(bytes, `ReadingMagazine_${item.sessionId}.pdf`);
    } catch (e) {
      console.error('Failed to download reading session PDF:', e);
    }
  };

  const openReadingPdf = async (item: SessionIndexItem) => {
    try {
      const json = await loadSessionJsonByStoragePath(item.storagePath);
      const pdfStudentName = role === 'student'
        ? (userProfile?.displayName ?? undefined)
        : (stateStudentName ?? getActiveStudentName() ?? undefined);
      const bytes = await buildReadingMagazinePdf({ title: 'Reading Magazine Practice', session: json, studentName: pdfStudentName });
      const copy = new Uint8Array(bytes);
      const blob = new Blob([copy], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank', 'noopener,noreferrer');
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e) {
      console.error('Failed to open reading session PDF:', e);
    }
  };

  const openReadingOverlay = async (item: SessionIndexItem) => {
    try {
      const json = await loadSessionJsonByStoragePath(item.storagePath);
      const pdfStudentName = role === 'student'
        ? (userProfile?.displayName ?? undefined)
        : (stateStudentName ?? getActiveStudentName() ?? undefined);
      const bytes = await buildReadingMagazinePdf({ title: 'Reading Magazine Practice', session: json, studentName: pdfStudentName });
      setOverlayTarget({ kind: 'pdf', title: 'Reading Magazine Practice', bytes });
    } catch (e) {
      console.error('Failed to open reading session PDF overlay:', e);
      throw e;
    }
  };

  if (!currentUser) {
    return <div className="bg-white rounded-xl border border-gray-200 p-6">Please sign in to view history.</div>;
  }

  if ((role === 'parent' || role === 'teacher') && (!studentUid || !linkedStudentUids.includes(studentUid))) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-green-50">
        <header className="bg-white/80 backdrop-blur border-b">
          <div className="w-full px-4 sm:px-6 lg:px-8 py-6">
            <h1 className="text-3xl font-bold text-gray-900">Year 3 History</h1>
            <p className="text-gray-600 mt-1">Progress and session history</p>
          </div>
        </header>

        <main className="w-full px-4 sm:px-6 lg:px-8 py-8">
          <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6">
            <div className="text-gray-900 font-bold">Select a student first</div>
            <div className="text-gray-600 mt-1">
              Go to Dashboard and open History for a linked student.
            </div>
            <button
              type="button"
              onClick={() => navigate('/dashboard')}
              className="mt-4 px-4 py-2 text-sm font-semibold rounded-lg bg-purple-600 text-white hover:bg-purple-700"
            >
              Go to Dashboard
            </button>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-green-50">
      <header className="bg-white/80 backdrop-blur border-b">
        <div className="w-full px-4 sm:px-6 lg:px-8 py-6">
          <h1 className="text-3xl font-bold text-gray-900">Year 3 History</h1>
          <p className="text-gray-600 mt-1">Progress and session history</p>

          {role !== 'student' && studentUid && (
            <div className="mt-3 text-xs text-gray-500">
              Viewing: {stateStudentName ?? getActiveStudentName() ?? 'Selected student'}
            </div>
          )}

          <div className="mt-5 flex items-center gap-2">
            <button type="button" className={subTabButtonClass(view === 'graph')} onClick={() => setView('graph')}>
              Visual
            </button>
            <button type="button" className={subTabButtonClass(view === 'list')} onClick={() => setView('list')}>
              List
            </button>
          </div>

          {view === 'list' && (
            <div className="mt-4 flex flex-wrap items-center gap-2">
              {listCategoryOrder.map((k) => {
                const active = listCategories.includes(k);
                return (
                  <button key={k} type="button" className={tabButtonClass(active)} onClick={() => toggleListCategory(k)}>
                    {historyCategoryLabel(k)}
                  </button>
                );
              })}

              <div className="flex flex-wrap items-center gap-2 ml-auto">
                <div className="text-xs font-semibold text-gray-700">From</div>
                <input
                  type="date"
                  value={listFromDate}
                  onChange={(e) => setListFromDate(e.target.value)}
                  className="px-2 py-1 rounded-lg border border-gray-300 bg-white text-sm"
                />
                <div className="text-xs font-semibold text-gray-700">To</div>
                <input
                  type="date"
                  value={listToDate}
                  onChange={(e) => setListToDate(e.target.value)}
                  className="px-2 py-1 rounded-lg border border-gray-300 bg-white text-sm"
                />
                <button
                  type="button"
                  aria-label="Refresh"
                  onClick={() => {
                    // Child components manage their own refresh; keep as UI affordance.
                  }}
                  className="px-3 py-2 rounded-lg bg-white border border-gray-200 text-gray-800"
                >
                  ↻
                </button>
              </div>
            </div>
          )}
        </div>
      </header>

      <main className="w-full px-4 sm:px-6 lg:px-8 py-8">
        {role !== 'student' && !studentUid && (
          <div className="mb-6 text-sm text-gray-700 bg-yellow-50 border border-yellow-200 rounded-lg p-3">
            No student selected. Go back to the parent dashboard and click “View Practice Sessions” for a child.
          </div>
        )}

        {view === 'graph' && (
          <div className="space-y-6">
            <Y3HistoryGraph />
            {isParent && <WeeklyConsistencyChart sessions={heatmapSessions} />}
            <StudyTimeHeatmap sessions={heatmapSessions} categories={heatmapCategories} showDateRangeControls={isAssessor} />
          </div>
        )}

        {view === 'list' && (
          <div className="space-y-6">
            {listCategories.includes('numeracy') && (
              <Y3NumeracyCombinedList
                studentUid={studentUid}
                studentName={stateStudentName}
                rangeStartMs={listDateRange?.startMs}
                rangeEndMs={listDateRange?.endMs}
                isParent={role === 'parent'}
                openingSessionId={openingSessionId}
                onSetOpeningSessionId={setOpeningSessionId}
                onOpenOverlay={setOverlayTarget}
              />
            )}

            {listCategories.includes('writing') && studentUid && (
              <Y3WritingList
                studentUid={studentUid}
                studentName={stateStudentName}
                rangeStartMs={listDateRange?.startMs}
                rangeEndMs={listDateRange?.endMs}
                openingSessionId={openingSessionId}
                onSetOpeningSessionId={setOpeningSessionId}
                onOpenOverlay={setOverlayTarget}
              />
            )}

            {listCategories.includes('language-conventions') && (
              <TopicList
                items={filteredLanguageItemsForList}
                loading={language.loading}
                error={language.error}
                emptyText="Complete a language conventions practice session to see it here."
                onOpen={(item) => {
                  if (role === 'parent') {
                    setOpeningSessionId(item.sessionId);
                    void openLanguageConventionsOverlay(item)
                      .catch((e) => {
                        console.error('Failed to open language conventions overlay:', e);
                        setOpeningSessionId(null);
                      });
                    return;
                  }

                  navigate('/y3/language-conventions/review', {
                    state: { storagePath: item.storagePath, studentUid },
                  });
                }}
                getOpenButtonState={(item) => {
                  if (role !== 'parent') return undefined;
                  if (openingSessionId && openingSessionId === item.sessionId) {
                    return { disabled: true, label: 'Opening' };
                  }
                  return undefined;
                }}
                onDownload={(item) => {
                  void downloadLanguageConventionsPdf(item);
                }}
                sectionText={() => 'Language Conventions'}
              />
            )}

            {listCategories.includes('reading') && (
              <TopicList
                items={filteredReadingItemsForList}
                loading={reading.loading}
                error={reading.error}
                emptyText="Complete a Reading Magazine practice session to see it here."
                onOpen={(item) => {
                  if (role === 'parent') {
                    setOpeningSessionId(item.sessionId);
                    void openReadingOverlay(item).catch(() => {
                      setOpeningSessionId(null);
                    });
                  } else {
                    void openReadingPdf(item);
                  }
                }}
                getOpenButtonState={(item) => {
                  if (role !== 'parent') return undefined;
                  if (openingSessionId && openingSessionId === item.sessionId) {
                    return { disabled: true, label: 'Opening' };
                  }
                  return undefined;
                }}
                onDownload={(item) => {
                  void downloadReadingPdf(item);
                }}
                sectionText={(item) => String((item as any)?.meta?.storyTitle ?? 'Reading')}
              />
            )}
          </div>
        )}
      </main>

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

export const Y3HistoryPage: React.FC = () => {
  const { userProfile } = useAuth();
  const role = userProfile?.role ?? 'student';

  const [isMobile, setIsMobile] = React.useState<boolean>(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia('(max-width: 767px)').matches;
  });

  React.useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(max-width: 767px)');
    const onChange = () => setIsMobile(mq.matches);
    onChange();
    mq.addEventListener?.('change', onChange);
    return () => mq.removeEventListener?.('change', onChange);
  }, []);

  // Parent-only mobile redesign. Desktop remains intact.
  if (role === 'parent') {
    return isMobile ? <Year3HistoryMobile /> : <Y3HistoryPageDesktop />;
  }

  return <Y3HistoryPageDesktop />;
};

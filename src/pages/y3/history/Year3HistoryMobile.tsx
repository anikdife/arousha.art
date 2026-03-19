import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../../auth/AuthProvider';
import { StickyHeader } from '../../../components/ui/StickyHeader';
import { SegmentedControl } from '../../../components/ui/SegmentedControl';
import { DateRangeButton } from '../../../components/ui/DateRangeButton';
import { Fab } from '../../../components/ui/Fab';
import { getActiveStudentName, getActiveStudentUid, setActiveStudent } from '../../../lib/activeStudent';
import { buildReadingMagazinePdf } from '../../../lib/readingMagazinePdf';
import { buildSubtractionPdf } from '../../../lib/subtractionPdf';
import { buildAdditionPdf } from '../../../lib/additionPdf';
import { buildMultiplicationPdf } from '../../../lib/multiplicationPdf';
import { buildMeasurementPdf } from '../../../lib/measurementPdf';
import { buildGeometryPdf } from '../../../lib/geometryPdf';
import { buildDataProbabilityPdf } from '../../../lib/dataProbabilityPdf';
import { buildLanguageConventionsPdf } from '../../../lib/languageConventions/pdfExport';
import type { LCSession } from '../../../lib/languageConventions/types';
import { loadSessionJsonByStoragePath } from '../../../lib/loadSessionJsonByPath';
import type { SessionIndexItem, SessionIndexTopic } from '../../../lib/sessionIndexReader';
import { ParentSessionOverlay, type OverlayTarget } from './ParentSessionOverlay';
import { DateRangeSheet, computeLocalDayRangeMs } from './components/DateRangeSheet';
import { StudentSwitcherSheet } from './components/StudentSwitcherSheet';
import { CombinedProgressCardMobile } from './components/CombinedProgressCardMobile';
import { CategoryShareCardMobile } from './components/CategoryShareCardMobile';
import { SessionListMobile } from './components/SessionListMobile';
import { HistoryActionsSheet } from './components/HistoryActionsSheet';
import { SeriesLegendSheet, type SeriesEnabledMap } from './components/SeriesLegendSheet';
import { useY3HistoryData } from '../../../hooks/useY3HistoryData';
import { useTopicSessionIndex } from '../../../hooks/useTopicSessionIndex';
import { StudyTimeHeatmap } from './components/StudyTimeHeatmap';
import { WeeklyConsistencyChart } from './components/WeeklyConsistencyChart';
import { defaultStudyTimeCategories } from './utils/aggregateStudyTime';

type Category = 'numeracy' | 'writing' | 'language-conventions' | 'reading';

function categoryLabel(category: Category): string {
  switch (category) {
    case 'numeracy':
      return 'Numeracy';
    case 'writing':
      return 'Writing';
    case 'language-conventions':
      return 'Language';
    case 'reading':
      return 'Reading';
    default:
      return category;
  }
}

function categoryPracticeHref(category: Category): string {
  return category === 'numeracy'
    ? '/y3/numeracy'
    : category === 'writing'
      ? '/y3/writing'
      : category === 'language-conventions'
        ? '/y3/language-conventions'
        : '/y3/reading-magazine';
}

function toLocalIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const a = parts[0]?.[0] ?? '';
  const b = parts.length > 1 ? parts[parts.length - 1]?.[0] ?? '' : '';
  return (a + b).toUpperCase();
}

function shortName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'Student';
  return parts[0].slice(0, 10);
}

export const Year3HistoryMobile: React.FC = () => {
  const { currentUser, userProfile } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const role = userProfile?.role ?? 'student';
  const isParent = role === 'parent';

  const state = (location.state as any) ?? {};
  const stateStudentUid = typeof state.studentUid === 'string' ? state.studentUid : undefined;
  const stateStudentName = typeof state.studentName === 'string' ? state.studentName : undefined;

  const linkedStudentUids = useMemo(() => {
    const legacy = (userProfile as any)?.linkedStudentIds as unknown;
    const newer = (userProfile as any)?.linkedStudentUids as unknown;
    const idsA = Array.isArray(legacy) ? (legacy as string[]) : [];
    const idsB = Array.isArray(newer) ? (newer as string[]) : [];
    return Array.from(new Set([...idsA, ...idsB])).filter(Boolean);
  }, [userProfile]);

  const [activeStudentUid, setActiveStudentUid] = useState<string | undefined>(() => getActiveStudentUid() ?? undefined);

  useEffect(() => {
    if (!stateStudentUid) return;
    setActiveStudent(stateStudentUid, stateStudentName);
    setActiveStudentUid(stateStudentUid);
  }, [stateStudentName, stateStudentUid]);

  useEffect(() => {
    if (!isParent) return;
    if (linkedStudentUids.length === 0) return;

    const candidate = stateStudentUid ?? activeStudentUid;
    const resolved = candidate && linkedStudentUids.includes(candidate) ? candidate : linkedStudentUids[0];
    if (!resolved) return;

    if (resolved !== activeStudentUid) {
      setActiveStudent(resolved);
      setActiveStudentUid(resolved);
    }
  }, [activeStudentUid, isParent, linkedStudentUids, stateStudentUid]);

  const studentUid = useMemo(() => {
    if (role === 'student') return currentUser?.uid ?? undefined;
    if (stateStudentUid) return stateStudentUid;
    if (activeStudentUid) return activeStudentUid;
    if (isParent && linkedStudentUids.length > 0) return linkedStudentUids[0];
    return undefined;
  }, [activeStudentUid, currentUser?.uid, isParent, linkedStudentUids, role, stateStudentUid]);

  const viewingName = stateStudentName ?? getActiveStudentName() ?? 'Selected student';

  const [view, setView] = useState<'graph' | 'list'>('graph');

  const [listCategories, setListCategories] = useState<Category[]>(() => {
    const raw = (location.state as any)?.historyCategory;
    const hinted = raw === 'numeracy' || raw === 'reading' || raw === 'language-conventions' || raw === 'writing' ? (raw as Category) : 'numeracy';
    return [hinted];
  });

  const toggleListCategory = (key: Category) => {
    setListCategories((current) => {
      const has = current.includes(key);
      if (has) {
        const next = current.filter((k) => k !== key);
        return next.length > 0 ? next : current;
      }
      return [...current, key];
    });
  };

  const todayIso = useMemo(() => toLocalIsoDate(new Date()), []);
  const [fromDate, setFromDate] = useState(todayIso);
  const [toDate, setToDate] = useState(todayIso);

  const dateRange = useMemo(() => {
    if (!isParent) return null;
    return computeLocalDayRangeMs(fromDate, toDate);
  }, [fromDate, isParent, toDate]);

  // Load sessions for the Visual dashboard graphs.
  const numeracy = useY3HistoryData(studentUid);
  const language = useTopicSessionIndex({ studentUid, topic: 'language-conventions', enabled: Boolean(studentUid) });
  const reading = useTopicSessionIndex({ studentUid, topic: 'reading-magazine', enabled: Boolean(studentUid) });
  const writing = useTopicSessionIndex({ studentUid, topic: 'writing', enabled: Boolean(studentUid) });

  const heatmapSessions = useMemo(() => {
    const out: SessionIndexItem[] = [];
    const d = numeracy.data;
    if (d) out.push(...d.addition, ...d.subtraction, ...d.multiplication, ...d.measurement, ...d.geometry, ...d.dataProbability);
    out.push(...reading.items);
    out.push(...language.items);
    out.push(...writing.items);
    return out;
  }, [language.items, numeracy.data, reading.items, writing.items]);

  const heatmapCategories = useMemo(() => defaultStudyTimeCategories(), []);

  const [studentSheetOpen, setStudentSheetOpen] = useState(false);
  const [dateSheetOpen, setDateSheetOpen] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [seriesSheetOpen, setSeriesSheetOpen] = useState(false);

  const seriesStorageKey = useMemo(() => {
    const parentUid = currentUser?.uid ?? 'anon';
    return `y3HistorySeries:${parentUid}:${studentUid ?? 'none'}`;
  }, [currentUser?.uid, studentUid]);

  const [seriesEnabled, setSeriesEnabled] = useState<SeriesEnabledMap>(() => {
    try {
      const raw = localStorage.getItem(seriesStorageKey);
      if (!raw) return { subtraction: true, addition: true, multiplication: true, measurement: true, geometry: true, dataProbability: true };
      const parsed = JSON.parse(raw);
      return {
        subtraction: parsed?.subtraction !== false,
        addition: parsed?.addition !== false,
        multiplication: parsed?.multiplication !== false,
        measurement: parsed?.measurement !== false,
        geometry: parsed?.geometry !== false,
        dataProbability: parsed?.dataProbability !== false,
      };
    } catch {
      return { subtraction: true, addition: true, multiplication: true, measurement: true, geometry: true, dataProbability: true };
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(seriesStorageKey, JSON.stringify(seriesEnabled));
    } catch {
      // ignore
    }
  }, [seriesEnabled, seriesStorageKey]);

  const resetAll = () => {
    setFromDate(todayIso);
    setToDate(todayIso);
    setSeriesEnabled({ subtraction: true, addition: true, multiplication: true, measurement: true, geometry: true, dataProbability: true });
    setView('graph');
    setListCategories(['numeracy']);
  };

  const [overlayTarget, setOverlayTarget] = useState<OverlayTarget | null>(null);

  const openOverlayForItem = async (item: SessionIndexItem) => {
    if (!item?.storagePath) return;

    const pdfStudentName = viewingName ?? getActiveStudentName() ?? 'Student';

    try {
      if (item.topic === 'reading-magazine') {
        const json = await loadSessionJsonByStoragePath(item.storagePath);
        const bytes = await buildReadingMagazinePdf({ title: 'Reading Magazine Practice', session: json, studentName: pdfStudentName });
        setOverlayTarget({ kind: 'pdf', title: 'Reading Magazine Practice', bytes });
        return;
      }

      if (item.topic === 'language-conventions') {
        const sessionJson = (await loadSessionJsonByStoragePath(item.storagePath)) as LCSession;
        const bytes = await buildLanguageConventionsPdf({
          title: 'Language Conventions Practice',
          session: sessionJson,
          studentName: pdfStudentName,
          createdAtIso: sessionJson.submittedAt ?? sessionJson.createdAt ?? item.submittedAt ?? item.createdAt,
          score: sessionJson.summary,
          sessionId: item.sessionId,
        });
        setOverlayTarget({ kind: 'pdf', title: 'Language Conventions Practice', bytes });
        return;
      }

      // Numeracy topics
      const sessionJson = await loadSessionJsonByStoragePath(item.storagePath);
      const topic = item.topic as SessionIndexTopic;
      const scoreFromIndex = item.score ?? { correct: 0, total: 0, percentage: 0 };
      const scoreToPrint = (sessionJson as any)?.score ?? scoreFromIndex;
      const createdAtIso =
        (sessionJson as any)?.submittedAt ??
        (sessionJson as any)?.createdAt ??
        item.submittedAt ??
        item.createdAt ??
        new Date((item.submittedAtMillis ?? 0) || Date.now()).toISOString();

      if (topic === 'addition') {
        const bytes = await buildAdditionPdf({
          title: 'Addition Practice',
          pages: (sessionJson as any)?.pages,
          createdAtIso,
          studentName: pdfStudentName,
          score: scoreToPrint,
          sessionId: item.sessionId,
        });
        setOverlayTarget({ kind: 'pdf', title: 'Addition Practice', bytes });
        return;
      }

      if (topic === 'subtraction') {
        const bytes = await buildSubtractionPdf({
          title: 'Subtraction Practice',
          pages: (sessionJson as any)?.pages,
          createdAtIso,
          studentName: pdfStudentName,
          score: scoreToPrint,
          sessionId: item.sessionId,
        });
        setOverlayTarget({ kind: 'pdf', title: 'Subtraction Practice', bytes });
        return;
      }

      if (topic === 'multiplication') {
        const sessionForPdf = {
          ...(sessionJson as any),
          topic: (sessionJson as any)?.topic ?? 'multiplication',
          score: (sessionJson as any)?.score ?? scoreFromIndex,
        };
        const bytes = await buildMultiplicationPdf({
          title: 'Multiplication Practice',
          session: sessionForPdf,
          createdAtIso,
          studentName: pdfStudentName,
          score: sessionForPdf.score,
          sessionId: item.sessionId,
        });
        setOverlayTarget({ kind: 'pdf', title: 'Multiplication Practice', bytes });
        return;
      }

      if (topic === 'measurement') {
        const bytes = await buildMeasurementPdf({
          title: 'Measurement Practice',
          session: sessionJson as any,
          createdAtIso: (sessionJson as any)?.submittedAt ?? (sessionJson as any)?.createdAt,
          studentName: pdfStudentName,
          score: (sessionJson as any)?.score,
          sessionId: item.sessionId,
        });
        setOverlayTarget({ kind: 'pdf', title: 'Measurement Practice', bytes });
        return;
      }

      if (topic === 'geometry') {
        const bytes = await buildGeometryPdf({ title: 'Geometry Practice', session: sessionJson as any, studentName: pdfStudentName });
        setOverlayTarget({ kind: 'pdf', title: 'Geometry Practice', bytes });
        return;
      }

      // data-probability
      {
        const bytes = await buildDataProbabilityPdf({ title: 'Data & Probability Practice', session: sessionJson as any, studentName: pdfStudentName });
        setOverlayTarget({ kind: 'pdf', title: 'Data & Probability Practice', bytes });
      }
    } catch (e) {
      console.error('Failed to open session PDF overlay:', e);
    }
  };

  const listCategoryOrder = useMemo(() => ['numeracy', 'writing', 'language-conventions', 'reading'] as Category[], []);

  if (!isParent) {
    return (
      <div className="p-4">
        <div className="bg-white border border-gray-200 rounded-2xl p-4">
          <div className="text-sm font-semibold text-gray-900">Mobile parent view only</div>
          <div className="text-sm text-gray-600 mt-1">This layout is only enabled for parent accounts.</div>
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return <div className="p-4">Please sign in to view history.</div>;
  }

  if (!studentUid || !linkedStudentUids.includes(studentUid)) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-green-50">
        <StickyHeader
          title="Year 3 History"
          leftAction={
            <button
              type="button"
              aria-label="Back"
              onClick={() => navigate('/dashboard')}
              className="px-3 py-2 rounded-xl bg-gray-100 text-gray-900 text-sm font-semibold"
            >
              Back
            </button>
          }
        />
        <div className="p-4">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-4">
            <div className="text-base font-bold text-gray-900">Select a student first</div>
            <div className="text-sm text-gray-600 mt-1">Go to Dashboard and open History for a linked student.</div>
            <button
              type="button"
              onClick={() => navigate('/dashboard')}
              className="mt-4 w-full px-4 py-2 rounded-xl bg-purple-600 text-white font-semibold"
            >
              Go to Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  const chipName = shortName(viewingName);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-green-50">
      <StickyHeader
        title="Year 3 History"
        leftAction={
          <button
            type="button"
            aria-label="Back"
            onClick={() => {
              // Prefer back if it stays in-app, otherwise dashboard.
              if (window.history.length > 1) navigate(-1);
              else navigate('/dashboard');
            }}
            className="px-3 py-2 rounded-xl bg-gray-100 text-gray-900 text-sm font-semibold"
          >
            Back
          </button>
        }
        right={
          <button
            type="button"
            aria-label="Switch student"
            onClick={() => setStudentSheetOpen(true)}
            className="flex items-center gap-2 px-2.5 py-2 rounded-full bg-white border border-gray-200"
          >
            <span className="w-7 h-7 rounded-full bg-purple-600 text-white text-xs font-bold flex items-center justify-center">
              {initials(viewingName)}
            </span>
            <span className="text-xs font-semibold text-gray-900 max-w-[90px] truncate">{chipName}</span>
          </button>
        }
      />

      <div className="p-4 space-y-3">
        <div className="flex items-center gap-3">
          <SegmentedControl
            value={view}
            onChange={setView}
            options={[
              { key: 'graph', label: 'Visual' },
              { key: 'list', label: 'List' },
            ]}
          />
        </div>

        {view === 'graph' ? (
          <>
            <DateRangeButton fromDate={fromDate} toDate={toDate} onClick={() => setDateSheetOpen(true)} />

            <CombinedProgressCardMobile
              studentUid={studentUid}
              rangeStartMs={dateRange?.startMs}
              rangeEndMs={dateRange?.endMs}
              seriesEnabled={seriesEnabled}
              onSeriesEnabledChange={setSeriesEnabled}
              onRefresh={() => {
                // intentionally empty
              }}
            />

            <CategoryShareCardMobile
              studentUid={studentUid}
              rangeStartMs={dateRange?.startMs}
              rangeEndMs={dateRange?.endMs}
            />

            <WeeklyConsistencyChart sessions={heatmapSessions} />
            <StudyTimeHeatmap sessions={heatmapSessions} categories={heatmapCategories} />
          </>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <div className="flex-1 overflow-x-auto no-scrollbar">
                <div className="flex items-center gap-2 whitespace-nowrap">
                  {listCategoryOrder.map((k) => {
                    const active = listCategories.includes(k);
                    return (
                      <button
                        key={k}
                        type="button"
                        aria-pressed={active}
                        onClick={() => toggleListCategory(k)}
                        className={
                          'inline-flex items-center gap-2 px-3 py-2 rounded-full text-sm font-semibold border transition-colors ' +
                          (active
                            ? 'bg-purple-600 text-white border-purple-600'
                            : 'bg-white text-gray-800 border-gray-200 hover:bg-gray-50')
                        }
                      >
                        {categoryLabel(k)}
                      </button>
                    );
                  })}
                </div>
              </div>

              <DateRangeButton fromDate={fromDate} toDate={toDate} onClick={() => setDateSheetOpen(true)} />
              <button
                type="button"
                aria-label="Refresh"
                onClick={() => {
                  // Child components have their own refresh hooks; this is a lightweight UX affordance.
                  // No-op here.
                }}
                className="shrink-0 w-11 h-11 rounded-2xl bg-white border border-gray-200 flex items-center justify-center text-gray-800"
              >
                ↻
              </button>
            </div>

            {listCategoryOrder
              .filter((k) => listCategories.includes(k))
              .map((k) => (
                <SessionListMobile
                  key={k}
                  category={k}
                  studentUid={studentUid}
                  studentName={stateStudentName ?? getActiveStudentName()}
                  rangeStartMs={dateRange?.startMs}
                  rangeEndMs={dateRange?.endMs}
                  onEmptyCta={() => navigate(categoryPracticeHref(k), { state: { historyCategory: k } })}
                  onOpenOverlayForParent={(item) => openOverlayForItem(item)}
                />
              ))}
          </>
        )}
      </div>

      <Fab onClick={() => setActionsOpen(true)} ariaLabel="Open actions" />

      <StudentSwitcherSheet
        open={studentSheetOpen}
        onClose={() => setStudentSheetOpen(false)}
        linkedStudentUids={linkedStudentUids}
        currentStudentUid={studentUid}
        onSelectStudent={({ uid, name }) => {
          setActiveStudent(uid, name);
          setActiveStudentUid(uid);
          // Preserve current view, but refresh the page state for routes that read location.state.
          navigate('/y3/history', { replace: true, state: { studentUid: uid, studentName: name } });
        }}
      />

      <DateRangeSheet
        open={dateSheetOpen}
        onClose={() => setDateSheetOpen(false)}
        fromDate={fromDate}
        toDate={toDate}
        onApply={({ fromDate: f, toDate: t }) => {
          setFromDate(f);
          setToDate(t);
        }}
        onReset={() => {
          setFromDate(todayIso);
          setToDate(todayIso);
        }}
      />

      <HistoryActionsSheet
        open={actionsOpen}
        onClose={() => setActionsOpen(false)}
        seriesEnabled={seriesEnabled}
        onOpenSeries={() => setSeriesSheetOpen(true)}
        onReset={resetAll}
      />

      <SeriesLegendSheet
        open={seriesSheetOpen}
        onClose={() => setSeriesSheetOpen(false)}
        enabled={seriesEnabled}
        onChange={setSeriesEnabled}
      />

      <ParentSessionOverlay
        target={overlayTarget}
        onClose={() => {
          setOverlayTarget(null);
        }}
        onOpenComplete={() => {
          // no-op
        }}
      />
    </div>
  );
};

// src/pages/y3/languageConventions/Y3LanguageConventionsPractice.tsx

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../../../auth/AuthProvider';
import type { LCAnswer, LCPage, LCQuestion, LCSession } from '../../../lib/languageConventions/types';
import { computeSummary, gradePages } from '../../../lib/languageConventions/grading';
import {
  loadLanguageConventionsBank,
  loadLanguageConventionsMeta,
} from '../../../lib/languageConventions/bankStorageService';
import { generateLCPageFromBank } from '../../../lib/languageConventions/pageGenerator';
import { savePracticeSession } from '../../../lib/session/savePracticeSession';
import { buildLanguageConventionsPdf } from '../../../lib/languageConventions/pdfExport';
import { downloadBytes } from '../../../lib/subtractionPdf';

type LcPracticeProgressTracker = {
  metaVersion: number;
  bankCount: number;
  currentBankIndex: number;
  usedIdsByBank: Record<string, string[]>;
  updatedAt: string;
};

const LC_PROGRESS_TRACKER_KEY_PREFIX = 'lcPracticeProgress:';

function safeGetLocalStorage(): Storage | null {
  try {
    if (typeof window === 'undefined') return null;
    return window.localStorage ?? null;
  } catch {
    return null;
  }
}

function safeParseJson<T>(text: string | null): T | null {
  if (!text) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

function computeQuestionIds(questions: LCQuestion[]): Set<string> {
  const ids = new Set<string>();
  for (const q of questions ?? []) {
    if (q?.id) ids.add(q.id);
  }
  return ids;
}

function loadProgressTracker(uid: string): LcPracticeProgressTracker | null {
  const ls = safeGetLocalStorage();
  if (!ls) return null;
  const raw = ls.getItem(`${LC_PROGRESS_TRACKER_KEY_PREFIX}${uid}`);
  const parsed = safeParseJson<LcPracticeProgressTracker>(raw);
  if (!parsed) return null;
  if (typeof parsed.metaVersion !== 'number') return null;
  if (typeof parsed.bankCount !== 'number') return null;
  if (typeof parsed.currentBankIndex !== 'number') return null;
  if (typeof parsed.usedIdsByBank !== 'object' || parsed.usedIdsByBank === null) return null;
  return parsed;
}

function saveProgressTracker(uid: string, tracker: LcPracticeProgressTracker): void {
  const ls = safeGetLocalStorage();
  if (!ls) return;
  try {
    ls.setItem(`${LC_PROGRESS_TRACKER_KEY_PREFIX}${uid}`, JSON.stringify(tracker));
  } catch {
    // ignore storage quota / private mode
  }
}

function clampBankIndex(bankIndex: number, bankCount: number): number {
  if (!Number.isFinite(bankIndex)) return 1;
  return Math.min(Math.max(1, Math.floor(bankIndex)), Math.max(1, Math.floor(bankCount)));
}

function getUsedSetForBank(tracker: LcPracticeProgressTracker, bankIndex: number, poolIds: Set<string>): Set<string> {
  const raw = tracker.usedIdsByBank[String(bankIndex)] ?? [];
  const used = new Set<string>();
  for (const id of raw) {
    if (poolIds.has(id)) used.add(id);
  }
  return used;
}

function setUsedForBank(tracker: LcPracticeProgressTracker, bankIndex: number, used: Set<string>): void {
  tracker.usedIdsByBank[String(bankIndex)] = Array.from(used);
  tracker.updatedAt = new Date().toISOString();
}

function remainingForBank(poolIds: Set<string>, used: Set<string>): number {
  return poolIds.size - used.size;
}

function nowSessionId(): string {
  return `language-conventions-${Date.now()}`;
}

function makeSessionSeed(uid: string): string {
  try {
    const buf = new Uint32Array(4);
    window.crypto.getRandomValues(buf);
    const hex = Array.from(buf)
      .map((n) => n.toString(16).padStart(8, '0'))
      .join('');
    return `${uid}-language-conventions-${Date.now()}-${hex}`;
  } catch {
    return `${uid}-language-conventions-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }
}

function formatAnswerForUi(q: LCQuestion, a: LCAnswer | undefined): string {
  if (!a) return '';
  if (q.type === 'mcq' && a.type === 'mcq') return String(a.selectedIndex);
  if (q.type === 'spell' && a.type === 'spell') return a.text;
  if (q.type === 'selectIncorrect' && a.type === 'selectIncorrect') return String(a.selectedIndex);
  return '';
}

export const Y3LanguageConventionsPractice: React.FC = () => {
  const location = useLocation();
  const loadedSession = (location.state as any)?.loadedSession as LCSession | undefined;

  const { currentUser, userProfile } = useAuth();
  const role = userProfile?.role ?? 'student';

  const [sessionId, setSessionId] = useState<string>(() => nowSessionId());
  const [sessionSeed, setSessionSeed] = useState<string>(() => {
    const uid = currentUser?.uid ?? 'anonymous';
    return makeSessionSeed(uid);
  });
  const [createdAt, setCreatedAt] = useState<string>(() => new Date().toISOString());

  const [banksState, setBanksState] = useState<
    | { status: 'loading'; stage: 'meta' | 'bank'; bankIndex?: number; bankCount?: number }
    | { status: 'error'; message: string }
    | {
        status: 'ready';
        metaVersion: number;
        bankCount: number;
        bankIndex: number;
        bankQuestions: LCQuestion[];
      }
  >({ status: 'loading', stage: 'meta' });
  const [banksReloadToken, setBanksReloadToken] = useState(0);

  const usedIdsRef = useRef<Set<string>>(new Set());
  const trackingReadyRef = useRef(false);
  const trackerRef = useRef<LcPracticeProgressTracker | null>(null);

  const [pages, setPages] = useState<LCPage[]>([]);
  const [activePageIndex, setActivePageIndex] = useState(0);
  const [submitted, setSubmitted] = useState(false);
  const [uploadState, setUploadState] = useState<'idle' | 'uploading' | 'done' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  const currentPage = pages[activePageIndex];

  useEffect(() => {
    if (!loadedSession) return;

    const loadedPages: LCPage[] = (loadedSession.pages ?? []).map((p: any) => ({
      pageId: String(p.pageId ?? ''),
      questions: (p.questions ?? []) as any,
      userAnswers: (p.userAnswers ?? {}) as any,
      graded: undefined,
    }));

    usedIdsRef.current = new Set<string>();
    for (const p of loadedPages) {
      for (const q of p.questions ?? []) {
        usedIdsRef.current.add((q as any).id);
      }
    }

    setSessionId(String(loadedSession.sessionId ?? nowSessionId()));
    setSessionSeed((prev) => String(loadedSession.seed ?? prev));
    setCreatedAt(String(loadedSession.createdAt ?? new Date().toISOString()));
    setPages((prev) => (loadedPages.length ? loadedPages : prev));
    setActivePageIndex(0);
    setSubmitted(false);
    setUploadState('idle');
  }, [loadedSession]);

  const ensureTrackerReadyForMeta = useCallback(
    (meta: { version: number; bankCount: number }) => {
      if (loadedSession) return;
      if (!currentUser) return;

      if (role !== 'student') {
        usedIdsRef.current = new Set<string>();
        trackingReadyRef.current = true;
        trackerRef.current = null;
        return;
      }

      const stored = loadProgressTracker(currentUser.uid);
      let tracker: LcPracticeProgressTracker;

      if (!stored || stored.metaVersion !== meta.version) {
        tracker = {
          metaVersion: meta.version,
          bankCount: meta.bankCount,
          currentBankIndex: 1,
          usedIdsByBank: {},
          updatedAt: new Date().toISOString(),
        };
      } else {
        tracker = {
          ...stored,
          metaVersion: meta.version,
          bankCount: meta.bankCount,
        };
        tracker.currentBankIndex = clampBankIndex(tracker.currentBankIndex, meta.bankCount);
      }

      trackerRef.current = tracker;
      trackingReadyRef.current = true;
      saveProgressTracker(currentUser.uid, tracker);
    },
    [currentUser, loadedSession, role]
  );

  const loadNextUsableBank = useCallback(
    async (
      meta: { version: number; bankCount: number },
      preferredStartIndex: number
    ): Promise<{ bankIndex: number; questions: LCQuestion[] }> => {
      const bankCount = Math.max(1, meta.bankCount);

      if (!currentUser || role !== 'student' || loadedSession) {
        const bank = await loadLanguageConventionsBank(clampBankIndex(preferredStartIndex, bankCount));
        return { bankIndex: clampBankIndex(preferredStartIndex, bankCount), questions: bank.questions };
      }

      if (!trackerRef.current || trackerRef.current.metaVersion !== meta.version) {
        ensureTrackerReadyForMeta(meta);
      }
      const tracker = trackerRef.current;
      if (!tracker) {
        const bankIndex = clampBankIndex(preferredStartIndex, bankCount);
        const bank = await loadLanguageConventionsBank(bankIndex);
        return { bankIndex, questions: bank.questions };
      }

      // Try banks sequentially starting at preferredStartIndex. Only load as many as needed.
      for (let attempt = 0; attempt < bankCount; attempt++) {
        const bankIndex = ((clampBankIndex(preferredStartIndex, bankCount) - 1 + attempt) % bankCount) + 1;
        const bank = await loadLanguageConventionsBank(bankIndex);
        const poolIds = computeQuestionIds(bank.questions);
        const used = getUsedSetForBank(tracker, bankIndex, poolIds);
        const remaining = remainingForBank(poolIds, used);
        if (remaining >= 10) {
          tracker.currentBankIndex = bankIndex;
          setUsedForBank(tracker, bankIndex, used);
          saveProgressTracker(currentUser.uid, tracker);
          usedIdsRef.current = used;
          return { bankIndex, questions: bank.questions };
        }
      }

      // If no bank can generate a fully-new page, reset everything and start at bank 1.
      tracker.usedIdsByBank = {};
      tracker.currentBankIndex = 1;
      tracker.updatedAt = new Date().toISOString();
      saveProgressTracker(currentUser.uid, tracker);
      usedIdsRef.current = new Set<string>();
      const bank = await loadLanguageConventionsBank(1);
      return { bankIndex: 1, questions: bank.questions };
    },
    [currentUser, ensureTrackerReadyForMeta, loadedSession, role]
  );

  const persistUsedForCurrentBank = useCallback(
    (meta: { version: number; bankCount: number }, bankIndex: number) => {
      if (loadedSession) return;
      if (!currentUser) return;
      if (role !== 'student') return;
      if (!trackerRef.current || trackerRef.current.metaVersion !== meta.version) return;

      const tracker = trackerRef.current;
      tracker.currentBankIndex = clampBankIndex(bankIndex, meta.bankCount);
      setUsedForBank(tracker, bankIndex, usedIdsRef.current);
      saveProgressTracker(currentUser.uid, tracker);
    },
    [currentUser, loadedSession, role]
  );

  useEffect(() => {
    if (!currentUser) return;

    let cancelled = false;
    setBanksState({ status: 'loading', stage: 'meta' });

    (async () => {
      try {
        const meta = await loadLanguageConventionsMeta();
        if (cancelled) return;

        ensureTrackerReadyForMeta(meta);
        const trackerBankIndex = trackerRef.current?.currentBankIndex ?? 1;

        setBanksState({ status: 'loading', stage: 'bank', bankIndex: trackerBankIndex, bankCount: meta.bankCount });
        const next = await loadNextUsableBank(meta, trackerBankIndex);
        if (cancelled) return;

        setBanksState({
          status: 'ready',
          metaVersion: meta.version,
          bankCount: meta.bankCount,
          bankIndex: next.bankIndex,
          bankQuestions: next.questions,
        });
      } catch (e: any) {
        if (cancelled) return;
        const message = String(e?.message ?? e ?? 'Failed to load banks');
        setBanksState({ status: 'error', message });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [currentUser, banksReloadToken, ensureTrackerReadyForMeta, loadNextUsableBank]);

  useEffect(() => {
    if (loadedSession) return;
    if (pages.length > 0) return;
    if (banksState.status !== 'ready') return;

    const meta = { version: banksState.metaVersion, bankCount: banksState.bankCount };

    const generated = generateLCPageFromBank({
      bankQuestions: banksState.bankQuestions,
      bankUsed: banksState.bankIndex,
      pageIndex: 0,
      seed: sessionSeed,
      usedIds: usedIdsRef.current,
      bundleVersion: banksState.metaVersion,
    });

    persistUsedForCurrentBank(meta, banksState.bankIndex);

    setPages([
      {
        pageId: `${sessionSeed}-p1`,
        pageIndex: 0,
        bankUsed: generated.bankUsed,
        questions: generated.questions,
        userAnswers: {},
        graded: undefined,
      },
    ]);
    setActivePageIndex(0);
  }, [banksState, loadedSession, pages.length, persistUsedForCurrentBank, sessionSeed]);

  const canPractice = useMemo(() => {
    if (!currentUser) return false;
    if (role !== 'student') return false;
    return true;
  }, [currentUser, role]);

  const updateAnswer = useCallback(
    (questionId: string, value: LCAnswer) => {
      if (submitted) return;
      setPages((prev) =>
        prev.map((p, idx) =>
          idx === activePageIndex ? { ...p, userAnswers: { ...p.userAnswers, [questionId]: value } } : p
        )
      );
    },
    [activePageIndex, submitted]
  );

  const addNewPage = useCallback(async () => {
    if (submitted) return;

    if (banksState.status !== 'ready') {
      setError('Question banks not loaded.');
      return;
    }

    const meta = { version: banksState.metaVersion, bankCount: banksState.bankCount };
    const poolIds = computeQuestionIds(banksState.bankQuestions);
    const remaining = remainingForBank(poolIds, usedIdsRef.current);

    let bankIndex = banksState.bankIndex;
    let bankQuestions = banksState.bankQuestions;
    if (poolIds.size > 0 && remaining < 10) {
      // Move to next bank.
      const next = await loadNextUsableBank(meta, bankIndex + 1);
      bankIndex = next.bankIndex;
      bankQuestions = next.questions;
      setBanksState({
        status: 'ready',
        metaVersion: meta.version,
        bankCount: meta.bankCount,
        bankIndex,
        bankQuestions,
      });
    }

    const nextIndex = pages.length;
    const generated = generateLCPageFromBank({
      bankQuestions,
      bankUsed: bankIndex,
      pageIndex: nextIndex,
      seed: sessionSeed,
      usedIds: usedIdsRef.current,
      bundleVersion: meta.version,
    });

    persistUsedForCurrentBank(meta, bankIndex);

    const next: LCPage = {
      pageId: `${sessionSeed}-p${nextIndex + 1}`,
      pageIndex: nextIndex,
      bankUsed: generated.bankUsed,
      questions: generated.questions,
      userAnswers: {},
      graded: undefined,
    };
    setPages((prev) => [...prev, next]);
    setActivePageIndex(nextIndex);
  }, [banksState, loadNextUsableBank, pages.length, persistUsedForCurrentBank, sessionSeed, submitted]);

  const goToPreviousPage = useCallback(() => {
    setActivePageIndex((i) => Math.max(0, i - 1));
  }, []);

  const goToNextPage = useCallback(() => {
    setActivePageIndex((i) => Math.min(pages.length - 1, i + 1));
  }, [pages.length]);

  const startNewWorkbook = useCallback(async () => {
    if (banksState.status !== 'ready') {
      setError('Question banks not loaded.');
      return;
    }

    const uid = currentUser?.uid ?? 'anonymous';
    const nextSeed = makeSessionSeed(uid);

    const meta = { version: banksState.metaVersion, bankCount: banksState.bankCount };
    const poolIds = computeQuestionIds(banksState.bankQuestions);
    const remaining = remainingForBank(poolIds, usedIdsRef.current);

    let bankIndex = banksState.bankIndex;
    let bankQuestions = banksState.bankQuestions;

    if (poolIds.size > 0 && remaining < 10) {
      const next = await loadNextUsableBank(meta, bankIndex + 1);
      bankIndex = next.bankIndex;
      bankQuestions = next.questions;
      setBanksState({
        status: 'ready',
        metaVersion: meta.version,
        bankCount: meta.bankCount,
        bankIndex,
        bankQuestions,
      });
    }

    const generated = generateLCPageFromBank({
      bankQuestions,
      bankUsed: bankIndex,
      pageIndex: 0,
      seed: nextSeed,
      usedIds: usedIdsRef.current,
      bundleVersion: meta.version,
    });

    persistUsedForCurrentBank(meta, bankIndex);

    const first: LCPage = {
      pageId: `${nextSeed}-p1`,
      pageIndex: 0,
      bankUsed: generated.bankUsed,
      questions: generated.questions,
      userAnswers: {},
      graded: undefined,
    };

    setError(null);
    setSessionId(nowSessionId());
    setSessionSeed(nextSeed);
    setCreatedAt(new Date().toISOString());
    setPages([first]);
    setActivePageIndex(0);
    setSubmitted(false);
    setUploadState('idle');
  }, [banksState, currentUser, loadNextUsableBank, persistUsedForCurrentBank]);

  const submitAll = useCallback(async () => {
    setError(null);

    if (!currentUser) {
      setError('No user logged in');
      return;
    }

    if (!canPractice) {
      setError('Only students can start practice sessions.');
      return;
    }

    setUploadState('uploading');

    try {
      const graded = gradePages(pages);
      const summary = computeSummary(graded);
      const submittedAt = new Date().toISOString();

      const bankRotation =
        banksState.status === 'ready'
          ? Array.from({ length: Math.max(1, banksState.bankCount) }, (_, i) => `lc_bank_${i + 1}.json`)
          : undefined;

      const pageBankUsed: Record<string, number> = {};
      const selectedQuestionIdsByPageId: Record<string, string[]> = {};
      for (const p of graded) {
        if (p.pageId) {
          pageBankUsed[p.pageId] = (p.bankUsed ?? 1) as any;
          selectedQuestionIdsByPageId[p.pageId] = (p.questions ?? []).map((q) => q.id);
        }
      }

      const session: LCSession = {
        sessionId,
        topic: 'language-conventions',
        year: 3,
        seed: sessionSeed,
        bankRotation,
        bankMetaVersion: banksState.status === 'ready' ? banksState.metaVersion : undefined,
        pageBankUsed,
        selectedQuestionIdsByPageId,
        createdAt,
        submittedAt,
        pages: graded,
        summary,
      };

      await savePracticeSession({
        studentUid: currentUser.uid,
        sessionId,
        topic: 'language-conventions',
        year: 3,
        section: 'language',
        score: summary,
        sessionJson: session,
      });

      setPages(graded);
      setSubmitted(true);
      setUploadState('done');
    } catch (e) {
      console.error('Failed to submit session:', e);
      setUploadState('error');
      setError('Failed to save session');
    }
  }, [banksState, canPractice, createdAt, currentUser, pages, sessionId, sessionSeed]);

  const downloadPdf = useCallback(async () => {
    setError(null);
    try {
      const summary = submitted ? computeSummary(pages) : undefined;
      const session: LCSession = {
        sessionId,
        topic: 'language-conventions',
        year: 3,
        seed: sessionSeed,
        createdAt,
        submittedAt: submitted ? new Date().toISOString() : undefined,
        pages,
        summary,
      };

      const studentName = userProfile?.displayName ?? currentUser?.displayName ?? 'Student';
      const bytes = await buildLanguageConventionsPdf({ title: 'Language Conventions Practice', session, studentName });
      downloadBytes(bytes, `LanguageConventions_${sessionId}.pdf`);
    } catch (e) {
      console.error('Failed to generate PDF:', e);
      setError('Failed to generate PDF');
    }
  }, [createdAt, currentUser?.displayName, pages, sessionId, sessionSeed, submitted, userProfile?.displayName]);

  const renderMcq = (q: Extract<LCQuestion, { type: 'mcq' }>) => {
    const a = currentPage.userAnswers[q.id];
    const selected = a?.type === 'mcq' ? a.selectedIndex : undefined;
    const ok = currentPage.graded?.[q.id];

    return (
      <div className="mt-3 space-y-2">
        {q.choices.map((choice, idx) => {
          const isSelected = selected === idx;
          const showGrade = submitted;
          return (
            <label
              key={idx}
              className={`flex items-center gap-2 p-2 rounded border ${
                showGrade
                  ? ok
                    ? 'border-green-300 bg-green-50'
                    : isSelected
                      ? 'border-red-300 bg-red-50'
                      : 'border-gray-200 bg-white'
                  : isSelected
                    ? 'border-blue-300 bg-blue-50'
                    : 'border-gray-200 bg-white'
              }`}
            >
              <input
                type="radio"
                name={q.id}
                checked={isSelected}
                disabled={submitted}
                onChange={() => updateAnswer(q.id, { type: 'mcq', selectedIndex: idx })}
              />
              <span className="text-gray-900">{choice}</span>
            </label>
          );
        })}
      </div>
    );
  };

  const renderSpell = (q: Extract<LCQuestion, { type: 'spell' }>) => {
    const a = currentPage.userAnswers[q.id];
    const val = a?.type === 'spell' ? a.text : '';
    const ok = currentPage.graded?.[q.id];

    return (
      <div className="mt-3">
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-gray-900">
          {q.sentenceWithError}
        </div>
        <div className="mt-3 flex items-center gap-2">
          <input
            type="text"
            value={val}
            disabled={submitted}
            onChange={(e) => updateAnswer(q.id, { type: 'spell', text: e.target.value })}
            className={`w-full px-3 py-2 rounded-lg border ${
              submitted ? (ok ? 'border-green-400 bg-green-50' : 'border-red-400 bg-red-50') : 'border-gray-300'
            }`}
            placeholder="Type your answer"
          />
          {submitted && (
            <span className={`text-sm font-bold ${ok ? 'text-green-700' : 'text-red-700'}`}>{ok ? '✓' : '✗'}</span>
          )}
        </div>
      </div>
    );
  };

  const renderSelectIncorrect = (q: Extract<LCQuestion, { type: 'selectIncorrect' }>) => {
    const a = currentPage.userAnswers[q.id];
    const selected = a?.type === 'selectIncorrect' ? a.selectedIndex : undefined;
    const ok = currentPage.graded?.[q.id];

    return (
      <div className="mt-3">
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
          <div className="flex flex-wrap gap-2">
            {q.tokens.map((t, idx) => {
              const isSelected = selected === idx;
              const showGrade = submitted;
              const isCorrectToken = idx === q.incorrectIndex;

              const cls = (() => {
                if (!showGrade) {
                  return isSelected ? 'bg-blue-600 text-white' : 'bg-white border border-gray-300 text-gray-900';
                }
                if (isCorrectToken) return 'bg-green-600 text-white';
                if (isSelected && !isCorrectToken) return 'bg-red-600 text-white';
                return 'bg-white border border-gray-300 text-gray-900';
              })();

              return (
                <button
                  key={idx}
                  type="button"
                  disabled={submitted}
                  onClick={() => updateAnswer(q.id, { type: 'selectIncorrect', selectedIndex: idx })}
                  className={`px-2 py-1 rounded ${cls}`}
                >
                  {t}
                </button>
              );
            })}
          </div>
        </div>
        {submitted && (
          <div className={`mt-2 text-sm font-medium ${ok ? 'text-green-700' : 'text-red-700'}`}>{ok ? '✓' : '✗'}</div>
        )}
      </div>
    );
  };

  if (!currentUser) {
    return <div className="bg-white rounded-xl border border-gray-200 p-6">Please sign in to practice.</div>;
  }

  if (!canPractice) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="text-gray-900 font-semibold">Practice is available for students.</div>
        <div className="text-sm text-gray-600 mt-1">Parents/teachers can use History to view sessions.</div>
      </div>
    );
  }

  if (banksState.status === 'loading') {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="text-gray-900 font-semibold">Loading…</div>
      </div>
    );
  }

  if (banksState.status === 'error') {
    return (
      <div className="bg-white rounded-xl border border-red-200 p-6 bg-red-50">
        <div className="text-red-900 font-semibold">Question bank error</div>
        <div className="text-sm text-red-800 mt-1">{banksState.message}</div>
        <div className="text-xs text-red-700 mt-3">
          Practice is disabled until the bank JSON in Storage is fixed.
        </div>
        <button
          type="button"
          onClick={() => {
            if (!currentUser) return;
            setBanksReloadToken((n) => n + 1);
          }}
          className="mt-4 px-4 py-2 bg-red-700 text-white rounded hover:bg-red-800"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
      <div className="px-6 py-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-lg font-bold text-gray-900">Practice</div>
            <div className="text-sm text-gray-600">Page {activePageIndex + 1} of {pages.length}</div>
          </div>
        </div>

        {/* Page dots (top) */}
        <div className="mt-3 flex items-center justify-center" aria-label="Pages">
          <div className="inline-flex items-center gap-1">
            {pages.map((_, index) => (
              <button
                // eslint-disable-next-line react/no-array-index-key
                key={index}
                type="button"
                onClick={() => setActivePageIndex(index)}
                className={`h-2.5 w-2.5 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-300 ${
                  index === activePageIndex ? 'bg-blue-600' : 'bg-gray-300 hover:bg-gray-400'
                }`}
                aria-label={`Go to page ${index + 1}`}
              />
            ))}
          </div>
        </div>
      </div>

      {error && <div className="px-6 py-3 text-sm text-red-700 bg-red-50 border-b border-red-200">{error}</div>}

      {submitted && (
        <div className="px-6 py-3 bg-green-50 border-b border-green-200 text-green-800 text-sm">
          Submitted. Score: {computeSummary(pages).correct}/{computeSummary(pages).total} ({computeSummary(pages).percentage}%)
        </div>
      )}

      <div className="p-6 space-y-6">
        {(currentPage?.questions ?? []).length === 0 ? (
          <div className="text-gray-600">No questions available on this page.</div>
        ) : (
          currentPage.questions.map((q, idx) => {
            const ok = currentPage.graded?.[q.id];

            return (
              <div key={q.id} className="p-4 rounded-xl border border-gray-200">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-sm text-gray-500">Question {idx + 1}</div>
                    <div className="mt-1 text-gray-900 font-semibold">{q.prompt}</div>
                    {'sentence' in q && (q as any).sentence && (
                      <div className="mt-2 text-gray-800 bg-gray-50 border border-gray-100 rounded-lg p-3">
                        {(q as any).sentence}
                      </div>
                    )}
                  </div>
                  {submitted && (
                    <div className={`text-xl font-bold ${ok ? 'text-green-700' : 'text-red-700'}`}>{ok ? '✓' : '✗'}</div>
                  )}
                </div>

                {q.type === 'mcq'
                  ? renderMcq(q)
                  : q.type === 'spell'
                    ? renderSpell(q)
                    : renderSelectIncorrect(q)}

                {submitted && q.type === 'spell' && currentPage.graded?.[q.id] === false && (
                  <div className="mt-2 text-sm text-gray-700">
                    Correct: <span className="font-semibold">{q.correctToken}</span>
                  </div>
                )}

                {submitted && q.type === 'selectIncorrect' && currentPage.graded?.[q.id] === false && (
                  <div className="mt-2 text-sm text-gray-700">
                    Correct: <span className="font-semibold">{q.tokens[q.incorrectIndex]}</span> → {q.correctToken}
                  </div>
                )}

                {submitted && q.type === 'mcq' && currentPage.graded?.[q.id] === false && (
                  <div className="mt-2 text-sm text-gray-700">
                    Correct: <span className="font-semibold">{q.choices[q.correctIndex]}</span>
                    <div className="text-xs text-gray-500">Your answer: {formatAnswerForUi(q, currentPage.userAnswers[q.id]) || '(blank)'}</div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      <div className="px-6 py-5 border-t border-gray-200">
        <div className="flex items-center justify-center">
          <div className="flex items-center justify-center gap-3 flex-wrap">
            {submitted && (
              <button
                type="button"
                onClick={() => void startNewWorkbook()}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                New workbook
              </button>
            )}

            <button
              type="button"
              onClick={() => void addNewPage()}
              disabled={submitted}
              className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Add New Page
            </button>

            <button
              type="button"
              onClick={goToPreviousPage}
              disabled={activePageIndex === 0}
              className="px-4 py-2 text-sm bg-gray-200 text-gray-700 rounded hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Previous
            </button>
            <button
              type="button"
              onClick={goToNextPage}
              disabled={activePageIndex >= pages.length - 1}
              className="px-4 py-2 text-sm bg-gray-200 text-gray-700 rounded hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next
            </button>

            {!submitted ? (
              <button
                type="button"
                onClick={submitAll}
                disabled={uploadState === 'uploading' || (currentPage?.questions ?? []).length === 0}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {uploadState === 'uploading' ? 'Submitting...' : 'Submit'}
              </button>
            ) : (
              <button
                type="button"
                onClick={downloadPdf}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                Download PDF
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

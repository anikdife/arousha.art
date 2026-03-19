import React, { useEffect, useMemo, useState } from 'react';
import { auth } from '../../../firebase/firebase';
import { uploadSessionJson } from '../../../lib/uploadSessionJson';
import { writeMultiplicationSessionIndex } from '../../../lib/sessionIndexService';
import { APP_VERSION, GENERATOR_VERSION } from '../../../constants/version';
import {
  MultiplicationProblem,
  generateMultiplicationPage,
  evaluateMultiplicationAnswer,
  formatMultiplicationPrompt,
} from '../../../lib/generators/multiplicationGenerator';

type GradeResult = { ok: boolean; expected: number };

function makeSessionSeedBase(uid: string): string {
  try {
    // Prefer cryptographically-strong randomness when available.
    const buf = new Uint32Array(4);
    window.crypto.getRandomValues(buf);
    const hex = Array.from(buf)
      .map((n) => n.toString(16).padStart(8, '0'))
      .join('');
    return `${uid}:${Date.now()}:${hex}`;
  } catch {
    // Fallback: still produces a new seed most runs.
    return `${uid}:${Date.now()}:${Math.random().toString(16).slice(2)}`;
  }
}

export const Y3MultiplicationPractice: React.FC = () => {
  const [pages, setPages] = useState<Array<{ pageId: string; problems: MultiplicationProblem[] }>>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);
  const [graded, setGraded] = useState<Record<string, GradeResult>>({});
  const [loadError, setLoadError] = useState<string | null>(null);
  const [uploadState, setUploadState] = useState<'idle' | 'uploading' | 'done' | 'error'>('idle');

  const userKey = auth.currentUser?.uid ?? 'anon';
  const [sessionSeedBase, setSessionSeedBase] = useState<string>(() => makeSessionSeedBase(userKey));

  const startNewWorkbook = () => {
    setLoadError(null);
    setUploadState('idle');
    setSessionSeedBase(makeSessionSeedBase(userKey));
  };

  // Regenerate the seed when the authenticated user changes.
  useEffect(() => {
    setSessionSeedBase(makeSessionSeedBase(userKey));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userKey]);

  useEffect(() => {
    try {
      setLoadError(null);

      // Initial page
      const first = generateMultiplicationPage({
        difficulty: 'easy',
        count: 10,
        seedKey: `${sessionSeedBase}:0`,
        ensureUniquenessWithinPage: true,
        allowZero: true,
        allowOne: true,
      });

      setPages([first]);
      setActiveIndex(0);
      setAnswers({});
      setSubmitted(false);
      setGraded({});
      setUploadState('idle');
    } catch (e) {
      console.error('Failed to generate multiplication page:', e);
      setLoadError('Failed to generate problems. Please try again.');
    }
  }, [sessionSeedBase]);

  const currentPage = pages[activeIndex];
  const problems = currentPage?.problems ?? [];

  const onChangeAnswer = (problemId: string, value: string) => {
    if (submitted) return;
    setAnswers((prev) => ({ ...prev, [problemId]: value }));
  };

  const handleSubmit = () => {
    if (submitted) return;

    const nextGraded: Record<string, GradeResult> = {};
    for (const page of pages) {
      for (const p of page.problems) {
        const input = answers[p.id] ?? '';
        nextGraded[p.id] = evaluateMultiplicationAnswer(p, input);
      }
    }

    setGraded(nextGraded);
    setSubmitted(true);
    setUploadState('uploading');

    // Save session JSON to Firebase Storage, matching subtraction structure.
    const user = auth.currentUser;
    if (user) {
      const uid = user.uid;
      (async () => {
        try {
          const sessionId = `multiplication-${Date.now()}`;
          const submittedAt = new Date().toISOString();

          const sessionPages = pages.map((page) => {
            const userAnswers: Record<string, string> = {};
            const gradedMap: Record<string, boolean> = {};

            for (const p of page.problems) {
              userAnswers[p.id] = answers[p.id] ?? '';
              gradedMap[p.id] = nextGraded[p.id]?.ok ?? false;
            }

            return {
              ...page,
              userAnswers,
              graded: gradedMap,
            };
          });

          const totalQuestions = pages.reduce((sum, page) => sum + page.problems.length, 0);
          const correctCount = Object.values(nextGraded).reduce((sum, r) => sum + (r.ok ? 1 : 0), 0);
          const percentage = totalQuestions > 0 ? Math.round((correctCount / totalQuestions) * 100) : 0;

          const sessionData = {
            topic: 'multiplication',
            seedBase: sessionSeedBase,
            pages: sessionPages,
            submittedAt,
            score: { correct: correctCount, total: totalQuestions, percentage },
            appVersion: APP_VERSION,
            // Keep the existing constant for backwards compatibility; this value is
            // stored in the JSON so you can distinguish generators later.
            generatorVersion: `y3-multiplication-v1 (app:${APP_VERSION}, base:${GENERATOR_VERSION})`,
          };

          const storagePath = await uploadSessionJson({
            uid,
            sessionId,
            data: sessionData,
          });

          await writeMultiplicationSessionIndex({
            studentUid: uid,
            sessionId,
            storagePath,
            score: { correct: correctCount, total: totalQuestions, percentage },
          });

          setUploadState('done');
        } catch (e) {
          console.error('Error uploading multiplication session:', e);
          setLoadError('Saved answers, but failed to upload session. Please try again.');
          setUploadState('error');
        }
      })();
    }
  };

  const addNewPage = () => {
    if (submitted) return;
    try {
      setLoadError(null);
      const nextIndex = pages.length;
      const next = generateMultiplicationPage({
        difficulty: 'easy',
        count: 10,
        seedKey: `${sessionSeedBase}:${nextIndex}`,
        ensureUniquenessWithinPage: true,
        allowZero: true,
        allowOne: true,
      });
      setPages((prev) => [...prev, next]);
      setActiveIndex(nextIndex);
    } catch (e) {
      console.error('Failed to add multiplication page:', e);
      setLoadError('Failed to add a new page. Please try again.');
    }
  };

  const goToPreviousPage = () => {
    if (activeIndex <= 0) return;
    setActiveIndex((i) => Math.max(0, i - 1));
  };

  const goToNextPage = () => {
    if (activeIndex >= pages.length - 1) return;
    setActiveIndex((i) => Math.min(pages.length - 1, i + 1));
  };

  const score = useMemo(() => {
    if (!submitted) return null;
    const allProblems = pages.flatMap((p) => p.problems);
    const total = allProblems.length;
    const correct = allProblems.reduce((sum, p) => sum + (graded[p.id]?.ok ? 1 : 0), 0);
    const percent = total > 0 ? Math.round((correct / total) * 100) : 0;
    return { total, correct, percent };
  }, [graded, pages, submitted]);

  const renderAnswerControl = (p: MultiplicationProblem) => {
    const value = answers[p.id] ?? '';
    const result = graded[p.id];

    if (p.kind === 'EQUIVALENCE_CHOICE' && p.mcq) {
      return (
        <div className="mt-3 grid grid-cols-2 gap-2">
          {p.mcq.options.map((opt, idx) => {
            const selected = value === String(opt);
            const disabled = submitted;

            const correctOpt = submitted && idx === p.mcq!.correctIndex;
            const wrongSelected = submitted && selected && idx !== p.mcq!.correctIndex;

            const base = 'w-full px-3 py-2 rounded-lg border text-sm font-medium transition-colors';
            const cls = correctOpt
              ? `${base} border-green-500 bg-green-50 text-green-800`
              : wrongSelected
                ? `${base} border-red-500 bg-red-50 text-red-800`
                : selected
                  ? `${base} border-purple-500 bg-purple-50 text-purple-800`
                  : `${base} border-gray-200 bg-white text-gray-800 hover:bg-gray-50`;

            return (
              <button
                key={opt}
                type="button"
                disabled={disabled}
                onClick={() => onChangeAnswer(p.id, String(opt))}
                className={cls}
              >
                {opt}
              </button>
            );
          })}
        </div>
      );
    }

    return (
      <div className="mt-3 flex items-center gap-3">
        <input
          type="text"
          inputMode="numeric"
          value={value}
          onChange={(e) => onChangeAnswer(p.id, e.target.value)}
          disabled={submitted}
          className={`w-28 px-3 py-2 border rounded-lg focus:outline-none ${
            submitted ? (result?.ok ? 'border-green-500 bg-green-50' : 'border-red-500 bg-red-50') : 'border-gray-300'
          }`}
          placeholder="Answer"
        />
        {submitted && (
          <div className={`text-sm font-semibold ${result?.ok ? 'text-green-700' : 'text-red-700'}`}>
            {result?.ok ? '✓' : `✗ ( ${result?.expected} )`}
          </div>
        )}
      </div>
    );
  };

  const renderProblemCard = (p: MultiplicationProblem, idx: number) => {
    const result = graded[p.id];

    const titleLine = (() => {
      if (p.kind === 'FACT' && typeof p.a === 'number' && typeof p.b === 'number') return `${p.a} × ${p.b}`;
      if (p.kind === 'MISSING_FACTOR') return 'Missing factor';
      if (p.kind === 'REPEATED_ADDITION') return 'Repeated addition';
      if (p.kind === 'ARRAY_GROUPS') return 'Groups / array';
      if (p.kind === 'WORD_PROBLEM') return 'Word problem';
      if (p.kind === 'EQUIVALENCE_CHOICE') return 'Choose the equivalent';
      return 'Problem';
    })();

    const prompt = formatMultiplicationPrompt(p);

    return (
      <div key={p.id} className="bg-white rounded-xl shadow-lg p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-xs font-semibold text-purple-700">Q{idx + 1}</div>
            <div className="text-lg font-bold text-gray-900 mt-1">{titleLine}</div>
          </div>

          {submitted && (
            <div
              className={`px-3 py-1 rounded-full text-xs font-bold ${
                result?.ok ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
              }`}
            >
              {result?.ok ? 'Correct' : 'Check'}
            </div>
          )}
        </div>

        <div className="mt-3 text-gray-800 leading-relaxed">{prompt}</div>

        {renderAnswerControl(p)}
      </div>
    );
  };

  return (
    <div className="bg-white/0">
      {loadError && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-4">
          <div className="text-red-800 font-medium">{loadError}</div>
        </div>
      )}

      {submitted && score && (
        <div className="bg-white rounded-xl shadow-lg p-4 mb-4 flex items-center justify-between">
          <div>
            <div className="text-sm text-gray-600">Score</div>
            <div className="text-xl font-bold text-gray-900">
              {score.correct} / {score.total}
            </div>
          </div>
          <div className="text-2xl font-extrabold text-purple-700">{score.percent}%</div>
        </div>
      )}

      {/* Page dots (top) */}
      <div className="mb-3 flex items-center justify-center" aria-label="Pages">
        <div className="inline-flex items-center gap-1">
          {pages.map((_, index) => (
            <button
              // eslint-disable-next-line react/no-array-index-key
              key={index}
              type="button"
              onClick={() => setActiveIndex(index)}
              className={`h-2.5 w-2.5 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-purple-300 ${
                index === activeIndex ? 'bg-purple-600' : 'bg-gray-300 hover:bg-gray-400'
              }`}
              aria-label={`Go to page ${index + 1}`}
            />
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {problems.map((p, i) => renderProblemCard(p, i))}
      </div>

      <div className="mt-6 pt-6 border-t border-gray-200">
        <div className="flex items-center justify-center">
          <div className="flex items-center justify-center gap-3 flex-wrap">
            {submitted && uploadState === 'done' && (
              <button
                type="button"
                onClick={startNewWorkbook}
                className="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700"
              >
                New workbook
              </button>
            )}
            <button
              type="button"
              onClick={addNewPage}
              disabled={submitted}
              className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Add New Page
            </button>

            <button
              type="button"
              onClick={goToPreviousPage}
              disabled={activeIndex === 0}
              className="px-4 py-2 text-sm bg-gray-200 text-gray-700 rounded hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Previous
            </button>
            <button
              type="button"
              onClick={goToNextPage}
              disabled={activeIndex >= pages.length - 1}
              className="px-4 py-2 text-sm bg-gray-200 text-gray-700 rounded hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitted || problems.length === 0}
              className="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Submit
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

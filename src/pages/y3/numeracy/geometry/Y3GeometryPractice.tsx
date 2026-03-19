// src/pages/y3/numeracy/geometry/Y3GeometryPractice.tsx

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../../../auth/AuthProvider';
import { hashStringToUint32 } from '../../../../lib/hash';
import { generateGeometryPage } from '../../../../lib/geometry';
import type { GeometryPage, GeometryProblem } from '../../../../lib/geometry/models';
import { GeometryDiagramSvg } from '../../../../components/geometry/GeometryDiagramSvg';
import { savePracticeSession } from '../../../../lib/session/savePracticeSession';

function nowSessionId(): string {
  return `geometry-${Date.now()}`;
}

export const Y3GeometryPractice: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { currentUser } = useAuth();

  const loadedSession = (location.state as any)?.loadedSession as
    | {
        sessionId?: string;
        topic?: string;
        score?: { total: number; correct: number; percentage: number };
        createdAt?: any;
        submittedAt?: any;
        page?: GeometryPage;
        answers?: Record<string, string>;
      }
    | undefined;

  const [sessionId, setSessionId] = useState<string>(() => nowSessionId());
  const [pagesCount, setPagesCount] = useState<number>(1);
  const [activeIndex, setActiveIndex] = useState<number>(0);
  const [pagesByIndex, setPagesByIndex] = useState<Record<number, GeometryPage>>({});
  const [answersByIndex, setAnswersByIndex] = useState<Record<number, Record<string, string>>>({});
  const [submittedByIndex, setSubmittedByIndex] = useState<Record<number, boolean>>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<
    | {
        studentUid: string;
        sessionId: string;
        storagePath: string;
      }
    | null
  >(null);

  const persistedSessionId = useMemo(() => `${sessionId}-set-${activeIndex + 1}`, [activeIndex, sessionId]);

  useEffect(() => {
    if (loadedSession && loadedSession.page) {
      setPagesCount(1);
      setActiveIndex(0);
      setPagesByIndex({ 0: loadedSession.page });
      setAnswersByIndex({ 0: loadedSession.answers ?? {} });
      setSubmittedByIndex({ 0: true });
      return;
    }
  }, [loadedSession]);

  useEffect(() => {
    setPagesByIndex((prev) => {
      if (prev[activeIndex]) return prev;
      const seed = hashStringToUint32(`${sessionId}:${activeIndex}`);
      const page = generateGeometryPage(seed, 8);
      return { ...prev, [activeIndex]: page };
    });

    setAnswersByIndex((prev) => {
      if (prev[activeIndex]) return prev;
      return { ...prev, [activeIndex]: {} };
    });

    setSubmittedByIndex((prev) => {
      if (typeof prev[activeIndex] === 'boolean') return prev;
      return { ...prev, [activeIndex]: false };
    });
  }, [activeIndex, sessionId]);

  const page = pagesByIndex[activeIndex];
  const emptyAnswers = useMemo(() => ({} as Record<string, string>), []);
  const answers = answersByIndex[activeIndex] ?? emptyAnswers;
  const submitted = submittedByIndex[activeIndex] ?? false;

  const setAnswer = useCallback((problemId: string, value: string) => {
    setAnswersByIndex((prev) => {
      const current = prev[activeIndex] ?? {};
      return { ...prev, [activeIndex]: { ...current, [problemId]: value } };
    });
  }, [activeIndex]);

  const score = useMemo(() => {
    if (!submitted) return null;
    const problems = page?.problems ?? [];
    const total = problems.length;
    const correct = problems.reduce((sum, p) => {
      const v = answers[p.id];
      return sum + (v === p.correctAnswer.value ? 1 : 0);
    }, 0);
    const percentage = total > 0 ? Math.round((correct / total) * 100) : 0;
    return { total, correct, percentage };
  }, [answers, page?.problems, submitted]);

  const handleSubmit = useCallback(async () => {
    setSaveError(null);
    setLastSaved(null);

    if (!currentUser) {
      setSaveError('Not signed in.');
      return;
    }

    const nextScore = (() => {
      const problems = page?.problems ?? [];
      const total = problems.length;
      const correct = problems.reduce((sum, p) => {
        const v = answers[p.id];
        return sum + (v === p.correctAnswer.value ? 1 : 0);
      }, 0);
      const percentage = total > 0 ? Math.round((correct / total) * 100) : 0;
      return { total, correct, percentage };
    })();

    setSaving(true);
    try {
      const { storagePath } = await savePracticeSession({
        studentUid: currentUser.uid,
        sessionId: persistedSessionId,
        topic: 'geometry',
        year: 3,
        section: 'numeracy',
        score: nextScore,
        sessionJson: {
          topic: 'geometry',
          sessionId: persistedSessionId,
          setNo: activeIndex + 1,
          createdAt: new Date().toISOString(),
          submittedAt: new Date().toISOString(),
          score: nextScore,
          page,
          answers,
        },
      });

      setSubmittedByIndex((prev) => ({ ...prev, [activeIndex]: true }));
      setLastSaved({ studentUid: currentUser.uid, sessionId: persistedSessionId, storagePath });
    } catch (e) {
      console.error('Failed to save geometry session:', e);
      const msg = (e as any)?.message ? String((e as any).message) : String(e);
      setSaveError(msg || 'Failed to save session');
      setSubmittedByIndex((prev) => ({ ...prev, [activeIndex]: false }));
    } finally {
      setSaving(false);
    }
  }, [activeIndex, answers, currentUser, page, persistedSessionId]);

  const startNewWorkbook = useCallback(() => {
    if (saving) return;
    setSaveError(null);
    setLastSaved(null);

    // If we arrived here from an older History flow that injected `loadedSession`,
    // clear navigation state by replacing the route.
    if (loadedSession) {
      navigate('/y3/numeracy/geometry', { replace: true });
      return;
    }

    const nextId = nowSessionId();
    setSessionId(nextId);
    setPagesCount(1);
    setActiveIndex(0);
    setPagesByIndex({});
    setAnswersByIndex({});
    setSubmittedByIndex({});
  }, [loadedSession, navigate, saving]);

  const addNewPage = useCallback(() => {
    if (submitted) return;
    if (saving) return;
    setSaveError(null);

    setPagesCount((count) => {
      const nextIndex = count;
      setActiveIndex(nextIndex);
      return count + 1;
    });
  }, [saving, submitted]);

  const goToPreviousPage = useCallback(() => {
    setActiveIndex((i) => Math.max(0, i - 1));
  }, []);

  const goToNextPage = useCallback(() => {
    setActiveIndex((i) => Math.min(pagesCount - 1, i + 1));
  }, [pagesCount]);

  const renderProblem = (p: GeometryProblem, index: number) => {
    const user = answers[p.id] ?? '';
    const isCorrect = submitted ? user === p.correctAnswer.value : null;

    return (
      <div key={p.id} className="bg-white rounded-xl shadow-lg p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-xs font-semibold text-purple-700">
              {String(p.metadata.subtopic ?? 'Geometry')} • Difficulty {p.metadata.difficulty}
            </div>
            <div className="text-gray-800 mt-1">
              {index + 1}. {p.questionText}
            </div>
          </div>

          {submitted && (
            <div
              className={`px-3 py-1 rounded-full text-xs font-bold ${
                isCorrect ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
              }`}
            >
              {isCorrect ? 'Correct' : 'Check'}
            </div>
          )}
        </div>

        {p.diagram && (
          <div className="mt-3 bg-gray-50 rounded-lg p-3 border border-gray-100 flex justify-center">
            <GeometryDiagramSvg diagram={p.diagram} />
          </div>
        )}

        {p.type === 'multiple-choice' ? (
          <div className="mt-4 space-y-2">
            {(p.options ?? []).map((opt) => {
              const selected = user === opt.id;
              const correct = submitted && opt.id === p.correctAnswer.value;
              const wrongSelected = submitted && selected && opt.id !== p.correctAnswer.value;

              const base =
                'w-full px-3 py-2 rounded-lg border text-sm font-medium transition-colors text-left flex items-center gap-2';
              const cls = correct
                ? `${base} border-green-500 bg-green-50 text-green-800`
                : wrongSelected
                  ? `${base} border-red-500 bg-red-50 text-red-800`
                  : selected
                    ? `${base} border-purple-500 bg-purple-50 text-purple-800`
                    : `${base} border-gray-200 bg-white text-gray-800 hover:bg-gray-50`;

              return (
                <button
                  key={opt.id}
                  type="button"
                  disabled={submitted}
                  className={cls}
                  onClick={() => setAnswer(p.id, opt.id)}
                >
                  <span className="inline-flex items-center justify-center w-4">{selected ? '●' : '○'}</span>
                  <span>{opt.text}</span>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="mt-4 flex items-center gap-2">
            <input
              type="number"
              inputMode="numeric"
              disabled={submitted}
              value={user}
              onChange={(e) => setAnswer(p.id, e.target.value)}
              className={`w-28 px-3 py-2 border rounded-lg focus:outline-none text-sm font-medium ${
                submitted
                  ? isCorrect
                    ? 'border-green-500 bg-green-50 text-green-800'
                    : 'border-red-500 bg-red-50 text-red-800'
                  : 'border-gray-300 bg-white text-gray-900 focus:border-purple-500'
              }`}
            />
            {submitted && (
              <span className={`text-sm font-semibold ${isCorrect ? 'text-green-700' : 'text-red-700'}`}>
                {isCorrect ? '✓' : `✗ (${p.correctAnswer.value})`}
              </span>
            )}
          </div>
        )}

        {submitted && (
          <div className="mt-3 text-sm text-gray-700 bg-gray-50 border border-gray-100 rounded-lg p-3">
            <div className="font-semibold text-gray-900">Explanation</div>
            <div className="mt-1">{p.explanation}</div>
          </div>
        )}
      </div>
    );
  };

  const saveStatus = useMemo(() => {
    if (saving) return 'Saving…';
    if (saveError) return 'Save failed';
    if (lastSaved) return 'Saved';
    return null;
  }, [lastSaved, saveError, saving]);

  return (
    <div className="bg-white/0">
      {saveError && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-4">
          <div className="text-red-800 font-medium break-words">{saveError}</div>
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
          <div className="text-2xl font-extrabold text-purple-700">{score.percentage}%</div>
        </div>
      )}

      {/* Page dots (top) */}
      <div className="mb-3 flex items-center justify-center" aria-label="Pages">
        <div className="inline-flex items-center gap-1">
          {Array.from({ length: pagesCount }).map((_, index) => (
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

      {saveStatus && <div className="mb-3 text-sm text-gray-700 text-center">{saveStatus}</div>}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {(page?.problems ?? []).map(renderProblem)}
      </div>

      <div className="mt-6 pt-6 border-t border-gray-200">
        <div className="flex items-center justify-center">
          <div className="flex items-center justify-center gap-3 flex-wrap">
            {submitted && lastSaved && (
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
              disabled={activeIndex >= pagesCount - 1}
              className="px-4 py-2 text-sm bg-gray-200 text-gray-700 rounded hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next
            </button>

            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitted || saving || (page?.problems ?? []).length === 0}
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

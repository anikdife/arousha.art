import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { auth } from '../../../../firebase/firebase';
import { uploadSessionJson } from '../../../../lib/uploadSessionJson';
import { writeMeasurementSessionIndex } from '../../../../lib/sessionIndexService';
import { APP_VERSION } from '../../../../constants/version';
import { generateMeasurementPage, lastTemplateKeyFromPage, MeasurementPage, MeasurementProblem } from '../../../../lib/measurement/generateMeasurementSession';
import { RulerSvg } from '../../../../components/measurement/figures/RulerSvg';
import { BalanceScaleSvg } from '../../../../components/measurement/figures/BalanceScaleSvg';
import { ContainerCompareSvg } from '../../../../components/measurement/figures/ContainerCompareSvg';

function nowSessionId(): string {
  return `measurement-${Date.now()}`;
}

function isMcq(p: MeasurementProblem): boolean {
  return p.kind === 'mcq';
}

function expectedNumber(problem: MeasurementProblem): number | null {
  const e = problem.meta.expected;
  if (typeof e === 'number') return e;
  const n = Number.parseFloat(String(e));
  return Number.isFinite(n) ? n : null;
}

export const Y3MeasurementPractice: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();

  const loadedSession = (location.state as any)?.loadedSession as any | undefined;

  const [sessionId, setSessionId] = useState<string>(() => nowSessionId());
  const [pages, setPages] = useState<MeasurementPage[]>(() => [generateMeasurementPage({ sessionId: nowSessionId(), pageNo: 0, problemsPerPage: 8 })]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [submitted, setSubmitted] = useState(false);
  const [uploadState, setUploadState] = useState<'idle' | 'uploading' | 'done' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loadedSession?.pages) return;

    const converted: MeasurementPage[] = loadedSession.pages.map((p: any, idx: number) => ({
      pageId: p.pageId ?? `measurement-page-${idx}`,
      pageNo: typeof p.pageNo === 'number' ? p.pageNo : idx,
      problems: p.problems ?? [],
      userAnswers: p.userAnswers ?? {},
      graded: p.graded,
    }));

    setSessionId(String(loadedSession.sessionId ?? nowSessionId()));
    setPages(converted);
    setActiveIndex(0);
    setSubmitted(Boolean(loadedSession.submittedAt || loadedSession.score));
    setUploadState('idle');
    setError(null);
  }, [loadedSession]);

  const currentPage = pages[activeIndex];

  const updateAnswer = useCallback(
    (problemId: string, value: string) => {
      if (submitted) return;
      setPages((prev) =>
        prev.map((p, i) => (i === activeIndex ? { ...p, userAnswers: { ...p.userAnswers, [problemId]: value } } : p))
      );
    },
    [activeIndex, submitted]
  );

  const addNewPage = useCallback(() => {
    if (submitted) return;
    const nextPageNo = pages.length;
    const prevKey = lastTemplateKeyFromPage(pages[pages.length - 1]);
    const next = generateMeasurementPage({ sessionId, pageNo: nextPageNo, problemsPerPage: 8, prevLastTemplateKey: prevKey });
    setPages((prev) => [...prev, next]);
    setActiveIndex(nextPageNo);
  }, [pages, sessionId, submitted]);

  const goPrev = useCallback(() => {
    if (activeIndex > 0) setActiveIndex((p) => p - 1);
  }, [activeIndex]);

  const goNext = useCallback(() => {
    if (activeIndex < pages.length - 1) setActiveIndex((p) => p + 1);
  }, [activeIndex, pages.length]);

  const startNewWorkbook = useCallback(() => {
    if (uploadState === 'uploading') return;
    const sid = nowSessionId();
    setSessionId(sid);
    setPages([generateMeasurementPage({ sessionId: sid, pageNo: 0, problemsPerPage: 8 })]);
    setActiveIndex(0);
    setSubmitted(false);
    setUploadState('idle');
    setError(null);
    navigate('/y3/numeracy/measurement', { replace: true, state: {} });
  }, [navigate, uploadState]);

  const score = useMemo(() => {
    if (!submitted) return null;
    const all = pages.flatMap((p) => p.problems);
    const total = all.length;
    const correct = all.reduce((s, pr) => s + (pages.some((pg) => pg.graded?.[pr.id]) ? 1 : 0), 0);
    const percentage = total > 0 ? Math.round((correct / total) * 100) : 0;
    return { total, correct, percentage };
  }, [pages, submitted]);

  const handleSubmit = useCallback(async () => {
    if (submitted) return;

    setError(null);

    const gradedPages: MeasurementPage[] = pages.map((p) => {
      const graded: Record<string, boolean> = {};
      for (const pr of p.problems) {
        const userAnswer = p.userAnswers[pr.id] ?? '';
        if (isMcq(pr)) {
          graded[pr.id] = userAnswer === String(pr.meta.expected);
        } else {
          const expected = expectedNumber(pr);
          const raw = Number.parseFloat(userAnswer);
          graded[pr.id] = expected != null && Number.isFinite(raw) && Math.abs(raw - expected) < 1e-9;
        }
      }
      return { ...p, graded };
    });

    setPages(gradedPages);
    setSubmitted(true);
    setUploadState('uploading');

    const totalQuestions = gradedPages.reduce((sum, p) => sum + p.problems.length, 0);
    const correctCount = gradedPages.reduce(
      (sum, p) => sum + p.problems.filter((pr) => p.graded?.[pr.id]).length,
      0
    );
    const percentage = totalQuestions > 0 ? Math.round((correctCount / totalQuestions) * 100) : 0;

    const user = auth.currentUser;
    if (!user) {
      setUploadState('error');
      setError('Not signed in.');
      return;
    }

    try {
      const submittedAt = new Date().toISOString();

      const sessionData = {
        sessionId,
        topic: 'measurement',
        year: 3,
        section: 'numeracy',
        createdAt: submittedAt,
        submittedAt,
        pages: gradedPages,
        score: { correct: correctCount, total: totalQuestions, percentage },
        appVersion: APP_VERSION,
        generatorVersion: 'y3-measurement-v1',
      };

      const storagePath = await uploadSessionJson({ uid: user.uid, sessionId, data: sessionData });
      await writeMeasurementSessionIndex({
        studentUid: user.uid,
        sessionId,
        storagePath,
        score: { total: totalQuestions, correct: correctCount, percentage },
      });

      setUploadState('done');
    } catch (e) {
      console.error('Failed to upload measurement session:', e);
      setUploadState('error');
      setError('Saved answers, but failed to upload session. Please try again.');
    }
  }, [pages, sessionId, submitted]);

  const renderFigure = (problem: MeasurementProblem) => {
    const fig = problem.meta.figure;
    if (!fig) return null;
    if (fig.kind === 'ruler') return <RulerSvg spec={fig} />;
    if (fig.kind === 'balance') return <BalanceScaleSvg spec={fig} />;
    if (fig.kind === 'containers') return <ContainerCompareSvg spec={fig} />;
    return null;
  };

  const renderProblem = (problem: MeasurementProblem) => {
    const userAnswer = currentPage?.userAnswers?.[problem.id] ?? '';
    const isCorrect = currentPage?.graded?.[problem.id];
    const expected = String(problem.meta.expected);

    return (
      <div key={problem.id} className="bg-white rounded-xl shadow-lg p-5">
        <div className="text-sm text-gray-500">{problem.meta.topicArea.toUpperCase()} • Difficulty {problem.meta.difficulty}</div>
        <div className="mt-2 text-gray-900 font-semibold">{problem.prompt}</div>

        {problem.meta.figure && <div className="mt-3 bg-gray-50 rounded-lg p-3 border border-gray-100">{renderFigure(problem)}</div>}

        {problem.kind === 'mcq' ? (
          <div className="mt-4 space-y-2">
            {(problem.choices ?? []).map((opt) => {
              const selected = userAnswer === opt;
              const correct = submitted && opt === expected;
              const wrongSelected = submitted && selected && opt !== expected;

              const base = 'w-full px-3 py-2 rounded-lg border text-sm font-medium transition-colors text-left flex items-center gap-2';
              const cls = correct
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
                  disabled={submitted}
                  className={cls}
                  onClick={() => updateAnswer(problem.id, opt)}
                >
                  <span className="inline-flex items-center justify-center w-4">{selected ? '●' : '○'}</span>
                  <span>{opt}</span>
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
              value={userAnswer}
              onChange={(e) => updateAnswer(problem.id, e.target.value)}
              className={`w-28 px-3 py-2 rounded-lg border text-sm font-medium ${
                submitted
                  ? isCorrect
                    ? 'border-green-500 bg-green-50 text-green-800'
                    : 'border-red-500 bg-red-50 text-red-800'
                  : 'border-gray-300 bg-white text-gray-900 focus:outline-none focus:border-purple-500'
              }`}
            />
            {problem.meta.unitHint && <span className="text-sm text-gray-600">{problem.meta.unitHint}</span>}

            {submitted && (
              <span className={`text-sm font-semibold ${isCorrect ? 'text-green-700' : 'text-red-700'}`}>
                {isCorrect ? '✓' : `✗ (${expected})`}
              </span>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="w-full">
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-4">
          <div className="text-red-800 font-medium">{error}</div>
        </div>
      )}

      {score && (
        <div className="mb-4 bg-purple-50 border border-purple-200 rounded-xl p-4">
          <div className="text-purple-900 font-bold">
            Score: {score.correct} / {score.total} ({score.percentage}%)
          </div>
        </div>
      )}

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
        {(currentPage?.problems ?? []).map(renderProblem)}
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
              onClick={goPrev}
              disabled={activeIndex === 0}
              className="px-4 py-2 text-sm bg-gray-200 text-gray-700 rounded hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Previous
            </button>

            <button
              type="button"
              onClick={goNext}
              disabled={activeIndex >= pages.length - 1}
              className="px-4 py-2 text-sm bg-gray-200 text-gray-700 rounded hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next
            </button>

            <button
              type="button"
              onClick={() => void handleSubmit()}
              disabled={submitted || (currentPage?.problems?.length ?? 0) === 0}
              className="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {uploadState === 'uploading' ? 'Submitting…' : 'Submit'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { auth } from '../../../../firebase/firebase';
import { APP_VERSION } from '../../../../constants/version';
import { uploadSessionJson } from '../../../../lib/uploadSessionJson';
import { writeDataProbabilitySessionIndex } from '../../../../lib/sessionIndexService';
import type { DataProbabilitySession, Page, Question } from '../../../../lib/dataProbability/types';
import { buildPage } from '../../../../lib/dataProbability/sessionBuild';
import { computeSummary, gradePages } from '../../../../lib/dataProbability/scoring';
import { BarChartSvg, LineGraphSvg, PictureGraphSvg, SpinnerSvg } from '../../../../lib/dataProbability/svgCharts';

function nowSessionId(): string {
  return `data-probability-${Date.now()}`;
}

function makeSeedBase(uid: string, sessionId: string): string {
  return `${sessionId}:${uid}`;
}

function isMcq(q: Question): boolean {
  return q.core.kind === 'mcq';
}

export const Y3DataProbabilityPractice: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();

  const loadedSession = (location.state as any)?.loadedSession as DataProbabilitySession | undefined;

  const [sessionId, setSessionId] = useState<string>(() => nowSessionId());
  const [seed, setSeed] = useState<string>(() => makeSeedBase(auth.currentUser?.uid ?? 'anon', sessionId));

  const [pages, setPages] = useState<Page[]>(() => [buildPage({ pageSeed: `${seed}-p0`, pageIndex: 0, questionCount: 8 })]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [submitted, setSubmitted] = useState(false);
  const [submittedAtIso, setSubmittedAtIso] = useState<string | null>(null);
  const [uploadState, setUploadState] = useState<'idle' | 'uploading' | 'done' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loadedSession?.pages) return;

    const converted: Page[] = loadedSession.pages.map((p: any, idx: number) => ({
      pageId: p.pageId ?? `data-probability-page-${idx}`,
      questions: p.questions ?? [],
      userAnswers: p.userAnswers ?? {},
      graded: p.graded,
    }));

    setSessionId(String(loadedSession.sessionId ?? nowSessionId()));
    setSeed(String(loadedSession.seed ?? makeSeedBase(auth.currentUser?.uid ?? 'anon', String(loadedSession.sessionId ?? nowSessionId()))));
    setPages(converted);
    setActiveIndex(0);
    setSubmitted(Boolean(loadedSession.submittedAt || loadedSession.summary));
    setSubmittedAtIso(String(loadedSession.submittedAt ?? loadedSession.createdAt ?? ''));
    setUploadState('idle');
    setError(null);
  }, [loadedSession]);

  const currentPage = pages[activeIndex];

  const updateAnswer = useCallback(
    (questionId: string, value: string) => {
      if (submitted) return;
      setPages((prev) => prev.map((p, i) => (i === activeIndex ? { ...p, userAnswers: { ...p.userAnswers, [questionId]: value } } : p)));
    },
    [activeIndex, submitted]
  );

  const addNewPage = useCallback(() => {
    if (submitted) return;
    const nextIndex = pages.length;
    const next = buildPage({ pageSeed: `${seed}-p${nextIndex}`, pageIndex: nextIndex, questionCount: 8 });
    setPages((prev) => [...prev, next]);
    setActiveIndex(nextIndex);
  }, [pages.length, seed, submitted]);

  const goPrev = useCallback(() => {
    if (activeIndex > 0) setActiveIndex((i) => i - 1);
  }, [activeIndex]);

  const goNext = useCallback(() => {
    if (activeIndex < pages.length - 1) setActiveIndex((i) => i + 1);
  }, [activeIndex, pages.length]);

  const startNewWorkbook = useCallback(() => {
    if (uploadState === 'uploading') return;
    const uid = auth.currentUser?.uid ?? 'anon';
    const sid = nowSessionId();
    const nextSeed = makeSeedBase(uid, sid);

    setSessionId(sid);
    setSeed(nextSeed);
    setPages([buildPage({ pageSeed: `${nextSeed}-p0`, pageIndex: 0, questionCount: 8 })]);
    setActiveIndex(0);
    setSubmitted(false);
    setSubmittedAtIso(null);
    setUploadState('idle');
    setError(null);

    navigate('/y3/numeracy/data-probability', { replace: true, state: {} });
  }, [navigate, uploadState]);

  const summary = useMemo(() => {
    if (!submitted) return null;
    const s = (pages.length ? pages : []) as Page[];
    return computeSummary(s);
  }, [pages, submitted]);

  const handleSubmit = useCallback(async () => {
    if (submitted) return;

    setError(null);

    const graded = gradePages(pages);
    const nextSummary = computeSummary(graded);

    setPages(graded);
    setSubmitted(true);
    setUploadState('uploading');

    const user = auth.currentUser;
    if (!user) {
      setUploadState('error');
      setError('Not signed in.');
      return;
    }

    try {
      const submittedAt = new Date().toISOString();
      setSubmittedAtIso(submittedAt);

      const sessionData: DataProbabilitySession & any = {
        sessionId,
        seed,
        topic: 'data-probability',
        year: 3,
        section: 'numeracy',
        status: 'submitted',
        ownerUid: user.uid,
        createdAt: submittedAt,
        submittedAt,
        pages: graded,
        summary: nextSummary,
        appVersion: APP_VERSION,
        generatorVersion: 'y3-data-probability-v1',
      };

      const storagePath = await uploadSessionJson({ uid: user.uid, sessionId, data: sessionData });
      await writeDataProbabilitySessionIndex({
        studentUid: user.uid,
        sessionId,
        storagePath,
        score: { total: nextSummary.total, correct: nextSummary.correct, percentage: nextSummary.percentage },
      });

      setUploadState('done');
    } catch (e) {
      console.error('Failed to upload data-probability session:', e);
      setUploadState('error');
      setError('Saved answers, but failed to upload session. Please try again.');
    }
  }, [pages, seed, sessionId, submitted]);

  const renderVisual = (q: Question) => {
    const v = q.visual;
    if (v.type === 'barChart') return <BarChartSvg visual={v} />;
    if (v.type === 'lineGraph') return <LineGraphSvg visual={v} />;
    if (v.type === 'pictureGraph') return <PictureGraphSvg visual={v} />;
    if (v.type === 'spinner') return <SpinnerSvg visual={v} />;
    if (v.type === 'table') {
      return (
        <div className="w-full max-w-2xl">
          <div className="text-gray-900 font-semibold mb-2">{v.title}</div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm border border-gray-200 bg-white">
              <thead className="bg-gray-50">
                <tr>
                  {v.headers.map((h) => (
                    <th key={h} className="px-3 py-2 text-left font-semibold text-gray-700 border-b border-gray-200">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {v.rows.map((row, i) => (
                  <tr key={i} className="border-t border-gray-100">
                    {row.map((cell, j) => (
                      <td key={j} className="px-3 py-2 text-gray-800">
                        {String(cell)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      );
    }

    // bag
    return (
      <div className="w-full max-w-2xl">
        <div className="text-gray-900 font-semibold mb-2">{v.title}</div>
        <div className="bg-gray-50 border border-gray-100 rounded-lg p-3">
          <div className="text-sm text-gray-700">Items:</div>
          <ul className="mt-2 grid grid-cols-2 gap-2">
            {v.items.map((it) => (
              <li key={it.label} className="text-sm text-gray-800 bg-white border border-gray-200 rounded-lg px-3 py-2">
                <span className="font-semibold">{it.label}</span>: {it.count}
              </li>
            ))}
          </ul>
        </div>
      </div>
    );
  };

  const renderQuestion = (q: Question) => {
    const userAnswer = currentPage?.userAnswers?.[q.core.id] ?? '';
    const isCorrect = Boolean(currentPage?.graded?.[q.core.id]);

    const expectedLabel = (() => {
      if (q.core.kind === 'input') return String((q.answer as any).correctValue);
      const ans: any = q.answer;
      const idx = ans.correctIndex as number;
      return ans.choices?.[idx] != null ? String(ans.choices[idx]) : '';
    })();

    return (
      <div key={q.core.id} className="p-4 bg-white rounded-xl border border-gray-100 shadow-sm">
        <div className="text-sm text-gray-500">{q.core.domain.toUpperCase()}  Difficulty {q.core.difficulty}</div>
        <div className="mt-2 text-gray-900 font-semibold">{q.core.prompt}</div>

        <div className="mt-3 bg-gray-50 rounded-lg p-3 border border-gray-100">{renderVisual(q)}</div>

        {isMcq(q) ? (
          <div className="mt-4 space-y-2">
            {((q.answer as any).choices ?? []).map((opt: string, idx: number) => {
              const selected = userAnswer === String(idx);
              const correct = submitted && idx === (q.answer as any).correctIndex;
              const wrongSelected = submitted && selected && !correct;

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
                  key={opt}
                  type="button"
                  disabled={submitted}
                  className={cls}
                  onClick={() => updateAnswer(q.core.id, String(idx))}
                >
                  <span className="inline-flex items-center justify-center w-4">{selected ? '' : ''}</span>
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
              onChange={(e) => updateAnswer(q.core.id, e.target.value)}
              className={`w-28 px-3 py-2 rounded-lg border text-sm font-medium ${
                submitted
                  ? isCorrect
                    ? 'border-green-500 bg-green-50 text-green-800'
                    : 'border-red-500 bg-red-50 text-red-800'
                  : 'border-gray-300 bg-white text-gray-900 focus:outline-none focus:border-purple-500'
              }`}
            />

            {submitted && (
              <span className={`text-sm font-semibold ${isCorrect ? 'text-green-700' : 'text-red-700'}`}>
                {isCorrect ? '' : ` (${expectedLabel})`}
              </span>
            )}
          </div>
        )}

        {submitted && q.core.explanation && <div className="mt-3 text-sm text-gray-600">{q.core.explanation}</div>}
      </div>
    );
  };

  return (
    <div>
      <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-gray-900 font-bold text-xl">Practice Workbook</div>
            <div className="text-gray-600 text-sm mt-1">
              Page {activeIndex + 1} of {pages.length}
              {submittedAtIso ? `  Submitted: ${new Date(submittedAtIso).toLocaleString()}` : ''}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => navigate('/y3/numeracy/data-probability/history')}
              className="px-4 py-2 text-sm font-semibold rounded-lg bg-gray-100 text-gray-800 hover:bg-gray-200"
            >
              History
            </button>
            <button
              type="button"
              onClick={startNewWorkbook}
              className="px-4 py-2 text-sm font-semibold rounded-lg bg-purple-600 text-white hover:bg-purple-700"
            >
              New workbook
            </button>
          </div>
        </div>

        {summary && (
          <div className="mt-4 bg-green-50 border border-green-200 rounded-xl p-4">
            <div className="text-green-900 font-bold">Score</div>
            <div className="text-green-800 mt-1">
              {summary.correct} / {summary.total} ({summary.percentage}%)
            </div>
          </div>
        )}

        {error && (
          <div className="mt-4 bg-red-50 border border-red-200 rounded-xl p-4">
            <div className="text-red-800 font-medium">{error}</div>
          </div>
        )}

        <div className="mt-5 grid grid-cols-1 gap-4">{currentPage?.questions?.map(renderQuestion)}</div>

        <div className="mt-6 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={goPrev}
              disabled={activeIndex === 0}
              className="px-4 py-2 text-sm font-semibold rounded-lg bg-gray-100 text-gray-800 hover:bg-gray-200 disabled:opacity-50"
            >
              Previous
            </button>
            <button
              type="button"
              onClick={goNext}
              disabled={activeIndex >= pages.length - 1}
              className="px-4 py-2 text-sm font-semibold rounded-lg bg-gray-100 text-gray-800 hover:bg-gray-200 disabled:opacity-50"
            >
              Next
            </button>
            <button
              type="button"
              onClick={addNewPage}
              disabled={submitted}
              className="px-4 py-2 text-sm font-semibold rounded-lg bg-white text-gray-800 border border-gray-200 hover:bg-gray-50 disabled:opacity-50"
            >
              Add page
            </button>
          </div>

          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitted || uploadState === 'uploading'}
            className="px-5 py-2.5 text-sm font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {uploadState === 'uploading' ? 'Submitting' : submitted ? 'Submitted' : 'Submit'}
          </button>
        </div>

        {submitted && uploadState === 'done' && (
          <div className="mt-4 text-sm text-gray-600">Saved to history.</div>
        )}
      </div>
    </div>
  );
};

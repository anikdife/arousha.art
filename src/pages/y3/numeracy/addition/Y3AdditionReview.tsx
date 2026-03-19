import React, { useEffect, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { signalHistoryOpenComplete } from '../../../../lib/historyOpenSignal';

type SessionScore = {
  percentage: number;
  correct: number;
  total: number;
};

type SessionPage = {
  pageId: string;
  problems: any[];
  userAnswers?: Record<string, string>;
  graded?: Record<string, boolean>;
};

type SessionData = {
  sessionId: string;
  submittedAt?: string;
  createdAt?: string;
  score?: SessionScore;
  topic?: string;
  mode?: 'numeric' | 'word';
  pages: SessionPage[];
};

function isWordProblem(p: any): p is { kind: 'word-input' | 'word-mcq'; total: number } {
  return p?.kind === 'word-input' || p?.kind === 'word-mcq';
}

function correctAnswerString(p: any): string {
  if (isWordProblem(p)) return String(p.total);
  if (typeof p?.correctAnswer === 'number') return String(p.correctAnswer);
  return '';
}

export const Y3AdditionReview: React.FC = () => {
  const location = useLocation();
  const backHref = '/y3/history';
  const historyHref = backHref;

  const didSignalOpenCompleteRef = useRef<boolean>(false);

  const openedInOverlay = !!(location.state as any)?.backgroundLocation;
  const session = location.state?.session as SessionData | undefined;

  useEffect(() => {
    if (didSignalOpenCompleteRef.current) return;
    const id = String(session?.sessionId ?? '');
    if (!id) return;
    didSignalOpenCompleteRef.current = true;
    signalHistoryOpenComplete(id);
  }, [session]);

  if (!session) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-green-50 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-gray-800 mb-4">Session not found</h2>
          <Link to={historyHref} className="text-blue-600 hover:text-blue-700">
            Back to History
          </Link>
        </div>
      </div>
    );
  }

  const percent = session.score?.percentage ?? 0;
  const modeLabel = session.mode === 'word' ? 'Word Problems' : session.mode === 'numeric' ? 'Numeric' : 'Practice';

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-green-50">
      {!openedInOverlay && (
        <header className="bg-white/80 backdrop-blur border-b">
          <div className="w-full px-4 sm:px-6 lg:px-8 py-6">
            <Link to={historyHref} className="inline-flex items-center text-blue-600 hover:text-blue-700 transition-colors">
              <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Back to History
            </Link>

            <div className="mt-3 flex items-start justify-between gap-4">
              <div>
                <h1 className="text-3xl font-bold text-gray-900">Addition Practice Session</h1>
                <div className="text-gray-600 mt-1">Mode: {modeLabel}</div>
                <div className="text-gray-500 mt-1 text-sm">Session ID: {session.sessionId}</div>
              </div>

              <div className="flex items-center gap-3">
                <div
                  className={`inline-flex items-center px-4 py-2 rounded-full font-bold text-white ${
                    percent >= 90
                      ? 'bg-green-500'
                      : percent >= 75
                        ? 'bg-yellow-500'
                        : percent >= 60
                          ? 'bg-orange-500'
                          : 'bg-red-500'
                  }`}
                >
                  {percent}%
                </div>
              </div>
            </div>
          </div>
        </header>
      )}

      <main className="w-full px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6">
          <div className="text-gray-800 font-semibold">Review</div>
          <div className="text-gray-600 mt-1">Your answers and correct answers</div>

          <div className="mt-6 space-y-6">
            {(session.pages ?? []).map((page, pageIdx) => (
              <div key={page.pageId ?? `page-${pageIdx}`} className="border border-gray-200 rounded-xl p-4">
                <div className="text-sm font-semibold text-gray-700">Page {pageIdx + 1}</div>

                <div className="mt-4 space-y-3">
                  {(page.problems ?? []).map((p: any, idx: number) => {
                    const id = String(p?.id ?? `${pageIdx}-${idx}`);
                    const userAnswer = page.userAnswers?.[id] ?? '';
                    const correct = correctAnswerString(p);
                    const isCorrect = page.graded?.[id] ?? false;

                    return (
                      <div key={id} className="rounded-lg border border-gray-100 bg-gray-50 p-4">
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <div className="text-sm text-gray-500">Question {idx + 1}</div>
                            <div className="mt-1 text-gray-900 font-semibold">{String(p?.prompt ?? '')}</div>
                          </div>

                          <span
                            className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-semibold ${
                              isCorrect ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                            }`}
                          >
                            {isCorrect ? 'Correct' : 'Incorrect'}
                          </span>
                        </div>

                        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div className="bg-white rounded-lg border border-gray-200 p-3">
                            <div className="text-xs text-gray-500">Your answer</div>
                            <div className="mt-1 font-bold text-gray-900">{userAnswer === '' ? '—' : userAnswer}</div>
                          </div>

                          <div className="bg-white rounded-lg border border-gray-200 p-3">
                            <div className="text-xs text-gray-500">Correct answer</div>
                            <div className="mt-1 font-bold text-gray-900">{correct === '' ? '—' : correct}</div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
};

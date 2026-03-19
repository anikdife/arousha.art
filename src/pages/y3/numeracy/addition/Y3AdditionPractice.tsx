import React, { useEffect, useMemo, useState } from 'react';
import { auth } from '../../../../firebase/firebase';
import { uploadSessionJson } from '../../../../lib/uploadSessionJson';
import { writeAdditionSessionIndex } from '../../../../lib/sessionIndexService';
import {
  AdditionProblem,
  AdditionDifficulty,
  MCQOption,
  expectedAnswer as expectedAdditionAnswer,
  generateAdditionPage,
  validateProblem,
} from '../../../../lib/additionGenerator';
import {
  AdditionWordProblem,
  WordProblemDifficulty,
  expectedAnswer as expectedWordAnswer,
  generateAdditionWordProblems,
} from '../../../../lib/additionWordProblemGenerator';
import { APP_VERSION, GENERATOR_VERSION } from '../../../../constants/version';

type AnyProblem = AdditionProblem | AdditionWordProblem;
type AdditionPage = { pageId: string; problems: AnyProblem[] };

function makeSessionSeedBase(uid: string): string {
  try {
    const buf = new Uint32Array(4);
    window.crypto.getRandomValues(buf);
    const hex = Array.from(buf)
      .map((n) => n.toString(16).padStart(8, '0'))
      .join('');
    return `${uid}:${Date.now()}:${hex}`;
  } catch {
    return `${uid}:${Date.now()}:${Math.random().toString(16).slice(2)}`;
  }
}

function renderVerticalAddition(a: number, b: number) {
  const top = String(a);
  const bottom = String(b);
  const width = Math.max(top.length, bottom.length + 1);

  const pad = (s: string, w: number) => s.padStart(w, ' ');

  return (
    <div className="font-mono text-lg leading-tight">
      <div className="text-right whitespace-pre">{pad(top, width)}</div>
      <div className="text-right whitespace-pre">{pad(`+${bottom}`, width)}</div>
      <div className="border-t border-gray-400 mt-1" />
    </div>
  );
}

export const Y3AdditionPractice: React.FC = () => {
  const userKey = auth.currentUser?.uid ?? 'anon';

  const [difficulty] = useState<AdditionDifficulty>('easy');
  const [seedBase, setSeedBase] = useState<string>(() => makeSessionSeedBase(userKey));
  const [pages, setPages] = useState<AdditionPage[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);
  const [graded, setGraded] = useState<Record<string, boolean>>({});
  const [uploadState, setUploadState] = useState<'idle' | 'uploading' | 'done' | 'error'>('idle');
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    setSeedBase(makeSessionSeedBase(userKey));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userKey]);

  const mixWeights = useMemo(
    () => ({ basic: 5, placeValue: 3, mentalMath: 2, equivalence: 1, missingAddend: 2 }),
    []
  );

  useEffect(() => {
    try {
      setLoadError(null);
      const numericSeed = `${seedBase}:numeric:0`;
      const wordSeed = `${seedBase}:word:0`;

      const numeric = generateAdditionPage({ seed: numericSeed, difficulty, count: 6, mixWeights });
      numeric.forEach(validateProblem);

      const wDifficulty: WordProblemDifficulty = difficulty;
      const word = generateAdditionWordProblems({
        seed: wordSeed,
        difficulty: wDifficulty,
        count: 4,
        mix: { input: 3, mcq: 1 },
      });

      setPages([{ pageId: 'page-0', problems: [...numeric, ...word] }]);

      setActiveIndex(0);
      setAnswers({});
      setSubmitted(false);
      setGraded({});
      setUploadState('idle');
    } catch (e) {
      console.error('Failed to generate addition page:', e);
      setLoadError('Failed to generate problems. Please try again.');
    }
  }, [difficulty, mixWeights, seedBase]);

  const currentPage = pages[activeIndex];
  const problems = currentPage?.problems ?? [];

  const score = useMemo(() => {
    if (!submitted) return null;
    const allProblems = pages.flatMap((p) => p.problems);
    const total = allProblems.length;
    const correct = allProblems.reduce((sum, p) => sum + (graded[p.id] ? 1 : 0), 0);
    const percent = total > 0 ? Math.round((correct / total) * 100) : 0;
    return { total, correct, percent };
  }, [graded, pages, submitted]);

  const startNewWorkbook = () => {
    if (uploadState === 'uploading') return;
    setLoadError(null);
    setSeedBase(makeSessionSeedBase(userKey));
  };

  const addNewPage = () => {
    if (submitted) return;
    try {
      setLoadError(null);
      const nextIndex = pages.length;

      const numericSeed = `${seedBase}:numeric:${nextIndex}`;
      const wordSeed = `${seedBase}:word:${nextIndex}`;

      const numeric = generateAdditionPage({ seed: numericSeed, difficulty, count: 6, mixWeights });
      numeric.forEach(validateProblem);

      const wDifficulty: WordProblemDifficulty = difficulty;
      const word = generateAdditionWordProblems({
        seed: wordSeed,
        difficulty: wDifficulty,
        count: 4,
        mix: { input: 3, mcq: 1 },
      });

      const page: AdditionPage = { pageId: `page-${nextIndex}`, problems: [...numeric, ...word] };
      setPages((prev) => [...prev, page]);
      setActiveIndex(nextIndex);
    } catch (e) {
      console.error('Failed to add addition page:', e);
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

  const onChangeAnswer = (problemId: string, value: string) => {
    if (submitted) return;
    setAnswers((prev) => ({ ...prev, [problemId]: value }));
  };

  const isWordProblem = (p: AnyProblem): p is AdditionWordProblem =>
    (p as any).kind === 'word-input' || (p as any).kind === 'word-mcq';

  const handleSubmit = () => {
    if (submitted) return;

    const nextGraded: Record<string, boolean> = {};
    for (const page of pages) {
      for (const p of page.problems) {
        const expected = isWordProblem(p) ? expectedWordAnswer(p) : expectedAdditionAnswer(p);
        const raw = answers[p.id] ?? '';

        if (p.kind === 'mcq' || p.kind === 'word-mcq') {
          const picked = Number(raw);
          nextGraded[p.id] = Number.isFinite(picked) && picked === expected;
        } else {
          const n = Number(raw);
          nextGraded[p.id] = Number.isFinite(n) && n === expected;
        }
      }
    }

    setGraded(nextGraded);
    setSubmitted(true);
    setUploadState('uploading');

    const user = auth.currentUser;
    if (!user) {
      setUploadState('error');
      setLoadError('Not signed in.');
      return;
    }

    (async () => {
      try {
        const uid = user.uid;
        const sessionId = `addition-${Date.now()}`;
        const submittedAt = new Date().toISOString();

        const sessionPages = pages.map((page) => {
          const userAnswers: Record<string, string> = {};
          const gradedMap: Record<string, boolean> = {};
          for (const p of page.problems) {
            userAnswers[p.id] = answers[p.id] ?? '';
            gradedMap[p.id] = nextGraded[p.id] ?? false;
          }
          return {
            ...page,
            userAnswers,
            graded: gradedMap,
          };
        });

        const total = pages.reduce((sum, page) => sum + page.problems.length, 0);
        const correct = Object.values(nextGraded).reduce((s, ok) => s + (ok ? 1 : 0), 0);
        const percentage = total > 0 ? Math.round((correct / total) * 100) : 0;

        const sessionData = {
          topic: 'addition',
          seedBase,
          difficulty,
          submittedAt,
          createdAt: submittedAt,
          pages: sessionPages,
          score: { correct, total, percentage },
          appVersion: APP_VERSION,
          generatorVersion: `y3-addition-v1 (app:${APP_VERSION}, base:${GENERATOR_VERSION})`,
        };

        const storagePath = await uploadSessionJson({ uid, sessionId, data: sessionData });

        await writeAdditionSessionIndex({
          studentUid: uid,
          sessionId,
          storagePath,
          score: { total, correct, percentage },
        });

        setUploadState('done');
      } catch (e) {
        console.error('Error uploading addition session:', e);
        setUploadState('error');
        setLoadError('Saved answers, but failed to upload session. Please try again.');
      }
    })();
  };

  const renderMcq = (p: AdditionProblem) => {
    const opts = p.options as MCQOption[];
    const value = answers[p.id] ?? '';

    return (
      <div className="mt-3 space-y-2">
        {opts.map((opt) => {
          const isSelected = value === String(opt.value);
          const isCorrect = submitted && opt.value === p.correctAnswer;
          const isWrongSelected = submitted && isSelected && opt.value !== p.correctAnswer;

          const base = 'w-full px-3 py-2 rounded-lg border text-sm font-medium transition-colors text-left';
          const cls = isCorrect
            ? `${base} border-green-500 bg-green-50 text-green-800`
            : isWrongSelected
              ? `${base} border-red-500 bg-red-50 text-red-800`
              : isSelected
                ? `${base} border-purple-500 bg-purple-50 text-purple-800`
                : `${base} border-gray-200 bg-white text-gray-800 hover:bg-gray-50`;

          return (
            <button
              key={opt.label}
              type="button"
              disabled={submitted}
              onClick={() => onChangeAnswer(p.id, String(opt.value))}
              className={cls}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    );
  };

  const renderWordMcq = (p: AdditionWordProblem) => {
    const opts = (p.options ?? []).slice(0, 4);
    const value = answers[p.id] ?? '';
    const correct = expectedWordAnswer(p);

    return (
      <div className="mt-3 space-y-2" role="radiogroup" aria-label="Choose an answer">
        {opts.map((opt) => {
          const isSelected = value === String(opt);
          const isCorrect = submitted && opt === correct;
          const isWrongSelected = submitted && isSelected && opt !== correct;

          const base = 'w-full px-3 py-2 rounded-lg border text-sm font-medium transition-colors text-left flex items-center gap-3';
          const cls = isCorrect
            ? `${base} border-green-500 bg-green-50 text-green-800`
            : isWrongSelected
              ? `${base} border-red-500 bg-red-50 text-red-800`
              : isSelected
                ? `${base} border-purple-500 bg-purple-50 text-purple-800`
                : `${base} border-gray-200 bg-white text-gray-800 hover:bg-gray-50`;

          return (
            <label key={opt} className={cls}>
              <input
                type="radio"
                name={p.id}
                value={String(opt)}
                checked={isSelected}
                disabled={submitted}
                onChange={() => onChangeAnswer(p.id, String(opt))}
              />
              <span>{opt}</span>
            </label>
          );
        })}
      </div>
    );
  };

  const renderInput = (p: AdditionProblem) => {
    const value = answers[p.id] ?? '';
    const ok = graded[p.id];

    return (
      <div className="mt-3 flex items-center gap-3">
        <input
          type="text"
          inputMode="numeric"
          value={value}
          onChange={(e) => onChangeAnswer(p.id, e.target.value)}
          disabled={submitted}
          className={`w-28 px-3 py-2 border rounded-lg focus:outline-none ${
            submitted ? (ok ? 'border-green-500 bg-green-50' : 'border-red-500 bg-red-50') : 'border-gray-300'
          }`}
          placeholder="Answer"
        />
        {submitted && (
          <div className={`text-sm font-semibold ${ok ? 'text-green-700' : 'text-red-700'}`}>
            {ok ? '✓' : `✗ ( ${p.correctAnswer} )`}
          </div>
        )}
      </div>
    );
  };

  const renderWordInput = (p: AdditionWordProblem) => {
    const value = answers[p.id] ?? '';
    const ok = graded[p.id];
    const correct = expectedWordAnswer(p);

    return (
      <div className="mt-3 flex items-center gap-3">
        <input
          type="text"
          inputMode="numeric"
          value={value}
          onChange={(e) => onChangeAnswer(p.id, e.target.value)}
          disabled={submitted}
          className={`w-28 px-3 py-2 border rounded-lg focus:outline-none ${
            submitted ? (ok ? 'border-green-500 bg-green-50' : 'border-red-500 bg-red-50') : 'border-gray-300'
          }`}
          placeholder="Answer"
        />
        {submitted && (
          <div className={`text-sm font-semibold ${ok ? 'text-green-700' : 'text-red-700'}`}>
            {ok ? '✓' : `✗ ( ${correct} )`}
          </div>
        )}
      </div>
    );
  };

  const renderCardHeader = (p: AdditionProblem) => {
    const label =
      p.mode === 'equivalence'
        ? 'Equivalent'
        : p.mode === 'placeValue'
          ? 'Place value'
          : p.mode === 'missingAddend'
            ? 'Missing addend'
            : p.mode === 'mentalMath'
              ? 'Mental maths'
              : 'Addition';

    const ok = graded[p.id];

    return (
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-semibold text-purple-700">{label}</div>
          <div className="text-gray-800 mt-1">{p.prompt}</div>
        </div>
        {submitted && (
          <div
            className={`px-3 py-1 rounded-full text-xs font-bold ${
              ok ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
            }`}
          >
            {ok ? 'Correct' : 'Check'}
          </div>
        )}
      </div>
    );
  };

  const renderWordHeader = (p: AdditionWordProblem) => {
    const ok = graded[p.id];
    return (
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-semibold text-purple-700">Word problem</div>
          <div className="text-gray-800 mt-1">{p.prompt}</div>
        </div>
        {submitted && (
          <div
            className={`px-3 py-1 rounded-full text-xs font-bold ${
              ok ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
            }`}
          >
            {ok ? 'Correct' : 'Check'}
          </div>
        )}
      </div>
    );
  };

  const renderVisual = (p: AdditionProblem) => {
    if (p.operands.mode === 'basic' || p.operands.mode === 'mentalMath') {
      return (
        <div className="mt-3">
          {renderVerticalAddition(p.operands.a, p.operands.b)}
        </div>
      );
    }

    return null;
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
        {problems.map((p) => (
          <div key={p.id} className="bg-white rounded-xl shadow-lg p-5">
            {isWordProblem(p) ? renderWordHeader(p) : renderCardHeader(p)}
            {!isWordProblem(p) ? renderVisual(p) : null}
            {isWordProblem(p)
              ? p.kind === 'word-mcq'
                ? renderWordMcq(p)
                : renderWordInput(p)
              : p.kind === 'mcq'
                ? renderMcq(p)
                : renderInput(p)}
          </div>
        ))}
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

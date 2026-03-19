import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../../auth/AuthProvider';
import type { RMIndexStory, RMQuestionSet, RMStory } from '../../../lib/readingMagazine/adminTypes';
import { loadRmIndex, loadRmQuestions, loadRmStory } from '../../../lib/readingMagazine/adminStorageService';
import { getOrChooseDailyRandomStoryId } from '../../../lib/readingMagazine/dailyRandomStory';
import { getOrChooseDailyRandomQuestionIds } from '../../../lib/readingMagazine/dailyRandomQuestions';
import {
  getOrAssignReadingMagazineY3CurrentPractice,
  type ReadingMagazineHalf,
  type ReadingMagazineY3CurrentAssignment,
  recordReadingMagazineY3Attempt,
} from '../../../lib/readingMagazine/studentProgressService';
import { uploadSessionJson } from '../../../lib/uploadSessionJson';
import { writeReadingMagazineSessionIndex } from '../../../lib/sessionIndexService';
import { APP_VERSION } from '../../../constants/version';

function todaySeed(): string {
  return new Date().toISOString().slice(0, 10);
}

function clampIndex(index: number, length: number): number {
  if (length <= 0) return 0;
  const n = index % length;
  return n < 0 ? n + length : n;
}

const LS_INDEX_KEY = 'rm:y3:reading-magazine:index:v1';
const LS_STORY_PREFIX = 'rm:y3:reading-magazine:story:v1:';

function safeParseJson<T>(value: string | null): T | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function safeSetLocalStorage(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore
  }
}

type CachedIndex = {
  cachedAt: string;
  stories: RMIndexStory[];
};

type CachedStoryPayload = {
  cachedAt: string;
  storyId: string;
  updatedAt: string;
  story: RMStory;
  questions: RMQuestionSet | null;
  imageUrlsByCaptionIndex: Record<number, string>;
  loadedImagesCount: number;
  loadedQuestionsCount: number;
};

export type Y3PracticeTabProps = {
  overrideOffset: number;
};

export const Y3PracticeTab: React.FC<Y3PracticeTabProps> = ({ overrideOffset }) => {
  const { currentUser, userProfile } = useAuth();
  const today = useMemo(() => todaySeed(), []);

  const studentUid = userProfile?.role === 'student' ? currentUser?.uid ?? undefined : undefined;

  const [indexStories, setIndexStories] = useState<RMIndexStory[]>([]);
  const [loadingIndex, setLoadingIndex] = useState(true);
  const [indexError, setIndexError] = useState<string | null>(null);

  const publishedStories = useMemo(
    () => indexStories.filter((s) => s.status === 'published'),
    [indexStories]
  );
  const availableStories = publishedStories.length > 0 ? publishedStories : indexStories;

  const storyIds = useMemo(() => availableStories.map((s) => s.storyId).filter(Boolean), [availableStories]);

  const [studentAssignment, setStudentAssignment] = useState<ReadingMagazineY3CurrentAssignment | null>(null);
  const [assignmentError, setAssignmentError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    if (!studentUid) {
      setStudentAssignment(null);
      setAssignmentError(null);
      return;
    }
    if (storyIds.length === 0) return;

    setAssignmentError(null);

    (async () => {
      try {
        const assigned = await getOrAssignReadingMagazineY3CurrentPractice({ studentUid, storyIds });
        if (cancelled) return;
        setStudentAssignment(assigned);
      } catch (e: any) {
        if (cancelled) return;
        console.error('Failed to assign reading-magazine practice:', e);
        setAssignmentError(String(e?.message ?? e));
        setStudentAssignment(null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [studentUid, storyIds.join('|')]);

  const baseStoryId = useMemo(
    () => getOrChooseDailyRandomStoryId(availableStories, today),
    [availableStories, today]
  );

  const baseIndex = useMemo(() => {
    if (!baseStoryId) return 0;
    const idx = availableStories.findIndex((s) => s.storyId === baseStoryId);
    return idx >= 0 ? idx : 0;
  }, [availableStories, baseStoryId]);

  const activeIndex = clampIndex(baseIndex + overrideOffset, availableStories.length);
  const activeIndexStory = availableStories[activeIndex];

  const nonStudentStoryId = activeIndexStory?.storyId ?? '';
  const nonStudentUpdatedAt = activeIndexStory?.updatedAt ?? '';

  const assignedStoryId = studentAssignment?.storyId ?? '';
  const assignedIndexStory = useMemo(
    () => (assignedStoryId ? availableStories.find((s) => s.storyId === assignedStoryId) : undefined),
    [availableStories, assignedStoryId]
  );

  const activeStoryId = studentUid ? assignedStoryId : nonStudentStoryId;
  const activeStoryUpdatedAt = studentUid ? assignedIndexStory?.updatedAt ?? '' : nonStudentUpdatedAt;

  const activeHalf: ReadingMagazineHalf | null = studentUid ? (studentAssignment?.half ?? null) : null;

  const [storyTitle, setStoryTitle] = useState<string>('');
  const [storyType, setStoryType] = useState<string>('');
  const [questions, setQuestions] = useState<RMQuestionSet | null>(null);
  const [selectedQuestionIds, setSelectedQuestionIds] = useState<string[]>([]);
  const [loadingQuestions, setLoadingQuestions] = useState(false);
  const [questionsError, setQuestionsError] = useState<string | null>(null);

  const selectedQuestions = useMemo(() => {
    const qs = questions?.questions ?? [];
    if (qs.length === 0) return [];

    if (studentUid && activeHalf != null) {
      const start = activeHalf === 0 ? 0 : 5;
      const end = activeHalf === 0 ? 5 : 10;
      return qs.slice(start, Math.min(end, qs.length));
    }

    if (!Array.isArray(selectedQuestionIds) || selectedQuestionIds.length === 0) {
      return qs.slice(0, Math.min(5, qs.length));
    }
    const idSet = new Set(selectedQuestionIds);
    return qs.filter((q) => idSet.has(q.id)).slice(0, 5);
  }, [questions, selectedQuestionIds, studentUid, activeHalf]);

  const selectedQuestionIdsKey = useMemo(() => selectedQuestionIds.join('|'), [selectedQuestionIds]);

  const [answersByQuestionId, setAnswersByQuestionId] = useState<Record<string, number>>({});
  const [submitted, setSubmitted] = useState(false);
  const [submitBusy, setSubmitBusy] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [score, setScore] = useState<{ correct: number; total: number; percentage: number } | null>(null);

  useEffect(() => {
    let cancelled = false;

    const cached = safeParseJson<CachedIndex>(localStorage.getItem(LS_INDEX_KEY));
    if (cached?.stories && Array.isArray(cached.stories)) {
      setIndexStories(cached.stories);
      setLoadingIndex(false);
    } else {
      setLoadingIndex(true);
    }

    setIndexError(null);

    (async () => {
      try {
        const index = await loadRmIndex();
        if (cancelled) return;
        const stories = index.stories ?? [];
        setIndexStories(stories);
        safeSetLocalStorage(LS_INDEX_KEY, {
          cachedAt: new Date().toISOString(),
          stories,
        } satisfies CachedIndex);
      } catch (e: any) {
        if (cancelled) return;
        setIndexError(String(e?.message ?? e));
      } finally {
        if (cancelled) return;
        setLoadingIndex(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const storyId = activeStoryId;
    const updatedAt = activeStoryUpdatedAt;

    if (!storyId) {
      setStoryTitle('');
      setStoryType('');
      setQuestions(null);
      setSelectedQuestionIds([]);
      setQuestionsError(null);
      setLoadingQuestions(false);
      setAnswersByQuestionId({});
      setSubmitted(false);
      setSubmitBusy(false);
      setSubmitError(null);
      setScore(null);
      return;
    }

    const cacheKey = `${LS_STORY_PREFIX}${storyId}:${updatedAt ?? 'no-updatedAt'}`;
    const cached = safeParseJson<CachedStoryPayload>(localStorage.getItem(cacheKey));

    if (cached?.storyId === storyId && cached?.updatedAt === (updatedAt ?? cached.updatedAt)) {
      setStoryTitle(cached.story?.title ?? '');
      setStoryType(cached.story?.type ?? '');
      if (cached.questions && Array.isArray(cached.questions.questions)) {
        setQuestions(cached.questions);
        const allIds = (cached.questions.questions ?? []).map((q) => q.id).filter(Boolean);
        if (studentUid) {
          setSelectedQuestionIds([]);
        } else {
          setSelectedQuestionIds(
            getOrChooseDailyRandomQuestionIds({
              isoDate: today,
              storyId,
              updatedAt: updatedAt ?? cached.updatedAt ?? '',
              allQuestionIds: allIds,
              count: 5,
            })
          );
        }
        setQuestionsError(null);
        setLoadingQuestions(false);
        setAnswersByQuestionId({});
        setSubmitted(false);
        setSubmitBusy(false);
        setSubmitError(null);
        setScore(null);
        return () => {
          cancelled = true;
        };
      }
    }

    setLoadingQuestions(true);
    setQuestionsError(null);

    (async () => {
      try {
        const [loadedStory, loadedQuestions] = await Promise.all([
          cached?.story ? Promise.resolve(cached.story) : loadRmStory(storyId),
          loadRmQuestions(storyId),
        ]);

        if (cancelled) return;

        setStoryTitle(loadedStory.title);
        setStoryType(loadedStory.type);
        setQuestions(loadedQuestions);

        const allIds = (loadedQuestions.questions ?? []).map((q) => q.id).filter(Boolean);
        if (studentUid) {
          setSelectedQuestionIds([]);
        } else {
          setSelectedQuestionIds(
            getOrChooseDailyRandomQuestionIds({
              isoDate: today,
              storyId,
              updatedAt: updatedAt ?? '',
              allQuestionIds: allIds,
              count: 5,
            })
          );
        }

        const merged: CachedStoryPayload = {
          cachedAt: new Date().toISOString(),
          storyId,
          updatedAt: updatedAt ?? '',
          story: loadedStory,
          questions: loadedQuestions,
          imageUrlsByCaptionIndex: cached?.imageUrlsByCaptionIndex ?? {},
          loadedImagesCount: cached?.loadedImagesCount ?? 0,
          loadedQuestionsCount: loadedQuestions.questions?.length ?? 0,
        };
        safeSetLocalStorage(cacheKey, merged);
      } catch (e: any) {
        if (cancelled) return;
        setQuestions(null);
        setSelectedQuestionIds([]);
        setQuestionsError(String(e?.message ?? e));
      } finally {
        if (cancelled) return;
        setLoadingQuestions(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activeStoryId, activeStoryUpdatedAt, today, studentUid]);

  // Reset answers when the selected questions set changes.
  useEffect(() => {
    setAnswersByQuestionId({});
    setSubmitted(false);
    setSubmitBusy(false);
    setSubmitError(null);
    setScore(null);
  }, [activeStoryId, activeStoryUpdatedAt, selectedQuestionIdsKey, activeHalf]);

  const canAnswer = Boolean(studentUid) && selectedQuestions.length > 0;
  const answeredCount = useMemo(() => {
    let n = 0;
    for (const q of selectedQuestions) {
      if (typeof q.id === 'string' && answersByQuestionId[q.id] != null) n += 1;
    }
    return n;
  }, [answersByQuestionId, selectedQuestions]);
  const allAnswered = selectedQuestions.length > 0 && answeredCount === selectedQuestions.length;

  const chooseAnswer = (questionId: string, choiceIndex: number) => {
    if (submitted || submitBusy) return;
    setAnswersByQuestionId((prev) => ({ ...prev, [questionId]: choiceIndex }));
  };

  const submit = async () => {
    if (!studentUid) {
      setSubmitError('Practice is available for student accounts.');
      return;
    }
    if (selectedQuestions.length === 0) return;
    if (!allAnswered) {
      setSubmitError('Please answer all questions before submitting.');
      return;
    }

    setSubmitError(null);
    setSubmitBusy(true);

    try {
      const total = selectedQuestions.length;
      const correct = selectedQuestions.reduce((sum, q) => {
        const chosen = answersByQuestionId[q.id];
        return sum + (chosen === q.correctIndex ? 1 : 0);
      }, 0);
      const percentage = total > 0 ? Math.round((correct / total) * 100) : 0;

      const sessionId = `reading-magazine-${Date.now()}`;
      const attemptId = `rm-y3-${Date.now()}`;
      const submittedAt = new Date().toISOString();

      const sessionData = {
        topic: 'reading-magazine' as const,
        year: 3 as const,
        isoDate: today,
        story: {
          storyId: activeStoryId,
          title: storyTitle,
          type: storyType,
          updatedAt: activeStoryUpdatedAt,
        },
        questions: selectedQuestions.map((q) => ({
          id: q.id,
          skill: q.skill,
          prompt: q.prompt,
          choices: q.choices,
          correctIndex: q.correctIndex,
        })),
        answers: selectedQuestions.map((q) => ({
          questionId: q.id,
          selectedIndex: answersByQuestionId[q.id],
          correctIndex: q.correctIndex,
          ok: answersByQuestionId[q.id] === q.correctIndex,
        })),
        submittedAt,
        score: { correct, total, percentage },
        appVersion: APP_VERSION,
      };

      const storagePath = await uploadSessionJson({
        uid: studentUid,
        sessionId,
        data: sessionData,
      });

      await writeReadingMagazineSessionIndex({
        studentUid,
        sessionId,
        storagePath,
        score: { correct, total, percentage },
        meta: { storyId: activeStoryId, storyTitle: storyTitle || 'Story', isoDate: today },
      });

      if (activeHalf != null) {
        await recordReadingMagazineY3Attempt({
          studentUid,
          attemptId,
          sessionId,
          storagePath,
          story: {
            storyId: activeStoryId,
            title: storyTitle || 'Story',
            type: storyType || '',
            updatedAt: activeStoryUpdatedAt,
          },
          half: activeHalf,
          questionIds: selectedQuestions.map((q) => q.id).filter(Boolean),
          score: { correct, total, percentage },
          appVersion: APP_VERSION,
        });
      }

      setScore({ correct, total, percentage });
      setSubmitted(true);
    } catch (e: any) {
      console.error('Failed to submit reading practice:', e);
      setSubmitError('Saved answers, but failed to upload. Please try again.');
    } finally {
      setSubmitBusy(false);
    }
  };

  if (loadingIndex) {
    return (
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
          <div className="text-lg font-semibold text-gray-900">Loading…</div>
        </div>
      </div>
    );
  }

  if (indexError) {
    return (
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="bg-white border border-red-200 rounded-xl p-6 shadow-sm">
          <div className="text-lg font-semibold text-gray-900">Could not load stories</div>
          <div className="mt-2 text-sm text-red-700">{indexError}</div>
        </div>
      </div>
    );
  }

  if (!activeIndexStory) {
    return (
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
          <div className="text-lg font-semibold text-gray-900">No stories available</div>
          <div className="mt-2 text-sm text-gray-600">Ask an owner to publish at least one story.</div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
        <div className="text-sm font-semibold text-gray-900">Practice</div>
        <div className="text-xs text-gray-600 mt-1">
          {studentUid ? 'Your next unanswered questions.' : 'Questions for today’s story.'}
        </div>

        <div className="mt-4">
          <div className="text-xs font-semibold text-gray-700 tracking-wide">{(storyType ?? '').toUpperCase()}</div>
          <div className="text-xl font-extrabold text-gray-900 mt-1">{storyTitle || 'Story'}</div>
        </div>

        {!studentUid && (
          <div className="mt-4 text-sm text-gray-700 bg-yellow-50 border border-yellow-200 rounded-lg p-3">
            Practice is available for student accounts. Please sign in as a student.
          </div>
        )}

        {assignmentError && (
          <div className="mt-4 text-sm text-red-700">
            Could not choose your next story: {assignmentError}
          </div>
        )}

        {loadingQuestions && <div className="mt-4 text-sm text-gray-600">Loading questions…</div>}
        {questionsError && <div className="mt-4 text-sm text-red-700">{questionsError}</div>}

        {!loadingQuestions && !questionsError && (!questions || (questions.questions ?? []).length === 0) && (
          <div className="mt-4 text-sm text-gray-600">No questions found for this story yet.</div>
        )}

        {selectedQuestions.length > 0 && (
          <div className="mt-6 space-y-5">
            {selectedQuestions.map((q, idx) => (
              <div key={q.id ?? idx} className="border border-gray-100 rounded-lg p-4">
                <div className="text-sm font-semibold text-gray-900">Q{idx + 1}. {q.prompt}</div>
                <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {q.choices.map((c, choiceIdx) => (
                    <button
                      key={choiceIdx}
                      type="button"
                      disabled={!canAnswer || submitBusy || submitted}
                      onClick={() => chooseAnswer(q.id, choiceIdx)}
                      className={
                        (answersByQuestionId[q.id] === choiceIdx
                          ? submitted
                            ? choiceIdx === q.correctIndex
                              ? 'bg-green-50 border-green-300 text-green-900'
                              : 'bg-red-50 border-red-300 text-red-900'
                            : 'bg-blue-50 border-blue-300 text-blue-900'
                          : submitted && choiceIdx === q.correctIndex
                            ? 'bg-green-50 border-green-300 text-green-900'
                            : 'bg-gray-50 border-gray-200 text-gray-800') +
                        ' text-left rounded-md px-3 py-2 border disabled:opacity-60'
                      }
                    >
                      <span className="font-semibold mr-2">{String.fromCharCode(65 + choiceIdx)}.</span>
                      {c}
                    </button>
                  ))}
                </div>
              </div>
            ))}

            <div className="pt-2 flex items-center justify-between gap-3">
              <div className="text-sm text-gray-600">
                Answered: <span className="font-semibold text-gray-900">{answeredCount}</span> / {selectedQuestions.length}
              </div>
              <button
                type="button"
                onClick={() => void submit()}
                disabled={!canAnswer || submitBusy || submitted || !allAnswered}
                className="px-4 py-2 text-sm font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {submitBusy ? 'Submitting…' : submitted ? 'Submitted' : 'Submit'}
              </button>
            </div>

            {submitError && <div className="text-sm text-red-700">{submitError}</div>}

            {submitted && score && (
              <div className="mt-2 text-sm text-gray-900 bg-green-50 border border-green-200 rounded-lg p-3">
                Saved to history. Score: <span className="font-bold">{score.correct} / {score.total}</span> ({score.percentage}%).
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

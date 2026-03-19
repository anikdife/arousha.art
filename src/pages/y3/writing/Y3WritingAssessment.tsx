import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../../../auth/AuthProvider';
import { getActiveStudentUid, setActiveStudent } from '../../../lib/activeStudent';
import { getDoc } from 'firebase/firestore';
import {
  downloadWritingAnswerText,
  loadWritingAttemptSummaries,
  submitWritingAssessment,
  writingAttemptDocRef,
} from '../../../lib/writing/attemptService';

function getLinkedStudentUids(profile: any): string[] {
  const current = profile?.linkedStudentUids ?? profile?.LinkedStudentUids;
  if (Array.isArray(current)) return current.filter(Boolean);
  const legacy = profile?.linkedStudentIds ?? profile?.LinkedStudentIds;
  if (Array.isArray(legacy)) return legacy.filter(Boolean);
  return [];
}

function getAssessmentKey(assessorUid: string, studentUid: string) {
  return `wp:y3:writing:assessment:v1:${assessorUid}:${studentUid}`;
}

type AssessmentDraft = {
  comment: string;
  scorePercent: string;
};

export const Y3WritingAssessment: React.FC = () => {
  const location = useLocation();
  const { currentUser, userProfile } = useAuth();

  const role = userProfile?.role ?? 'student';
  const linkedStudentUids = useMemo(() => getLinkedStudentUids(userProfile as any), [userProfile]);

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

  const effectiveStudentUid = useMemo(() => {
    if (stateStudentUid) return stateStudentUid;
    if (activeStudentUid) return activeStudentUid;
    if ((role === 'parent' || role === 'teacher') && linkedStudentUids.length > 0) return linkedStudentUids[0];
    return undefined;
  }, [activeStudentUid, linkedStudentUids, role, stateStudentUid]);

  const canView = useMemo(() => {
    if (role !== 'parent' && role !== 'teacher') return false;
    if (!effectiveStudentUid) return false;
    return linkedStudentUids.includes(effectiveStudentUid);
  }, [effectiveStudentUid, linkedStudentUids, role]);

  const stateAttemptId = typeof (state as any).attemptId === 'string' ? ((state as any).attemptId as string) : undefined;

  const [attemptId, setAttemptId] = useState<string | null>(stateAttemptId ?? null);
  const [attemptTitle, setAttemptTitle] = useState<string>('');
  const [studentAnswer, setStudentAnswer] = useState<string>('');
  const [assessed, setAssessed] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<boolean>(false);

  const assessmentKey = useMemo(() => {
    if (!currentUser?.uid || !effectiveStudentUid) return null;
    return getAssessmentKey(currentUser.uid, effectiveStudentUid);
  }, [currentUser?.uid, effectiveStudentUid]);

  const [draft, setDraft] = useState<AssessmentDraft>({ comment: '', scorePercent: '' });
  const loadedDraftForAttemptRef = useRef<string | null>(null);

  // Load assessor draft from sessionStorage (only for unassessed attempts).
  useEffect(() => {
    if (!assessmentKey || !attemptId) return;
    if (loadedDraftForAttemptRef.current === attemptId) return;
    loadedDraftForAttemptRef.current = attemptId;

    try {
      const raw = sessionStorage.getItem(`${assessmentKey}:${attemptId}`);
      if (!raw) {
        setDraft({ comment: '', scorePercent: '' });
        return;
      }
      const parsed = JSON.parse(raw) as Partial<AssessmentDraft>;
      setDraft({ comment: String(parsed.comment ?? ''), scorePercent: String(parsed.scorePercent ?? '') });
    } catch {
      setDraft({ comment: '', scorePercent: '' });
    }
  }, [assessmentKey, attemptId]);

  useEffect(() => {
    if (!assessmentKey || !attemptId) return;
    try {
      sessionStorage.setItem(`${assessmentKey}:${attemptId}`, JSON.stringify(draft));
    } catch {
      // ignore
    }
  }, [assessmentKey, attemptId, draft]);

  // Pick the latest unassessed attempt if one isn't explicitly chosen.
  useEffect(() => {
    let cancelled = false;
    if (!canView || !effectiveStudentUid) return;
    if (attemptId) return;

    setLoading(true);
    setLoadError(null);

    (async () => {
      try {
        const summaries = await loadWritingAttemptSummaries({ studentUid: effectiveStudentUid, max: 200 });
        const preferred = summaries.find((s) => s.assessed === false && s.answerStoragePath) ?? summaries.find((s) => s.assessed === false);
        if (!preferred) {
          if (!cancelled) {
            setAttemptId(null);
            setAttemptTitle('');
            setStudentAnswer('');
            setAssessed(false);
            setDraft({ comment: '', scorePercent: '' });
          }
          return;
        }
        if (!cancelled) {
          setAttemptId(preferred.attemptId);
        }
      } catch (e: any) {
        if (!cancelled) setLoadError(String(e?.message ?? 'Failed to load writing attempts'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [attemptId, canView, effectiveStudentUid]);

  // Load selected attempt (metadata + answer text).
  useEffect(() => {
    let cancelled = false;
    if (!canView || !effectiveStudentUid || !attemptId) return;

    setLoading(true);
    setLoadError(null);

    (async () => {
      try {
        const snap = await getDoc(writingAttemptDocRef(effectiveStudentUid, attemptId));
        if (!snap.exists()) throw new Error('Writing attempt not found');

        const data = snap.data() as any;
        const promptTitle = typeof data.promptTitle === 'string' ? data.promptTitle : '';
        const assessedFlag = Boolean(data.assessed);
        const score = typeof data.scorePercent === 'number' ? data.scorePercent : null;
        const comment = typeof data.comment === 'string' ? data.comment : '';
        const answerStoragePath = typeof data.answerStoragePath === 'string' ? data.answerStoragePath : null;

        let answerText = '';
        if (answerStoragePath) {
          try {
            answerText = await downloadWritingAnswerText(answerStoragePath);
          } catch {
            answerText = '';
          }
        }

        if (!cancelled) {
          setAttemptTitle(promptTitle);
          setStudentAnswer(answerText);
          setAssessed(assessedFlag);

          if (assessedFlag) {
            setDraft({ comment, scorePercent: score == null ? '' : String(score) });
          }
        }
      } catch (e: any) {
        if (!cancelled) setLoadError(String(e?.message ?? 'Failed to load writing'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [attemptId, canView, effectiveStudentUid]);

  if (!currentUser) {
    return (
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm text-sm text-gray-600">Please sign in.</div>
      </div>
    );
  }

  if (role !== 'parent' && role !== 'teacher') {
    return (
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
          <div className="text-sm font-semibold text-gray-900">Assessment</div>
          <div className="mt-3 text-sm text-gray-600">Assessment is available for parent/teacher accounts.</div>
        </div>
      </div>
    );
  }

  if (!canView || !effectiveStudentUid) {
    return (
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
          <div className="text-sm font-semibold text-gray-900">Assessment</div>
          <div className="mt-3 text-sm text-red-700">Not authorised.</div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-hidden">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 h-full overflow-hidden">
        <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden h-full">
          <div className="p-3 sm:p-4 h-full">
            <div className="max-w-4xl mx-auto h-full flex flex-col min-h-0">
              <div className="shrink-0">
                <div className="text-sm font-semibold text-gray-900">Assessment</div>
                <div className="mt-1 text-xs text-gray-600">Review the student’s writing, then add comments and a score.</div>
                {attemptTitle && <div className="mt-2 text-xs text-gray-500">Prompt: {attemptTitle}</div>}
                {loading && <div className="mt-2 text-xs text-gray-500">Loading…</div>}
                {!loading && loadError && <div className="mt-2 text-xs text-red-700">{loadError}</div>}
                {!loading && !loadError && !attemptId && (
                  <div className="mt-2 text-xs text-gray-600">No writing attempts found yet.</div>
                )}
              </div>

              <div className="mt-4 flex-1 min-h-0 grid grid-rows-2 gap-4">
                <div className="min-h-0 flex flex-col">
                  <div className="text-xs font-semibold text-gray-700">Student answer</div>
                  <textarea
                    value={studentAnswer}
                    readOnly
                    className="mt-2 w-full flex-1 min-h-0 rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm leading-relaxed"
                    placeholder="No student answer found yet."
                  />
                </div>

                <div className="min-h-0 flex flex-col">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-xs font-semibold text-gray-700">Comments</div>
                    <div className="flex items-center gap-2">
                      <label className="text-xs font-semibold text-gray-700">Score (%)</label>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={draft.scorePercent}
                        onChange={(e) => setDraft((d) => ({ ...d, scorePercent: e.target.value }))}
                        disabled={assessed || !attemptId}
                        className="w-24 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm disabled:bg-gray-100"
                        placeholder="0-100"
                      />
                    </div>
                  </div>

                  <textarea
                    value={draft.comment}
                    onChange={(e) => setDraft((d) => ({ ...d, comment: e.target.value }))}
                    disabled={assessed || !attemptId}
                    className="mt-2 w-full flex-1 min-h-0 rounded-xl border border-gray-200 bg-white p-4 text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                    placeholder="Write feedback for the student…"
                  />

                  <div className="mt-3 flex items-center justify-between gap-3 shrink-0">
                    <div className="text-xs text-gray-600">
                      {assessed ? 'Locked: already assessed.' : 'Once submitted, this cannot be edited.'}
                    </div>

                    <button
                      type="button"
                      disabled={assessed || !attemptId || submitting}
                      onClick={() => {
                        if (!currentUser?.uid || !effectiveStudentUid || !attemptId) return;
                        setSubmitError(null);

                        const score = Number(draft.scorePercent);
                        if (!Number.isFinite(score) || score < 0 || score > 100) {
                          setSubmitError('Score must be between 0 and 100.');
                          return;
                        }

                        setSubmitting(true);
                        void (async () => {
                          try {
                            await submitWritingAssessment({
                              studentUid: effectiveStudentUid,
                              attemptId,
                              assessorUid: currentUser.uid,
                              comment: draft.comment,
                              scorePercent: score,
                            });

                            // Refresh attempt
                            const snap = await getDoc(writingAttemptDocRef(effectiveStudentUid, attemptId));
                            const data = snap.data() as any;
                            const assessedFlag = Boolean(data?.assessed);
                            const scoreLocked = typeof data?.scorePercent === 'number' ? data.scorePercent : null;
                            const commentLocked = typeof data?.comment === 'string' ? data.comment : '';

                            setAssessed(assessedFlag);
                            setDraft({ comment: commentLocked, scorePercent: scoreLocked == null ? '' : String(scoreLocked) });
                          } catch (e: any) {
                            setSubmitError(String(e?.message ?? 'Failed to submit assessment'));
                          } finally {
                            setSubmitting(false);
                          }
                        })();
                      }}
                      className="px-4 py-2 text-sm font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
                    >
                      {submitting ? 'Submitting…' : assessed ? 'Assessed' : 'Submit assessment'}
                    </button>
                  </div>

                  {submitError && <div className="mt-2 text-xs text-red-700">{submitError}</div>}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

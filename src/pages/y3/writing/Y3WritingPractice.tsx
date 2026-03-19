import React, { useEffect, useState } from 'react';
import { useAuth } from '../../../auth/AuthProvider';
import { getDoc } from 'firebase/firestore';
import {
  downloadWritingAnswerText,
  makeAttemptId,
  pruneWritingAnswersKeepLastN,
  upsertWritingAttemptDraft,
  writingAttemptDocRef,
} from '../../../lib/writing/attemptService';

function currentPromptIdKey(studentUid: string) {
  return `wp:y3:writing:currentPromptId:v1:${studentUid}`;
}

function currentPromptTitleKey(studentUid: string) {
  return `wp:y3:writing:currentPromptTitle:v1:${studentUid}`;
}

function currentAttemptIdKey(studentUid: string) {
  return `wp:y3:writing:currentAttemptId:v1:${studentUid}`;
}

function draftKey(studentUid: string, attemptId: string) {
  return `wp:y3:writing:draft:v1:${studentUid}:${attemptId}`;
}

export const Y3WritingPractice: React.FC = () => {
  const { currentUser, userProfile } = useAuth();
  const uid = currentUser?.uid ?? null;
  const role = userProfile?.role ?? 'student';
  const isStudent = role === 'student';

  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [promptId, setPromptId] = useState<string | undefined>(undefined);
  const [promptTitle, setPromptTitle] = useState<string | undefined>(undefined);
  const [loadingRemote, setLoadingRemote] = useState<boolean>(false);
  const [remoteError, setRemoteError] = useState<string | null>(null);
  const [isAssessed, setIsAssessed] = useState<boolean>(false);
  const [isUploaded, setIsUploaded] = useState<boolean>(false);

  const [uploading, setUploading] = useState<boolean>(false);
  const [uploadMessage, setUploadMessage] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const [answer, setAnswer] = useState<string>('');

  // Resolve current attempt/prompt context created by the Writing tab.
  useEffect(() => {
    if (!uid) return;

    try {
      const nextAttempt = sessionStorage.getItem(currentAttemptIdKey(uid)) ?? makeAttemptId();
      sessionStorage.setItem(currentAttemptIdKey(uid), nextAttempt);
      setAttemptId(nextAttempt);

      const pid = sessionStorage.getItem(currentPromptIdKey(uid)) ?? undefined;
      const ptitle = sessionStorage.getItem(currentPromptTitleKey(uid)) ?? undefined;
      setPromptId(pid ?? undefined);
      setPromptTitle(ptitle ?? undefined);
    } catch {
      // ignore
      setAttemptId(makeAttemptId());
    }
  }, [uid]);

  // New attempt => reset upload status.
  useEffect(() => {
    setIsUploaded(false);
    setUploadMessage(null);
    setUploadError(null);
  }, [attemptId]);

  // Load local draft for this attempt.
  useEffect(() => {
    if (!uid || !attemptId) return;
    try {
      setAnswer(sessionStorage.getItem(draftKey(uid, attemptId)) ?? '');
    } catch {
      setAnswer('');
    }
  }, [attemptId, uid]);

  // Persist local draft.
  useEffect(() => {
    if (!uid || !attemptId) return;
    try {
      sessionStorage.setItem(draftKey(uid, attemptId), answer);
    } catch {
      // ignore
    }
  }, [answer, attemptId, uid]);

  // Load remote answer for this attempt (cross-device support).
  useEffect(() => {
    let cancelled = false;
    if (!uid || !attemptId) return;

    setLoadingRemote(true);
    setRemoteError(null);

    (async () => {
      try {
        const snap = await getDoc(writingAttemptDocRef(uid, attemptId));
        if (!snap.exists()) return;
        const data = snap.data() as any;
        const assessed = Boolean(data.assessed);
        if (!cancelled) setIsAssessed(assessed);

        const path = typeof data.answerStoragePath === 'string' ? data.answerStoragePath : null;
        if (!cancelled && path) setIsUploaded(true);
        if (!path) return;

        const text = await downloadWritingAnswerText(path);
        if (!cancelled && typeof text === 'string' && text.length > 0) {
          setAnswer((prev) => (prev.trim().length > 0 ? prev : text));
        }
      } catch (e: any) {
        if (!cancelled) setRemoteError(String(e?.message ?? 'Failed to load saved answer'));
      } finally {
        if (!cancelled) setLoadingRemote(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [attemptId, uid]);

  if (!currentUser) {
    return (
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm text-sm text-gray-600">Please sign in.</div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-hidden">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 h-full overflow-hidden">
        <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden h-full">
          <div className="p-3 sm:p-4 h-full">
            <div className="max-w-4xl mx-auto h-full flex flex-col">
              <div className="shrink-0">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-gray-900">Practice</div>
                    <div className="mt-1 text-xs text-gray-600">Write your answer on the page below.</div>
                  </div>

                  {isStudent && (
                    <button
                      type="button"
                      disabled={uploading || isAssessed || isUploaded || !attemptId}
                      onClick={() => {
                        if (!uid || !attemptId) return;
                        if (isAssessed) return;
                        if (isUploaded) return;
                        setUploadMessage(null);
                        setUploadError(null);
                        setUploading(true);

                        void (async () => {
                          try {
                            await upsertWritingAttemptDraft({
                              studentUid: uid,
                              attemptId,
                              promptId,
                              promptTitle,
                              answerText: answer,
                            });

                            await pruneWritingAnswersKeepLastN({ studentUid: uid, keepLastN: 10 });
                            setIsUploaded(true);
                            setUploadMessage('Uploaded — your answer is now saved.');
                          } catch (e: any) {
                            setUploadError(String(e?.message ?? 'Failed to upload'));
                          } finally {
                            setUploading(false);
                          }
                        })();
                      }}
                      className={
                        isUploaded
                          ? 'px-3 py-2 rounded-lg bg-green-600 text-white text-sm font-semibold disabled:opacity-50'
                          : 'px-3 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 text-sm font-semibold disabled:opacity-50'
                      }
                    >
                      {uploading ? 'Uploading…' : isUploaded ? 'Uploaded' : 'Upload answer'}
                    </button>
                  )}
                </div>

                {promptTitle && <div className="mt-2 text-xs text-gray-500">Prompt: {promptTitle}</div>}
                {loadingRemote && <div className="mt-2 text-xs text-gray-500">Loading saved answer…</div>}
                {!loadingRemote && remoteError && <div className="mt-2 text-xs text-red-700">{remoteError}</div>}
                {isAssessed && (
                  <div className="mt-2 text-xs text-gray-700 bg-yellow-50 border border-yellow-200 rounded-lg p-2">
                    This writing has been assessed and is now locked.
                  </div>
                )}
                {isStudent && isUploaded && (
                  <div className="mt-2 text-sm font-semibold text-green-800 bg-green-50 border border-green-200 rounded-lg p-3">
                    Uploaded
                    {uploadMessage ? <span className="ml-2 text-sm font-normal">{uploadMessage}</span> : null}
                  </div>
                )}
                {isStudent && !isUploaded && uploadMessage && <div className="mt-2 text-xs text-green-700">{uploadMessage}</div>}
                {isStudent && uploadError && <div className="mt-2 text-xs text-red-700">{uploadError}</div>}
              </div>

              <div className="mt-4 flex-1 min-h-0">
                <textarea
                  value={answer}
                  onChange={(e) => setAnswer(e.target.value)}
                  disabled={isAssessed || (isStudent && isUploaded)}
                  className="w-full h-full border border-gray-200 rounded-xl p-5 text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                  placeholder="Start writing here…"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

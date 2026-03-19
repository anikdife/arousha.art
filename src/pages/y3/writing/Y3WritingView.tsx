import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../../../auth/AuthProvider';
import { getActiveStudentUid, setActiveStudent } from '../../../lib/activeStudent';
import { loadWritingIndexY3, type WritingIndexItemY3 } from '../../../lib/writing/storageIndex';
import { loadPromptById, randomPickPrompt, type WritingPromptY3 } from '../../../lib/writing/promptLoader';
import { makeAttemptId } from '../../../lib/writing/attemptService';
import {
  clearPromptCanvas,
  drawWritingPromptPage,
  WRITING_PROMPT_PAGE_H,
  WRITING_PROMPT_PAGE_W,
} from '../../../lib/writing/promptCanvas';

function getLinkedStudentUids(profile: any): string[] {
  const current = profile?.linkedStudentUids ?? profile?.LinkedStudentUids;
  if (Array.isArray(current)) return current.filter(Boolean);
  const legacy = profile?.linkedStudentIds ?? profile?.LinkedStudentIds;
  if (Array.isArray(legacy)) return legacy.filter(Boolean);
  return [];
}

function getOrCreateSessionSeed(key: string): string {
  try {
    const cached = sessionStorage.getItem(key);
    if (cached) return cached;
  } catch {
    // ignore
  }

  const fallback = `${Date.now()}-${Math.random()}`;

  let seed = fallback;
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
      const buf = new Uint32Array(4);
      crypto.getRandomValues(buf);
      seed = Array.from(buf)
        .map((n) => n.toString(16).padStart(8, '0'))
        .join('');
    }
  } catch {
    // ignore
  }

  try {
    sessionStorage.setItem(key, seed);
  } catch {
    // ignore
  }

  return seed;
}

function generateNewSeed(): string {
  const fallback = `${Date.now()}-${Math.random()}`;

  let seed = fallback;
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
      const buf = new Uint32Array(4);
      crypto.getRandomValues(buf);
      seed = Array.from(buf)
        .map((n) => n.toString(16).padStart(8, '0'))
        .join('');
    }
  } catch {
    // ignore
  }

  return seed;
}

function pickPromptExcluding(
  items: WritingIndexItemY3[],
  seed: string,
  excludePromptId?: string
): WritingIndexItemY3 | null {
  if (!excludePromptId) return randomPickPrompt(items, seed);
  if (items.length <= 1) return randomPickPrompt(items, seed);

  const filtered = items.filter((it) => it.promptId !== excludePromptId);
  if (filtered.length === 0) return randomPickPrompt(items, seed);
  return randomPickPrompt(filtered, seed);
}

function currentPromptIdKey(studentUid: string) {
  return `wp:y3:writing:currentPromptId:v1:${studentUid}`;
}

function currentPromptTitleKey(studentUid: string) {
  return `wp:y3:writing:currentPromptTitle:v1:${studentUid}`;
}

function currentAttemptIdKey(studentUid: string) {
  return `wp:y3:writing:currentAttemptId:v1:${studentUid}`;
}

function setCurrentWritingContext(params: { studentUid: string; promptId: string; promptTitle: string }) {
  try {
    const { studentUid, promptId, promptTitle } = params;
    const pidKey = currentPromptIdKey(studentUid);
    const prevPromptId = sessionStorage.getItem(pidKey);

    sessionStorage.setItem(pidKey, promptId);
    sessionStorage.setItem(currentPromptTitleKey(studentUid), promptTitle);

    // New prompt => new attemptId.
    if (!prevPromptId || prevPromptId !== promptId) {
      sessionStorage.setItem(currentAttemptIdKey(studentUid), makeAttemptId());
    } else {
      const existing = sessionStorage.getItem(currentAttemptIdKey(studentUid));
      if (!existing) sessionStorage.setItem(currentAttemptIdKey(studentUid), makeAttemptId());
    }
  } catch {
    // ignore
  }
}

export const Y3WritingView: React.FC = () => {
  const location = useLocation();
  const { currentUser, userProfile } = useAuth();

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const currentPromptIdRef = useRef<string | undefined>(undefined);
  const excludeNextPromptIdRef = useRef<string | undefined>(undefined);

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
    if (role === 'student' || role === 'owner') return currentUser?.uid ?? undefined;
    if (stateStudentUid) return stateStudentUid;
    if (activeStudentUid) return activeStudentUid;
    if ((role === 'parent' || role === 'teacher') && linkedStudentUids.length > 0) return linkedStudentUids[0];
    return undefined;
  }, [activeStudentUid, currentUser?.uid, linkedStudentUids, role, stateStudentUid]);

  const canView = useMemo(() => {
    if (role === 'student' || role === 'owner') return Boolean(effectiveStudentUid);
    if (role === 'parent' || role === 'teacher') return Boolean(effectiveStudentUid) && linkedStudentUids.includes(effectiveStudentUid!);
    return false;
  }, [effectiveStudentUid, linkedStudentUids, role]);

  const seedKey = useMemo(() => {
    const uid = effectiveStudentUid ?? 'unknown';
    return `wp:y3:writing:seed:v1:${uid}`;
  }, [effectiveStudentUid]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [prompt, setPrompt] = useState<WritingPromptY3 | null>(null);
  const [imageUrl, setImageUrl] = useState<string>('');
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    currentPromptIdRef.current = prompt?.promptId;
  }, [prompt?.promptId]);

  const onNewPrompt = () => {
    // Capture the currently displayed promptId *before* any state updates.
    excludeNextPromptIdRef.current = currentPromptIdRef.current;
    try {
      sessionStorage.setItem(seedKey, generateNewSeed());
    } catch {
      // ignore
    }
    setLoading(true);
    setError(null);
    setReloadToken((n) => n + 1);
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (!prompt) {
      clearPromptCanvas(canvas);
      return;
    }
    drawWritingPromptPage(canvas, prompt, imageUrl);
  }, [imageUrl, prompt]);

  useEffect(() => {
    let cancelled = false;

    if (!canView) {
      setLoading(false);
      setError(role === 'parent' || role === 'teacher' ? 'Not authorised.' : 'Please sign in.');
      setPrompt(null);
      setImageUrl('');
      return;
    }

    setLoading(true);
    setError(null);

    (async () => {
      try {
        const index = await loadWritingIndexY3();
        const items = index.items ?? [];
        if (items.length === 0) {
          if (!cancelled) {
            setPrompt(null);
            setImageUrl('');
            setError('No prompts available yet.');
          }
          return;
        }

        const seed = getOrCreateSessionSeed(seedKey);

        const excludePromptId = excludeNextPromptIdRef.current;
        const picked = pickPromptExcluding(items as WritingIndexItemY3[], seed, excludePromptId);
        if (!picked) {
          if (!cancelled) {
            setPrompt(null);
            setImageUrl('');
            setError('No prompts available yet.');
          }
          return;
        }

        const loaded = await loadPromptById({ item: picked, expectedPromptId: picked.promptId });
        if (!cancelled) {
          setPrompt(loaded.prompt);
          setImageUrl(loaded.imageUrl);
          if (role === 'student' && currentUser?.uid) {
            setCurrentWritingContext({
              studentUid: currentUser.uid,
              promptId: loaded.prompt.promptId,
              promptTitle: loaded.prompt.title,
            });
          }
          // Exclusion is only meant for the next load triggered by 'New prompt'.
          excludeNextPromptIdRef.current = undefined;
        }
      } catch (e: any) {
        console.error('Failed to load writing prompt:', e);
        if (!cancelled) setError(String(e?.message ?? 'Failed to load writing prompt'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [canView, currentUser?.uid, reloadToken, role, seedKey]);

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm text-sm text-gray-600">Loading…</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
          <div className="text-sm font-semibold text-gray-900">Writing</div>
          <div className="mt-3 text-sm text-red-700">{error}</div>
        </div>
      </div>
    );
  }

  if (!prompt) {
    return (
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
          <div className="text-sm font-semibold text-gray-900">Writing</div>
          <div className="mt-3 text-sm text-gray-600">No prompt available.</div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-hidden">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 h-full overflow-hidden">
        <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden h-full">
          <div className="p-3 sm:p-4 h-full">
            <div className="max-w-4xl mx-auto overflow-hidden h-full w-full flex flex-col min-h-0">
              <div className="shrink-0 flex items-center justify-end">
                <button
                  type="button"
                  onClick={onNewPrompt}
                  className="px-3 py-2 rounded-lg bg-gray-100 text-gray-800 hover:bg-gray-200 text-sm font-semibold"
                >
                  New prompt
                </button>
              </div>

              <div className="mt-3 flex-1 min-h-0 flex items-center justify-center overflow-hidden">
                <canvas
                  ref={canvasRef}
                  width={WRITING_PROMPT_PAGE_W}
                  height={WRITING_PROMPT_PAGE_H}
                  className="block border border-gray-200 rounded-xl bg-white max-w-full max-h-full"
                  style={{ aspectRatio: '210 / 297', height: '100%', width: 'auto', maxHeight: '100%', maxWidth: '100%' }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

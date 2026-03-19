import {
  collection,
  doc,
  getDoc,
  getDocs,
  increment,
  serverTimestamp,
  setDoc,
  writeBatch,
} from 'firebase/firestore';
import { db } from '../../firebase/firebase';

export type ReadingMagazineHalf = 0 | 1;

export type ReadingMagazineY3CurrentAssignment = {
  storyId: string;
  half: ReadingMagazineHalf;
  assignedAt?: any;
};

export type ReadingMagazineY3StoryProgress = {
  storyId: string;
  firstHalfCompletedAt?: any | null;
  secondHalfCompletedAt?: any | null;
  updatedAt?: any;
};

type ReadingMagazineY3MetaDoc = {
  studentUid: string;
  year: 3;
  currentAssignment?: ReadingMagazineY3CurrentAssignment | null;
  lastAssignedStoryId?: string | null;
  repeatCount?: any;
  repeatResetAt?: any | null;
  updatedAt?: any;
};

function metaDocRef(studentUid: string) {
  return doc(db, 'readingMagazineY3', studentUid);
}

function storyProgressDocRef(studentUid: string, storyId: string) {
  return doc(db, 'readingMagazineY3', studentUid, 'stories', storyId);
}

function attemptDocRef(studentUid: string, attemptId: string) {
  return doc(db, 'readingMagazineY3', studentUid, 'attempts', attemptId);
}

export async function loadReadingMagazineY3Progress(params: { studentUid: string }): Promise<{
  meta: ReadingMagazineY3MetaDoc | null;
  stories: Record<string, ReadingMagazineY3StoryProgress>;
}> {
  const { studentUid } = params;

  const [metaSnap, storySnaps] = await Promise.all([
    getDoc(metaDocRef(studentUid)),
    getDocs(collection(db, 'readingMagazineY3', studentUid, 'stories')),
  ]);

  const meta = metaSnap.exists() ? (metaSnap.data() as ReadingMagazineY3MetaDoc) : null;

  const stories: Record<string, ReadingMagazineY3StoryProgress> = {};
  for (const snap of storySnaps.docs) {
    const data = snap.data() as any;
    const storyId = String(data.storyId ?? snap.id);
    stories[storyId] = {
      storyId,
      firstHalfCompletedAt: data.firstHalfCompletedAt ?? null,
      secondHalfCompletedAt: data.secondHalfCompletedAt ?? null,
      updatedAt: data.updatedAt,
    };
  }

  return { meta, stories };
}

function isHalfDone(progress: ReadingMagazineY3StoryProgress | undefined, half: ReadingMagazineHalf): boolean {
  if (!progress) return false;
  return half === 0 ? Boolean(progress.firstHalfCompletedAt) : Boolean(progress.secondHalfCompletedAt);
}

function isStoryFullyDone(progress: ReadingMagazineY3StoryProgress | undefined): boolean {
  return isHalfDone(progress, 0) && isHalfDone(progress, 1);
}

function areAllStoriesFullyDone(storyIds: string[], progressByStoryId: Record<string, ReadingMagazineY3StoryProgress>): boolean {
  const ids = (storyIds ?? []).filter(Boolean);
  if (ids.length === 0) return false;
  for (const id of ids) {
    if (!isStoryFullyDone(progressByStoryId[id])) return false;
  }
  return true;
}

export function chooseNextReadingMagazineY3Assignment(params: {
  storyIds: string[];
  progressByStoryId: Record<string, ReadingMagazineY3StoryProgress>;
  lastAssignedStoryId?: string | null;
}): ReadingMagazineY3CurrentAssignment | null {
  const storyIds = (params.storyIds ?? []).filter(Boolean);
  if (storyIds.length === 0) return null;

  const progress = params.progressByStoryId ?? {};
  const last = params.lastAssignedStoryId ?? null;

  const unread = storyIds.filter((id) => !isHalfDone(progress[id], 0));
  if (unread.length > 0) {
    const pick = unread.find((id) => id !== last) ?? unread[0]!;
    return { storyId: pick, half: 0 };
  }

  const needsSecondHalf = storyIds.filter((id) => isHalfDone(progress[id], 0) && !isHalfDone(progress[id], 1));
  if (needsSecondHalf.length > 0) {
    const pick = needsSecondHalf.find((id) => id !== last) ?? needsSecondHalf[0]!;
    return { storyId: pick, half: 1 };
  }

  // Everything completed. Fall back to a deterministic repeat.
  return { storyId: storyIds[0]!, half: 0 };
}

export async function getOrAssignReadingMagazineY3CurrentPractice(params: {
  studentUid: string;
  storyIds: string[];
}): Promise<ReadingMagazineY3CurrentAssignment | null> {
  const { studentUid, storyIds } = params;

  const { meta, stories } = await loadReadingMagazineY3Progress({ studentUid });

  const existing = meta?.currentAssignment ?? null;
  if (existing?.storyId) {
    // Keep existing assignment only if it still has unanswered questions.
    const stillUnanswered = !isHalfDone(stories[existing.storyId], existing.half);
    if (stillUnanswered) return existing;
  }

  const shouldResetForRepeat = areAllStoriesFullyDone(storyIds, stories);
  const effectiveStories = shouldResetForRepeat ? {} : stories;

  const next = chooseNextReadingMagazineY3Assignment({
    storyIds,
    progressByStoryId: effectiveStories,
    lastAssignedStoryId: meta?.lastAssignedStoryId ?? null,
  });

  if (!next) return null;

  if (shouldResetForRepeat) {
    const batch = writeBatch(db);

    // Clear completion flags so the student can repeat the whole magazine again.
    for (const id of (storyIds ?? []).filter(Boolean)) {
      batch.set(
        storyProgressDocRef(studentUid, id),
        {
          storyId: id,
          firstHalfCompletedAt: null,
          secondHalfCompletedAt: null,
          updatedAt: serverTimestamp(),
        } satisfies ReadingMagazineY3StoryProgress,
        { merge: true }
      );
    }

    batch.set(
      metaDocRef(studentUid),
      {
        studentUid,
        year: 3,
        repeatCount: increment(1),
        repeatResetAt: serverTimestamp(),
        currentAssignment: {
          storyId: next.storyId,
          half: next.half,
          assignedAt: serverTimestamp(),
        },
        lastAssignedStoryId: next.storyId,
        updatedAt: serverTimestamp(),
      } satisfies ReadingMagazineY3MetaDoc,
      { merge: true }
    );

    await batch.commit();
  } else {
    await setDoc(
      metaDocRef(studentUid),
      {
        studentUid,
        year: 3,
        currentAssignment: {
          storyId: next.storyId,
          half: next.half,
          assignedAt: serverTimestamp(),
        },
        lastAssignedStoryId: next.storyId,
        updatedAt: serverTimestamp(),
      } satisfies ReadingMagazineY3MetaDoc,
      { merge: true }
    );
  }

  return next;
}

export async function recordReadingMagazineY3Attempt(params: {
  studentUid: string;
  attemptId: string;
  sessionId: string;
  storagePath: string;
  story: { storyId: string; title: string; type: string; updatedAt: string };
  half: ReadingMagazineHalf;
  questionIds: string[];
  score: { correct: number; total: number; percentage: number };
  appVersion: string;
}): Promise<void> {
  const { studentUid, attemptId, story, half } = params;

  const batch = writeBatch(db);

  batch.set(
    attemptDocRef(studentUid, attemptId),
    {
      attemptId,
      studentUid,
      year: 3,
      topic: 'reading-magazine',
      story: {
        storyId: story.storyId,
        title: story.title,
        type: story.type,
        updatedAt: story.updatedAt,
      },
      half,
      questionIds: params.questionIds,
      sessionId: params.sessionId,
      storagePath: params.storagePath,
      score: params.score,
      submittedAt: serverTimestamp(),
      appVersion: params.appVersion,
    },
    { merge: true }
  );

  batch.set(
    storyProgressDocRef(studentUid, story.storyId),
    {
      storyId: story.storyId,
      ...(half === 0 ? { firstHalfCompletedAt: serverTimestamp() } : { secondHalfCompletedAt: serverTimestamp() }),
      updatedAt: serverTimestamp(),
    } satisfies ReadingMagazineY3StoryProgress,
    { merge: true }
  );

  batch.set(
    metaDocRef(studentUid),
    {
      studentUid,
      year: 3,
      currentAssignment: null,
      lastAssignedStoryId: story.storyId,
      updatedAt: serverTimestamp(),
    } satisfies ReadingMagazineY3MetaDoc,
    { merge: true }
  );

  await batch.commit();
}

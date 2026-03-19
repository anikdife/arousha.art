import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { deleteObject, getBytes, ref, uploadString } from 'firebase/storage';
import { db, functions, storage } from '../../firebase/firebase';
import type { WritingAttemptSummaryY3, WritingFeedbackSummaryY3 } from './attemptTypes';

function toMillis(value: any): number {
  if (!value) return 0;
  if (typeof value === 'string') {
    const t = Date.parse(value);
    return Number.isNaN(t) ? 0 : t;
  }
  if (typeof value?.toDate === 'function') {
    try {
      return value.toDate().getTime();
    } catch {
      return 0;
    }
  }
  if (typeof value?.seconds === 'number') {
    return value.seconds * 1000;
  }
  return 0;
}

export function makeAttemptId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function writingAttemptDocRef(studentUid: string, attemptId: string) {
  return doc(db, 'writingY3', studentUid, 'attempts', attemptId);
}

export function writingAnswerPath(studentUid: string, attemptId: string) {
  return `writingY3/${studentUid}/attempts/${attemptId}/answer.txt`;
}

export async function upsertWritingAttemptDraft(params: {
  studentUid: string;
  attemptId: string;
  promptId?: string;
  promptTitle?: string;
  answerText: string;
}): Promise<void> {
  const { studentUid, attemptId, promptId, promptTitle, answerText } = params;
  const answerPath = writingAnswerPath(studentUid, attemptId);

  // 1) Write answer text to Storage
  await uploadString(ref(storage, answerPath), answerText ?? '', 'raw', {
    contentType: 'text/plain; charset=utf-8',
    customMetadata: {
      studentUid,
      attemptId,
      year: '3',
    },
  });

  // 2) Upsert Firestore metadata
  const attemptRef = writingAttemptDocRef(studentUid, attemptId);
  const snap = await getDoc(attemptRef);

  const basePayload: Record<string, unknown> = {
    attemptId,
    studentUid,
    year: 3,
    promptId: promptId ?? null,
    promptTitle: promptTitle ?? null,
    updatedAt: serverTimestamp(),
    answerStoragePath: answerPath,
    answerCharCount: typeof answerText === 'string' ? answerText.length : 0,
  };

  // Only initialize assessment fields on create.
  if (!snap.exists()) {
    basePayload.createdAt = serverTimestamp();
    basePayload.assessed = false;
    basePayload.assessedAt = null;
    basePayload.assessorUid = null;
    basePayload.scorePercent = null;
    basePayload.comment = null;
  }

  await setDoc(attemptRef, basePayload, { merge: true });
}

export async function loadWritingAttemptSummaries(params: {
  studentUid: string;
  max?: number;
}): Promise<WritingAttemptSummaryY3[]> {
  const colRef = collection(db, 'writingY3', params.studentUid, 'attempts');
  const maxRaw = params.max;
  const max = typeof maxRaw === 'number' ? Math.max(1, Math.min(5000, maxRaw)) : null;
  const q = max ? query(colRef, orderBy('createdAt', 'desc'), limit(max)) : query(colRef, orderBy('createdAt', 'desc'));
  const snap = await getDocs(q);

  return snap.docs
    .map((d) => {
      const data = d.data() as any;
      const attemptId = String(data.attemptId ?? d.id);
      const createdAtMillis = toMillis(data.createdAt);
      const assessedAtMillis = toMillis(data.assessedAt);
      const assessed = Boolean(data.assessed);
      const scorePercent = typeof data.scorePercent === 'number' ? data.scorePercent : null;
      const answerStoragePath = typeof data.answerStoragePath === 'string' ? data.answerStoragePath : null;
      return {
        attemptId,
        createdAtMillis,
        promptId: typeof data.promptId === 'string' ? data.promptId : undefined,
        promptTitle: typeof data.promptTitle === 'string' ? data.promptTitle : undefined,
        assessed,
        assessedAtMillis,
        scorePercent,
        answerStoragePath,
      } satisfies WritingAttemptSummaryY3;
    })
    .sort((a, b) => b.createdAtMillis - a.createdAtMillis);
}

function isCompleteFeedback(row: {
  assessedAtMillis: number;
  scorePercent: number | null;
  comment: string;
  assessorUid: string | null;
}): row is { assessedAtMillis: number; scorePercent: number; comment: string; assessorUid: string } {
  if (!row.assessedAtMillis) return false;
  if (typeof row.scorePercent !== 'number') return false;
  if (!Number.isFinite(row.scorePercent)) return false;
  if (typeof row.comment !== 'string' || row.comment.trim().length === 0) return false;
  if (typeof row.assessorUid !== 'string' || row.assessorUid.length === 0) return false;
  return true;
}

export async function loadWritingFeedbackSummaries(params: {
  studentUid: string;
  max?: number;
  rangeStartMs?: number;
  rangeEndMs?: number;
}): Promise<WritingFeedbackSummaryY3[]> {
  const maxRaw = params.max;
  const max = typeof maxRaw === 'number' ? Math.max(1, Math.min(500, maxRaw)) : 10;

  // Intentionally avoid a composite index requirement by ordering only by assessedAt and filtering client-side.
  // We over-fetch a bit to ensure we can still return `max` items after filtering.
  const colRef = collection(db, 'writingY3', params.studentUid, 'attempts');
  const fetchLimit = Math.min(1000, Math.max(100, max * 3));
  const snap = await getDocs(query(colRef, orderBy('assessedAt', 'desc'), limit(fetchLimit)));

  const rangeStart = typeof params.rangeStartMs === 'number' ? params.rangeStartMs : null;
  const rangeEnd = typeof params.rangeEndMs === 'number' ? params.rangeEndMs : null;

  const rows = snap.docs
    .map((d) => {
      const data = d.data() as any;
      const attemptId = String(data.attemptId ?? d.id);
      const createdAtMillis = toMillis(data.createdAt);
      const assessedAtMillis = toMillis(data.assessedAt);
      const scorePercent = typeof data.scorePercent === 'number' ? data.scorePercent : null;
      const comment = typeof data.comment === 'string' ? data.comment : '';
      const assessorUid = typeof data.assessorUid === 'string' ? data.assessorUid : null;
      const promptTitle = typeof data.promptTitle === 'string' ? data.promptTitle : undefined;
      const answerStoragePath = typeof data.answerStoragePath === 'string' ? data.answerStoragePath : null;

      return {
        attemptId,
        createdAtMillis,
        assessedAtMillis,
        scorePercent,
        comment,
        assessorUid,
        promptTitle,
        answerStoragePath,
      };
    })
    .filter((r) => isCompleteFeedback(r))
    .filter((r) => {
      if (rangeStart == null || rangeEnd == null) return true;
      return r.assessedAtMillis >= rangeStart && r.assessedAtMillis <= rangeEnd;
    })
    .sort((a, b) => b.assessedAtMillis - a.assessedAtMillis)
    .slice(0, max)
    .map((r) => ({
      attemptId: r.attemptId,
      createdAtMillis: r.createdAtMillis,
      assessedAtMillis: r.assessedAtMillis,
      scorePercent: r.scorePercent,
      comment: r.comment,
      assessorUid: r.assessorUid,
      promptTitle: r.promptTitle,
      answerStoragePath: r.answerStoragePath,
    } satisfies WritingFeedbackSummaryY3));

  return rows;
}

export async function downloadWritingAnswerText(storagePath: string): Promise<string> {
  const buf = await getBytes(ref(storage, storagePath));
  const bytes = new Uint8Array(buf);
  try {
    return new TextDecoder('utf-8').decode(bytes);
  } catch {
    // Fallback for older environments
    let s = '';
    for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return s;
  }
}

export async function pruneWritingAnswersKeepLastN(params: {
  studentUid: string;
  keepLastN: number;
}): Promise<void> {
  const keepLastN = Math.max(1, Math.min(50, params.keepLastN));
  const all = await loadWritingAttemptSummaries({ studentUid: params.studentUid, max: 2000 });
  const withAnswers = all.filter((a) => Boolean(a.answerStoragePath));

  const toPrune = withAnswers.slice(keepLastN);
  for (const attempt of toPrune) {
    if (!attempt.answerStoragePath) continue;

    try {
      await deleteObject(ref(storage, attempt.answerStoragePath));
    } catch {
      // ignore missing
    }

    try {
      await updateDoc(writingAttemptDocRef(params.studentUid, attempt.attemptId), {
        answerStoragePath: null,
        answerPrunedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch {
      // ignore
    }
  }
}

export async function submitWritingAssessment(params: {
  studentUid: string;
  attemptId: string;
  assessorUid: string;
  comment: string;
  commentFormat?: 'text' | 'json';
  commentJson?: unknown;
  scorePercent: number;
}): Promise<void> {
  const scorePercent = Math.max(0, Math.min(100, Math.round(params.scorePercent)));

  const refDoc = writingAttemptDocRef(params.studentUid, params.attemptId);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(refDoc);
    if (!snap.exists()) throw new Error('Writing attempt not found');

    const data = snap.data() as any;
    if (data.assessed === true) throw new Error('This writing has already been assessed');

    tx.update(refDoc, {
      assessed: true,
      assessedAt: serverTimestamp(),
      assessorUid: params.assessorUid,
      scorePercent,
      comment: String(params.comment ?? ''),
      commentFormat: params.commentFormat ?? 'text',
      commentJson: params.commentFormat === 'json' ? (params.commentJson ?? null) : null,
      updatedAt: serverTimestamp(),
    });
  });
}

export async function deleteUnassessedWritingAttempt(params: {
  studentUid: string;
  attemptId: string;
}): Promise<void> {
  // Parents/teachers cannot delete these directly due to Firestore/Storage rules.
  // Use a callable Cloud Function which performs authorization and deletes both
  // Firestore + Storage.
  const fn = httpsCallable(functions, 'deleteWritingUnassessedAttemptY3');
  await fn({ studentUid: params.studentUid, attemptId: params.attemptId });
}

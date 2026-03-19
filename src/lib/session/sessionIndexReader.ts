// src/lib/session/sessionIndexReader.ts

import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../../firebase/firebase';

export type SessionIndexListItem = {
  sessionId: string;
  topic: string;
  submittedAt?: any;
  createdAt?: any;
  submittedAtMillis?: number;
  score?: { total: number; correct: number; percentage: number };
  storagePath: string;
};

function toMillis(value: any): number {
  if (!value) return 0;
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }
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

export async function listSessionIndexByTopic(params: {
  studentUid: string;
  topic: string;
}): Promise<SessionIndexListItem[]> {
  const { studentUid, topic } = params;
  const colRef = collection(db, 'sessionIndex', studentUid, 'items');

  // Avoid `orderBy` to reduce composite-index requirements.
  const q = query(colRef, where('topic', '==', topic));
  const snap = await getDocs(q);

  return snap.docs
    .map((d) => {
      const data = d.data() as any;
      const submittedAt = data.submittedAt;
      const createdAt = data.createdAt;
      const submittedAtMillis =
        typeof data.submittedAtMillis === 'number' && Number.isFinite(data.submittedAtMillis)
          ? data.submittedAtMillis
          : toMillis(submittedAt ?? createdAt);
      return {
        sessionId: String(data.sessionId ?? d.id),
        topic: String(data.topic ?? topic),
        submittedAt,
        createdAt,
        submittedAtMillis,
        score: data.score,
        storagePath: String(data.storagePath ?? ''),
      } satisfies SessionIndexListItem;
    })
    .filter((item) => Boolean(item.storagePath))
    .sort((a, b) => (b.submittedAtMillis ?? 0) - (a.submittedAtMillis ?? 0));
}

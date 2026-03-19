// src/lib/session/sessionIndexWriter.ts

import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '../../firebase/firebase';

export type SessionIndexWriteParams = {
  studentUid: string;
  sessionId: string;
  topic: string;
  year: number;
  section: string;
  score: { total: number; correct: number; percentage: number };
  storagePath: string;
};

export async function writeSessionIndex(params: SessionIndexWriteParams): Promise<void> {
  const { studentUid, sessionId, topic, year, section, score, storagePath } = params;

  const docRef = doc(db, 'sessionIndex', studentUid, 'items', sessionId);

  let createdAt: any = serverTimestamp();
  try {
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      const existing = snap.data() as any;
      if (existing?.createdAt != null) createdAt = existing.createdAt;
    }
  } catch {
    createdAt = serverTimestamp();
  }

  const payload = {
    sessionId,
    studentUid,
    topic,
    year,
    section,
    status: 'submitted' as const,
    createdAt,
    submittedAt: serverTimestamp(),
    score: {
      total: score.total,
      correct: score.correct,
      percentage: score.percentage,
    },
    storagePath,
  };

  await setDoc(docRef, payload, { merge: true });
}

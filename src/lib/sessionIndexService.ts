// src/lib/sessionIndexService.ts

import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '../firebase/firebase';

export async function writeMultiplicationSessionIndex(params: {
  studentUid: string;
  sessionId: string;
  storagePath: string;
  score: { total: number; correct: number; percentage: number };
}): Promise<void> {
  const { studentUid, sessionId, storagePath, score } = params;

  const docRef = doc(db, 'sessionIndex', studentUid, 'items', sessionId);

  let createdAt: any = serverTimestamp();
  try {
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      const existing = snap.data() as any;
      if (existing?.createdAt != null) {
        createdAt = existing.createdAt;
      }
    }
  } catch {
    createdAt = serverTimestamp();
  }

  const payload = {
    sessionId,
    studentUid,
    topic: 'multiplication' as const,
    year: 3 as const,
    section: 'numeracy' as const,
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

export async function writeSubtractionSessionIndex(params: {
  studentUid: string;
  sessionId: string;
  storagePath: string;
  score: { total: number; correct: number; percentage: number };
}): Promise<void> {
  const { studentUid, sessionId, storagePath, score } = params;

  const docRef = doc(db, 'sessionIndex', studentUid, 'items', sessionId);

  let createdAt: any = serverTimestamp();
  try {
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      const existing = snap.data() as any;
      if (existing?.createdAt != null) {
        createdAt = existing.createdAt;
      }
    }
  } catch {
    createdAt = serverTimestamp();
  }

  const payload = {
    sessionId,
    studentUid,
    topic: 'subtraction' as const,
    year: 3 as const,
    section: 'numeracy' as const,
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

export async function writeAdditionSessionIndex(params: {
  studentUid: string;
  sessionId: string;
  storagePath: string;
  score: { total: number; correct: number; percentage: number };
  mode?: 'numeric' | 'word';
}): Promise<void> {
  const { studentUid, sessionId, storagePath, score, mode } = params;

  const docRef = doc(db, 'sessionIndex', studentUid, 'items', sessionId);

  let createdAt: any = serverTimestamp();
  try {
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      const existing = snap.data() as any;
      if (existing?.createdAt != null) {
        createdAt = existing.createdAt;
      }
    }
  } catch {
    createdAt = serverTimestamp();
  }

  const payload = {
    sessionId,
    studentUid,
    topic: 'addition' as const,
    year: 3 as const,
    section: 'numeracy' as const,
    status: 'submitted' as const,
    createdAt,
    submittedAt: serverTimestamp(),
    score: {
      total: score.total,
      correct: score.correct,
      percentage: score.percentage,
    },
    storagePath,
    mode: mode ?? 'numeric',
  };

  await setDoc(docRef, payload, { merge: true });
}

export async function writeMeasurementSessionIndex(params: {
  studentUid: string;
  sessionId: string;
  storagePath: string;
  score: { total: number; correct: number; percentage: number };
}): Promise<void> {
  const { studentUid, sessionId, storagePath, score } = params;

  const docRef = doc(db, 'sessionIndex', studentUid, 'items', sessionId);

  let createdAt: any = serverTimestamp();
  try {
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      const existing = snap.data() as any;
      if (existing?.createdAt != null) {
        createdAt = existing.createdAt;
      }
    }
  } catch {
    createdAt = serverTimestamp();
  }

  const payload = {
    sessionId,
    studentUid,
    topic: 'measurement' as const,
    year: 3 as const,
    section: 'numeracy' as const,
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

export async function writeDataProbabilitySessionIndex(params: {
  studentUid: string;
  sessionId: string;
  storagePath: string;
  score: { total: number; correct: number; percentage: number };
}): Promise<void> {
  const { studentUid, sessionId, storagePath, score } = params;

  const docRef = doc(db, 'sessionIndex', studentUid, 'items', sessionId);

  let createdAt: any = serverTimestamp();
  try {
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      const existing = snap.data() as any;
      if (existing?.createdAt != null) {
        createdAt = existing.createdAt;
      }
    }
  } catch {
    createdAt = serverTimestamp();
  }

  const payload = {
    sessionId,
    studentUid,
    topic: 'data-probability' as const,
    year: 3 as const,
    section: 'numeracy' as const,
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

export async function writeReadingMagazineSessionIndex(params: {
  studentUid: string;
  sessionId: string;
  storagePath: string;
  score: { total: number; correct: number; percentage: number };
  meta: { storyId: string; storyTitle: string; isoDate: string };
}): Promise<void> {
  const { studentUid, sessionId, storagePath, score, meta } = params;

  const docRef = doc(db, 'sessionIndex', studentUid, 'items', sessionId);

  let createdAt: any = serverTimestamp();
  try {
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      const existing = snap.data() as any;
      if (existing?.createdAt != null) {
        createdAt = existing.createdAt;
      }
    }
  } catch {
    createdAt = serverTimestamp();
  }

  const payload = {
    sessionId,
    studentUid,
    topic: 'reading-magazine' as const,
    year: 3 as const,
    section: 'reading' as const,
    status: 'submitted' as const,
    createdAt,
    submittedAt: serverTimestamp(),
    score: {
      total: score.total,
      correct: score.correct,
      percentage: score.percentage,
    },
    storagePath,
    meta,
  };

  await setDoc(docRef, payload, { merge: true });
}

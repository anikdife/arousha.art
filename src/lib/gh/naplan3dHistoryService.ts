import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import { db } from '../../firebase/firebase';
import type { PracticeSessionDoc } from '../../types/practiceSession';

const SECTION_TO_DOMAIN: Record<PracticeSessionDoc['section'], string> = {
  numeracy: 'Numeracy',
  reading: 'Reading',
  writing: 'Writing',
  language: 'Language',
};

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

function toMillis(value: any): number {
  if (!value) return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
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
  if (typeof value?.toMillis === 'function') {
    try {
      const t = value.toMillis();
      return Number.isFinite(t) ? t : 0;
    } catch {
      return 0;
    }
  }
  if (typeof value?.seconds === 'number') return value.seconds * 1000;
  return 0;
}

function scalePercentToNaplanScore(percent: number): number {
  // Visualization-only scaling: map 0–100% into a typical NAPLAN-like band (300–700).
  // Keeps the 3D charts meaningful even if raw Firestore data stores only percentage scores.
  const t = clamp01(percent / 100);
  return Math.round(300 + t * 400);
}

export async function loadNaplan3DHistoryFromFirestore(params: {
  studentUid: string;
}): Promise<{
  student_id: string;
  attempts: Array<{ domain: string; score: number; date: any; metadata?: any }>;
  benchmarks: { national: number; school: number };
}> {
  const studentUid = params.studentUid;
  if (!studentUid) throw new Error('studentUid is required');

  // Prefer showing the human studentId (e.g., AB-12345) if present.
  const studentSnap = await getDoc(doc(db, 'users', studentUid));
  const studentData: any = studentSnap.exists() ? studentSnap.data() : null;
  const studentId = typeof studentData?.studentId === 'string' && studentData.studentId.trim() ? studentData.studentId.trim() : studentUid;

  // IMPORTANT: avoid composite index requirement by not using orderBy here.
  // We'll sort client-side by submittedAt/updatedAt.
  const q = query(collection(db, 'practiceSessions'), where('ownerUid', '==', studentUid));
  const snap = await getDocs(q);
  const sessions = snap.docs.map((d) => d.data() as PracticeSessionDoc);
  const submitted = sessions.filter((s) => s.status === 'submitted');

  const attempts = submitted
    .filter((s) => !!s.score && typeof s.score?.percentage === 'number')
    .map((s) => {
      const percent = s.score?.percentage ?? 0;
      const score = scalePercentToNaplanScore(percent);
      const date = s.submittedAt ?? s.updatedAt ?? s.createdAt;

      return {
        domain: SECTION_TO_DOMAIN[s.section] ?? String(s.section),
        score,
        date,
        metadata: {
          source: 'practiceSessions',
          sessionId: s.sessionId,
          year: s.year,
          section: s.section,
          topic: s.topic,
          percentage: percent,
          correct: s.score?.correct,
          total: s.score?.total,
          submittedAtMs: toMillis(s.submittedAt),
          updatedAtMs: toMillis(s.updatedAt),
        },
      };
    })
    .sort((a, b) => toMillis(a.date) - toMillis(b.date));

  // Benchmarks are not stored in existing collections (per current firestore.rules).
  // Provide safe defaults; you can later backfill from a dedicated benchmark doc if desired.
  return {
    student_id: studentId,
    attempts,
    benchmarks: {
      national: 0,
      school: 0,
    },
  };
}

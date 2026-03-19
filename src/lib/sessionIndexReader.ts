// src/lib/sessionIndexReader.ts

import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebase/firebase';

export type SessionIndexTopic =
  | 'subtraction'
  | 'multiplication'
  | 'addition'
  | 'measurement'
  | 'geometry'
  | 'data-probability'
  | 'language-conventions'
  | 'reading-magazine'
  | 'writing';

export type SessionIndexItem = {
  sessionId: string;
  topic: SessionIndexTopic;
  mode?: 'numeric' | 'word';
  meta?: Record<string, unknown>;
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

export async function listTopicSessionIndex(
  studentUid: string,
  topic: SessionIndexTopic
): Promise<SessionIndexItem[]> {
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
        topic,
        mode: data.mode === 'word' ? 'word' : data.mode === 'numeric' ? 'numeric' : undefined,
        meta: data.meta && typeof data.meta === 'object' ? data.meta : undefined,
        submittedAt,
        createdAt,
        submittedAtMillis,
        score: data.score,
        storagePath: String(data.storagePath ?? ''),
      } satisfies SessionIndexItem;
    })
    .filter((item) => Boolean(item.storagePath))
    .sort((a, b) => (b.submittedAtMillis ?? 0) - (a.submittedAtMillis ?? 0));
}

export type ReadingMagazineSessionIndexItem = Omit<SessionIndexItem, 'topic'>;

export async function listReadingMagazineSessionIndex(
  studentUid: string
): Promise<ReadingMagazineSessionIndexItem[]> {
  const items = await listTopicSessionIndex(studentUid, 'reading-magazine');
  return items.map(({ topic: _topic, ...rest }) => rest);
}

export async function listY3NumeracySessionIndex(studentUid: string): Promise<{
  subtraction: SessionIndexItem[];
  multiplication: SessionIndexItem[];
  addition: SessionIndexItem[];
  measurement: SessionIndexItem[];
  geometry: SessionIndexItem[];
  dataProbability: SessionIndexItem[];
}> {
  const [subtraction, multiplication, addition, measurement, geometry, dataProbability] = await Promise.all([
    listTopicSessionIndex(studentUid, 'subtraction'),
    listTopicSessionIndex(studentUid, 'multiplication'),
    listTopicSessionIndex(studentUid, 'addition'),
    listTopicSessionIndex(studentUid, 'measurement'),
    listTopicSessionIndex(studentUid, 'geometry'),
    listTopicSessionIndex(studentUid, 'data-probability'),
  ]);
  return { subtraction, multiplication, addition, measurement, geometry, dataProbability };
}

export type MeasurementSessionIndexItem = Omit<SessionIndexItem, 'topic'>;

export async function listMeasurementSessionIndex(studentUid: string): Promise<MeasurementSessionIndexItem[]> {
  const items = await listTopicSessionIndex(studentUid, 'measurement');
  return items.map(({ topic: _topic, ...rest }) => rest);
}

export type DataProbabilitySessionIndexItem = Omit<SessionIndexItem, 'topic'>;

export async function listDataProbabilitySessionIndex(
  studentUid: string
): Promise<DataProbabilitySessionIndexItem[]> {
  const items = await listTopicSessionIndex(studentUid, 'data-probability');
  return items.map(({ topic: _topic, ...rest }) => rest);
}

// Backwards-compatible exports used by older pages.
export type SubtractionSessionIndexItem = Omit<SessionIndexItem, 'topic'>;

export async function listSubtractionSessionIndex(studentUid: string): Promise<SubtractionSessionIndexItem[]> {
  const items = await listTopicSessionIndex(studentUid, 'subtraction');
  return items.map(({ topic: _topic, ...rest }) => rest);
}

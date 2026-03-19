// src/lib/userCounterService.ts

import { doc, getDoc, increment, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '../firebase/firebase';

const COLLECTION = 'userCounters';

export async function getSubtractionCount(uid: string): Promise<number> {
  const ref = doc(db, COLLECTION, uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) return 0;
  const data = snap.data() as { subtractionCount?: unknown };
  const value = data.subtractionCount;
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

export async function incrementSubtractionCount(uid: string): Promise<void> {
  const ref = doc(db, COLLECTION, uid);
  await setDoc(
    ref,
    {
      subtractionCount: increment(1),
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

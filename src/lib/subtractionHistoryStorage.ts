// src/lib/subtractionHistoryStorage.ts

import { ref, listAll, getDownloadURL } from 'firebase/storage';
import { storage } from '../firebase/firebase';

export async function listSubtractionSessions(uid: string): Promise<any[]> {
  const sessionsRef = ref(storage, `practiceSessions/${uid}/`);
  const result = await listAll(sessionsRef);

  const sessionPromises = result.items.map(async (itemRef) => {
    const downloadUrl = await getDownloadURL(itemRef);
    const response = await fetch(downloadUrl);
    const json = await response.json();

    const sessionId = itemRef.name.replace(/\.json$/i, '');

    return {
      sessionId,
      downloadUrl,
      ...json,
    };
  });

  const all = await Promise.all(sessionPromises);

  return all.filter((s) => {
    const topic = (s as any)?.topic;
    return topic === 'subtraction' || topic == null;
  });
}

// src/lib/listSessionsFromStorage.ts

import { ref, listAll } from "firebase/storage";
import { storage } from "../firebase/firebase";

export type StoredSessionMeta = {
  sessionId: string;
  fullPath: string;
  createdAt?: string;
};

export async function listUserSessions(uid: string): Promise<StoredSessionMeta[]> {
  const userFolderRef = ref(storage, `practiceSessions/${uid}/`);
  
  try {
    const listResult = await listAll(userFolderRef);
    
    const sessionMetas: StoredSessionMeta[] = listResult.items
      .filter(item => item.name.endsWith('.json'))
      .map(item => {
        const sessionId = item.name.replace('.json', '');
        return {
          sessionId,
          fullPath: item.fullPath,
          createdAt: undefined // Will be populated from JSON if needed
        };
      });

    return sessionMetas;
  } catch (error) {
    console.error('Failed to list sessions:', error);
    return [];
  }
}
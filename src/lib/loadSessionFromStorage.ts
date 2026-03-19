// src/lib/loadSessionFromStorage.ts

import { ref, getBytes } from "firebase/storage";
import { storage, auth } from "../firebase/firebase";

export async function loadSessionJson(uid: string, sessionId: string): Promise<any> {
  // Ensure user is authenticated
  if (!auth.currentUser) {
    throw new Error('User must be authenticated to load sessions');
  }

  const storagePath = `practiceSessions/${uid}/${sessionId}.json`;
  const storageRef = ref(storage, storagePath);
  
  try {
    // Use getBytes instead of fetch to avoid CORS
    const arrayBuffer = await getBytes(storageRef);
    const jsonString = new TextDecoder().decode(arrayBuffer);
    return JSON.parse(jsonString);
  } catch (error: any) {
    console.error('Firebase Storage error:', error);
    
    if (error?.code === 'storage/unauthorized') {
      throw new Error('Access denied. Please ensure you are logged in and have permission to access this session.');
    }
    
    throw new Error(`Failed to load session ${sessionId}: ${error?.message || error}`);
  }
}
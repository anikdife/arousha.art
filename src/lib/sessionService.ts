// src/lib/sessionService.ts

import { 
  doc, 
  collection, 
  addDoc, 
  updateDoc, 
  getDoc, 
  getDocs, 
  query, 
  where, 
  orderBy, 
  limit,
  serverTimestamp 
} from 'firebase/firestore';
import { db } from '../firebase/firebase';
import { PracticeSessionDoc } from '../types/practiceSession';

const COLLECTION = 'practiceSessions';

export async function createSession(sessionData: Omit<PracticeSessionDoc, 'createdAt' | 'updatedAt'>): Promise<string> {
  const docRef = await addDoc(collection(db, COLLECTION), {
    ...sessionData,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
  
  // Update with the actual document ID as sessionId
  await updateDoc(docRef, { sessionId: docRef.id });
  
  return docRef.id;
}

export async function updateSession(sessionId: string, updates: Partial<PracticeSessionDoc>): Promise<void> {
  const docRef = doc(db, COLLECTION, sessionId);
  await updateDoc(docRef, {
    ...updates,
    updatedAt: serverTimestamp()
  });
}

export async function getSession(sessionId: string): Promise<PracticeSessionDoc | null> {
  const docRef = doc(db, COLLECTION, sessionId);
  const docSnap = await getDoc(docRef);
  
  if (docSnap.exists()) {
    return docSnap.data() as PracticeSessionDoc;
  }
  
  return null;
}

export async function getUserSessions(ownerUid: string): Promise<PracticeSessionDoc[]> {
  const q = query(
    collection(db, COLLECTION),
    where('ownerUid', '==', ownerUid),
    orderBy('updatedAt', 'desc')
  );
  
  const querySnapshot = await getDocs(q);
  return querySnapshot.docs.map(doc => doc.data() as PracticeSessionDoc);
}

export async function getLatestDraftSession(ownerUid: string): Promise<PracticeSessionDoc | null> {
  const q = query(
    collection(db, COLLECTION),
    where('ownerUid', '==', ownerUid),
    where('status', '==', 'draft'),
    orderBy('updatedAt', 'desc'),
    limit(1)
  );
  
  const querySnapshot = await getDocs(q);
  
  if (querySnapshot.docs.length > 0) {
    return querySnapshot.docs[0].data() as PracticeSessionDoc;
  }
  
  return null;
}

export async function submitSession(
  sessionId: string, 
  updates: { 
    pages: PracticeSessionDoc['pages']; 
    score: PracticeSessionDoc['score'] 
  }
): Promise<void> {
  const docRef = doc(db, COLLECTION, sessionId);
  await updateDoc(docRef, {
    ...updates,
    status: 'submitted',
    submittedAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
}

export async function enableSharing(sessionId: string, shareId: string): Promise<void> {
  const docRef = doc(db, COLLECTION, sessionId);
  await updateDoc(docRef, {
    'share.enabled': true,
    'share.shareId': shareId,
    'share.public': true,
    updatedAt: serverTimestamp()
  });
}

export async function getSharedSession(shareId: string): Promise<PracticeSessionDoc | null> {
  const q = query(
    collection(db, COLLECTION),
    where('share.shareId', '==', shareId),
    where('share.enabled', '==', true),
    where('share.public', '==', true)
  );
  
  const querySnapshot = await getDocs(q);
  
  if (querySnapshot.docs.length > 0) {
    return querySnapshot.docs[0].data() as PracticeSessionDoc;
  }
  
  return null;
}
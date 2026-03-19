// src/firebase/firebase.ts

import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { getFunctions } from 'firebase/functions';

const requiredEnv = (name: string): string => {
  const value = process.env[name as keyof NodeJS.ProcessEnv];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
};

const firebaseConfig = {
  apiKey: requiredEnv('REACT_APP_FIREBASE_API_KEY'),
  authDomain: requiredEnv('REACT_APP_FIREBASE_AUTH_DOMAIN'),
  projectId: requiredEnv('REACT_APP_FIREBASE_PROJECT_ID'),
  storageBucket: requiredEnv('REACT_APP_FIREBASE_STORAGE_BUCKET'),
  messagingSenderId: requiredEnv('REACT_APP_FIREBASE_MESSAGING_SENDER_ID'),
  appId: requiredEnv('REACT_APP_FIREBASE_APP_ID')
};


const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const functions = getFunctions(app);
// src/firebase/firebase.ts

import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { getFunctions } from 'firebase/functions';

const firebaseConfig = {
  apiKey: "REDACTED",
  authDomain: "matha-6878d.firebaseapp.com",
  projectId: "matha-6878d",
  storageBucket: "matha-6878d.firebasestorage.app",
  messagingSenderId: "528799786012",
  appId: "1:528799786012:web:44f2bb5de0398166702bd9"
};


const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const functions = getFunctions(app);
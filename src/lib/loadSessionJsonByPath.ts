// src/lib/loadSessionJsonByPath.ts

import { getBytes, ref } from 'firebase/storage';
import { storage } from '../firebase/firebase';

export async function loadSessionJsonByStoragePath(storagePath: string): Promise<any> {
  console.log(storagePath);
  const bytes = await getBytes(ref(storage, storagePath));
  const text = new TextDecoder('utf-8').decode(bytes);
  return JSON.parse(text);
}

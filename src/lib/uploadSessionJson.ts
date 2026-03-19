// src/lib/uploadSessionJson.ts

import { ref, uploadBytes } from "firebase/storage";
import { storage } from "../firebase/firebase";

interface UploadSessionParams {
  uid: string;
  sessionId: string;
  data: any;
}

export async function uploadSessionJson(params: UploadSessionParams): Promise<string> {
  const { uid, sessionId, data } = params;
  
  const storagePath = `practiceSessions/${uid}/${sessionId}.json`;
  const storageRef = ref(storage, storagePath);
  
  const jsonString = JSON.stringify(data);
  const jsonBlob = new Blob([jsonString], { type: 'application/json' });
  
  await uploadBytes(storageRef, jsonBlob, {
    contentType: 'application/json'
  });
  
  return storagePath;
}
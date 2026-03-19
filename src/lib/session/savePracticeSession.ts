// src/lib/session/savePracticeSession.ts

import { uploadSessionJson } from '../uploadSessionJson';
import { writeSessionIndex } from './sessionIndexWriter';

export async function savePracticeSession(params: {
  studentUid: string;
  sessionId: string;
  topic: string;
  year: number;
  section: string;
  score: { total: number; correct: number; percentage: number };
  sessionJson: any;
}): Promise<{ storagePath: string }> {
  const { studentUid, sessionId, topic, year, section, score, sessionJson } = params;

  const storagePath = await uploadSessionJson({ uid: studentUid, sessionId, data: sessionJson });
  await writeSessionIndex({ studentUid, sessionId, topic, year, section, score, storagePath });

  return { storagePath };
}

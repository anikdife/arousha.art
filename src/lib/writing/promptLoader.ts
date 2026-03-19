import { getBytes, getDownloadURL, ref } from 'firebase/storage';
import { auth, storage } from '../../firebase/firebase';
import { hashSeedToIndex } from '../readingMagazine/seed';
import type { WritingIndexItemY3, WritingPromptType } from './storageIndex';

export type WritingPromptY3 = {
  promptId: string;
  year: 3;
  type: WritingPromptType;
  title: string;
  taskIntro: string;
  guidance: string[];
  remember: string[];
  version: number;
};

function decodeUtf8(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  try {
    return new TextDecoder('utf-8').decode(view);
  } catch {
    let out = '';
    for (let i = 0; i < view.length; i++) out += String.fromCharCode(view[i]);
    return out;
  }
}

async function ensureAuthTokenReady(): Promise<void> {
  const user = auth.currentUser;
  if (!user) return;
  try {
    await user.getIdToken();
  } catch {
    // ignore
  }
}

export function randomPickPrompt(items: WritingIndexItemY3[], seed: string): WritingIndexItemY3 | null {
  const list = items ?? [];
  if (list.length === 0) return null;
  const idx = hashSeedToIndex(String(seed ?? ''), list.length);
  return list[idx] ?? list[0] ?? null;
}

function cleanString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function cleanStringList(value: unknown, min: number, max: number): string[] {
  if (!Array.isArray(value)) return [];
  const out = value
    .map((v) => cleanString(v))
    .filter((v) => v.length > 0);
  if (out.length < min || out.length > max) return [];
  return out;
}

export function validateWritingPromptY3(value: unknown): { ok: true; prompt: WritingPromptY3 } | { ok: false; error: string } {
  if (!value || typeof value !== 'object') return { ok: false, error: 'JSON must be an object.' };

  const promptId = cleanString((value as any).promptId);
  const year = (value as any).year;
  const type = (value as any).type;
  const title = cleanString((value as any).title);
  const taskIntro = cleanString((value as any).taskIntro);
  const guidance = cleanStringList((value as any).guidance, 3, 6);
  const remember = cleanStringList((value as any).remember, 4, 7);
  const version = (value as any).version;

  if (!promptId) return { ok: false, error: 'promptId is required.' };
  if (year !== 3) return { ok: false, error: 'year must be 3.' };
  if (type !== 'persuasive' && type !== 'narrative' && type !== 'imaginative') {
    return { ok: false, error: 'type must be persuasive, narrative, or imaginative.' };
  }
  if (!title) return { ok: false, error: 'title is required.' };
  if (!taskIntro) return { ok: false, error: 'taskIntro is required.' };
  if (guidance.length === 0) return { ok: false, error: 'guidance must be 3–6 non-empty bullets.' };
  if (remember.length === 0) return { ok: false, error: 'remember must be 4–7 non-empty bullets.' };
  if (typeof version !== 'number' || !Number.isFinite(version)) return { ok: false, error: 'version must be a number.' };

  return {
    ok: true,
    prompt: {
      promptId,
      year: 3,
      type,
      title,
      taskIntro,
      guidance,
      remember,
      version,
    },
  };
}

export async function loadPromptById(params: {
  item: WritingIndexItemY3;
  expectedPromptId?: string;
}): Promise<{ prompt: WritingPromptY3; imageUrl: string }> {
  await ensureAuthTokenReady();

  const { item, expectedPromptId } = params;

  const bytes = await getBytes(ref(storage, item.jsonPath));
  const text = decodeUtf8(bytes);
  const parsed = JSON.parse(text);
  const validated = validateWritingPromptY3(parsed);
  if (!validated.ok) throw new Error(validated.error);

  if (validated.prompt.promptId !== item.promptId) {
    throw new Error('promptId mismatch between index and JSON.');
  }

  if (expectedPromptId && validated.prompt.promptId !== expectedPromptId) {
    throw new Error('promptId mismatch.');
  }

  const imageUrl = await getDownloadURL(ref(storage, item.imagePath));

  return { prompt: validated.prompt, imageUrl };
}

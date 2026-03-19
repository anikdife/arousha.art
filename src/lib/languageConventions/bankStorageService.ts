import { getBytes, ref, uploadBytes } from 'firebase/storage';
import { auth, storage } from '../../firebase/firebase';
import type { LCQuestion } from './types';

export type BankFile = { version: number; questions: LCQuestion[] };
export type BanksBundle = { version: number; bankCount: number; banks: BankFile[] };

const BASE_PATH = 'adminBanks/y3/language-conventions';
const META_PATH = `${BASE_PATH}/meta.json`;

function bankPath(bankIndex: number): string {
  return `${BASE_PATH}/lc_bank_${bankIndex}.json`;
}

type MetaFile = { version: number; updatedAt: string; updatedByUid: string; bankCount?: number };

let cachedBundle: BanksBundle | null = null;
let inFlightPromise: Promise<BanksBundle> | null = null;

let cachedMeta: { version: number; bankCount: number } | null = null;
let cachedMetaCheckedAtMs = 0;

const META_CACHE_TTL_MS = 5 * 60 * 1000;

async function ensureAuthTokenReady(): Promise<void> {
  const user = auth.currentUser;
  if (!user) return;
  try {
    // Prime/refresh ID token so Storage requests are authenticated.
    await user.getIdToken();
  } catch {
    // If token fetch fails, Storage will still throw a meaningful error.
  }
}

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function isChoiceTuple4(value: unknown): value is [string, string, string, string] {
  return Array.isArray(value) && value.length === 4 && value.every((v) => typeof v === 'string');
}

function isCorrectIndex(value: unknown): value is 0 | 1 | 2 | 3 {
  return value === 0 || value === 1 || value === 2 || value === 3;
}

function coerceQuestion(value: unknown): LCQuestion | null {
  if (!isRecord(value)) return null;
  if (!isString(value.id)) return null;
  if (!isString(value.type)) return null;
  if (!isString(value.prompt)) return null;
  if (!isString(value.skill)) return null;

  if (value.type === 'mcq') {
    if (!isChoiceTuple4(value.choices)) return null;
    if (!isCorrectIndex(value.correctIndex)) return null;
    const sentence = isString(value.sentence) ? value.sentence : undefined;
    return {
      id: value.id,
      type: 'mcq',
      prompt: value.prompt,
      sentence,
      choices: value.choices,
      correctIndex: value.correctIndex,
      skill: value.skill as any,
    };
  }

  if (value.type === 'spell') {
    if (!isString(value.sentenceWithError)) return null;
    if (!isString(value.errorToken)) return null;
    if (!isString(value.correctToken)) return null;
    return {
      id: value.id,
      type: 'spell',
      prompt: value.prompt,
      sentenceWithError: value.sentenceWithError,
      errorToken: value.errorToken,
      correctToken: value.correctToken,
      skill: 'spelling',
    };
  }

  if (value.type === 'selectIncorrect') {
    if (!isString(value.sentence)) return null;
    if (!Array.isArray(value.tokens) || !value.tokens.every((t) => typeof t === 'string')) return null;
    if (typeof value.incorrectIndex !== 'number') return null;
    if (!isString(value.correctToken)) return null;
    return {
      id: value.id,
      type: 'selectIncorrect',
      prompt: value.prompt,
      sentence: value.sentence,
      tokens: value.tokens,
      incorrectIndex: value.incorrectIndex,
      correctToken: value.correctToken,
      skill: value.skill as any,
    };
  }

  return null;
}

function validateQuestionsArray(value: unknown): LCQuestion[] {
  if (!Array.isArray(value)) return [];
  const out: LCQuestion[] = [];
  const seen = new Set<string>();

  for (const row of value) {
    const q = coerceQuestion(row);
    if (!q) continue;
    if (seen.has(q.id)) continue;
    seen.add(q.id);
    out.push(q);
  }

  return out;
}

async function downloadJson(path: string, opts?: { missingOk?: boolean }): Promise<unknown | null> {
  await ensureAuthTokenReady();
  try {
    const bytes = await getBytes(ref(storage, path));
    const text = decodeUtf8(bytes);
    return JSON.parse(text);
  } catch (e: any) {
    const code = String(e?.code ?? '');
    if (code === 'storage/object-not-found') {
      if (opts?.missingOk) return null;
      throw new Error(
        `Missing file in Firebase Storage: ${path}. ` +
          `An owner must upload it (Owner → LC Banks) before students can load practice.`
      );
    }
    throw e;
  }
}

async function downloadBankFile(index: number, version: number): Promise<BankFile> {
  const parsed = await downloadJson(bankPath(index));
  const questions = validateQuestionsArray(parsed);
  return { version, questions };
}

async function downloadMeta(): Promise<MetaFile | null> {
  const parsed = await downloadJson(META_PATH, { missingOk: true });
  if (!parsed || !isRecord(parsed)) return null;
  if (typeof parsed.version !== 'number') return null;
  if (!isString(parsed.updatedAt)) return null;
  if (!isString(parsed.updatedByUid)) return null;
  return parsed as MetaFile;
}

export async function loadLanguageConventionsMeta(): Promise<{ version: number; bankCount: number }> {
  const now = Date.now();
  if (cachedMeta !== null && now - cachedMetaCheckedAtMs < META_CACHE_TTL_MS) {
    return cachedMeta;
  }

  const meta = await downloadMeta();
  const resolved = {
    version: meta?.version ?? 1,
    bankCount: typeof meta?.bankCount === 'number' && meta.bankCount >= 1 ? Math.floor(meta.bankCount) : 3,
  };
  cachedMeta = resolved;
  cachedMetaCheckedAtMs = now;
  return resolved;
}

export async function loadLanguageConventionsMetaVersion(): Promise<number> {
  const meta = await loadLanguageConventionsMeta();
  return meta.version;
}

export async function loadLanguageConventionsBank(bankIndex: number): Promise<BankFile> {
  const { version } = await loadLanguageConventionsMeta();
  return downloadBankFile(bankIndex, version);
}

export function invalidateLanguageConventionsBanksCache(): void {
  cachedBundle = null;
  inFlightPromise = null;
  cachedMeta = null;
  cachedMetaCheckedAtMs = 0;
}

export async function loadLanguageConventionsBanks(): Promise<BanksBundle> {
  if (cachedBundle) return cachedBundle;
  if (inFlightPromise) return inFlightPromise;

  inFlightPromise = (async () => {
    const meta = await loadLanguageConventionsMeta();

    const banks = await Promise.all(
      Array.from({ length: meta.bankCount }, (_, i) => downloadBankFile(i + 1, meta.version))
    );

    if (!banks.some((b) => (b.questions ?? []).length > 0)) {
      throw new Error('Language Conventions banks are empty or malformed (no valid questions)');
    }

    const bundle: BanksBundle = { version: meta.version, bankCount: meta.bankCount, banks };
    cachedBundle = bundle;
    return bundle;
  })();

  try {
    return await inFlightPromise;
  } finally {
    inFlightPromise = null;
  }
}

export async function saveLanguageConventionsBank(
  bankIndex: number,
  questions: LCQuestion[]
): Promise<void> {
  const payload = JSON.stringify(questions, null, 2);
  const bytes = new TextEncoder().encode(payload);
  await ensureAuthTokenReady();
  await uploadBytes(ref(storage, bankPath(bankIndex)), bytes, {
    contentType: 'application/json; charset=utf-8',
  });
}

export async function saveLanguageConventionsMeta(params: {
  version: number;
  updatedAt: string;
  updatedByUid: string;
  bankCount?: number;
}): Promise<void> {
  const existing = await loadLanguageConventionsMeta();
  const payload = JSON.stringify({ ...params, bankCount: params.bankCount ?? existing.bankCount }, null, 2);
  const bytes = new TextEncoder().encode(payload);
  await ensureAuthTokenReady();
  await uploadBytes(ref(storage, META_PATH), bytes, {
    contentType: 'application/json; charset=utf-8',
  });
}

export async function addLanguageConventionsBank(params: {
  updatedAt: string;
  updatedByUid: string;
}): Promise<{ newBankIndex: number; bankCount: number; version: number }> {
  const meta = await loadLanguageConventionsMeta();
  const nextCount = meta.bankCount + 1;
  const newBankIndex = nextCount;

  // Create the new bank file as an empty array. It won't be used in practice until it has questions.
  await saveLanguageConventionsBank(newBankIndex, []);

  await saveLanguageConventionsMeta({
    version: meta.version,
    updatedAt: params.updatedAt,
    updatedByUid: params.updatedByUid,
    bankCount: nextCount,
  });

  invalidateLanguageConventionsBanksCache();
  return { newBankIndex, bankCount: nextCount, version: meta.version };
}

export function getLanguageConventionsBankPaths(): { base: string; meta: string; bankPath: (bankIndex: number) => string } {
  return { base: BASE_PATH, meta: META_PATH, bankPath };
}

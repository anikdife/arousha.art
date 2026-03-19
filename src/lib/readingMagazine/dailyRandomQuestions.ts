export const DAILY_RM_PRACTICE_QUESTIONS_KEY_PREFIX = 'rm:y3:reading-magazine:dailyPracticeQIds:v1:';

function safeGetStorage(): Storage | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) return window.localStorage;
  } catch {
    // ignore
  }
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) return window.sessionStorage;
  } catch {
    // ignore
  }
  return null;
}

function safeParseJson<T>(value: string | null): T | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function clampInt(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

function shuffleInPlace<T>(arr: T[], rng: () => number): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const r = rng();
    const j = clampInt(Math.floor((Number.isFinite(r) ? r : 0) * (i + 1)), 0, i);
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
}

export function getOrChooseDailyRandomQuestionIds(params: {
  isoDate: string;
  storyId: string;
  updatedAt: string;
  allQuestionIds: string[];
  count: number;
  rng?: () => number;
  keyPrefix?: string;
}): string[] {
  const {
    isoDate,
    storyId,
    updatedAt,
    allQuestionIds,
    count,
    rng = Math.random,
    keyPrefix = DAILY_RM_PRACTICE_QUESTIONS_KEY_PREFIX,
  } = params;

  const ids = (allQuestionIds ?? []).filter(Boolean);
  const desired = Math.max(0, Math.floor(count));

  if (desired === 0 || ids.length === 0) return [];
  if (ids.length <= desired) return ids;

  const storage = safeGetStorage();
  const key = `${keyPrefix}${isoDate}:${storyId}:${updatedAt ?? ''}`;

  if (storage) {
    const cached = safeParseJson<string[]>(storage.getItem(key));
    if (Array.isArray(cached) && cached.length === desired && cached.every((id) => ids.includes(id))) {
      return cached;
    }
  }

  const shuffled = ids.slice();
  shuffleInPlace(shuffled, rng);
  const picked = shuffled.slice(0, desired);

  if (storage) {
    try {
      storage.setItem(key, JSON.stringify(picked));
    } catch {
      // ignore
    }
  }

  return picked;
}

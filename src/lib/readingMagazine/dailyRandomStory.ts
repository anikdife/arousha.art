export const DAILY_RM_STORY_KEY_PREFIX = 'rm:y3:reading-magazine:dailyStoryId:v1:';

export type StoryIdLike = { storyId: string };

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

function clampIndex(index: number, length: number): number {
  if (length <= 0) return 0;
  const n = index % length;
  return n < 0 ? n + length : n;
}

export function pickRandomIndex(length: number, rng: () => number = Math.random): number {
  if (length <= 0) return 0;
  const raw = rng();
  const n = Number.isFinite(raw) ? raw : 0;
  const idx = Math.floor(n * length);
  return clampIndex(idx, length);
}

/**
 * Picks a random storyId for a given date and persists it so Reading + Practice stay in sync.
 * If storage is unavailable, it still returns a random storyId but cannot persist across tabs.
 */
export function getOrChooseDailyRandomStoryId(
  stories: StoryIdLike[],
  isoDate: string,
  rng: () => number = Math.random,
  keyPrefix: string = DAILY_RM_STORY_KEY_PREFIX
): string {
  const list = stories ?? [];
  if (list.length === 0) return '';

  const storage = safeGetStorage();
  const key = `${keyPrefix}${isoDate}`;

  if (storage) {
    try {
      const cached = storage.getItem(key);
      if (cached && list.some((s) => s.storyId === cached)) return cached;
    } catch {
      // ignore
    }
  }

  const idx = pickRandomIndex(list.length, rng);
  const selected = list[idx]?.storyId ?? list[0]!.storyId;

  if (storage) {
    try {
      storage.setItem(key, selected);
    } catch {
      // ignore
    }
  }

  return selected;
}

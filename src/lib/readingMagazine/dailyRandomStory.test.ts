import { DAILY_RM_STORY_KEY_PREFIX, getOrChooseDailyRandomStoryId } from './dailyRandomStory';

describe('getOrChooseDailyRandomStoryId', () => {
  const date = '2026-01-01';

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('picks a random storyId and caches it for the date', () => {
    const stories = [{ storyId: 'a' }, { storyId: 'b' }];

    const first = getOrChooseDailyRandomStoryId(stories, date, () => 0.9);
    expect(first).toBe('b');

    const second = getOrChooseDailyRandomStoryId(stories, date, () => 0.01);
    expect(second).toBe('b');

    expect(localStorage.getItem(`${DAILY_RM_STORY_KEY_PREFIX}${date}`)).toBe('b');
  });

  it('re-picks if cached storyId is not in the list', () => {
    const stories = [{ storyId: 'a' }, { storyId: 'b' }];
    localStorage.setItem(`${DAILY_RM_STORY_KEY_PREFIX}${date}`, 'missing');

    const picked = getOrChooseDailyRandomStoryId(stories, date, () => 0.01);
    expect(picked).toBe('a');
  });

  it('returns empty string when no stories exist', () => {
    const picked = getOrChooseDailyRandomStoryId([], date, () => 0.5);
    expect(picked).toBe('');
  });
});

import {
  DAILY_RM_PRACTICE_QUESTIONS_KEY_PREFIX,
  getOrChooseDailyRandomQuestionIds,
} from './dailyRandomQuestions';

describe('getOrChooseDailyRandomQuestionIds', () => {
  const isoDate = '2026-01-01';
  const storyId = 's1';
  const updatedAt = '2026-01-01T00:00:00.000Z';

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('returns all ids when count >= length', () => {
    const allQuestionIds = ['q1', 'q2', 'q3'];
    const picked = getOrChooseDailyRandomQuestionIds({ isoDate, storyId, updatedAt, allQuestionIds, count: 5 });
    expect(picked).toEqual(allQuestionIds);
  });

  it('picks N ids and caches them for the day/story', () => {
    const allQuestionIds = ['q1', 'q2', 'q3', 'q4'];

    const picked1 = getOrChooseDailyRandomQuestionIds({
      isoDate,
      storyId,
      updatedAt,
      allQuestionIds,
      count: 2,
      rng: () => 0.99,
    });

    expect(picked1).toHaveLength(2);
    expect(new Set(picked1).size).toBe(2);

    const picked2 = getOrChooseDailyRandomQuestionIds({
      isoDate,
      storyId,
      updatedAt,
      allQuestionIds,
      count: 2,
      rng: () => 0.01,
    });

    expect(picked2).toEqual(picked1);

    const key = `${DAILY_RM_PRACTICE_QUESTIONS_KEY_PREFIX}${isoDate}:${storyId}:${updatedAt}`;
    expect(JSON.parse(localStorage.getItem(key) || '[]')).toEqual(picked1);
  });

  it('re-picks if cached ids are not valid anymore', () => {
    const allQuestionIds = ['q1', 'q2', 'q3', 'q4'];
    const key = `${DAILY_RM_PRACTICE_QUESTIONS_KEY_PREFIX}${isoDate}:${storyId}:${updatedAt}`;
    localStorage.setItem(key, JSON.stringify(['missing', 'q1']));

    const picked = getOrChooseDailyRandomQuestionIds({
      isoDate,
      storyId,
      updatedAt,
      allQuestionIds,
      count: 2,
      rng: () => 0.5,
    });

    expect(picked).toHaveLength(2);
    expect(picked.every((id) => allQuestionIds.includes(id))).toBe(true);
  });
});

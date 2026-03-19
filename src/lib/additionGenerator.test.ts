import { generateAdditionPage, validateProblem } from './additionGenerator';

describe('additionGenerator', () => {
  it('is deterministic for same seed', () => {
    const seed = 'test-seed-1';
    const a = generateAdditionPage({ seed, count: 10, difficulty: 'easy' });
    const b = generateAdditionPage({ seed, count: 10, difficulty: 'easy' });
    expect(JSON.stringify(a)).toEqual(JSON.stringify(b));
  });

  it('generates valid problems', () => {
    const seed = 'test-seed-2';
    const list = generateAdditionPage({ seed, count: 50, difficulty: 'medium' });
    for (const p of list) {
      expect(() => validateProblem(p)).not.toThrow();
    }
  });
});

import {
  generateMultiplicationPage,
  evaluateMultiplicationAnswer,
  stableHashSeed,
  makeRng,
  MultiplicationProblem,
} from './multiplicationGenerator';

function canonicalPair(a: number, b: number): string {
  const x = Math.min(a, b);
  const y = Math.max(a, b);
  return `${x}x${y}`;
}

describe('multiplicationGenerator', () => {
  test('stableHashSeed + makeRng are deterministic', () => {
    const seed = stableHashSeed('abc');
    const rng1 = makeRng(seed);
    const rng2 = makeRng(seed);

    const seq1 = Array.from({ length: 10 }, () => rng1());
    const seq2 = Array.from({ length: 10 }, () => rng2());

    expect(seq1).toEqual(seq2);
  });

  test('generateMultiplicationPage is deterministic for same seedKey', () => {
    const a = generateMultiplicationPage({ difficulty: 'easy', count: 12, seedKey: 'u1:2025-12-30:0' });
    const b = generateMultiplicationPage({ difficulty: 'easy', count: 12, seedKey: 'u1:2025-12-30:0' });

    expect(a).toEqual(b);
  });

  test('uniqueness constraint avoids repeated factor pairs (commutative)', () => {
    const page = generateMultiplicationPage({
      difficulty: 'medium',
      count: 30,
      seedKey: 'u1:2025-12-30:uniq',
      includeKinds: {
        FACT: 6,
        MISSING_FACTOR: 4,
        ARRAY_GROUPS: 4,
        WORD_PROBLEM: 4,
        REPEATED_ADDITION: 2,
        EQUIVALENCE_CHOICE: 2,
      },
      ensureUniquenessWithinPage: true,
      allowZero: true,
      allowOne: true,
    });

    const seen = new Set<string>();

    for (const p of page.problems) {
      let a: number | null = typeof p.a === 'number' ? p.a : null;
      let b: number | null = typeof p.b === 'number' ? p.b : null;

      if ((a === null || b === null) && p.kind === 'MISSING_FACTOR' && typeof p.total === 'number') {
        if (a !== null && b === null) {
          b = a === 0 ? 0 : p.total / a;
        } else if (b !== null && a === null) {
          a = b === 0 ? 0 : p.total / b;
        }
      }

      if (a !== null && b !== null) {
        const key = canonicalPair(a, b);
        expect(seen.has(key)).toBe(false);
        seen.add(key);
      }
    }
  });

  test('word problems avoid obvious singular/plural mistakes for 1', () => {
    const page = generateMultiplicationPage({
      difficulty: 'easy',
      count: 25,
      seedKey: 'u1:2025-12-30:words',
      includeKinds: { WORD_PROBLEM: 10 },
      allowZero: false,
      allowOne: true,
    });

    const wordPrompts = page.problems.filter((p) => p.kind === 'WORD_PROBLEM').map((p) => p.prompt);
    expect(wordPrompts.length).toBeGreaterThan(0);

    // If we ever see "1 <noun>s" for common nouns, that's a grammar failure.
    // This is a heuristic check against our noun sets.
    const badPatterns = [
      /\b1\s+bags\b/i,
      /\b1\s+cars\b/i,
      /\b1\s+students\b/i,
      /\b1\s+boxes\b/i,
      /\b1\s+plates\b/i,
      /\b1\s+shelves\b/i,
      /\b1\s+packets\b/i,
      /\b1\s+rows\b/i,
      /\b1\s+trays\b/i,
      /\b1\s+teams\b/i,
      /\b1\s+buses\b/i,
      /\b1\s+tables\b/i,
      /\b1\s+apples\b/i,
      /\b1\s+pencils\b/i,
      /\b1\s+cupcakes\b/i,
      /\b1\s+books\b/i,
      /\b1\s+stickers\b/i,
      /\b1\s+chairs\b/i,
      /\b1\s+eggs\b/i,
      /\b1\s+players\b/i,
      /\b1\s+children\b/i,
    ];

    for (const prompt of wordPrompts) {
      for (const re of badPatterns) {
        expect(re.test(prompt)).toBe(false);
      }
    }
  });

  test('evaluateMultiplicationAnswer parses strictly', () => {
    const problem: MultiplicationProblem = {
      id: 't1',
      kind: 'FACT',
      a: 3,
      b: 4,
      total: 12,
      answer: 12,
      prompt: '3 × 4 = ?',
    };

    expect(evaluateMultiplicationAnswer(problem, ' 012 ').ok).toBe(true);
    expect(evaluateMultiplicationAnswer(problem, '12').ok).toBe(true);

    expect(evaluateMultiplicationAnswer(problem, '').ok).toBe(false);
    expect(evaluateMultiplicationAnswer(problem, '  ').ok).toBe(false);
    expect(evaluateMultiplicationAnswer(problem, '12.0').ok).toBe(false);
    expect(evaluateMultiplicationAnswer(problem, '12a').ok).toBe(false);
  });
});

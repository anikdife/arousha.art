import { generateGeometryPage } from './generateGeometryPage';

describe('generateGeometryPage', () => {
  test('is deterministic for same seed', () => {
    const a = generateGeometryPage(12345, 9);
    const b = generateGeometryPage(12345, 9);
    expect(b).toEqual(a);
  });

  test('produces valid problems (MCQ single correct, input integer)', () => {
    const page = generateGeometryPage(42, 12);
    expect(page.problems).toHaveLength(12);

    let prevTemplateKey: string | null = null;

    for (const p of page.problems) {
      expect(p.marks).toBe(1);
      expect(p.metadata.topic).toBe('geometry');
      expect(p.metadata.yearLevel).toBe(3);

      // Avoid repeating the same question pattern twice in a row.
      if (prevTemplateKey) expect(p.metadata.templateKey).not.toBe(prevTemplateKey);
      prevTemplateKey = p.metadata.templateKey;

      if (p.type === 'multiple-choice') {
        expect(Array.isArray(p.options)).toBe(true);
        const ids = (p.options ?? []).map((o) => o.id);
        expect(new Set(ids).size).toBe(ids.length);
        expect(ids).toContain(p.correctAnswer.value);
      }

      if (p.type === 'input') {
        expect(/^-?\d+$/.test(p.correctAnswer.value.trim())).toBe(true);
      }
    }
  });
  
  test('does not produce duplicate MCQ option texts (avoids ambiguous grading)', () => {
    // Try a bunch of seeds to catch edge cases like 0 sides/corners.
    for (let seed = 1; seed <= 200; seed++) {
      const page = generateGeometryPage(seed, 8);
      for (const p of page.problems) {
        if (p.type !== 'multiple-choice') continue;
        const texts = (p.options ?? []).map((o) => o.text);
        expect(new Set(texts).size).toBe(texts.length);
      }
    }
  });
});

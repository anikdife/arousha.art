// src/lib/dataProbability/sessionBuild.ts

import type { Page, Question } from './types';
import { createRng } from './rng';
import { generateQuestion } from './generators';

export function buildPage(params: { pageSeed: string; pageIndex: number; questionCount: number }): Page {
  const { pageSeed, pageIndex, questionCount } = params;

  const rng = createRng(pageSeed);

  // Balanced mix: 5 data + 3 probability for 8 questions.
  const schedule = Array.from({ length: questionCount }, (_, i) => {
    if (questionCount === 8) return i < 5 ? 'data' : 'probability';
    // Otherwise: alternate and keep a slight bias to data.
    return i % 3 === 2 ? 'probability' : 'data';
  }) as Array<'data' | 'probability'>;

  rng.shuffle(schedule);

  const questions: Question[] = [];
  const templateSeen = new Set<string>();

  for (let i = 0; i < schedule.length; i++) {
    const domain = schedule[i];

    let attempt = 0;
    while (attempt < 50) {
      const q = generateQuestion(`${pageSeed}-q${i}-a${attempt}`, i, domain);

      // Avoid repeating the exact same prompt pattern inside a page.
      const key = `${q.core.domain}:${q.visual.type}:${q.core.prompt}`;
      if (templateSeen.has(key)) {
        attempt++;
        continue;
      }

      // MCQ must have 4 choices; input must be integer.
      if (q.core.kind === 'mcq') {
        const ans: any = q.answer;
        if (!Array.isArray(ans.choices) || ans.choices.length !== 4) {
          throw new Error('Invalid MCQ choices');
        }
        if (!Number.isInteger(ans.correctIndex) || ans.correctIndex < 0 || ans.correctIndex > 3) {
          throw new Error('Invalid MCQ correctIndex');
        }
      } else {
        const ans: any = q.answer;
        if (!Number.isInteger(ans.correctValue)) throw new Error('Input correctValue must be integer');
      }

      templateSeen.add(key);
      questions.push(q);
      break;
    }

    if (questions.length !== i + 1) {
      throw new Error('Failed to generate non-repeating question');
    }
  }

  return {
    pageId: `data-probability-page-${pageIndex}`,
    questions,
    userAnswers: {},
  };
}

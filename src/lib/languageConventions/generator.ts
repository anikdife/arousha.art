// src/lib/languageConventions/generator.ts

import type { LCPage, LCQuestion, LCSkill } from './types';
import { createRng } from './rng';

function bySkill(q: LCQuestion, skill: LCSkill): boolean {
  return q.skill === skill;
}

function stablePageId(sessionSeed: string, pageIndex: number): string {
  return `${sessionSeed}-p${pageIndex + 1}`;
}

function dedupeById(questions: LCQuestion[]): LCQuestion[] {
  const seen = new Set<string>();
  const out: LCQuestion[] = [];
  for (const q of questions) {
    if (seen.has(q.id)) continue;
    seen.add(q.id);
    out.push(q);
  }
  return out;
}

export function buildNextPage(params: {
  sessionSeed: string;
  pageIndex: number;
  usedQuestionIds: Set<string>;
  bank: LCQuestion[];
  perPage?: number;
}): LCPage {
  const { sessionSeed, pageIndex, usedQuestionIds, bank: fullBank, perPage = 10 } = params;

  const seed = `${sessionSeed}-p${pageIndex}`;
  const rng = createRng(seed);

  const bank = fullBank.filter((q) => !usedQuestionIds.has(q.id));
  const spelling = bank.filter((q) => bySkill(q, 'spelling'));
  const punct = bank.filter((q) => bySkill(q, 'punctuation'));
  const grammar = bank.filter((q) => bySkill(q, 'grammar'));

  const picked: LCQuestion[] = [];

  // Try to include variety if available.
  const want = {
    spelling: Math.min(2, spelling.length),
    punctOrGrammar: Math.min(2, punct.length + grammar.length),
  };

  const punctOrGrammar = [...punct, ...grammar];

  const pickSome = (arr: LCQuestion[], count: number) => {
    if (count <= 0 || arr.length === 0) return;
    const shuffled = rng.shuffle(arr.slice());
    for (const q of shuffled) {
      if (picked.length >= perPage) break;
      if (picked.find((p) => p.id === q.id)) continue;
      picked.push(q);
      if (picked.filter((p) => p.skill === q.skill).length >= count) break;
    }
  };

  pickSome(spelling, want.spelling);
  pickSome(punctOrGrammar, want.punctOrGrammar);

  if (picked.length < perPage) {
    const remaining = bank.slice();
    rng.shuffle(remaining);
    for (const q of remaining) {
      if (picked.length >= perPage) break;
      if (picked.some((p) => p.id === q.id)) continue;
      picked.push(q);
    }
  }

  const finalQs = dedupeById(picked).slice(0, perPage);

  for (const q of finalQs) usedQuestionIds.add(q.id);

  return {
    pageId: stablePageId(sessionSeed, pageIndex),
    questions: finalQs,
    userAnswers: {},
    graded: undefined,
  };
}

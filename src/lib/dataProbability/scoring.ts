// src/lib/dataProbability/scoring.ts

import type { Page, Question, SessionSummary } from './types';

export function gradeQuestion(question: Question, userValue: string | undefined): boolean {
  if (question.core.kind === 'mcq') {
    const idx = Number.parseInt(userValue ?? '', 10);
    if (!Number.isFinite(idx)) return false;
    const ans: any = question.answer;
    return idx === ans.correctIndex;
  }

  const n = Number.parseInt((userValue ?? '').trim(), 10);
  if (!Number.isFinite(n)) return false;
  const ans: any = question.answer;
  return n === ans.correctValue;
}

export function gradePages(pages: Page[]): Page[] {
  return pages.map((p) => {
    const graded: Record<string, boolean> = {};
    for (const q of p.questions) {
      graded[q.core.id] = gradeQuestion(q, p.userAnswers[q.core.id]);
    }
    return { ...p, graded };
  });
}

export function computeSummary(pages: Page[]): SessionSummary {
  const total = pages.reduce((s, p) => s + p.questions.length, 0);
  const correct = pages.reduce((s, p) => s + p.questions.filter((q) => p.graded?.[q.core.id]).length, 0);
  const percentage = total > 0 ? Math.round((correct / total) * 100) : 0;
  return { total, correct, percentage };
}

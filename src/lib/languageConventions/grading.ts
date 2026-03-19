// src/lib/languageConventions/grading.ts

import type { LCAnswer, LCPage, LCQuestion, LCSessionSummary } from './types';

function norm(s: string): string {
  return String(s ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

export function gradeQuestion(q: LCQuestion, ans: LCAnswer | undefined): boolean {
  if (!ans) return false;

  if (q.type === 'mcq') {
    if (ans.type !== 'mcq') return false;
    return ans.selectedIndex === q.correctIndex;
  }

  if (q.type === 'spell') {
    if (ans.type !== 'spell') return false;
    return norm(ans.text) === norm(q.correctToken);
  }

  if (q.type === 'selectIncorrect') {
    if (ans.type !== 'selectIncorrect') return false;
    return ans.selectedIndex === q.incorrectIndex;
  }

  return false;
}

export function gradePages(pages: LCPage[]): LCPage[] {
  return pages.map((p) => {
    const graded: Record<string, boolean> = {};
    for (const q of p.questions) {
      graded[q.id] = gradeQuestion(q, p.userAnswers[q.id]);
    }
    return { ...p, graded };
  });
}

export function computeSummary(pages: LCPage[]): LCSessionSummary {
  let total = 0;
  let correct = 0;

  for (const p of pages) {
    for (const q of p.questions) {
      total += 1;
      const ok = Boolean(p.graded?.[q.id]);
      if (ok) correct += 1;
    }
  }

  const percentage = total > 0 ? Math.round((correct / total) * 100) : 0;
  return { total, correct, percentage };
}

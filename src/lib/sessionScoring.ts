// src/lib/sessionScoring.ts

import { PracticeSessionDoc, ScoreSummary, PracticePage } from '../types/practiceSession';

export function computeScoreFromSession(session: PracticeSessionDoc): ScoreSummary {
  let total = 0;
  let correct = 0;

  for (const page of session.pages) {
    for (const problem of page.problems) {
      total++;
      
      const userAnswer = page.userAnswers[problem.id] || '';
      const parsedAnswer = parseInt(userAnswer, 10);
      
      if (!isNaN(parsedAnswer) && parsedAnswer === problem.expected) {
        correct++;
      }
    }
  }

  const percentage = total > 0 ? Math.round((correct / total) * 100) : 0;

  return {
    total,
    correct,
    percentage
  };
}

export function computeGradedAnswers(pages: PracticePage[]): PracticePage[] {
  return pages.map(page => {
    const graded: Record<string, boolean> = {};
    
    for (const problem of page.problems) {
      const userAnswer = page.userAnswers[problem.id] || '';
      const parsedAnswer = parseInt(userAnswer, 10);
      graded[problem.id] = !isNaN(parsedAnswer) && parsedAnswer === problem.expected;
    }

    return {
      ...page,
      graded
    };
  });
}
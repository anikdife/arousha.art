// src/lib/sessionMapper.ts

import { AnySubProblem as LibAnySubProblem, expectedAnswer } from './y3SubtractionGen';
import { PracticeSessionDoc, PracticePage, AnyProblem } from '../types/practiceSession';
import { GENERATOR_VERSION, APP_VERSION } from '../constants/version';

export function mapLibProblemToSessionProblem(libProblem: LibAnySubProblem): AnyProblem {
  if (libProblem.kind === 'numeric') {
    return {
      kind: 'numeric',
      id: libProblem.id,
      variant: libProblem.variant,
      a: libProblem.a,
      b: libProblem.b,
      expected: libProblem.expected
    };
  } else {
    return {
      kind: 'word',
      id: libProblem.id,
      category: libProblem.category,
      templateId: 'template-1', // simplified for now
      params: {
        A: libProblem.meta.A,
        B: libProblem.meta.B,
        result: libProblem.meta.result,
        nameA: libProblem.meta.nameA,
        nameB: libProblem.meta.nameB || '',
        item: libProblem.meta.item
      },
      text: libProblem.text,
      expected: libProblem.answer
    };
  }
}

export function mapSessionProblemToLibProblem(sessionProblem: AnyProblem): LibAnySubProblem {
  if (sessionProblem.kind === 'numeric') {
    return {
      kind: 'numeric',
      id: sessionProblem.id,
      variant: sessionProblem.variant as any,
      a: sessionProblem.a,
      b: sessionProblem.b,
      expected: sessionProblem.expected
    };
  } else {
    return {
      kind: 'word',
      id: sessionProblem.id,
      category: sessionProblem.category as any,
      difficulty: 'easy' as any,
      text: sessionProblem.text,
      answer: sessionProblem.expected,
      meta: {
        nameA: sessionProblem.params.nameA as string,
        nameB: sessionProblem.params.nameB as string,
        item: sessionProblem.params.item as string,
        A: sessionProblem.params.A as number,
        B: sessionProblem.params.B as number,
        result: sessionProblem.params.result as number
      }
    };
  }
}

export function mapLibPageToSessionPage(
  libPage: { pageId: string; problems: LibAnySubProblem[]; userAnswers: Record<string, string>; graded?: Record<string, boolean> },
  pageIndex: number
): PracticePage {
  return {
    pageId: libPage.pageId,
    pageIndex,
    problems: libPage.problems.map(mapLibProblemToSessionProblem),
    userAnswers: libPage.userAnswers,
    graded: libPage.graded
  };
}

export function createNewSession(
  ownerUid: string,
  initialPage: { pageId: string; problems: LibAnySubProblem[]; userAnswers: Record<string, string> }
): Omit<PracticeSessionDoc, 'createdAt' | 'updatedAt'> {
  return {
    sessionId: crypto.randomUUID(),
    ownerUid,
    year: 3,
    section: 'numeracy',
    topic: 'subtraction',
    status: 'draft',
    generatorVersion: GENERATOR_VERSION,
    appVersion: APP_VERSION,
    settings: {
      difficulty: 'easy',
      numericCountPerPage: 6,
      wordCountPerPage: 2
    },
    pages: [mapLibPageToSessionPage(initialPage, 0)]
  };
}
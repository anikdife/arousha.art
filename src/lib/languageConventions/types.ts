// src/lib/languageConventions/types.ts

export type LCSkill =
  | 'spelling'
  | 'punctuation'
  | 'grammar'
  | 'capitalisation'
  | 'sentence'
  | 'wordChoice';

export type LCMcqQuestion = {
  id: string;
  type: 'mcq';
  prompt: string;
  sentence?: string;
  choices: [string, string, string, string];
  correctIndex: 0 | 1 | 2 | 3;
  skill: LCSkill;
};

export type LCSpellCorrectQuestion = {
  id: string;
  type: 'spell';
  prompt: string;
  sentenceWithError: string;
  errorToken: string;
  correctToken: string;
  skill: 'spelling';
};

export type LCSelectIncorrectWordQuestion = {
  id: string;
  type: 'selectIncorrect';
  prompt: string;
  sentence: string;
  tokens: string[];
  incorrectIndex: number;
  correctToken: string;
  skill: 'spelling' | 'grammar' | 'wordChoice' | 'sentence' | 'punctuation' | 'capitalisation';
};

export type LCQuestion = LCMcqQuestion | LCSpellCorrectQuestion | LCSelectIncorrectWordQuestion;

export type LCAnswer =
  | { type: 'mcq'; selectedIndex: number }
  | { type: 'spell'; text: string }
  | { type: 'selectIncorrect'; selectedIndex: number };

export type LCPage = {
  pageId: string;
  pageIndex?: number;
  bankUsed?: number;
  questions: LCQuestion[];
  userAnswers: Record<string, LCAnswer | undefined>;
  graded?: Record<string, boolean>;
};

export type LCSessionSummary = { total: number; correct: number; percentage: number };

export type LCSession = {
  sessionId: string;
  topic: 'language-conventions';
  year: 3;
  seed: string;
  bankRotation?: string[];
  bankMetaVersion?: number;
  pageBankUsed?: Record<string, number>;
  selectedQuestionIdsByPageId?: Record<string, string[]>;
  createdAt: string;
  submittedAt?: string;
  pages: LCPage[];
  summary?: LCSessionSummary;
};

export type LCSessionIndexDoc = {
  sessionId: string;
  studentUid: string;
  topic: 'language-conventions';
  year: 3;
  section: 'language';
  status: 'submitted';
  submittedAt: any;
  score: LCSessionSummary;
  storagePath: string;
};

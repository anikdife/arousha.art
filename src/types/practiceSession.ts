// src/types/practiceSession.ts

export type Year = 3 | 5 | 7 | 9;
export type Section = "numeracy" | "reading" | "writing" | "language";
export type Topic = "subtraction";

export type SessionStatus = "draft" | "submitted";

export type NumericProblem = {
  kind: "numeric";
  id: string;
  variant: string;
  a: number | null;
  b: number | null;
  expected: number;
};

export type WordProblem = {
  kind: "word";
  id: string;
  category: string;
  templateId: string;
  params: Record<string, string | number | boolean | null>;
  text: string;
  expected: number;
};

export type AnyProblem = NumericProblem | WordProblem;

export type PracticePage = {
  pageId: string;
  pageIndex: number;
  problems: AnyProblem[];
  userAnswers: Record<string, string>;
  graded?: Record<string, boolean>;
};

export type ScoreSummary = {
  total: number;
  correct: number;
  percentage: number;
};

export type PracticeSessionDoc = {
  sessionId: string;
  ownerUid: string;
  year: Year;
  section: Section;
  topic: Topic;
  status: SessionStatus;
  generatorVersion: string;
  appVersion: string;

  createdAt: any;
  updatedAt: any;
  submittedAt?: any;

  settings: {
    difficulty: "easy" | "medium" | "hard";
    numericCountPerPage: number;
    wordCountPerPage: number;
  };

  pages: PracticePage[];
  score?: ScoreSummary;

  share?: {
    enabled: boolean;
    shareId: string;
    viewers?: string[];
    public?: boolean;
  };
};
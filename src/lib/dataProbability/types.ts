// src/lib/dataProbability/types.ts

export type DataProbTopic = 'data-probability';

export type Domain = 'data' | 'probability';

export type Difficulty = 1 | 2 | 3;

export type QuestionCore = {
  id: string;
  kind: 'mcq' | 'input';
  prompt: string;
  stem?: string;
  marks: 1;
  explanation?: string;
  difficulty: Difficulty;
  domain: Domain;
};

export type BarChartVisual = {
  type: 'barChart';
  title: string;
  xLabel?: string;
  yLabel?: string;
  categories: string[];
  values: number[];
  maxY: number;
};

export type PictureGraphVisual = {
  type: 'pictureGraph';
  title: string;
  keyLabel: string;
  keyValue: number;
  categories: string[];
  iconsPerCategory: number[];
};

export type LineGraphVisual = {
  type: 'lineGraph';
  title: string;
  xCategories: string[];
  yLabel: string;
  points: number[];
  maxY: number;
};

export type TableVisual = {
  type: 'table';
  title: string;
  headers: string[];
  rows: (string | number)[][];
};

export type SpinnerVisual = {
  type: 'spinner';
  title: string;
  sectors: { label: string; weight: number; colorKey: string }[];
  questionFocusLabel?: string;
};

export type BagVisual = {
  type: 'bag';
  title: string;
  items: { label: string; count: number }[];
};

export type Visual = BarChartVisual | PictureGraphVisual | LineGraphVisual | TableVisual | SpinnerVisual | BagVisual;

export type McqAnswer = {
  choices: string[];
  correctIndex: number;
};

export type InputAnswer = {
  correctValue: number;
  accept?: { type: 'exact' };
};

export type Answer = McqAnswer | InputAnswer;

export type Question = {
  core: QuestionCore;
  visual: Visual;
  answer: Answer;
};

export type Page = {
  pageId: string;
  questions: Question[];
  userAnswers: Record<string, string>; // questionId -> (choiceIndex string) OR numeric input string
  graded?: Record<string, boolean>; // questionId -> correctness
};

export type SessionSummary = {
  total: number;
  correct: number;
  percentage: number;
};

export type DataProbabilitySession = {
  sessionId: string;
  seed: string;
  createdAt: string;
  submittedAt?: string;
  topic: DataProbTopic;
  year: 3;
  pages: Page[];
  summary?: SessionSummary;
  appVersion?: string;
  generatorVersion?: string;
};

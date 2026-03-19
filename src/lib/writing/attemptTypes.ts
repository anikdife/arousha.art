export type WritingAttemptY3 = {
  attemptId: string;
  studentUid: string;
  year: 3;
  promptId?: string;
  promptTitle?: string;
  createdAt?: any;
  updatedAt?: any;
  answerStoragePath?: string | null;
  answerCharCount?: number;
  answerPrunedAt?: any;
  assessed?: boolean;
  assessedAt?: any;
  assessorUid?: string | null;
  scorePercent?: number | null;
  comment?: string | null;
  commentFormat?: 'text' | 'json' | null;
  commentJson?: unknown;
};

export type WritingAttemptSummaryY3 = {
  attemptId: string;
  createdAtMillis: number;
  promptId?: string;
  promptTitle?: string;
  assessed: boolean;
  assessedAtMillis: number;
  scorePercent: number | null;
  answerStoragePath: string | null;
};

export type WritingFeedbackSummaryY3 = {
  attemptId: string;
  createdAtMillis: number;
  assessedAtMillis: number;
  scorePercent: number;
  comment: string;
  assessorUid: string;
  promptTitle?: string;
  answerStoragePath: string | null;
};

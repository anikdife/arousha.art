export type NaplanAttemptDoc = {
  domain: string;
  score: number;
  date: unknown;
  metadata?: unknown;
};

export type NaplanBenchmarksDoc = {
  national?: number;
  school?: number;
};

export type NaplanHistoryFirestoreDoc = {
  student_id: string;
  attempts: NaplanAttemptDoc[];
  benchmarks?: NaplanBenchmarksDoc;
};

export type NaplanAttempt = {
  domain: string;
  score: number;
  dateMs: number;
  metadata?: Record<string, unknown>;
};

export type NaplanHistoryParsed = {
  student_id: string;
  attempts: NaplanAttempt[];
  benchmarks: { national: number; school: number };
};

export function parseNaplanHistoryDoc(input: unknown): NaplanHistoryParsed | null {
  const obj = asRecord(input);
  if (!obj) return null;

  const studentId = typeof obj.student_id === 'string' ? obj.student_id.trim() : '';
  if (!studentId) return null;

  const attemptsRaw = Array.isArray(obj.attempts) ? obj.attempts : null;
  if (!attemptsRaw) return null;

  const mapped: Array<NaplanAttempt | null> = attemptsRaw.map((a) => {
    const rec = asRecord(a);
    if (!rec) return null;

    const domain = typeof rec.domain === 'string' ? rec.domain.trim() : '';
    const score = typeof rec.score === 'number' ? rec.score : Number(rec.score);
    const dateMs = toMillis(rec.date);

    if (!domain) return null;
    if (!Number.isFinite(score)) return null;
    if (!dateMs) return null;

    const metadata = asRecord(rec.metadata);
    return metadata ? { domain, score, dateMs, metadata } : { domain, score, dateMs };
  });

  const attempts: NaplanAttempt[] = mapped.filter((x): x is NaplanAttempt => x !== null).sort((a, b) => a.dateMs - b.dateMs);

  const benchmarksRaw = asRecord(obj.benchmarks);
  const national = benchmarksRaw ? toFiniteNumber(benchmarksRaw.national, 0) : 0;
  const school = benchmarksRaw ? toFiniteNumber(benchmarksRaw.school, 0) : 0;

  return {
    student_id: studentId,
    attempts,
    benchmarks: {
      national,
      school,
    },
  };
}

export function toMillis(value: unknown): number {
  if (!value) return 0;

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }

  if (value instanceof Date) {
    const t = value.getTime();
    return Number.isFinite(t) ? t : 0;
  }

  if (typeof value === 'string') {
    const t = Date.parse(value);
    return Number.isNaN(t) ? 0 : t;
  }

  const rec = asRecord(value);
  if (!rec) return 0;

  if (typeof rec.toDate === 'function') {
    try {
      const d = (rec.toDate as () => Date)();
      const t = d.getTime();
      return Number.isFinite(t) ? t : 0;
    } catch {
      return 0;
    }
  }

  if (typeof rec.toMillis === 'function') {
    try {
      const t = (rec.toMillis as () => number)();
      return Number.isFinite(t) ? t : 0;
    } catch {
      return 0;
    }
  }

  if (typeof rec.seconds === 'number') {
    const t = rec.seconds * 1000;
    return Number.isFinite(t) ? t : 0;
  }

  return 0;
}

function toFiniteNumber(value: unknown, fallback: number): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function asRecord(value: unknown): Record<string, any> | null {
  if (!value || typeof value !== 'object') return null;
  return value as Record<string, any>;
}

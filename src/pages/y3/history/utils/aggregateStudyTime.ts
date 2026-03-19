import type { SessionIndexItem, SessionIndexTopic } from '../../../../lib/sessionIndexReader';

export type StudyTimeCategoryKey =
  | 'addition'
  | 'subtraction'
  | 'multiplication'
  | 'measurement'
  | 'geometry'
  | 'data-probability'
  | 'language-conventions'
  | 'reading-magazine'
  | 'writing';

export type StudyTimeCategory = { key: StudyTimeCategoryKey; label: string };

export type StudyTimeCell = {
  category: StudyTimeCategoryKey;
  hour: number; // 0-23 local
  count: number;
  avgScorePercent?: number;
};

export type StudyTimeAggregation = {
  hours: number[];
  categories: StudyTimeCategory[];
  cells: Record<StudyTimeCategoryKey, Record<number, StudyTimeCell>>;
  maxCount: number;
};

function toMillis(value: any): number {
  if (!value) return 0;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const t = Date.parse(value);
    return Number.isNaN(t) ? 0 : t;
  }
  if (typeof value?.toDate === 'function') {
    try {
      return value.toDate().getTime();
    } catch {
      return 0;
    }
  }
  if (typeof value?.seconds === 'number') {
    return value.seconds * 1000;
  }
  return 0;
}

function normalizeCategory(topic: SessionIndexTopic): StudyTimeCategoryKey | null {
  if (
    topic === 'addition' ||
    topic === 'subtraction' ||
    topic === 'multiplication' ||
    topic === 'measurement' ||
    topic === 'geometry' ||
    topic === 'data-probability' ||
    topic === 'language-conventions' ||
    topic === 'reading-magazine' ||
    topic === 'writing'
  ) {
    return topic;
  }
  return null;
}

export function defaultStudyTimeCategories(): StudyTimeCategory[] {
  return [
    { key: 'addition', label: 'Addition' },
    { key: 'subtraction', label: 'Subtraction' },
    { key: 'multiplication', label: 'Multiplication' },
    { key: 'measurement', label: 'Measurement' },
    { key: 'geometry', label: 'Geometry' },
    { key: 'data-probability', label: 'Data & Probability' },
    { key: 'language-conventions', label: 'Language Conventions' },
    { key: 'reading-magazine', label: 'Reading' },
    { key: 'writing', label: 'Writing' },
  ];
}

export function aggregateStudyTime(params: {
  sessions: SessionIndexItem[];
  categories: StudyTimeCategory[];
  startHourInclusive?: number; // local
  endHourInclusive?: number; // local
}): StudyTimeAggregation {
  const { sessions, categories } = params;
  const startHourInclusive = typeof params.startHourInclusive === 'number' ? params.startHourInclusive : 0;
  const endHourInclusive = typeof params.endHourInclusive === 'number' ? params.endHourInclusive : 23;

  const hours: number[] = [];
  for (let h = startHourInclusive; h <= endHourInclusive; h++) hours.push(h);

  const cells: StudyTimeAggregation['cells'] = {
    addition: {},
    subtraction: {},
    multiplication: {},
    measurement: {},
    geometry: {},
    'data-probability': {},
    'language-conventions': {},
    'reading-magazine': {},
    writing: {},
  };

  const scoreSums = new Map<string, { sum: number; n: number }>();

  let maxCount = 0;

  for (const it of sessions) {
    const category = normalizeCategory(it.topic);
    if (!category) continue;

    // Only keep sessions that belong to the requested categories list.
    if (!categories.some((c) => c.key === category)) continue;

    const ms = typeof (it as any).submittedAtMillis === 'number' ? (it as any).submittedAtMillis : toMillis(it.submittedAt ?? it.createdAt);
    if (!ms) continue;

    const hour = new Date(ms).getHours();
    if (hour < startHourInclusive || hour > endHourInclusive) continue;

    const byHour = cells[category];
    const existing = byHour[hour];

    const nextCount = (existing?.count ?? 0) + 1;
    byHour[hour] = {
      category,
      hour,
      count: nextCount,
    };

    maxCount = Math.max(maxCount, nextCount);

    const scorePct = typeof it.score?.percentage === 'number' && Number.isFinite(it.score.percentage) ? it.score.percentage : null;
    if (scorePct != null) {
      const key = `${category}::${hour}`;
      const agg = scoreSums.get(key) ?? { sum: 0, n: 0 };
      agg.sum += scorePct;
      agg.n += 1;
      scoreSums.set(key, agg);
    }
  }

  scoreSums.forEach((agg, key) => {
    const parts = key.split('::');
    if (parts.length !== 2) return;
    const category = parts[0] as StudyTimeCategoryKey;
    const hour = Number(parts[1]);
    if (!Number.isFinite(hour)) return;

    const cell = cells[category]?.[hour];
    if (!cell) return;

    cells[category][hour] = {
      ...cell,
      avgScorePercent: agg.n > 0 ? agg.sum / agg.n : undefined,
    };
  });

  return { hours, categories, cells, maxCount };
}

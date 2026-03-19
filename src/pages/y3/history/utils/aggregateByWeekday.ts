import type { SessionIndexItem } from '../../../../lib/sessionIndexReader';

export type WeeklyMetric = 'sessions' | 'minutes';

export type WeekdayAggregation = {
  labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  values: [number, number, number, number, number, number, number];
  max: number;
  hasDuration: boolean;
  minutesValues: [number, number, number, number, number, number, number];
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

function jsDayToMondayIndex(jsDay: number): number {
  // JS: Sun=0..Sat=6  ->  Mon=0..Sun=6
  return ((jsDay % 7) + 6) % 7;
}

function extractDurationMinutes(item: SessionIndexItem): number | null {
  const candidateList = [
    (item as any)?.durationMinutes,
    (item as any)?.durationMins,
    (item as any)?.duration,
    (item as any)?.durationSeconds,
    (item as any)?.durationSecs,
    (item as any)?.meta?.durationMinutes,
    (item as any)?.meta?.durationMins,
    (item as any)?.meta?.duration,
    (item as any)?.meta?.durationSeconds,
    (item as any)?.meta?.durationSecs,
  ];

  for (const raw of candidateList) {
    if (raw == null) continue;
    if (typeof raw !== 'number' || !Number.isFinite(raw)) continue;

    // Heuristic: values over 600 are probably seconds, not minutes.
    if (raw > 600) return raw / 60;
    // Otherwise assume minutes.
    return raw;
  }

  return null;
}

export function aggregateByWeekday(params: {
  sessions: SessionIndexItem[];
  rangeStartMs?: number;
  rangeEndMs?: number;
}): WeekdayAggregation {
  const labels: WeekdayAggregation['labels'] = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  const sessionBuckets = [0, 0, 0, 0, 0, 0, 0] as unknown as WeekdayAggregation['values'];
  const minutesBuckets = [0, 0, 0, 0, 0, 0, 0] as unknown as WeekdayAggregation['minutesValues'];

  const hasRange = typeof params.rangeStartMs === 'number' && typeof params.rangeEndMs === 'number';
  const startMs = hasRange ? (params.rangeStartMs as number) : -Infinity;
  const endMs = hasRange ? (params.rangeEndMs as number) : Infinity;

  let hasDuration = false;

  for (const it of params.sessions) {
    const ms = (it as any).submittedAtMillis ?? toMillis((it as any).submittedAt ?? (it as any).createdAt);
    if (!ms) continue;
    if (ms < startMs || ms > endMs) continue;

    const d = new Date(ms);
    const idx = jsDayToMondayIndex(d.getDay());

    sessionBuckets[idx] = (sessionBuckets[idx] ?? 0) + 1;

    const mins = extractDurationMinutes(it);
    if (mins != null && mins >= 0) {
      hasDuration = true;
      minutesBuckets[idx] = (minutesBuckets[idx] ?? 0) + mins;
    }
  }

  const maxSessions = Math.max(0, ...sessionBuckets);
  const maxMinutes = Math.max(0, ...minutesBuckets);

  return {
    labels,
    values: sessionBuckets,
    max: maxSessions,
    hasDuration,
    minutesValues: minutesBuckets,
  };
}

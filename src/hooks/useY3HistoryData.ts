import { useEffect, useState } from 'react';
import { listY3NumeracySessionIndex, SessionIndexItem } from '../lib/sessionIndexReader';

export type Y3HistoryData = {
  subtraction: SessionIndexItem[];
  multiplication: SessionIndexItem[];
  addition: SessionIndexItem[];
  measurement: SessionIndexItem[];
  geometry: SessionIndexItem[];
  dataProbability: SessionIndexItem[];
};

type CacheEntry = {
  fetchedAt: number;
  data: Y3HistoryData;
};

const cacheByUid = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 2 * 60 * 1000;

export function useY3HistoryData(studentUid: string | undefined) {
  const [data, setData] = useState<Y3HistoryData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    // This hook is used by the legacy numeracy history views. It always loads by default.
    // New /y3/history tabs can opt out by passing `studentUid` as undefined until needed.

    if (!studentUid) {
      setData(null);
      setLoading(false);
      setError('No student selected');
      return;
    }

    const cached = cacheByUid.get(studentUid);
    const now = Date.now();

    if (cached && now - cached.fetchedAt < CACHE_TTL_MS) {
      setData(cached.data);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    (async () => {
      try {
        const next = await listY3NumeracySessionIndex(studentUid);
        if (cancelled) return;

        cacheByUid.set(studentUid, { fetchedAt: Date.now(), data: next });
        setData(next);
      } catch (e) {
        console.error('Failed to load Y3 history index:', e);
        if (!cancelled) setError('Failed to load history');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [studentUid]);

  const refresh = async () => {
    if (!studentUid) return;
    cacheByUid.delete(studentUid);
    setLoading(true);
    setError(null);

    try {
      const next = await listY3NumeracySessionIndex(studentUid);
      cacheByUid.set(studentUid, { fetchedAt: Date.now(), data: next });
      setData(next);
    } catch (e) {
      console.error('Failed to refresh Y3 history index:', e);
      setError('Failed to load history');
    } finally {
      setLoading(false);
    }
  };

  return { data, loading, error, refresh };
}

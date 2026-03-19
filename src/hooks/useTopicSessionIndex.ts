import { useEffect, useState } from 'react';
import { listTopicSessionIndex, type SessionIndexItem, type SessionIndexTopic } from '../lib/sessionIndexReader';

type CacheEntry = { fetchedAt: number; items: SessionIndexItem[] };
const cacheByKey = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 2 * 60 * 1000;

export function useTopicSessionIndex(params: {
  studentUid: string | undefined;
  topic: SessionIndexTopic;
  enabled?: boolean;
}) {
  const { studentUid, topic, enabled = true } = params;

  const [items, setItems] = useState<SessionIndexItem[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    if (!enabled) {
      setLoading(false);
      setError(null);
      return;
    }

    if (!studentUid) {
      setItems([]);
      setLoading(false);
      setError('No student selected');
      return;
    }

    const key = `${studentUid}::${topic}`;
    const cached = cacheByKey.get(key);
    const now = Date.now();

    if (cached && now - cached.fetchedAt < CACHE_TTL_MS) {
      setItems(cached.items);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    (async () => {
      try {
        const next = await listTopicSessionIndex(studentUid, topic);
        if (cancelled) return;
        cacheByKey.set(key, { fetchedAt: Date.now(), items: next });
        setItems(next);
      } catch (e) {
        console.error('Failed to load session index:', e);
        if (!cancelled) setError('Failed to load history');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled, studentUid, topic]);

  const refresh = async () => {
    if (!enabled) return;
    if (!studentUid) return;

    const key = `${studentUid}::${topic}`;
    cacheByKey.delete(key);
    setLoading(true);
    setError(null);

    try {
      const next = await listTopicSessionIndex(studentUid, topic);
      cacheByKey.set(key, { fetchedAt: Date.now(), items: next });
      setItems(next);
    } catch (e) {
      console.error('Failed to refresh session index:', e);
      setError('Failed to load history');
    } finally {
      setLoading(false);
    }
  };

  return { items: items ?? [], loading, error, refresh };
}

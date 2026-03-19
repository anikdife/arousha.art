import { useEffect, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase/firebase';

export function useReadingMagazineY3RepeatCount(params: {
  studentUid: string | undefined;
  enabled?: boolean;
}) {
  const { studentUid, enabled = true } = params;

  const [repeatCount, setRepeatCount] = useState(0);
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
      setRepeatCount(0);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    (async () => {
      try {
        const snap = await getDoc(doc(db, 'readingMagazineY3', studentUid));
        if (cancelled) return;
        const data = snap.exists() ? (snap.data() as any) : null;
        const n = Number.isFinite(data?.repeatCount) ? Number(data.repeatCount) : 0;
        setRepeatCount(Math.max(0, Math.floor(n)));
      } catch (e) {
        console.error('Failed to load repeatCount:', e);
        if (!cancelled) setError('Failed to load repeat count');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled, studentUid]);

  return { repeatCount, loading, error };
}

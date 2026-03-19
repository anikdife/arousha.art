import { useEffect, useState } from 'react';
import { User, onAuthStateChanged } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../../firebase/firebase';

export type CurrentUserProfile = {
  uid: string;
  role?: string;
  displayName?: string;
  email?: string;
  linkedStudentUids?: string[];
};

export function useCurrentUserProfile(): {
  user: User | null;
  profile: CurrentUserProfile | null;
  loading: boolean;
  error: string | null;
} {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<CurrentUserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);

    const unsubAuth = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setProfile(null);
      setError(null);
      setLoading(false);
    });

    return () => {
      unsubAuth();
    };
  }, []);

  useEffect(() => {
    if (!user) {
      setProfile(null);
      return;
    }

    setError(null);
    const ref = doc(db, 'users', user.uid);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        const raw = (snap.data() as any) ?? null;
        if (!raw) {
          setProfile(null);
          return;
        }

        const current = raw.linkedStudentUids ?? raw.LinkedStudentUids;
        const legacy = raw.linkedStudentIds ?? raw.LinkedStudentIds;

        const linkedStudentUids = Array.isArray(current) ? current : Array.isArray(legacy) ? legacy : undefined;

        setProfile({
          uid: raw.uid ?? user.uid,
          role: raw.role,
          displayName: raw.displayName,
          email: raw.email,
          linkedStudentUids,
        });
      },
      (e) => {
        setError(String((e as any)?.message ?? 'Failed to load profile'));
      }
    );

    return () => {
      unsub();
    };
  }, [user]);

  return { user, profile, loading, error };
}

import React from 'react';
import { getActiveStudentUid } from '../../../lib/activeStudent';
import { useAuth } from '../../../auth/AuthProvider';

export function useGhHistoryStudentUid(): string | null {
  const { currentUser, userProfile } = useAuth();

  return React.useMemo(() => {
    if (!currentUser) return null;

    const role = userProfile?.role ?? 'student';
    if (role === 'student') return currentUser.uid;

    const active = getActiveStudentUid();
    if (active) return active;

    const linked = Array.isArray(userProfile?.linkedStudentUids) ? userProfile?.linkedStudentUids ?? [] : [];
    return linked.length > 0 ? linked[0] : null;
  }, [currentUser, userProfile?.linkedStudentUids, userProfile?.role]);
}

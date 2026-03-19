import { useMemo } from 'react';
import { useAuth } from '../../auth/AuthProvider';
import type { UserRole } from '../../types/userProfile';

export function useUserRole(): {
  loading: boolean;
  role: UserRole | null;
  isOwner: boolean;
} {
  const { loading, userProfile } = useAuth();

  return useMemo(() => {
    const role = (userProfile?.role ?? null) as UserRole | null;
    return {
      loading,
      role,
      isOwner: role === 'owner',
    };
  }, [loading, userProfile?.role]);
}

import React, { useEffect, useMemo, useState } from 'react';
import { BottomSheet } from '../../../../components/ui/BottomSheet';
import { getUserProfile } from '../../../../lib/userProfileService';
import type { UserProfile } from '../../../../types/userProfile';

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const a = parts[0]?.[0] ?? '';
  const b = parts.length > 1 ? parts[parts.length - 1]?.[0] ?? '' : '';
  return (a + b).toUpperCase();
}

export const StudentSwitcherSheet: React.FC<{
  open: boolean;
  onClose: () => void;
  linkedStudentUids: string[];
  currentStudentUid: string | undefined;
  onSelectStudent: (student: { uid: string; name?: string }) => void;
}> = ({ open, onClose, linkedStudentUids, currentStudentUid, onSelectStudent }) => {
  const [loading, setLoading] = useState(false);
  const [profiles, setProfiles] = useState<UserProfile[]>([]);

  const sortedUids = useMemo(() => linkedStudentUids.slice().filter(Boolean), [linkedStudentUids]);

  useEffect(() => {
    let cancelled = false;
    if (!open) return;

    setLoading(true);

    (async () => {
      try {
        const results = await Promise.all(sortedUids.map((uid) => getUserProfile(uid)));
        const next = results.filter(Boolean) as UserProfile[];
        if (!cancelled) setProfiles(next);
      } catch {
        if (!cancelled) setProfiles([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, sortedUids]);

  return (
    <BottomSheet open={open} onClose={onClose} title="Switch student">
      {loading ? <div className="text-sm text-gray-600">Loading…</div> : null}

      {!loading && profiles.length === 0 ? (
        <div className="text-sm text-gray-600">No linked students found.</div>
      ) : (
        <div className="space-y-2">
          {profiles.map((p) => {
            const active = p.uid === currentStudentUid;
            const name = p.displayName ?? 'Student';
            return (
              <button
                key={p.uid}
                type="button"
                onClick={() => {
                  onSelectStudent({ uid: p.uid, name });
                  onClose();
                }}
                className={
                  'w-full flex items-center justify-between gap-3 p-3 rounded-2xl border text-left ' +
                  (active ? 'border-purple-600 bg-purple-50' : 'border-gray-200 bg-white')
                }
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className={"w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold " + (active ? 'bg-purple-600 text-white' : 'bg-gray-200 text-gray-700')}>
                    {initials(name)}
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-gray-900 truncate">{name}</div>
                    <div className="text-xs text-gray-500 truncate">Year {p.classYear ?? '—'}</div>
                  </div>
                </div>

                <div className={"text-sm font-semibold " + (active ? 'text-purple-700' : 'text-gray-400')}>{active ? 'Viewing' : 'Select'}</div>
              </button>
            );
          })}
        </div>
      )}
    </BottomSheet>
  );
};

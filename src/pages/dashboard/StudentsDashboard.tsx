import React, { useEffect, useMemo, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '../../auth/AuthProvider';
import { setActiveStudent } from '../../lib/activeStudent';
import {
  createStudentAccountCallable,
  linkStudentToParentUidCallable,
  unlinkStudentFromParentCallable,
} from '../../lib/firebase/callables';
import { getUserProfile } from '../../lib/userProfileService';

type StudentProfile = {
  uid: string;
  role?: string;
  displayName?: string;
  studentId?: string;
};

function isValidPin(pin: string): boolean {
  return /^\d{4,6}$/.test(pin);
}

function isValidStudentId(studentId: string): boolean {
  return /^[A-Z]{2}-[A-Z0-9]{5}$/.test(studentId);
}

export const StudentsDashboard: React.FC = () => {
  const { currentUser, userProfile, loading, refreshUserProfile } = useAuth();

  const role = userProfile?.role;
  const canManage = role === 'owner' || role === 'parent';

  const [displayName, setDisplayName] = useState('');
  const [pin, setPin] = useState('');
  const [studentIdOverride, setStudentIdOverride] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ studentUid: string; studentId: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [optimisticLinkedStudentUids, setOptimisticLinkedStudentUids] = useState<string[]>([]);

  const [linkStudentUid, setLinkStudentUid] = useState('');
  const [linking, setLinking] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);

  const normalizedStudentIdOverride = studentIdOverride.trim().toUpperCase();
  const normalizedLinkStudentUid = linkStudentUid.trim();

  const pinOk = isValidPin(pin.trim());
  const nameOk = displayName.trim().length > 0;
  const studentIdOk =
    normalizedStudentIdOverride.length === 0 || isValidStudentId(normalizedStudentIdOverride);

  const canSubmit = nameOk && pinOk && studentIdOk && !submitting;

  const linkedStudentUids = useMemo(() => {
    const fromNew = (userProfile as any)?.linkedStudentUids ?? [];
    const fromOld = (userProfile as any)?.linkedStudentIds ?? [];
    return Array.from(new Set([...(fromNew ?? []), ...(fromOld ?? [])])).filter(Boolean);
  }, [userProfile]);

  const effectiveLinkedStudentUids = useMemo(() => {
    return Array.from(new Set([...(linkedStudentUids ?? []), ...(optimisticLinkedStudentUids ?? [])])).filter(Boolean);
  }, [linkedStudentUids, optimisticLinkedStudentUids]);

  const [linkedStudents, setLinkedStudents] = useState<StudentProfile[]>([]);
  const [studentsLoading, setStudentsLoading] = useState(false);
  const [unlinkingStudentUid, setUnlinkingStudentUid] = useState<string | null>(null);
  const [copiedStudentUid, setCopiedStudentUid] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      if (!currentUser || !canManage) {
        setLinkedStudents([]);
        return;
      }

      setStudentsLoading(true);
      try {
        const results: StudentProfile[] = [];
        for (const uid of effectiveLinkedStudentUids) {
          const p = await getUserProfile(uid);
          if (!p) continue;
          results.push({ uid, role: p.role, displayName: p.displayName, studentId: (p as any).studentId });
        }
        if (!cancelled) setLinkedStudents(results);
      } finally {
        if (!cancelled) setStudentsLoading(false);
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [currentUser, canManage, effectiveLinkedStudentUids]);

  const onCreate = async () => {
    if (!currentUser) return;

    setSubmitError(null);
    setCopied(false);

    if (!nameOk) {
      setSubmitError('Student display name is required.');
      return;
    }

    if (!pinOk) {
      setSubmitError('PIN must be 4 to 6 digits.');
      return;
    }

    if (!studentIdOk) {
      setSubmitError('Student ID must match format like AR-ABCDE.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await createStudentAccountCallable({
        displayName: displayName.trim(),
        pin: pin.trim(),
        studentId: normalizedStudentIdOverride.length ? normalizedStudentIdOverride : undefined,
      });

      setCreated({ studentUid: res.studentUid, studentId: res.studentId });

      // Optimistically show the newly-created student as linked immediately.
      setOptimisticLinkedStudentUids((prev) => Array.from(new Set([...(prev ?? []), res.studentUid])));

      // Refresh the signed-in parent's profile so other pages (e.g. /dashboard)
      // immediately see the new linkedStudentUids.
      try {
        await refreshUserProfile();
      } catch {
        // ignore
      }

      try {
        const p = await getUserProfile(res.studentUid);
        const optimistic: StudentProfile = {
          uid: res.studentUid,
          role: p?.role,
          displayName: p?.displayName ?? displayName.trim(),
          studentId: (p as any)?.studentId ?? res.studentId,
        };
        setLinkedStudents((prev) => {
          const existing = (prev ?? []).some((s) => s.uid === optimistic.uid);
          return existing ? prev : [optimistic, ...(prev ?? [])];
        });
      } catch {
        // Ignore; the effect will reload when effectiveLinkedStudentUids updates.
      }
    } catch (e: any) {
      setSubmitError(String(e?.message ?? 'Failed to create student'));
    } finally {
      setSubmitting(false);
    }
  };

  const onCopyStudentId = async () => {
    if (!created?.studentId) return;
    try {
      await navigator.clipboard.writeText(created.studentId);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setSubmitError('Copy failed. Please copy manually.');
    }
  };

  const onCreateAnother = () => {
    setCreated(null);
    setSubmitError(null);
    setCopied(false);
    setDisplayName('');
    setPin('');
    setStudentIdOverride('');
  };

  const onLinkExistingStudent = async () => {
    if (!currentUser) return;

    setLinkError(null);
    const uid = normalizedLinkStudentUid;
    if (!uid) {
      setLinkError('Student UID is required.');
      return;
    }

    if (effectiveLinkedStudentUids.includes(uid)) {
      setLinkError('That student is already linked to your account.');
      return;
    }

    setLinking(true);
    try {
      await linkStudentToParentUidCallable({ studentUid: uid });

      setOptimisticLinkedStudentUids((prev) => Array.from(new Set([...(prev ?? []), uid])));

      try {
        await refreshUserProfile();
      } catch {
        // ignore
      }

      try {
        const p = await getUserProfile(uid);
        if (p) {
          setLinkedStudents((prev) => {
            const existing = (prev ?? []).some((s) => s.uid === uid);
            if (existing) return prev;
            return [{ uid, role: p.role, displayName: p.displayName, studentId: (p as any).studentId }, ...(prev ?? [])];
          });
        }
      } catch {
        // ignore
      }

      setLinkStudentUid('');
    } catch (e: any) {
      setLinkError(String(e?.message ?? 'Failed to link student'));
    } finally {
      setLinking(false);
    }
  };

  const onCopyLinkedStudentUid = async (student: StudentProfile) => {
    const uid = String(student.uid ?? '').trim();
    if (!uid) {
      setSubmitError('No Student UID available to copy.');
      return;
    }

    try {
      await navigator.clipboard.writeText(uid);
      setCopiedStudentUid(student.uid);
      setTimeout(() => setCopiedStudentUid(null), 1200);
    } catch {
      setSubmitError('Copy failed. Please copy manually.');
    }
  };

  const onUnlinkStudent = async (studentUid: string) => {
    if (!currentUser) return;

    const ok = window.confirm('Unlink this student from your account?');
    if (!ok) return;

    setSubmitError(null);
    setUnlinkingStudentUid(studentUid);
    try {
      await unlinkStudentFromParentCallable({ studentUid });

      // Update local UI immediately.
      setLinkedStudents((prev) => (prev ?? []).filter((s) => s.uid !== studentUid));
      setOptimisticLinkedStudentUids((prev) => (prev ?? []).filter((uid) => uid !== studentUid));

      try {
        await refreshUserProfile();
      } catch {
        // ignore
      }
    } catch (e: any) {
      setSubmitError(String(e?.message ?? 'Failed to unlink student'));
    } finally {
      setUnlinkingStudentUid(null);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4" />
          <div className="text-sm text-gray-700">Loading...</div>
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return <Navigate to="/login" replace />;
  }

  if (!canManage) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Students</h1>
          <Link
            to="/dashboard"
            className="bg-gray-200 hover:bg-gray-300 text-gray-800 px-3 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            Back
          </Link>
        </div>

        {/* profile loading errors are handled by existing AuthProvider */}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="space-y-6">
            <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Create Student</h2>

              {created ? (
                <div className="space-y-4">
                  <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                    <div className="text-sm font-semibold text-green-900 mb-2">Student created</div>
                    <div className="text-sm text-green-900">Student ID: {created.studentId}</div>
                    <div className="text-xs text-green-900 break-all">Student UID: {created.studentUid}</div>
                  </div>

                  <button
                    type="button"
                    onClick={onCopyStudentId}
                    className="w-full bg-gray-900 hover:bg-gray-800 text-white px-4 py-3 rounded-lg text-sm font-medium transition-colors"
                  >
                    {copied ? 'Copied!' : 'Copy Student ID'}
                  </button>

                  <button
                    type="button"
                    onClick={onCreateAnother}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white px-4 py-3 rounded-lg text-sm font-medium transition-colors"
                  >
                    Create another
                  </button>

                  {submitError && (
                    <div className="text-red-700 bg-red-50 border border-red-200 p-3 rounded-lg text-sm">
                      {submitError}
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Display name</label>
                    <input
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                      placeholder="Student name"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">PIN</label>
                    <input
                      value={pin}
                      onChange={(e) => setPin(e.target.value)}
                      type="password"
                      inputMode="numeric"
                      autoComplete="new-password"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                      placeholder="4–6 digits"
                    />
                    <div className="mt-1 text-xs text-gray-500">PIN must be 4–6 digits.</div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Student ID (optional)</label>
                    <input
                      value={studentIdOverride}
                      onChange={(e) => setStudentIdOverride(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                      placeholder="AR-1A2B3"
                    />
                    <div className="mt-1 text-xs text-gray-500">
                      Format: two letters, hyphen, five letters/digits (e.g. AR-1A2B3)
                    </div>
                    {!studentIdOk && normalizedStudentIdOverride.length > 0 && (
                      <div className="mt-2 text-xs text-red-700">Invalid Student ID format.</div>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={onCreate}
                    disabled={!canSubmit}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white px-4 py-3 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {submitting ? 'Creating...' : 'Create Student'}
                  </button>

                  {submitError && (
                    <div className="text-red-700 bg-red-50 border border-red-200 p-3 rounded-lg text-sm">
                      {submitError}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Link existing student</h2>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Student UID</label>
                  <input
                    value={linkStudentUid}
                    onChange={(e) => setLinkStudentUid(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Paste student UID"
                    disabled={linking}
                  />
                  <div className="mt-1 text-xs text-gray-500">Only the student UID is used for linking.</div>
                </div>

                <button
                  type="button"
                  onClick={onLinkExistingStudent}
                  disabled={linking}
                  className="w-full bg-gray-900 hover:bg-gray-800 text-white px-4 py-3 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {linking ? 'Linking...' : 'Link'}
                </button>

                {linkError && (
                  <div className="text-red-700 bg-red-50 border border-red-200 p-3 rounded-lg text-sm">
                    {linkError}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Your linked students</h2>

            {studentsLoading ? (
              <div className="text-sm text-gray-600">Loading students...</div>
            ) : effectiveLinkedStudentUids.length === 0 ? (
              <div className="text-sm text-gray-600">No linked students yet.</div>
            ) : (
              <div className="space-y-3">
                {linkedStudents.map((s) => (
                  <div key={s.uid} className="border border-gray-200 rounded-lg p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-medium text-gray-900 flex items-center gap-2">
                          <span>{s.displayName || 'Unnamed student'}</span>
                          <button
                            type="button"
                            onClick={() => onCopyLinkedStudentUid(s)}
                            title="Copy Student UID"
                            className="inline-flex items-center justify-center h-7 w-7 rounded-md border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            <span className="sr-only">Copy Student UID</span>
                            {copiedStudentUid === s.uid ? (
                              <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                                <path
                                  fillRule="evenodd"
                                  d="M16.704 5.29a1 1 0 010 1.414l-7.5 7.5a1 1 0 01-1.414 0l-3.5-3.5a1 1 0 011.414-1.414l2.793 2.793 6.793-6.793a1 1 0 011.414 0z"
                                  clipRule="evenodd"
                                />
                              </svg>
                            ) : (
                              <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                                <path d="M4 4a2 2 0 012-2h5a2 2 0 012 2v2h-2V4H6v10h2v2H6a2 2 0 01-2-2V4z" />
                                <path d="M9 8a2 2 0 012-2h5a2 2 0 012 2v8a2 2 0 01-2 2h-5a2 2 0 01-2-2V8zm2 0v8h5V8h-5z" />
                              </svg>
                            )}
                          </button>
                        </div>
                        {s.studentId && <div className="text-xs text-gray-700 mt-1">Student ID: {s.studentId}</div>}
                      </div>

                      <div className="shrink-0 flex items-center gap-2">
                        {(userProfile?.role ?? 'student') !== 'student' && (
                          <Link
                            to="/y3/history"
                            state={{ studentUid: s.uid, studentName: s.displayName }}
                            onClick={() => setActiveStudent(s.uid, s.displayName)}
                            className="bg-purple-600 hover:bg-purple-700 text-white px-3 py-2 rounded-lg text-xs font-semibold transition-colors"
                          >
                            View history
                          </Link>
                        )}
                        <button
                          type="button"
                          onClick={() => onUnlinkStudent(s.uid)}
                          disabled={unlinkingStudentUid === s.uid}
                          className="bg-gray-200 hover:bg-gray-300 text-gray-800 px-3 py-2 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {unlinkingStudentUid === s.uid ? 'Unlinking...' : 'Unlink'}
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

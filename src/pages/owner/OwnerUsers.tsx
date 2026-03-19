import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { listUsersForOwnerCallable } from '../../lib/firebase/callables';
import { getUserProfile } from '../../lib/userProfileService';
import type { UserProfile } from '../../types/userProfile';
import { collection, getDocs, query, where, Timestamp } from 'firebase/firestore';
import { db } from '../../firebase/firebase';

type RoleTab = 'students' | 'parents' | 'teachers' | 'adminOwner';

function isStudent(u: UserProfile): boolean {
  return u.role === 'student';
}

function isAdminOwner(u: UserProfile): boolean {
  // App roles are: owner | student | parent | teacher
  // Since we have dedicated parent/teacher tabs, this tab is strictly owners.
  return u.role === 'owner';
}

function isParent(u: UserProfile): boolean {
  return u.role === 'parent';
}

function isTeacher(u: UserProfile): boolean {
  return u.role === 'teacher';
}

function labelForUser(u: UserProfile): string {
  const name = (u.displayName || '').trim();
  const email = (u.email || '').trim();
  if (name && email) return `${name} (${email})`;
  if (name) return name;
  if (email) return email;
  return u.uid;
}

function tryToDate(value: any): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value?.toDate === 'function') {
    try {
      return value.toDate();
    } catch {
      return null;
    }
  }
  if (typeof value === 'number') return new Date(value);
  return null;
}

function isSameLocalDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function formatLocalDateTime(d: Date): string {
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function toLocalDateInputValue(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

type WorkDoneRow = {
  section: string;
  subsection: string;
  submittedQuestions: number;
};

export const OwnerUsers: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [users, setUsers] = useState<UserProfile[]>([]);

  const [tab, setTab] = useState<RoleTab>('students');
  const [selectedUid, setSelectedUid] = useState<string | null>(null);
  const [selectedUserLive, setSelectedUserLive] = useState<UserProfile | null>(null);

  const [workDoneFrom, setWorkDoneFrom] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return toLocalDateInputValue(d);
  });
  const [workDoneTo, setWorkDoneTo] = useState<string>(() => toLocalDateInputValue(new Date()));
  const [workDoneBusy, setWorkDoneBusy] = useState(false);
  const [workDoneError, setWorkDoneError] = useState<string | null>(null);
  const [workDoneRows, setWorkDoneRows] = useState<WorkDoneRow[] | null>(null);

  // Populate (show list) only after a tab is clicked.
  // Students is considered visited by default since it's the initial tab.
  const [tabVisited, setTabVisited] = useState<Record<RoleTab, boolean>>({
    students: true,
    parents: false,
    teachers: false,
    adminOwner: false,
  });

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      setLoading(true);
      setError(null);

      try {
        const res = await listUsersForOwnerCallable();
        const all = (res.users ?? []) as any as UserProfile[];
        if (cancelled) return;

        const sorted = [...all].sort((a, b) => labelForUser(a).localeCompare(labelForUser(b)));
        setUsers(sorted);
      } catch (e: any) {
        console.error('Failed to load users:', e);
        if (!cancelled) setError(String(e?.message ?? 'Failed to load users'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  const studentCount = useMemo(() => users.filter(isStudent).length, [users]);
  const parentCount = useMemo(() => users.filter(isParent).length, [users]);
  const teacherCount = useMemo(() => users.filter(isTeacher).length, [users]);
  const adminOwnerCount = useMemo(() => users.filter(isAdminOwner).length, [users]);

  const visibleUsers = useMemo(() => {
    if (!tabVisited[tab]) return [];
    if (tab === 'students') return users.filter(isStudent);
    if (tab === 'parents') return users.filter(isParent);
    if (tab === 'teachers') return users.filter(isTeacher);
    return users.filter(isAdminOwner);
  }, [users, tab, tabVisited]);

  const selectedUser = useMemo(() => {
    if (!selectedUid) return null;
    return users.find((u) => u.uid === selectedUid) ?? null;
  }, [users, selectedUid]);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      setSelectedUserLive(null);
      if (!selectedUid) return;

      // Only needed for parent details currently.
      const fromList = users.find((u) => u.uid === selectedUid);
      if (!fromList || fromList.role !== 'parent') return;

      try {
        const live = await getUserProfile(selectedUid);
        if (!cancelled && live) setSelectedUserLive(live);
      } catch (e) {
        // If rules block this read, fall back to list data.
        console.error('Failed to load selected user profile:', e);
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [selectedUid, users]);

  const detailUser = selectedUserLive ?? selectedUser;

  useEffect(() => {
    // Reset per-user derived data when selecting a new user.
    setWorkDoneError(null);
    setWorkDoneRows(null);
  }, [selectedUid]);

  const userByUid = useMemo(() => {
    const m = new Map<string, UserProfile>();
    for (const u of users) m.set(u.uid, u);
    return m;
  }, [users]);

  const linkedStudentLabels = useMemo(() => {
    if (!detailUser) return [] as string[];
    const linked = Array.isArray(detailUser.linkedStudentUids) ? detailUser.linkedStudentUids : [];
    return linked
      .filter((uid): uid is string => typeof uid === 'string' && uid.length > 0)
      .map((uid) => {
        const student = userByUid.get(uid);
        if (student) return labelForUser(student);
        return uid;
      });
  }, [detailUser, userByUid]);

  const parentSessionInfo = useMemo(() => {
    if (!detailUser || detailUser.role !== 'parent') return null;

    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);

    const candidates = [tryToDate(detailUser.lastSessionAt), tryToDate(detailUser.previousSessionAt)].filter(
      (d): d is Date => d instanceof Date
    );

    const todayHit = candidates.find((d) => isSameLocalDay(d, now)) ?? null;
    const yesterdayHit = candidates.find((d) => isSameLocalDay(d, yesterday)) ?? null;

    return {
      today: todayHit ? formatLocalDateTime(todayHit) : null,
      yesterday: yesterdayHit ? formatLocalDateTime(yesterdayHit) : null,
    };
  }, [detailUser]);

  const loadStudentWorkDone = async (studentUid: string): Promise<void> => {
    const start = workDoneFrom ? new Date(`${workDoneFrom}T00:00:00`) : null;
    const end = workDoneTo ? new Date(`${workDoneTo}T23:59:59.999`) : null;
    if (!start || Number.isNaN(start.getTime())) {
      throw new Error('Please select a valid From date.');
    }
    if (!end || Number.isNaN(end.getTime())) {
      throw new Error('Please select a valid To date.');
    }
    if (start.getTime() > end.getTime()) {
      throw new Error('From date must be on or before To date.');
    }

    const colRef = collection(db, 'sessionIndex', studentUid, 'items');
    const q = query(colRef, where('submittedAt', '>=', Timestamp.fromDate(start)), where('submittedAt', '<=', Timestamp.fromDate(end)));
    const snap = await getDocs(q);

    const map = new Map<string, WorkDoneRow>();

    for (const d of snap.docs) {
      const data = d.data() as any;
      const section = String(data?.section ?? 'unknown');
      const subsection = String(data?.topic ?? 'unknown');
      const total = Number(data?.score?.total ?? 0);
      const add = Number.isFinite(total) ? total : 0;

      const key = `${section}|||${subsection}`;
      const prev = map.get(key);
      if (prev) {
        prev.submittedQuestions += add;
      } else {
        map.set(key, { section, subsection, submittedQuestions: add });
      }
    }

    return void setWorkDoneRows(
      Array.from(map.values()).sort((a, b) => {
        const s = a.section.localeCompare(b.section);
        if (s !== 0) return s;
        return a.subsection.localeCompare(b.subsection);
      })
    );
  };

  useEffect(() => {
    // If the currently selected user is not in the active tab, clear selection.
    if (!selectedUid) return;
    const u = users.find((x) => x.uid === selectedUid);
    if (!u) {
      setSelectedUid(null);
      return;
    }
    if (tab === 'students' && !isStudent(u)) setSelectedUid(null);
    if (tab === 'parents' && !isParent(u)) setSelectedUid(null);
    if (tab === 'teachers' && !isTeacher(u)) setSelectedUid(null);
    if (tab === 'adminOwner' && !isAdminOwner(u)) setSelectedUid(null);
  }, [tab, users, selectedUid]);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Owner • Users</h1>
            <div className="text-sm text-gray-600">Students vs Admin/Owner</div>
          </div>
          <Link to="/owner" className="px-3 py-2 rounded-lg bg-gray-200 text-gray-700 hover:bg-gray-300">
            Back
          </Link>
        </div>

        <div className="mt-6 bg-white border border-gray-200 rounded-xl p-4">
          <div className="flex flex-wrap gap-2 items-center justify-between">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setTabVisited((prev) => ({ ...prev, students: true }));
                  setTab('students');
                }}
                className={`px-4 py-2 text-sm font-semibold rounded-lg transition-colors ${
                  tab === 'students' ? 'bg-blue-600 text-white' : 'text-gray-700 hover:bg-gray-100'
                }`}
                aria-current={tab === 'students' ? 'page' : undefined}
              >
                Students ({studentCount})
              </button>

              <button
                type="button"
                onClick={() => {
                  setTabVisited((prev) => ({ ...prev, parents: true }));
                  setTab('parents');
                }}
                className={`px-4 py-2 text-sm font-semibold rounded-lg transition-colors ${
                  tab === 'parents' ? 'bg-blue-600 text-white' : 'text-gray-700 hover:bg-gray-100'
                }`}
                aria-current={tab === 'parents' ? 'page' : undefined}
              >
                Parent ({parentCount})
              </button>

              <button
                type="button"
                onClick={() => {
                  setTabVisited((prev) => ({ ...prev, teachers: true }));
                  setTab('teachers');
                }}
                className={`px-4 py-2 text-sm font-semibold rounded-lg transition-colors ${
                  tab === 'teachers' ? 'bg-blue-600 text-white' : 'text-gray-700 hover:bg-gray-100'
                }`}
                aria-current={tab === 'teachers' ? 'page' : undefined}
              >
                Teacher ({teacherCount})
              </button>

              <button
                type="button"
                onClick={() => {
                  setTabVisited((prev) => ({ ...prev, adminOwner: true }));
                  setTab('adminOwner');
                }}
                className={`px-4 py-2 text-sm font-semibold rounded-lg transition-colors ${
                  tab === 'adminOwner' ? 'bg-blue-600 text-white' : 'text-gray-700 hover:bg-gray-100'
                }`}
                aria-current={tab === 'adminOwner' ? 'page' : undefined}
              >
                Admin/Owner ({adminOwnerCount})
              </button>
            </div>

            <div className="text-xs text-gray-500">Total: {users.length}</div>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-4">
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div className="p-4 border-b border-gray-200">
                <div className="text-sm font-semibold text-gray-900">Users</div>
                <div className="text-xs text-gray-500 mt-1">Click a user to view details</div>
              </div>

              {loading ? (
                <div className="p-4 text-sm text-gray-600">Loading…</div>
              ) : error ? (
                <div className="p-4 text-sm text-red-700">{error}</div>
              ) : !tabVisited[tab] ? (
                <div className="p-4 text-sm text-gray-600">Click the tab to load this list.</div>
              ) : visibleUsers.length === 0 ? (
                <div className="p-4 text-sm text-gray-600">No users in this group.</div>
              ) : (
                <div className="max-h-[70vh] overflow-auto">
                  {visibleUsers.map((u) => (
                    <button
                      key={u.uid}
                      type="button"
                      onClick={() => setSelectedUid(u.uid)}
                      className={`w-full text-left px-4 py-3 border-b border-gray-100 hover:bg-gray-50 ${
                        selectedUid === u.uid ? 'bg-gray-50' : ''
                      }`}
                    >
                      <div className="text-sm font-medium text-gray-900 truncate">{labelForUser(u)}</div>
                      <div className="text-xs text-gray-500 mt-1">
                        Role: {u.role}
                        {u.role === 'student' && u.classYear ? ` • Year ${u.classYear}` : ''}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="lg:col-span-8">
            <div className="bg-white border border-gray-200 rounded-xl p-6 min-h-[70vh]">
              {!detailUser ? (
                <div className="h-full flex items-center justify-center">
                  <div className="text-sm text-gray-500">Select a user to view info.</div>
                </div>
              ) : (
                <div>
                  <div className="text-lg font-semibold text-gray-900">{detailUser.displayName || 'User'}</div>
                  <div className="text-sm text-gray-600 mt-1">{detailUser.email || 'No email'}</div>

                  <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="rounded-lg border border-gray-200 p-4">
                      <div className="text-xs font-semibold text-gray-600">UID</div>
                      <div className="text-sm text-gray-900 mt-1 break-all">{detailUser.uid}</div>
                    </div>

                    <div className="rounded-lg border border-gray-200 p-4">
                      <div className="text-xs font-semibold text-gray-600">Role</div>
                      <div className="text-sm text-gray-900 mt-1">{detailUser.role}</div>
                    </div>

                    {detailUser.role === 'parent' && parentSessionInfo && (
                      <div className="rounded-lg border border-gray-200 p-4 sm:col-span-2">
                        <div className="text-xs font-semibold text-gray-600">Parent Sessions</div>
                        <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div className="rounded-lg border border-gray-200 p-3 bg-gray-50">
                            <div className="text-xs font-semibold text-gray-600">Today</div>
                            <div className="text-sm text-gray-900 mt-1">{parentSessionInfo.today ?? '—'}</div>
                          </div>
                          <div className="rounded-lg border border-gray-200 p-3 bg-gray-50">
                            <div className="text-xs font-semibold text-gray-600">Yesterday</div>
                            <div className="text-sm text-gray-900 mt-1">{parentSessionInfo.yesterday ?? '—'}</div>
                          </div>
                        </div>
                      </div>
                    )}

                    {detailUser.role === 'student' && (
                      <>
                        <div className="rounded-lg border border-gray-200 p-4">
                          <div className="text-xs font-semibold text-gray-600">Class Year</div>
                          <div className="text-sm text-gray-900 mt-1">{detailUser.classYear || '—'}</div>
                        </div>

                        <div className="rounded-lg border border-gray-200 p-4">
                          <div className="text-xs font-semibold text-gray-600">Student ID</div>
                          <div className="text-sm text-gray-900 mt-1">{detailUser.studentId || '—'}</div>
                        </div>

                        <div className="rounded-lg border border-gray-200 p-4">
                          <div className="text-xs font-semibold text-gray-600">Parent</div>
                          <div className="text-sm text-gray-900 mt-1 break-all">
                            {detailUser.parentId || (Array.isArray((detailUser as any).linkedParentUids) ? (detailUser as any).linkedParentUids.join(', ') : '—')}
                          </div>
                        </div>

                        <div className="rounded-lg border border-gray-200 p-4">
                          <div className="text-xs font-semibold text-gray-600">Teacher</div>
                          <div className="text-sm text-gray-900 mt-1 break-all">
                            {detailUser.teacherId || detailUser.teacherEmail || '—'}
                          </div>
                        </div>

                        <div className="rounded-lg border border-gray-200 p-4 sm:col-span-2">
                          <div className="text-xs font-semibold text-gray-600">Work Done</div>

                          <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <div>
                              <label className="block text-xs font-semibold text-gray-600">From</label>
                              <input
                                type="date"
                                value={workDoneFrom}
                                onChange={(e) => setWorkDoneFrom(e.target.value)}
                                className="mt-1 w-full px-2 py-2 border border-gray-300 rounded-lg text-sm"
                              />
                            </div>

                            <div>
                              <label className="block text-xs font-semibold text-gray-600">To</label>
                              <input
                                type="date"
                                value={workDoneTo}
                                onChange={(e) => setWorkDoneTo(e.target.value)}
                                className="mt-1 w-full px-2 py-2 border border-gray-300 rounded-lg text-sm"
                              />
                            </div>

                            <div className="flex items-end">
                              <button
                                type="button"
                                disabled={workDoneBusy}
                                onClick={async () => {
                                  setWorkDoneBusy(true);
                                  setWorkDoneError(null);
                                  try {
                                    await loadStudentWorkDone(detailUser.uid);
                                  } catch (e: any) {
                                    setWorkDoneRows(null);
                                    setWorkDoneError(String(e?.message ?? 'Failed to load work done'));
                                  } finally {
                                    setWorkDoneBusy(false);
                                  }
                                }}
                                className="w-full px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 text-sm font-semibold disabled:opacity-60"
                              >
                                {workDoneBusy ? 'Loading…' : 'Work Done'}
                              </button>
                            </div>
                          </div>

                          {workDoneError && <div className="mt-3 text-sm text-red-700">{workDoneError}</div>}

                          {workDoneRows && (
                            <div className="mt-4 overflow-auto border border-gray-200 rounded-lg">
                              <table className="min-w-full text-sm">
                                <thead className="bg-gray-50">
                                  <tr>
                                    <th className="text-left px-3 py-2 font-semibold text-gray-700">Section</th>
                                    <th className="text-left px-3 py-2 font-semibold text-gray-700">Subsection</th>
                                    <th className="text-left px-3 py-2 font-semibold text-gray-700">Submitted Questions</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {workDoneRows.length === 0 ? (
                                    <tr>
                                      <td className="px-3 py-3 text-gray-600" colSpan={3}>
                                        No submitted work in this date range.
                                      </td>
                                    </tr>
                                  ) : (
                                    workDoneRows.map((r) => (
                                      <tr key={`${r.section}-${r.subsection}`} className="border-t border-gray-100">
                                        <td className="px-3 py-2 text-gray-900">{r.section}</td>
                                        <td className="px-3 py-2 text-gray-900">{r.subsection}</td>
                                        <td className="px-3 py-2 text-gray-900">{r.submittedQuestions}</td>
                                      </tr>
                                    ))
                                  )}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      </>
                    )}

                    {detailUser.role !== 'student' && (
                      <div className="rounded-lg border border-gray-200 p-4 sm:col-span-2">
                        <div className="text-xs font-semibold text-gray-600">Linked Students</div>
                        {linkedStudentLabels.length > 0 ? (
                          <div className="mt-2 space-y-1">
                            {linkedStudentLabels.map((s, i) => (
                              <div key={i} className="text-sm text-gray-900 break-words">
                                {s}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="text-sm text-gray-900 mt-1">—</div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

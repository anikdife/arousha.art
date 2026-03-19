import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { ensureUserProfileAfterLogin, getUserProfile, linkStudentToEmail, linkStudentToParentUid } from '../lib/userProfileService';
import { isProjectOwner } from '../lib/isProjectOwner';
import { listTopicSessionIndex, listY3NumeracySessionIndex, type SessionIndexItem } from '../lib/sessionIndexReader';
import { UserRole, ClassYear, UserProfile } from '../types/userProfile';
import './DashboardDrops.css';

function toMillis(value: any): number {
  if (!value) return 0;
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }
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

function sessionItemMillis(item: SessionIndexItem): number {
  const direct = item.submittedAtMillis;
  if (typeof direct === 'number' && Number.isFinite(direct) && direct > 0) return direct;
  const ms = toMillis((item as any).submittedAt) || toMillis((item as any).createdAt);
  return typeof ms === 'number' && Number.isFinite(ms) ? ms : 0;
}

function formatTopicLabel(topic: string): string {
  switch (topic) {
    case 'addition':
      return 'Addition';
    case 'subtraction':
      return 'Subtraction';
    case 'multiplication':
      return 'Multiplication';
    case 'measurement':
      return 'Measurement';
    case 'data-probability':
      return 'Data & Probability';
    case 'geometry':
      return 'Geometry';
    case 'reading-magazine':
      return 'Reading';
    case 'writing':
      return 'Writing';
    case 'language-conventions':
      return 'Language';
    default:
      return topic;
  }
}

type TopicCountRow = { topic: string; label: string; count: number };

function countSessionsByTopic(items: SessionIndexItem[]): TopicCountRow[] {
  const order: SessionIndexItem['topic'][] = [
    'addition',
    'subtraction',
    'multiplication',
    'measurement',
    'geometry',
    'data-probability',
    'reading-magazine',
    'language-conventions',
    'writing',
  ];

  const counts = new Map<SessionIndexItem['topic'], number>();
  for (const it of items) {
    counts.set(it.topic, (counts.get(it.topic) ?? 0) + 1);
  }

  return order
    .map((topic) => ({ topic, label: formatTopicLabel(topic), count: counts.get(topic) ?? 0 }))
    .filter((r) => r.count > 0);
}

export const Dashboard: React.FC = () => {
  const { currentUser, userProfile, signOut, loading } = useAuth();
  const navigate = useNavigate();
  const [creatingProfile, setCreatingProfile] = useState(false);
  const [selectedRole, setSelectedRole] = useState<UserRole>('student');
  const [selectedClass, setSelectedClass] = useState<ClassYear>('3');
  const [linkedStudents, setLinkedStudents] = useState<UserProfile[]>([]);

  const [selectedStudentUid, setSelectedStudentUid] = useState<string | null>(null);

  type SectionKey = 'numeracy' | 'reading' | 'writing' | 'language-conventions';
  type SectionCounts = { questions: number; sessionsWithTimeInOut: number; lastSessionMillis?: number };
  type DailyCounts = Record<SectionKey, SectionCounts>;
  type DailyStudentStats = {
    loading: boolean;
    today: DailyCounts;
    yesterday: DailyCounts;
    todaySessions: SessionIndexItem[];
    yesterdaySessions: SessionIndexItem[];
    error?: string;
  };

  const emptyDailyCounts = (): DailyCounts => ({
    numeracy: { questions: 0, sessionsWithTimeInOut: 0, lastSessionMillis: undefined },
    reading: { questions: 0, sessionsWithTimeInOut: 0, lastSessionMillis: undefined },
    writing: { questions: 0, sessionsWithTimeInOut: 0, lastSessionMillis: undefined },
    'language-conventions': { questions: 0, sessionsWithTimeInOut: 0, lastSessionMillis: undefined },
  });

  const [dailyStatsByStudentUid, setDailyStatsByStudentUid] = useState<Record<string, DailyStudentStats>>({});

  const selectedStudent = React.useMemo(() => {
    if (!selectedStudentUid) return null;
    return linkedStudents.find((s) => s.uid === selectedStudentUid) ?? null;
  }, [linkedStudents, selectedStudentUid]);

  const selectedStats = React.useMemo(() => {
    if (!selectedStudentUid) return undefined;
    return dailyStatsByStudentUid[selectedStudentUid];
  }, [dailyStatsByStudentUid, selectedStudentUid]);
  
  // For linking functionality
  const [linkingParentUid, setLinkingParentUid] = useState('');
  const [linkingTeacherEmail, setLinkingTeacherEmail] = useState('');
  const [linkingParent, setLinkingParent] = useState(false);
  const [linkingTeacher, setLinkingTeacher] = useState(false);
  const [linkMessage, setLinkMessage] = useState('');

  const isOwner = isProjectOwner(currentUser, userProfile);
  const canSeeStudents = userProfile?.role === 'owner' || userProfile?.role === 'parent';
  const canAssessWriting = userProfile?.role === 'parent' || userProfile?.role === 'teacher' || userProfile?.role === 'owner';

  // Load linked students for parents/teachers
  useEffect(() => {
    const loadLinkedStudents = async () => {
      if (userProfile && (userProfile.role === 'parent' || userProfile.role === 'teacher')) {
        try {
          const legacy = (userProfile as any)?.linkedStudentIds as unknown;
          const newer = (userProfile as any)?.linkedStudentUids as unknown;

          const idsA = Array.isArray(legacy) ? legacy : [];
          const idsB = Array.isArray(newer) ? newer : [];
          const ids = Array.from(new Set([...(idsA as string[]), ...(idsB as string[])])).filter(Boolean);

          if (ids.length === 0) {
            setLinkedStudents([]);
            return;
          }

          const students = await Promise.all(ids.map((uid) => getUserProfile(uid)));
          const filtered = students.filter(Boolean) as UserProfile[];
          setLinkedStudents(filtered);

          // Preserve existing selection if still valid; otherwise require an explicit click.
          setSelectedStudentUid((prev) => (prev && filtered.some((s) => s.uid === prev) ? prev : null));
        } catch (error) {
          console.error('Error loading linked students:', error);
        }
      }
    };

    loadLinkedStudents();
  }, [userProfile]);

  // Load daily stats only for the selected linked student (reduce network fetch)
  useEffect(() => {
    let cancelled = false;

    const loadDailyCounts = async () => {
      if (!userProfile || (userProfile.role !== 'parent' && userProfile.role !== 'teacher')) return;
      if (!selectedStudentUid) return;
      if (!linkedStudents.some((s) => s.uid === selectedStudentUid)) return;

      const now = new Date();
      const todayStart = new Date(now);
      todayStart.setHours(0, 0, 0, 0);
      const tomorrowStart = new Date(todayStart);
      tomorrowStart.setDate(todayStart.getDate() + 1);
      const yesterdayStart = new Date(todayStart);
      yesterdayStart.setDate(todayStart.getDate() - 1);

      const startToday = todayStart.getTime();
      const startTomorrow = tomorrowStart.getTime();
      const startYesterday = yesterdayStart.getTime();

      setDailyStatsByStudentUid((prev) => ({
        ...prev,
        [selectedStudentUid]: {
          loading: true,
          today: emptyDailyCounts(),
          yesterday: emptyDailyCounts(),
          todaySessions: [],
          yesterdaySessions: [],
        },
      }));

      const calcCounts = (items: SessionIndexItem[], start: number, end: number): SectionCounts => {
        let questions = 0;
        let sessionsWithTimeInOut = 0;
        let lastSessionMillis = 0;

        for (const item of items) {
          const submittedAtMillis = sessionItemMillis(item);
          if (submittedAtMillis < start || submittedAtMillis >= end) continue;

          if (submittedAtMillis > lastSessionMillis) lastSessionMillis = submittedAtMillis;

          const total = typeof item.score?.total === 'number' ? item.score.total : 0;
          questions += total;

          const createdAtMillis = toMillis((item as any).createdAt);
          const submittedAtMillis2 = toMillis((item as any).submittedAt);
          if (createdAtMillis > 0 && submittedAtMillis2 > 0) sessionsWithTimeInOut += 1;
        }

        return { questions, sessionsWithTimeInOut, lastSessionMillis: lastSessionMillis > 0 ? lastSessionMillis : undefined };
      };

      try {
        const uid = selectedStudentUid;
        const [numeracyIndex, readingItems, languageItems, writingItems] = await Promise.all([
          listY3NumeracySessionIndex(uid),
          listTopicSessionIndex(uid, 'reading-magazine'),
          listTopicSessionIndex(uid, 'language-conventions'),
          listTopicSessionIndex(uid, 'writing'),
        ]);

        const numeracyItems = [
          ...numeracyIndex.addition,
          ...numeracyIndex.subtraction,
          ...numeracyIndex.multiplication,
          ...numeracyIndex.measurement,
          ...numeracyIndex.geometry,
          ...numeracyIndex.dataProbability,
        ];

        const today: DailyCounts = {
          numeracy: calcCounts(numeracyItems, startToday, startTomorrow),
          reading: calcCounts(readingItems, startToday, startTomorrow),
          writing: calcCounts(writingItems, startToday, startTomorrow),
          'language-conventions': calcCounts(languageItems, startToday, startTomorrow),
        };

        const yesterday: DailyCounts = {
          numeracy: calcCounts(numeracyItems, startYesterday, startToday),
          reading: calcCounts(readingItems, startYesterday, startToday),
          writing: calcCounts(writingItems, startYesterday, startToday),
          'language-conventions': calcCounts(languageItems, startYesterday, startToday),
        };

        const allItems: SessionIndexItem[] = [...numeracyItems, ...readingItems, ...writingItems, ...languageItems]
          .filter((it) => sessionItemMillis(it) > 0)
          .sort((a, b) => sessionItemMillis(b) - sessionItemMillis(a));

        const todaySessions = allItems.filter((it) => {
          const ms = sessionItemMillis(it);
          return ms >= startToday && ms < startTomorrow;
        });

        const yesterdaySessions = allItems.filter((it) => {
          const ms = sessionItemMillis(it);
          return ms >= startYesterday && ms < startToday;
        });

        if (cancelled) return;

        setDailyStatsByStudentUid((prev) => ({
          ...prev,
          [uid]: { loading: false, today, yesterday, todaySessions, yesterdaySessions },
        }));
      } catch (e) {
        console.error('Failed to load daily session totals for student:', selectedStudentUid, e);
        if (cancelled) return;
        setDailyStatsByStudentUid((prev) => ({
          ...prev,
          [selectedStudentUid]: {
            loading: false,
            today: emptyDailyCounts(),
            yesterday: emptyDailyCounts(),
            todaySessions: [],
            yesterdaySessions: [],
            error: 'Failed to load',
          },
        }));
      }
    };

    loadDailyCounts();
    return () => {
      cancelled = true;
    };
  }, [linkedStudents, selectedStudentUid, userProfile]);

  // Handle linking parent
  const handleLinkParent = async () => {
    if (!currentUser || !linkingParentUid.trim()) return;
    
    setLinkingParent(true);
    setLinkMessage('');
    
    try {
      const parentUid = linkingParentUid.trim();

      if (parentUid.includes('@')) {
        setLinkMessage('Please enter a Parent UID (not an email address).');
        return;
      }

      await linkStudentToParentUid(currentUser.uid, parentUid);
      setLinkMessage('Parent linked successfully!');
      setLinkingParentUid('');
      
      // Reload page to refresh profile
      setTimeout(() => window.location.reload(), 2000);
    } catch (error) {
      console.error('Error linking parent:', error);
      setLinkMessage('Error linking parent. Please check the UID and try again.');
    } finally {
      setLinkingParent(false);
    }
  };

  // Handle linking teacher
  const handleLinkTeacher = async () => {
    if (!currentUser || !linkingTeacherEmail.trim()) return;
    
    setLinkingTeacher(true);
    setLinkMessage('');
    
    try {
      const email = linkingTeacherEmail.trim();
      
      // Basic email validation
      if (!email.includes('@')) {
        setLinkMessage('Please enter a valid email address.');
        return;
      }
      
      // Link student to teacher email
      await linkStudentToEmail(currentUser.uid, email, 'teacher');
      setLinkMessage('Teacher email linked successfully! When your teacher signs in with this email, you\'ll be automatically connected.');
      setLinkingTeacherEmail('');
      
      // Reload page to refresh profile
      setTimeout(() => window.location.reload(), 2000);
    } catch (error) {
      console.error('Error linking teacher:', error);
      setLinkMessage('Error linking teacher email. Please try again.');
    } finally {
      setLinkingTeacher(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Loading...</h1>
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Not authenticated</h1>
          <Link
            to="/login"
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            Sign In
          </Link>
        </div>
      </div>
    );
  }

  if (!userProfile) {
    const handleCreateProfile = async () => {
      if (!currentUser) return;
      
      setCreatingProfile(true);
      try {
        // For students, we need class year
        const profileData: any = {
          uid: currentUser.uid,
          email: currentUser.email || undefined,
          displayName: currentUser.displayName || undefined,
          role: selectedRole,
        };

        if (selectedRole === 'student') {
          profileData.classYear = selectedClass;
          // Note: Parent/Teacher linking would be implemented with invite codes in a real app
          // For now, we'll add these fields as optional
        }

        await ensureUserProfileAfterLogin(profileData);
        
        // Reload the page to refresh the user profile
        window.location.reload();
      } catch (error) {
        console.error('Error creating profile:', error);
        alert('Error creating profile. Please try again.');
      } finally {
        setCreatingProfile(false);
      }
    };

    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center max-w-md">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Profile Not Found</h1>
          <p className="text-gray-600 mb-6">Your user profile could not be found. Please create a profile by selecting your role.</p>
          <p className="text-sm text-gray-500 mb-6">Debug: User ID = {currentUser.uid}</p>
          
          <div className="bg-white border border-gray-200 rounded-lg p-6 mb-6">
            <h3 className="text-lg font-semibold mb-4">Create Profile</h3>
            
            <div className="space-y-4">
              {/* Role Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">Select your role</label>
                <div className="space-y-2">
                  {(['student', 'parent', 'teacher'] as UserRole[]).map((role) => (
                    <label key={role} className="flex items-center">
                      <input
                        type="radio"
                        name="role"
                        value={role}
                        checked={selectedRole === role}
                        onChange={(e) => setSelectedRole(e.target.value as UserRole)}
                        className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300"
                      />
                      <span className="ml-3 text-sm text-gray-700 capitalize">
                        {role}
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Class Year Selection for Students */}
              {selectedRole === 'student' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-3">Select your class year</label>
                  <div className="space-y-2">
                    {(['3', '5', '7', '9'] as ClassYear[]).map((year) => (
                      <label key={year} className="flex items-center">
                        <input
                          type="radio"
                          name="classYear"
                          value={year}
                          checked={selectedClass === year}
                          onChange={(e) => setSelectedClass(e.target.value as ClassYear)}
                          className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300"
                        />
                        <span className="ml-3 text-sm text-gray-700">
                          Year {year}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {/* Parent/Teacher Email for Students (Optional for now) */}
              {selectedRole === 'student' && (
                <div>
                  <p className="text-xs text-gray-500 mt-1">
                    Note: Parent/Teacher linking is done after profile creation.
                  </p>
                </div>
              )}
            </div>

            <button
              onClick={handleCreateProfile}
              disabled={creatingProfile}
              className="w-full mt-6 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
            >
              {creatingProfile ? 'Creating Profile...' : 'Create Profile'}
            </button>
          </div>

          <button
            onClick={signOut}
            className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            Sign Out Instead
          </button>
        </div>
      </div>
    );
  }

  const handleSignOut = async () => {
    await signOut();
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="bg-white shadow rounded-lg p-6">
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
            <div className="flex items-center gap-2">
              {canSeeStudents && (
                <Link
                  to="/dashboard/students"
                  className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded-lg text-sm font-medium transition-colors"
                >
                  Create/link/unlink student profile
                </Link>
              )}
              {isOwner && (
                <Link
                  to="/owner"
                  className="bg-gray-200 hover:bg-gray-300 text-gray-800 px-3 py-2 rounded-lg text-sm font-medium transition-colors"
                >
                  Owner
                </Link>
              )}
              <button
                onClick={handleSignOut}
                className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              >
                Sign Out
              </button>
            </div>
          </div>
          
          {/* User Profile Info */}
          <div className="mb-8">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Welcome, {userProfile.displayName}!</h2>
            <div className="bg-gray-50 p-4 rounded-lg">
              <p className="text-sm text-gray-600 mb-2"><strong>Role:</strong> {userProfile.role}</p>
              <p className="text-sm text-gray-600 mb-2"><strong>Email:</strong> {userProfile.email || 'Not provided'}</p>
              {userProfile.role === 'student' && userProfile.classYear && (
                <p className="text-sm text-gray-600 mb-2"><strong>Class Year:</strong> {userProfile.classYear}</p>
              )}
              <p className="text-sm text-gray-600"><strong>User ID:</strong> {userProfile.uid}</p>
            </div>
          </div>

          {/* Role-specific Content */}
          {userProfile.role === 'student' && (
            <div className="space-y-6">
              <h3 className="text-lg font-semibold text-gray-900">Student Resources - Year {userProfile.classYear}</h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {String(userProfile.classYear) === '3' && (
                  <Link
                    to="/y3/numeracy"
                    className="block p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    <div className="text-sm font-medium text-blue-600 mb-1">Year 3 Numeracy</div>
                    <div className="text-xs text-gray-500">Practice numeracy skills for your year level</div>
                  </Link>
                )}
                
                <Link
                  to={String(userProfile.classYear) === '3' ? '/y3/history' : '/y3/history'}
                  className="block p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <div className="text-sm font-medium text-blue-600 mb-1">My Practice Sessions</div>
                  <div className="text-xs text-gray-500">View your completed practice work</div>
                </Link>

                <Link
                  to="/"
                  className="block p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <div className="text-sm font-medium text-blue-600 mb-1">Home</div>
                  <div className="text-xs text-gray-500">Return to main page</div>
                </Link>
              </div>

              {/* Linking Information */}
              <div className="mt-6 p-4 bg-blue-50 rounded-lg">
                <h4 className="text-sm font-semibold text-blue-900 mb-3">Linked Accounts</h4>

                {(() => {
                  const linkedParents = Array.isArray((userProfile as any).linkedParentUids)
                    ? ((userProfile as any).linkedParentUids as string[])
                    : [];
                  const hasLinkedParents = linkedParents.length > 0;
                  return (
                    <>
                      {/* Current Links */}
                      <div className="mb-4 space-y-1">
                        {(userProfile.parentId || hasLinkedParents) && (
                          <p className="text-xs text-green-700">✓ Parent connected: {userProfile.parentId || linkedParents.join(', ')}</p>
                        )}
                        {userProfile.teacherId && (
                          <p className="text-xs text-green-700">✓ Teacher connected: {userProfile.teacherId}</p>
                        )}
                        {userProfile.teacherEmail && !userProfile.teacherId && (
                          <p className="text-xs text-orange-600">⏳ Teacher email linked: {userProfile.teacherEmail} (waiting for them to sign in)</p>
                        )}
                        {!userProfile.parentId && !hasLinkedParents && !userProfile.teacherId && !userProfile.teacherEmail && (
                          <p className="text-xs text-blue-700">No parent or teacher accounts linked yet</p>
                        )}
                      </div>

                      {/* Link Parent Section */}
                      {!userProfile.parentId && !hasLinkedParents && (
                        <div className="mb-4 p-3 bg-white rounded border">
                          <h5 className="text-xs font-medium text-gray-700 mb-2">Link Parent Account</h5>
                          <div className="flex gap-2">
                            <input
                              type="text"
                              value={linkingParentUid}
                              onChange={(e) => setLinkingParentUid(e.target.value)}
                              placeholder="Enter Parent UID"
                              className="flex-1 px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:border-blue-500"
                            />
                            <button
                              onClick={handleLinkParent}
                              disabled={linkingParent || !linkingParentUid.trim()}
                              className="px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              {linkingParent ? 'Linking...' : 'Link'}
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Link Teacher Section */}
                      {!userProfile.teacherId && !userProfile.teacherEmail && (
                        <div className="mb-4 p-3 bg-white rounded border">
                          <h5 className="text-xs font-medium text-gray-700 mb-2">Link Teacher Account</h5>
                          <div className="flex gap-2">
                            <input
                              type="email"
                              value={linkingTeacherEmail}
                              onChange={(e) => setLinkingTeacherEmail(e.target.value)}
                              placeholder="Enter Teacher's Email"
                              className="flex-1 px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:border-blue-500"
                            />
                            <button
                              onClick={handleLinkTeacher}
                              disabled={linkingTeacher || !linkingTeacherEmail.trim()}
                              className="px-3 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              {linkingTeacher ? 'Linking...' : 'Link'}
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Link Status Message */}
                      {linkMessage && (
                        <div
                          className={`p-2 rounded text-xs ${
                            linkMessage.includes('successfully') || linkMessage === 'Parent linked successfully!'
                              ? 'bg-green-100 text-green-800'
                              : 'bg-red-100 text-red-800'
                          }`}
                        >
                          {linkMessage}
                        </div>
                      )}

                      <p className="text-xs text-gray-500 mt-3">Ask your parent or teacher for their User ID to link accounts.</p>
                    </>
                  );
                })()}
              </div>
            </div>
          )}

          {(userProfile.role === 'parent' || userProfile.role === 'teacher') && (
            <div className="space-y-6">
              <h3 className="text-lg font-semibold text-gray-900">
                {userProfile.role === 'parent' ? 'Your Children\'s Work' : 'Your Students\' Work'}
              </h3>
              
              {linkedStudents.length > 0 ? (
                <div className="space-y-4">
                  {!selectedStudentUid && (
                    <div className="grid grid-cols-2 gap-3">
                      {linkedStudents.map((student) => (
                        <button
                          key={student.uid}
                          type="button"
                          onClick={() => setSelectedStudentUid(student.uid)}
                          className="text-left border border-gray-200 bg-white hover:bg-gray-50 rounded-lg p-3 transition-colors"
                        >
                          <div className="text-sm font-semibold text-gray-900">{student.displayName}</div>
                        </button>
                      ))}
                    </div>
                  )}

                  {selectedStudentUid && (
                    <div className="border border-gray-200 rounded-lg p-4">
                      <div className="flex items-center justify-between mb-4">
                        <div className="text-sm font-semibold text-gray-900">Selected student</div>
                        <button
                          type="button"
                          onClick={() => setSelectedStudentUid(null)}
                          className="text-xs font-medium text-blue-600 hover:text-blue-700"
                        >
                          Change student
                        </button>
                      </div>

                      <div className="border border-gray-200 rounded-xl overflow-hidden">
                        <div className="flex flex-col md:flex-row">
                          {/* Left identity panel */}
                          <div className="md:w-64 bg-gray-900 text-white p-4">
                            <div className="text-xs text-gray-300">Student</div>
                            <div className="text-lg font-bold mt-1">{selectedStudent?.displayName ?? 'Selected student'}</div>

                            <div className="mt-6">
                              <div className="text-xs font-semibold text-white mb-2">Student info</div>
                              <div className="border border-white/20 rounded-lg overflow-hidden">
                                <table className="w-full text-[11px]">
                                  <tbody>
                                    <tr className="border-b border-white/10">
                                      <td className="px-2 py-1 text-gray-300">Name</td>
                                      <td className="px-2 py-1 text-right text-white font-semibold">{selectedStudent?.displayName ?? '—'}</td>
                                    </tr>
                                    <tr className="border-b border-white/10">
                                      <td className="px-2 py-1 text-gray-300">Class</td>
                                      <td className="px-2 py-1 text-right text-white font-semibold">{selectedStudent?.classYear ?? '—'}</td>
                                    </tr>
                                    <tr className="border-b border-white/10">
                                      <td className="px-2 py-1 text-gray-300">Student ID</td>
                                      <td className="px-2 py-1 text-right text-white font-semibold">{(selectedStudent as any)?.studentId ?? '—'}</td>
                                    </tr>
                                    <tr>
                                      <td className="px-2 py-1 text-gray-300">UID</td>
                                      <td className="px-2 py-1 text-right text-white font-semibold">{selectedStudentUid.slice(0, 6)}…{selectedStudentUid.slice(-4)}</td>
                                    </tr>
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          </div>

                          {/* Right inclined stat cards */}
                          <div className="flex-1 bg-gray-50 p-4">
                            <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-4">
                              <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                                <div className="px-3 py-2 border-b border-gray-200">
                                  <div className="text-xs font-semibold text-gray-900">
                                    Today (Total sessions: {selectedStats?.todaySessions?.length ?? 0})
                                  </div>
                                </div>
                                {selectedStats?.loading ? (
                                  <div className="px-3 py-3 text-xs text-gray-600">Loading…</div>
                                ) : selectedStats?.error ? (
                                  <div className="px-3 py-3 text-xs text-red-700">Failed to load</div>
                                ) : (selectedStats?.todaySessions?.length ?? 0) === 0 ? (
                                  <div className="px-3 py-3 text-xs text-gray-600">No workbooks submitted today.</div>
                                ) : (
                                  <table className="w-full text-xs">
                                    <thead>
                                      <tr className="text-left text-gray-500">
                                        <th className="px-3 py-2">Serial</th>
                                        <th className="px-3 py-2">Type</th>
                                        <th className="px-3 py-2 text-right">Count</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {countSessionsByTopic(selectedStats?.todaySessions ?? []).map((row, idx) => (
                                        <tr key={`t-c-${row.topic}`} className="border-t border-gray-100">
                                          <td className="px-3 py-2 text-gray-700">{idx + 1}</td>
                                          <td className="px-3 py-2 text-gray-700">{row.label}</td>
                                          <td className="px-3 py-2 text-right text-gray-900 font-semibold">{row.count}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                )}
                              </div>

                              <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                                <div className="px-3 py-2 border-b border-gray-200">
                                  <div className="text-xs font-semibold text-gray-900">
                                    Yesterday (Total sessions: {selectedStats?.yesterdaySessions?.length ?? 0})
                                  </div>
                                </div>
                                {selectedStats?.loading ? (
                                  <div className="px-3 py-3 text-xs text-gray-600">Loading…</div>
                                ) : selectedStats?.error ? (
                                  <div className="px-3 py-3 text-xs text-red-700">Failed to load</div>
                                ) : (selectedStats?.yesterdaySessions?.length ?? 0) === 0 ? (
                                  <div className="px-3 py-3 text-xs text-gray-600">No workbooks submitted yesterday.</div>
                                ) : (
                                  <table className="w-full text-xs">
                                    <thead>
                                      <tr className="text-left text-gray-500">
                                        <th className="px-3 py-2">Serial</th>
                                        <th className="px-3 py-2">Type</th>
                                        <th className="px-3 py-2 text-right">Count</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {countSessionsByTopic(selectedStats?.yesterdaySessions ?? []).map((row, idx) => (
                                        <tr key={`y-c-${row.topic}`} className="border-t border-gray-100">
                                          <td className="px-3 py-2 text-gray-700">{idx + 1}</td>
                                          <td className="px-3 py-2 text-gray-700">{row.label}</td>
                                          <td className="px-3 py-2 text-right text-gray-900 font-semibold">{row.count}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>

                      <Link
                        to="/y3/history"
                        state={{
                          studentUid: selectedStudentUid,
                          studentName: selectedStudent?.displayName,
                        }}
                        className="inline-block bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded text-xs font-medium transition-colors"
                      >
                        View Practice Sessions
                      </Link>

                      {canAssessWriting && (
                        <button
                          type="button"
                          onClick={() => {
                            // Open straight into Writing assessment for the selected student.
                            navigate('/dashboard/assessment', {
                              state: {
                                studentUid: selectedStudentUid,
                                studentName: selectedStudent?.displayName,
                              },
                            });
                          }}
                          className="ml-2 inline-block bg-purple-600 hover:bg-purple-700 text-white px-3 py-1 rounded text-xs font-medium transition-colors"
                        >
                          Assess Writing
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-8">
                  <p className="text-gray-500 mb-4">
                    No {userProfile.role === 'parent' ? 'children' : 'students'} have linked their accounts yet.
                  </p>
                  <p className="text-sm text-gray-400">
                    Students can link their accounts by entering your email during profile creation.
                  </p>
                </div>
              )}

              <Link
                to="/"
                className="inline-block bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              >
                Return to Home
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
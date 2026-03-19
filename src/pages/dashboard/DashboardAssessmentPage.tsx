import React, { useMemo } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../auth/AuthProvider';
import { Y3HistoryWritingSection } from '../y3/history/writing/Y3HistoryWritingSection';

export const DashboardAssessmentPage: React.FC = () => {
  const { currentUser, userProfile } = useAuth();
  const location = useLocation();

  const state = (location.state as any) ?? {};
  const studentUid = typeof state.studentUid === 'string' ? state.studentUid : undefined;
  const studentName = typeof state.studentName === 'string' ? state.studentName : undefined;

  const role = userProfile?.role ?? 'student';
  const canAssess = role === 'parent' || role === 'teacher' || role === 'owner';

  const linkedStudentUids = useMemo(() => {
    const legacy = (userProfile as any)?.linkedStudentIds as unknown;
    const newer = (userProfile as any)?.linkedStudentUids as unknown;
    const idsA = Array.isArray(legacy) ? (legacy as string[]) : [];
    const idsB = Array.isArray(newer) ? (newer as string[]) : [];
    return Array.from(new Set([...idsA, ...idsB])).filter(Boolean);
  }, [userProfile]);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-white shadow rounded-lg p-6">
          <div className="flex items-center justify-between gap-4">
            <h1 className="text-2xl font-bold text-gray-900">Assessment</h1>
            {canAssess && (studentName || studentUid) && (
              <div className="text-right">
                <div className="text-sm font-semibold text-gray-900">Writing</div>
                <div className="text-xs text-gray-500">Viewing: {studentName ?? 'Selected student'}</div>
              </div>
            )}
          </div>

          {!currentUser || !userProfile ? (
            <div className="mt-6 text-sm text-gray-600">Please sign in to continue.</div>
          ) : !canAssess ? (
            <div className="mt-6 text-sm text-red-700">Not authorised.</div>
          ) : !studentUid ? (
            <div className="mt-6 text-sm text-gray-700">
              No student selected. Go to{' '}
              <Link className="text-blue-700 hover:text-blue-800" to="/dashboard">
                Dashboard
              </Link>{' '}
              and choose a student, then click “Assess Writing”.
            </div>
          ) : (
            <div className="mt-6">
              <Y3HistoryWritingSection
                studentUid={studentUid}
                studentName={studentName}
                linkedStudentUids={linkedStudentUids}
                defaultTab="assessment"
                hideTabs
                hideGraphTab
                hideAssessmentTab
                hideHeader
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

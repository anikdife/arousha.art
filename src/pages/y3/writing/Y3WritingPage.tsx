import React, { useEffect } from 'react';
import { NavLink, Route, Routes, useNavigate } from 'react-router-dom';
import { useAuth } from '../../../auth/AuthProvider';
import { Y3WritingView } from './Y3WritingView';
import { Y3WritingPractice } from './Y3WritingPractice';
import { Y3WritingAssessment } from './Y3WritingAssessment';
import { Y3WritingHistory } from './Y3WritingHistory';

function TabLink(props: { to: string; label: string; end?: boolean }) {
  return (
    <NavLink
      to={props.to}
      end={props.end}
      className={({ isActive }) =>
        `px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
          isActive ? 'bg-blue-600 text-white' : 'text-gray-700 hover:bg-gray-100'
        }`
      }
    >
      {props.label}
    </NavLink>
  );
}

export const Y3WritingPage: React.FC = () => {
  const navigate = useNavigate();
  const { userProfile } = useAuth();
  const role = userProfile?.role ?? 'student';
  const isAssessor = role === 'parent' || role === 'teacher';

  useEffect(() => {
    if (!isAssessor) return;
    navigate('/y3/history', { replace: true, state: { historyCategory: 'writing' } });
  }, [isAssessor, navigate]);

  useEffect(() => {
    const prevBodyOverflow = document.body.style.overflow;
    const prevHtmlOverflow = document.documentElement.style.overflow;
    const prevBodyHeight = document.body.style.height;
    const prevHtmlHeight = document.documentElement.style.height;

    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    document.body.style.height = '100%';
    document.documentElement.style.height = '100%';

    return () => {
      document.body.style.overflow = prevBodyOverflow;
      document.documentElement.style.overflow = prevHtmlOverflow;
      document.body.style.height = prevBodyHeight;
      document.documentElement.style.height = prevHtmlHeight;
    };
  }, []);

  return (
    <div className="h-[100dvh] bg-gray-50 flex flex-col overflow-hidden">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-10 shrink-0">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Year 3 • Writing</h1>
            <div className="text-sm text-gray-600 mt-1">Read a prompt and plan your writing.</div>
          </div>
        </div>

        <div className="mt-6">
          <div className="inline-flex rounded-xl border border-gray-200 bg-white p-1 shadow-sm">
            <TabLink to="/y3/writing" label="Writing" end />
            {isAssessor ? (
              <TabLink to="/y3/writing/assessment" label="Assessment" />
            ) : (
              <TabLink to="/y3/writing/practice" label="Practice" />
            )}
            <TabLink to="/y3/writing/history" label="History" />
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        <Routes>
          <Route index element={<Y3WritingView />} />
          <Route path="practice" element={<Y3WritingPractice />} />
          <Route path="assessment" element={<Y3WritingAssessment />} />
          <Route path="history" element={<Y3WritingHistory />} />
        </Routes>
      </div>
    </div>
  );
};

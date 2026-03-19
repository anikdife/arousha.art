// src/pages/ShareViewer.tsx

import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { getSharedSession } from '../lib/sessionService';
import { mapSessionProblemToLibProblem } from '../lib/sessionMapper';
import { buildSubtractionPdf, downloadBytes } from '../lib/subtractionPdf';
import { getUserProfile } from '../lib/userProfileService';
import { formatForDisplay, NumericSubProblem } from '../lib/y3SubtractionGen';
import { PracticeSessionDoc } from '../types/practiceSession';

export const ShareViewer: React.FC = () => {
  const { shareId } = useParams<{ shareId: string }>();
  const [session, setSession] = useState<PracticeSessionDoc | null>(null);
  const [studentName, setStudentName] = useState<string | null>(null);
  const [activePageIndex, setActivePageIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadSharedSession();
  }, [shareId]);

  useEffect(() => {
    let cancelled = false;

    async function loadStudentName() {
      try {
        if (!session?.ownerUid) return;
        const profile = await getUserProfile(session.ownerUid);
        const name = (profile as any)?.displayName;
        if (!cancelled && typeof name === 'string' && name.trim()) {
          setStudentName(name);
        }
      } catch {
        // Ignore profile lookup failures (e.g. public share / permissions)
      }
    }

    loadStudentName();
    return () => {
      cancelled = true;
    };
  }, [session?.ownerUid]);

  const loadSharedSession = async () => {
    if (!shareId) return;

    try {
      const sessionData = await getSharedSession(shareId);
      
      if (!sessionData) {
        setError('Shared session not found or no longer available');
        return;
      }

      setSession(sessionData);
    } catch (err) {
      setError('Error loading shared session');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleGeneratePDF = async () => {
    if (!session) return;

    try {
      const libPages = session.pages.map(page => ({
        pageId: page.pageId,
        problems: page.problems.map(mapSessionProblemToLibProblem),
        userAnswers: page.userAnswers,
        graded: page.graded
      }));

      const pdfBytes = await buildSubtractionPdf({
        title: 'Shared Subtraction Practice Session',
        pages: libPages,
        createdAtIso: (session as any).submittedAt ?? (session as any).createdAt,
        studentName: studentName ?? 'Student',
      });

      const timestamp = new Date().toISOString().slice(0, 10);
      downloadBytes(pdfBytes, `shared-subtraction-session-${timestamp}.pdf`);
    } catch (error) {
      console.error('Error generating PDF:', error);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-green-50 flex items-center justify-center">
        <div className="text-lg text-gray-600">Loading shared session...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-green-50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-lg text-red-600 mb-4">{error}</div>
          <p className="text-gray-600">This link may have expired or been disabled.</p>
        </div>
      </div>
    );
  }

  if (!session) return null;

  const currentPage = session.pages[activePageIndex];

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-green-50">
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Shared Practice Session</h1>
              <p className="text-gray-600">
                Completed: {session.submittedAt && new Date(session.submittedAt.toDate()).toLocaleDateString()}
              </p>
            </div>
            <button
              onClick={handleGeneratePDF}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center space-x-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <span>Download PDF</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Score Summary */}
        {session.score && (
          <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm mb-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Student Performance</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="text-center">
                <div className="text-3xl font-bold text-blue-600">{session.score.percentage}%</div>
                <div className="text-gray-600">Overall Score</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-green-600">{session.score.correct}</div>
                <div className="text-gray-600">Correct Answers</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-gray-600">{session.score.total}</div>
                <div className="text-gray-600">Total Questions</div>
              </div>
            </div>
          </div>
        )}

        {/* Page Navigation */}
        {session.pages.length > 1 && (
          <div className="flex items-center justify-between mb-6">
            <button
              onClick={() => setActivePageIndex(Math.max(0, activePageIndex - 1))}
              disabled={activePageIndex === 0}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg disabled:bg-gray-300 disabled:cursor-not-allowed"
            >
              Previous Page
            </button>
            
            <span className="text-gray-600">
              Page {activePageIndex + 1} of {session.pages.length}
            </span>
            
            <button
              onClick={() => setActivePageIndex(Math.min(session.pages.length - 1, activePageIndex + 1))}
              disabled={activePageIndex === session.pages.length - 1}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg disabled:bg-gray-300 disabled:cursor-not-allowed"
            >
              Next Page
            </button>
          </div>
        )}

        {/* Problems Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {currentPage.problems.map((problem, index) => {
            const userAnswer = currentPage.userAnswers[problem.id] || '';
            const isCorrect = currentPage.graded?.[problem.id] || false;
            
            if (problem.kind === 'word') {
              return (
                <div key={problem.id} className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm col-span-1 md:col-span-2">
                  <div className="text-sm font-medium text-gray-500 mb-3">
                    Question {index + 1}
                  </div>
                  
                  <div className="mb-4">
                    <p className="text-sm leading-relaxed text-gray-800">
                      {problem.text}
                    </p>
                  </div>
                  
                  <div className="flex items-center space-x-3">
                    <span className="text-sm font-medium text-gray-700">Student Answer:</span>
                    <span className="text-lg font-mono bg-gray-50 px-2 py-1 rounded">
                      {userAnswer || '(blank)'}
                    </span>
                    <div className={`text-lg font-bold ${isCorrect ? 'text-green-600' : 'text-red-600'}`}>
                      {isCorrect ? '✓' : '✗'}
                    </div>
                  </div>
                  
                  {!isCorrect && (
                    <div className="text-sm text-gray-500 mt-2">
                      Correct Answer: {problem.expected}
                    </div>
                  )}
                </div>
              );
            } else if (problem.kind === 'numeric') {
              // Numeric problem
              const libProblem = mapSessionProblemToLibProblem(problem);
              const display = formatForDisplay(libProblem as NumericSubProblem);
              
              return (
                <div key={problem.id} className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm">
                  <div className="text-sm font-medium text-gray-500 mb-3">
                    Question {index + 1}
                  </div>
                  
                  <div className="text-center mb-4">
                    <div className="text-right text-lg font-mono mb-1">
                      {display.top}
                    </div>
                    <div className="text-right text-lg font-mono mb-1">
                      - {display.bottom}
                    </div>
                    <div className="border-b border-gray-400 mb-2"></div>
                    
                    <div className="flex items-center justify-end space-x-2">
                      <span className="text-lg font-mono bg-gray-50 px-2 py-1 rounded">
                        {userAnswer || '(blank)'}
                      </span>
                      <div className={`text-lg font-bold ${isCorrect ? 'text-green-600' : 'text-red-600'}`}>
                        {isCorrect ? '✓' : '✗'}
                      </div>
                    </div>
                    
                    {display.result && (
                      <div className="text-right text-lg font-mono mt-1">
                        = {display.result}
                      </div>
                    )}
                    
                    {!isCorrect && (
                      <div className="text-sm text-gray-500 mt-2">
                        Correct: {problem.expected}
                      </div>
                    )}
                  </div>
                </div>
              );
            }
          })}
        </div>
      </main>
    </div>
  );
};
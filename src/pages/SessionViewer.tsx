// src/pages/SessionViewer.tsx

import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { getSession, enableSharing } from '../lib/sessionService';
import { mapSessionProblemToLibProblem } from '../lib/sessionMapper';
import { buildSubtractionPdf, downloadBytes } from '../lib/subtractionPdf';
import { getUserProfile } from '../lib/userProfileService';
import { formatForDisplay, expectedAnswer, NumericSubProblem } from '../lib/y3SubtractionGen';
import { PracticeSessionDoc } from '../types/practiceSession';

export const SessionViewer: React.FC = () => {
  const { sessionId } = useParams<{ sessionId: string }>();
  const { currentUser } = useAuth();
  const navigate = useNavigate();

  const [session, setSession] = useState<PracticeSessionDoc | null>(null);
  const [studentName, setStudentName] = useState<string | null>(null);
  const [activePageIndex, setActivePageIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sharingEnabled, setSharingEnabled] = useState(false);
  const [shareLink, setShareLink] = useState<string>('');

  useEffect(() => {
    loadSession();
  }, [sessionId]);

  useEffect(() => {
    let cancelled = false;

    async function loadStudentName() {
      try {
        if (!session?.ownerUid) return;

        // Prefer the session owner's current auth display name when they are the viewer.
        if (currentUser?.uid && currentUser.uid === session.ownerUid) {
          const name = currentUser.displayName;
          if (typeof name === 'string' && name.trim()) {
            setStudentName(name);
            return;
          }
        }

        // Otherwise try to load the owner's profile.
        const profile = await getUserProfile(session.ownerUid);
        const name = (profile as any)?.displayName;
        if (!cancelled && typeof name === 'string' && name.trim()) {
          setStudentName(name);
        }
      } catch {
        // Ignore profile lookup failures
      }
    }

    loadStudentName();
    return () => {
      cancelled = true;
    };
  }, [currentUser?.displayName, currentUser?.uid, session?.ownerUid]);

  const loadSession = async () => {
    if (!sessionId) return;

    try {
      const sessionData = await getSession(sessionId);
      
      if (!sessionData) {
        setError('Session not found');
        return;
      }

      // Check if user has permission to view
      if (sessionData.ownerUid !== currentUser?.uid && 
          (!sessionData.share?.enabled || !sessionData.share?.public)) {
        setError('You do not have permission to view this session');
        return;
      }

      setSession(sessionData);
      setSharingEnabled(sessionData.share?.enabled || false);
      if (sessionData.share?.shareId) {
        setShareLink(`${window.location.origin}/share/${sessionData.share.shareId}`);
      }
    } catch (err) {
      setError('Error loading session');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleGeneratePDF = async () => {
    if (!session) return;

    try {
      // Convert session data to lib format
      const libPages = session.pages.map(page => ({
        pageId: page.pageId,
        problems: page.problems.map(mapSessionProblemToLibProblem),
        userAnswers: page.userAnswers,
        graded: page.graded
      }));

      const pdfBytes = await buildSubtractionPdf({
        title: 'Subtraction Practice Session',
        pages: libPages,
        createdAtIso: (session as any).submittedAt ?? (session as any).createdAt,
        studentName: studentName ?? currentUser?.displayName ?? 'Student',
      });
      const timestamp = new Date().toISOString().slice(0, 10);
      downloadBytes(pdfBytes, `subtraction-session-${timestamp}.pdf`);
    } catch (error) {
      console.error('Error generating PDF:', error);
    }
  };

  const handleEnableSharing = async () => {
    if (!session || !currentUser || session.ownerUid !== currentUser.uid) return;

    try {
      const shareId = crypto.randomUUID();
      await enableSharing(session.sessionId, shareId);
      
      setSharingEnabled(true);
      setShareLink(`${window.location.origin}/share/${shareId}`);
      
      // Update local state
      setSession({
        ...session,
        share: {
          enabled: true,
          shareId,
          public: true
        }
      });
    } catch (error) {
      console.error('Error enabling sharing:', error);
    }
  };

  const copyShareLink = () => {
    navigator.clipboard.writeText(shareLink);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-green-50 flex items-center justify-center">
        <div className="text-lg text-gray-600">Loading session...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-green-50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-lg text-red-600 mb-4">{error}</div>
          <button
            onClick={() => navigate('/dashboard')}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  if (!session) return null;

  const currentPage = session.pages[activePageIndex];
  const isOwner = session.ownerUid === currentUser?.uid;

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-green-50">
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Session Review</h1>
              <p className="text-gray-600">
                Submitted: {session.submittedAt && new Date(session.submittedAt.toDate()).toLocaleDateString()}
              </p>
            </div>
            <div className="flex items-center space-x-4">
              <button
                onClick={handleGeneratePDF}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center space-x-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <span>Download PDF</span>
              </button>
              <button
                onClick={() => navigate('/dashboard')}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Back to Dashboard
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Score Summary */}
        {session.score && (
          <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm mb-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Final Score</h2>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-3xl font-bold text-blue-600">{session.score.percentage}%</div>
                <div className="text-gray-600">{session.score.correct} out of {session.score.total} correct</div>
              </div>
            </div>
          </div>
        )}

        {/* Sharing Controls */}
        {isOwner && (
          <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm mb-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Share Session</h2>
            {!sharingEnabled ? (
              <div>
                <p className="text-gray-600 mb-4">Enable sharing to create a public link for teachers or parents to review this session.</p>
                <button
                  onClick={handleEnableSharing}
                  className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
                >
                  Enable Public Sharing
                </button>
              </div>
            ) : (
              <div>
                <p className="text-gray-600 mb-2">Share this link with teachers or parents:</p>
                <div className="flex items-center space-x-2">
                  <input
                    type="text"
                    value={shareLink}
                    readOnly
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-md bg-gray-50"
                  />
                  <button
                    onClick={copyShareLink}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                  >
                    Copy
                  </button>
                </div>
              </div>
            )}
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
                    <span className="text-sm font-medium text-gray-700">Answer:</span>
                    <span className="text-lg font-mono bg-gray-50 px-2 py-1 rounded">
                      {userAnswer || '(blank)'}
                    </span>
                    <div className={`text-lg font-bold ${isCorrect ? 'text-green-600' : 'text-red-600'}`}>
                      {isCorrect ? 'C' : 'X'}
                    </div>
                  </div>
                  
                  {!isCorrect && (
                    <div className="text-sm text-gray-500 mt-2">
                      Correct: {problem.expected}
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
                        {isCorrect ? 'C' : 'X'}
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
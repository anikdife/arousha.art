// src/pages/y3/numeracy/subtraction/Y3SubtractionPractice.tsx

import React, { useState, useCallback, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { 
  PracticePage, 
  generatePracticePage,
  NumericSubProblem,
  AnySubProblem,
  expectedAnswer
} from '../../../../lib/y3SubtractionGen';
import { uploadSessionJson } from '../../../../lib/uploadSessionJson';
import { auth } from '../../../../firebase/firebase';
import { APP_VERSION, GENERATOR_VERSION } from '../../../../constants/version';
import { incrementSubtractionCount } from '../../../../lib/userCounterService';
import { writeSubtractionSessionIndex } from '../../../../lib/sessionIndexService';

export const Y3SubtractionPractice: React.FC = () => {
  const location = useLocation();
  const loadedSession = location.state?.loadedSession;

  const [pages, setPages] = useState<PracticePage[]>([generatePracticePage({ numericCount: 6, wordCount: 2 })]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [submitted, setSubmitted] = useState(false);
  const [uploadState, setUploadState] = useState<'idle' | 'uploading' | 'done' | 'error'>('idle');

  // Load session data if provided via navigation state
  useEffect(() => {
    if (loadedSession?.pages) {
      // Convert loaded session pages to PracticePage format
      const convertedPages = loadedSession.pages.map((page: any) => ({
        ...page,
        userAnswers: page.userAnswers || {},
        graded: undefined // Reset graded state for editing
      }));
      
      setPages(convertedPages);
      setSubmitted(false); // Allow editing
      setActiveIndex(0);
      setUploadState('idle');
    }
  }, [loadedSession]);

  const currentPage = pages[activeIndex];

  const updateAnswer = useCallback((problemId: string, value: string) => {
    if (submitted) return;
    
    setPages(prev => 
      prev.map((page, index) => 
        index === activeIndex 
          ? { ...page, userAnswers: { ...page.userAnswers, [problemId]: value } }
          : page
      )
    );
  }, [activeIndex, submitted]);

  const addNewPage = useCallback(() => {
    if (submitted) return;
    
    const newPage = generatePracticePage({ numericCount: 6, wordCount: 2 });
    setPages(prev => [...prev, newPage]);
    setActiveIndex(pages.length);
  }, [pages.length, submitted]);

  const goToPreviousPage = useCallback(() => {
    if (activeIndex > 0) {
      setActiveIndex(prev => prev - 1);
    }
  }, [activeIndex]);

  const goToNextPage = useCallback(() => {
    if (activeIndex < pages.length - 1) {
      setActiveIndex(prev => prev + 1);
    }
  }, [activeIndex, pages.length]);

  const handleSubmit = useCallback(async () => {
    if (submitted) return;

    // Grade all pages
    const gradedPages = pages.map(page => {
      const graded: Record<string, boolean> = {};
      page.problems.forEach(problem => {
        const userAnswer = page.userAnswers[problem.id] || '';
        const parsedAnswer = parseInt(userAnswer, 10);
        const expected = expectedAnswer(problem);
        graded[problem.id] = !isNaN(parsedAnswer) && parsedAnswer === expected;
      });
      return { ...page, graded };
    });

    setPages(gradedPages);
    setSubmitted(true);
    setUploadState('uploading');

    // Compute score
    const totalQuestions = gradedPages.reduce((sum, page) => sum + page.problems.length, 0);
    const correctCount = gradedPages.reduce((sum, page) => {
      return sum + page.problems.filter(problem => page.graded?.[problem.id]).length;
    }, 0);
    const percentage = totalQuestions > 0 ? Math.round((correctCount / totalQuestions) * 100) : 0;

    // Upload to Firebase Storage
    if (auth.currentUser) {
      try {
        const sessionId = `subtraction-${Date.now()}`;
        const submittedAt = new Date().toISOString();
        const sessionData = {
          topic: 'subtraction',
          pages: gradedPages,
          submittedAt,
          score: { correct: correctCount, total: totalQuestions, percentage },
          appVersion: APP_VERSION,
          generatorVersion: GENERATOR_VERSION
        };

        const storagePath = await uploadSessionJson({
          uid: auth.currentUser.uid,
          sessionId,
          data: sessionData
        });

        try {
          await writeSubtractionSessionIndex({
            studentUid: auth.currentUser.uid,
            sessionId,
            storagePath,
            score: { total: totalQuestions, correct: correctCount, percentage },
          });
        } catch (e) {
          console.error('Error writing session index:', e);
        }

        try {
          await incrementSubtractionCount(auth.currentUser.uid);
        } catch (e) {
          console.error('Error incrementing subtraction counter:', e);
        }

        setUploadState('done');
      } catch (error) {
        console.error('Error uploading session:', error);
        setUploadState('error');
      }
    } else {
      setUploadState('error');
    }
  }, [pages, submitted]);

  const startNewWorkbook = useCallback(() => {
    setPages([generatePracticePage({ numericCount: 6, wordCount: 2 })]);
    setActiveIndex(0);
    setSubmitted(false);
    setUploadState('idle');
  }, []);

  const renderProblem = (problem: AnySubProblem) => {
    const userAnswer = currentPage.userAnswers[problem.id] || '';
    const isCorrect = currentPage.graded?.[problem.id];
    const expected = expectedAnswer(problem);

    if (problem.kind === 'word') {
      return (
        <div key={problem.id} className="mb-6 p-4 bg-blue-50 rounded-lg">
          <div className="mb-3 text-gray-800 leading-relaxed">
            {problem.text}
          </div>
          <div className="flex items-center space-x-2">
            <span className="text-gray-600">Answer:</span>
            <input
              type="number"
              value={userAnswer}
              onChange={(e) => updateAnswer(problem.id, e.target.value)}
              disabled={submitted}
              className={`w-20 px-3 py-1 border rounded ${
                submitted
                  ? isCorrect
                    ? 'border-green-500 bg-green-50'
                    : 'border-red-500 bg-red-50'
                  : 'border-gray-300 focus:border-blue-500 focus:outline-none'
              }`}
            />
            {submitted && (
              <span className={`text-sm ${isCorrect ? 'text-green-600' : 'text-red-600'}`}>
                {isCorrect ? '✓' : `✗ (${expected})`}
              </span>
            )}
          </div>
        </div>
      );
    } else {
      const numProblem = problem as NumericSubProblem;
      const isMissingProblem = numProblem.variant === 'missing_subtrahend' || numProblem.variant === 'missing_minuend';
      
      return (
        <div key={problem.id} className="p-3 bg-gray-50 rounded">
          <div className="flex flex-col items-center">
            <div className="w-full max-w-[7rem] text-lg font-mono leading-tight">
              <div className="text-right">
                <div>{numProblem.a ?? '?'}</div>
                <div>- {numProblem.b ?? '?'}</div>
                <div className="border-t border-gray-400 mt-1 pt-1">
                  {isMissingProblem
                    ? (numProblem.variant === 'missing_subtrahend'
                        ? (numProblem.a! - numProblem.expected).toString()
                        : (numProblem.expected - numProblem.b!).toString())
                    : '___'}
                </div>
              </div>
            </div>

            <div className="w-full max-w-[7rem] mt-1 flex justify-end">
              <input
                type="number"
                value={userAnswer}
                onChange={(e) => updateAnswer(problem.id, e.target.value)}
                disabled={submitted}
                className={`w-16 px-2 py-1 border rounded text-center ${
                  submitted
                    ? isCorrect
                      ? 'border-green-500 bg-green-50'
                      : 'border-red-500 bg-red-50'
                    : 'border-gray-300 focus:border-blue-500 focus:outline-none'
                }`}
              />
            </div>
            {submitted && (
              <div className={`text-sm ${isCorrect ? 'text-green-600' : 'text-red-600'}`}>
                {isCorrect ? '✓' : `✗ (${expected})`}
              </div>
            )}
          </div>
        </div>
      );
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 relative">
      <div className="bg-white rounded-xl shadow-lg">
        <div className="p-6">
        {/* Page dots (top) */}
        <div className="mb-4 flex items-center justify-center" aria-label="Pages">
          <div className="inline-flex items-center gap-1">
            {pages.map((_, index) => (
              <button
                // eslint-disable-next-line react/no-array-index-key
                key={index}
                type="button"
                onClick={() => setActiveIndex(index)}
                className={`h-2.5 w-2.5 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-purple-300 ${
                  index === activeIndex ? 'bg-purple-600' : 'bg-gray-300 hover:bg-gray-400'
                }`}
                aria-label={`Go to page ${index + 1}`}
              />
            ))}
          </div>
        </div>

        {/* Word problems */}
        {currentPage.problems.filter(p => p.kind === 'word').map(renderProblem)}
        
        {/* Numeric problems in grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
          {currentPage.problems.filter(p => p.kind === 'numeric').map(renderProblem)}
        </div>

        <div className="mt-6 pt-6 border-t border-gray-200">
          <div className="flex items-center justify-center">
            <div className="flex items-center justify-center gap-3 flex-wrap">
              {submitted && uploadState === 'done' && (
                <button
                  onClick={startNewWorkbook}
                  className="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700"
                >
                  New workbook
                </button>
              )}

              <button
                type="button"
                onClick={addNewPage}
                disabled={submitted}
                className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Add New Page
              </button>

              <button
                type="button"
                onClick={goToPreviousPage}
                disabled={activeIndex === 0}
                className="px-4 py-2 text-sm bg-gray-200 text-gray-700 rounded hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Previous
              </button>

              <button
                type="button"
                onClick={goToNextPage}
                disabled={activeIndex === pages.length - 1}
                className="px-4 py-2 text-sm bg-gray-200 text-gray-700 rounded hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next
              </button>

              <button
                type="button"
                onClick={handleSubmit}
                disabled={submitted}
                className="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Submit
              </button>
            </div>
          </div>
        </div>
      </div>
      </div>
    </div>
  );
};
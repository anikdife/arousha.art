// src/pages/y3/numeracy/Y3SubtractionPractice.tsx

import React, { useState, useCallback, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { 
  PracticePage, 
  generatePracticePage, 
  formatForDisplay, 
  computeExpected, 
  SubProblem,
  AnySubProblem,
  expectedAnswer
} from '../../../lib/y3SubtractionGen';
import { buildSubtractionPdf, downloadBytes } from '../../../lib/subtractionPdf';
import { uploadSessionJson } from '../../../lib/uploadSessionJson';
import { auth } from '../../../firebase/firebase';
import { APP_VERSION, GENERATOR_VERSION } from '../../../constants/version';

export const Y3SubtractionPractice: React.FC = () => {
  const location = useLocation();
  const loadedSession = location.state?.loadedSession;

  const [pages, setPages] = useState<PracticePage[]>([generatePracticePage({ numericCount: 6, wordCount: 2 })]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [submitted, setSubmitted] = useState(false);

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

    // Compute score
    const totalQuestions = gradedPages.reduce((sum, page) => sum + page.problems.length, 0);
    const correctCount = gradedPages.reduce((sum, page) => {
      return sum + page.problems.filter(problem => page.graded?.[problem.id]).length;
    }, 0);
    const percentage = totalQuestions > 0 ? Math.round((correctCount / totalQuestions) * 100) : 0;

    const now = new Date().toISOString();

    // Upload session JSON to Firebase Storage
    const currentUser = auth.currentUser;
    if (currentUser?.uid) {
      try {
        const sessionId = crypto.randomUUID();
        
        const sessionData = {
          sessionId,
          ownerUid: currentUser.uid,
          year: 3,
          section: "numeracy",
          topic: "subtraction",
          status: "submitted",
          createdAt: now,
          submittedAt: now,
          appVersion: APP_VERSION,
          generatorVersion: GENERATOR_VERSION,
          score: {
            total: totalQuestions,
            correct: correctCount,
            percentage
          },
          pages: gradedPages
        };

        await uploadSessionJson({
          uid: currentUser.uid,
          sessionId,
          data: sessionData
        });
      } catch (error) {
        console.error('Failed to upload session to Firebase Storage:', error);
      }
    } else {
      console.warn('No user logged in, skipping session upload');
    }

    // Generate and download PDF
    try {
      const pdfBytes = await buildSubtractionPdf({
        title: 'Subtraction Practice',
        pages: gradedPages,
        createdAtIso: now,
        studentName: currentUser?.displayName ?? 'Student',
      });
      
      const timestamp = new Date().toISOString().slice(0, 10);
      downloadBytes(pdfBytes, `subtraction-practice-${timestamp}.pdf`);
    } catch (error) {
      console.error('Failed to generate PDF:', error);
    }
  }, [pages, submitted]);

  const startNewBook = useCallback(() => {
    setPages([generatePracticePage({ numericCount: 6, wordCount: 2 })]);
    setActiveIndex(0);
    setSubmitted(false);
  }, []);

  const deletePage = useCallback(() => {
    if (pages.length <= 1 || submitted) return; // Don't delete if only one page or already submitted
    
    const newPages = pages.filter((_, index) => index !== activeIndex);
    setPages(newPages);
    
    // Adjust active index if necessary
    if (activeIndex >= newPages.length) {
      setActiveIndex(newPages.length - 1);
    }
  }, [pages, activeIndex, submitted]);

  // Calculate live score
  const totalProblems = pages.reduce((sum, page) => sum + page.problems.length, 0);
  const answeredCorrect = pages.reduce((sum, page) => {
    return sum + page.problems.filter(problem => {
      const userAnswer = page.userAnswers[problem.id] || '';
      const parsedAnswer = parseInt(userAnswer, 10);
      const expected = expectedAnswer(problem);
      return !isNaN(parsedAnswer) && parsedAnswer === expected;
    }).length;
  }, 0);
  const percentage = totalProblems > 0 ? Math.round((answeredCorrect / totalProblems) * 100) : 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-green-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <Link 
              to="/y3/numeracy" 
              className="flex items-center text-blue-600 hover:text-blue-700 transition-colors"
            >
              <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Back to Topics
            </Link>
            
            <div className="text-center">
              <h1 className="text-3xl font-bold text-gray-900">
                Year 3 Numeracy — Subtraction
              </h1>
              <p className="text-gray-600">Practice subtraction problems</p>
            </div>
            
            <div className="w-32"></div>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Submit Banner */}
        {submitted && (
          <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg">
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <svg className="w-5 h-5 text-green-600 mr-2" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <span className="text-green-800 font-medium">Submitted. PDF download started.</span>
              </div>
              <button
                onClick={startNewBook}
                className="bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700 transition-colors flex items-center space-x-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
                <span>New Book</span>
              </button>
            </div>
          </div>
        )}

        {/* Score Panel */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-gray-900">Progress</h2>
              <p className="text-gray-600">Page {activeIndex + 1} of {pages.length}</p>
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold text-blue-600">
                {answeredCorrect} / {totalProblems}
              </div>
              <div className="text-lg text-gray-600">
                {percentage}% correct
              </div>
            </div>
          </div>
        </div>

        {/* Pagination Controls */}
        <div className="flex items-center justify-between mb-6">
          <button
            onClick={goToPreviousPage}
            disabled={activeIndex === 0}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              activeIndex === 0
                ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                : 'bg-blue-600 text-white hover:bg-blue-700'
            }`}
          >
            Previous
          </button>
          
          <div className="flex items-center space-x-2">
            {pages.map((_, index) => (
              <button
                key={index}
                onClick={() => setActiveIndex(index)}
                className={`w-8 h-8 rounded-full font-medium transition-colors ${
                  index === activeIndex
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
                }`}
              >
                {index + 1}
              </button>
            ))}
          </div>

          <div className="flex space-x-2">
            {!submitted && (
              <>
                <button
                  onClick={addNewPage}
                  className="px-4 py-2 rounded-lg font-medium bg-green-600 text-white hover:bg-green-700 transition-colors"
                >
                  Add Page
                </button>
                <button
                  onClick={deletePage}
                  disabled={pages.length <= 1}
                  className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                    pages.length <= 1
                      ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                      : 'bg-red-600 text-white hover:bg-red-700'
                  }`}
                >
                  Delete Page
                </button>
                <button
                  onClick={handleSubmit}
                  className="px-6 py-2 rounded-lg font-medium bg-purple-600 text-white hover:bg-purple-700 transition-colors"
                >
                  Submit All
                </button>
              </>
            )}
            {submitted && (
              <button
                onClick={startNewBook}
                className="px-6 py-2 rounded-lg font-medium bg-blue-600 text-white hover:bg-blue-700 transition-colors flex items-center space-x-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
                </svg>
                <span>New Practice Book</span>
              </button>
            )}
          </div>
        </div>

        {/* Questions Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {currentPage.problems.map((problem, index) => (
            <QuestionCard
              key={problem.id}
              problem={problem}
              questionNumber={index + 1}
              userAnswer={currentPage.userAnswers[problem.id] || ''}
              onAnswerChange={(value) => updateAnswer(problem.id, value)}
              isGraded={submitted}
              isCorrect={currentPage.graded?.[problem.id]}
              disabled={submitted}
            />
          ))}
        </div>
      </main>
    </div>
  );
};

interface QuestionCardProps {
  problem: AnySubProblem;
  questionNumber: number;
  userAnswer: string;
  onAnswerChange: (value: string) => void;
  isGraded: boolean;
  isCorrect?: boolean;
  disabled: boolean;
}

const QuestionCard: React.FC<QuestionCardProps> = ({
  problem,
  questionNumber,
  userAnswer,
  onAnswerChange,
  isGraded,
  isCorrect,
  disabled
}) => {
  const expected = expectedAnswer(problem);

  if (problem.kind === 'word') {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm col-span-1 md:col-span-2">
        <div className="text-sm font-medium text-gray-500 mb-3">
          Question {questionNumber}
        </div>
        
        <div className="mb-4">
          <p className="text-sm leading-relaxed text-gray-800">
            {problem.text}
          </p>
        </div>
        
        <div className="flex items-center space-x-3">
          <label className="text-sm font-medium text-gray-700">Answer:</label>
          <input
            type="text"
            value={userAnswer}
            onChange={(e) => onAnswerChange(e.target.value)}
            disabled={disabled}
            inputMode="numeric"
            pattern="[0-9]*"
            className={`w-24 text-lg font-mono text-center px-2 py-1 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500 ${
              disabled ? 'bg-gray-50 border-gray-200' : 'border-gray-300'
            }`}
            placeholder="?"
          />
          
          {isGraded && (
            <div className={`text-lg font-bold ${
              isCorrect ? 'text-green-600' : 'text-red-600'
            }`}>
              {isCorrect ? 'C' : 'X'}
            </div>
          )}
        </div>
        
        {isGraded && !isCorrect && (
          <div className="text-sm text-gray-500 mt-2">
            Correct: {expected}
          </div>
        )}
      </div>
    );
  }

  // Numeric problem rendering
  const display = formatForDisplay(problem);

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm">
      <div className="text-sm font-medium text-gray-500 mb-3">
        Question {questionNumber}
      </div>
      
      <div className="text-center mb-4">
        {/* Top number */}
        <div className="text-right text-lg font-mono mb-1">
          {display.top}
        </div>
        
        {/* Minus and bottom number */}
        <div className="text-right text-lg font-mono mb-1">
          - {display.bottom}
        </div>
        
        {/* Horizontal line */}
        <div className="border-b border-gray-400 mb-2"></div>
        
        {/* Answer input */}
        <div className="flex items-center justify-end space-x-2">
          <input
            type="text"
            value={userAnswer}
            onChange={(e) => onAnswerChange(e.target.value)}
            disabled={disabled}
            inputMode="numeric"
            pattern="[0-9]*"
            className={`w-20 text-lg font-mono text-right px-2 py-1 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500 ${
              disabled ? 'bg-gray-50 border-gray-200' : 'border-gray-300'
            }`}
            placeholder="?"
          />
          
          {isGraded && (
            <div className={`text-lg font-bold ${
              isCorrect ? 'text-green-600' : 'text-red-600'
            }`}>
              {isCorrect ? 'C' : 'X'}
            </div>
          )}
        </div>
        
        {/* Show equation result for missing number problems */}
        {display.result && (
          <div className="text-right text-lg font-mono mt-1">
            = {display.result}
          </div>
        )}
        
        {/* Show correct answer if wrong */}
        {isGraded && !isCorrect && (
          <div className="text-sm text-gray-500 mt-2">
            Correct: {expected}
          </div>
        )}
      </div>
    </div>
  );
};
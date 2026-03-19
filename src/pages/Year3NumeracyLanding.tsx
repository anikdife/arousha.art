// src/pages/Year3NumeracyLanding.tsx

import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

interface Topic {
  id: string;
  title: string;
  description: string;
  icon: string;
  available: boolean;
  difficulty: 'Easy' | 'Medium' | 'Hard';
  estimatedTime: string;
}

const TOPICS: Topic[] = [
  {
    id: 'subtraction',
    title: 'Subtraction',
    description: 'Learn to subtract numbers up to 100 with and without regrouping',
    icon: '➖',
    available: true,
    difficulty: 'Medium',
    estimatedTime: '15-20 min'
  },
  {
    id: 'addition',
    title: 'Addition',
    description: 'Practice adding numbers up to 100 with carrying',
    icon: '➕',
    available: false,
    difficulty: 'Easy',
    estimatedTime: '15-20 min'
  },
  {
    id: 'multiplication-basics',
    title: 'Multiplication Basics',
    description: 'Introduction to multiplication tables 2, 5, and 10',
    icon: '✖️',
    available: false,
    difficulty: 'Medium',
    estimatedTime: '20-25 min'
  },
  {
    id: 'division-basics',
    title: 'Division Basics',
    description: 'Simple division using multiplication facts',
    icon: '➗',
    available: false,
    difficulty: 'Medium',
    estimatedTime: '20-25 min'
  },
  {
    id: 'place-value',
    title: 'Place Value',
    description: 'Understanding hundreds, tens, and ones',
    icon: '🔢',
    available: false,
    difficulty: 'Easy',
    estimatedTime: '15-20 min'
  },
  {
    id: 'fractions',
    title: 'Simple Fractions',
    description: 'Introduction to halves, quarters, and thirds',
    icon: '🧩',
    available: false,
    difficulty: 'Hard',
    estimatedTime: '25-30 min'
  },
  {
    id: 'money',
    title: 'Money & Change',
    description: 'Counting coins and calculating change',
    icon: '💰',
    available: false,
    difficulty: 'Medium',
    estimatedTime: '20-25 min'
  },
  {
    id: 'time',
    title: 'Telling Time',
    description: 'Reading analog and digital clocks',
    icon: '🕐',
    available: false,
    difficulty: 'Medium',
    estimatedTime: '20-25 min'
  },
  {
    id: 'measurement',
    title: 'Length & Measurement',
    description: 'Measuring with rulers, comparing lengths',
    icon: '📏',
    available: false,
    difficulty: 'Easy',
    estimatedTime: '15-20 min'
  },
  {
    id: 'shapes',
    title: '2D & 3D Shapes',
    description: 'Identifying and describing geometric shapes',
    icon: '🔷',
    available: false,
    difficulty: 'Easy',
    estimatedTime: '15-20 min'
  },
  {
    id: 'data',
    title: 'Data & Graphs',
    description: 'Reading simple charts and collecting data',
    icon: '📊',
    available: false,
    difficulty: 'Medium',
    estimatedTime: '20-25 min'
  },
  {
    id: 'patterns',
    title: 'Number Patterns',
    description: 'Finding and continuing number sequences',
    icon: '🔄',
    available: false,
    difficulty: 'Medium',
    estimatedTime: '15-20 min'
  }
];

export const Year3NumeracyLanding: React.FC = () => {
  const navigate = useNavigate();
  const [selectedView, setSelectedView] = useState<'overview' | 'topics'>('overview');
  
  const availableTopics = TOPICS.filter(topic => topic.available);
  const comingSoonTopics = TOPICS.filter(topic => !topic.available);

  const handleTopicClick = (topic: Topic) => {
    if (topic.available) {
      if (topic.id === 'subtraction') {
        navigate('/y3/numeracy/subtraction');
      } else {
        console.log(`Starting ${topic.title} practice`);
      }
    }
  };

  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty) {
      case 'Easy': return 'text-green-600 bg-green-50';
      case 'Medium': return 'text-yellow-600 bg-yellow-50';
      case 'Hard': return 'text-red-600 bg-red-50';
      default: return 'text-gray-600 bg-gray-50';
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 via-white to-blue-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <Link 
              to="/" 
              className="flex items-center text-blue-600 hover:text-blue-700 transition-colors"
            >
              <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Back to Home
            </Link>
            
            <div className="text-center">
              <h1 className="text-3xl font-bold text-gray-900">
                Year 3 Numeracy Practice
              </h1>
              <p className="text-gray-600">Mathematical reasoning and problem solving</p>
            </div>
            
            <div className="w-24"></div>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Navigation Tabs */}
        <div className="flex justify-center mb-8">
          <div className="bg-gray-100 p-1 rounded-lg">
            <button
              onClick={() => setSelectedView('overview')}
              className={`px-6 py-2 rounded-md font-medium transition-colors ${
                selectedView === 'overview'
                  ? 'bg-white text-blue-600 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Practice Overview
            </button>
            <button
              onClick={() => setSelectedView('topics')}
              className={`px-6 py-2 rounded-md font-medium transition-colors ${
                selectedView === 'topics'
                  ? 'bg-white text-blue-600 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Choose Topics
            </button>
          </div>
        </div>

        {selectedView === 'overview' && (
          <>
            {/* Welcome Section */}
            <div className="text-center mb-12">
              <div className="text-6xl mb-4">🧮</div>
              <h2 className="text-2xl font-bold text-gray-900 mb-4">
                Ready to Practice Numeracy?
              </h2>
              <p className="text-lg text-gray-600 max-w-2xl mx-auto">
                Improve your mathematical skills with engaging practice questions designed for Year 3 students.
                Build confidence in number operations, measurement, geometry, and data analysis.
              </p>
            </div>

            {/* Practice Options */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-12">
              <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
                <div className="text-4xl mb-4">📊</div>
                <h3 className="text-xl font-bold text-gray-900 mb-3">Practice Tests</h3>
                <p className="text-gray-600 mb-4">
                  Complete practice tests with questions similar to the actual NAPLAN numeracy assessment.
                </p>
                <button type="button" className="btn-start">
                  Start
                </button>
              </div>

              <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
                <div className="text-4xl mb-4">🎯</div>
                <h3 className="text-xl font-bold text-gray-900 mb-3">Topic Practice</h3>
                <p className="text-gray-600 mb-4">
                  Focus on specific math topics like addition, subtraction, shapes, and measurement.
                </p>
                <button 
                  onClick={() => setSelectedView('topics')}
                  className="bg-green-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-green-700 transition-colors"
                >
                  Choose Topics
                </button>
              </div>
            </div>

            {/* Features */}
            <div className="bg-white rounded-xl border border-gray-200 p-8 shadow-sm">
              <h3 className="text-xl font-bold text-gray-900 mb-6 text-center">
                What You'll Practice
              </h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <div className="text-center">
                  <div className="text-3xl mb-3">➕</div>
                  <h4 className="font-semibold text-gray-900 mb-2">Number Operations</h4>
                  <p className="text-sm text-gray-600">Addition, subtraction, multiplication basics</p>
                </div>
                
                <div className="text-center">
                  <div className="text-3xl mb-3">📏</div>
                  <h4 className="font-semibold text-gray-900 mb-2">Measurement</h4>
                  <p className="text-sm text-gray-600">Length, mass, volume, and time</p>
                </div>
                
                <div className="text-center">
                  <div className="text-3xl mb-3">🔷</div>
                  <h4 className="font-semibold text-gray-900 mb-2">Geometry</h4>
                  <p className="text-sm text-gray-600">2D shapes, position, and movement</p>
                </div>
                
                <div className="text-center">
                  <div className="text-3xl mb-3">📈</div>
                  <h4 className="font-semibold text-gray-900 mb-2">Data & Probability</h4>
                  <p className="text-sm text-gray-600">Simple graphs and chance concepts</p>
                </div>
              </div>
            </div>

            {/* Call to Action */}
            <div className="text-center mt-12">
              <h3 className="text-xl font-bold text-gray-900 mb-4">
                Ready to Get Started?
              </h3>
              <p className="text-gray-600 mb-6">
                Begin your numeracy practice journey today and build confidence for the NAPLAN assessment.
              </p>
              <button className="bg-purple-600 text-white px-8 py-4 rounded-lg text-lg font-semibold hover:bg-purple-700 transition-colors shadow-lg">
                Begin Practice Session
              </button>
            </div>
          </>
        )}

        {selectedView === 'topics' && (
          <>
            {/* Available Topics */}
            {availableTopics.length > 0 && (
              <div className="mb-12">
                <h2 className="text-2xl font-bold text-gray-900 mb-2">Available Now</h2>
                <p className="text-gray-600 mb-6">Start practicing these topics immediately</p>
                
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {availableTopics.map(topic => (
                    <div
                      key={topic.id}
                      onClick={() => handleTopicClick(topic)}
                      className="bg-white rounded-xl border-2 border-green-200 p-6 shadow-sm hover:border-green-300 cursor-pointer card-hover"
                    >
                      <div className="flex items-start justify-between mb-4">
                        <div className="text-4xl">{topic.icon}</div>
                        <div className="flex flex-col items-end space-y-2">
                          <span className="px-2 py-1 text-xs font-semibold bg-green-500 text-white rounded-full">
                            Available
                          </span>
                          <span className={`px-2 py-1 text-xs font-medium rounded-full ${getDifficultyColor(topic.difficulty)}`}>
                            {topic.difficulty}
                          </span>
                        </div>
                      </div>
                      
                      <h3 className="text-lg font-bold text-gray-900 mb-2">{topic.title}</h3>
                      <p className="text-sm text-gray-600 mb-3 line-clamp-2">{topic.description}</p>
                      
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-500">⏱️ {topic.estimatedTime}</span>
                        <div className="flex items-center text-green-600 font-medium">
                          <span>Start</span>
                          <svg className="w-4 h-4 ml-1" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" clipRule="evenodd" />
                          </svg>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Practice History */}
            <div className="mb-12">
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Practice History</h2>
              <p className="text-gray-600 mb-6">Access your previous practice sessions</p>
              
              <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">
                      Review Previous Answers
                    </h3>
                    <p className="text-gray-600">
                      View and edit your previously submitted practice sessions
                    </p>
                  </div>
                  <Link
                    to="/y3/numeracy/overview"
                    className="bg-blue-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-blue-700 transition-colors flex items-center space-x-2"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <span>View History</span>
                  </Link>
                </div>
              </div>
            </div>

            {/* Coming Soon Topics */}
            <div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Coming Soon</h2>
              <p className="text-gray-600 mb-6">These topics will be available soon</p>
              
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {comingSoonTopics.map(topic => (
                  <div
                    key={topic.id}
                    className="bg-gray-50 rounded-xl border-2 border-gray-200 p-6 shadow-sm opacity-75 cursor-not-allowed"
                  >
                    <div className="flex items-start justify-between mb-4">
                      <div className="text-4xl opacity-50">{topic.icon}</div>
                      <div className="flex flex-col items-end space-y-2">
                        <span className="px-2 py-1 text-xs font-semibold bg-gray-400 text-white rounded-full">
                          Coming Soon
                        </span>
                        <span className={`px-2 py-1 text-xs font-medium rounded-full ${getDifficultyColor(topic.difficulty)} opacity-75`}>
                          {topic.difficulty}
                        </span>
                      </div>
                    </div>
                    
                    <h3 className="text-lg font-bold text-gray-600 mb-2">{topic.title}</h3>
                    <p className="text-sm text-gray-500 mb-3 line-clamp-2">{topic.description}</p>
                    
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-400">⏱️ {topic.estimatedTime}</span>
                      <span className="text-gray-400 font-medium">Under Development</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </main>

    </div>
  );
};
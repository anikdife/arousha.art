// src/pages/ComingSoonPage.tsx

import React from 'react';
import { Link, useParams } from 'react-router-dom';

export const ComingSoonPage: React.FC = () => {
  const { year, section } = useParams<{ year: string; section: string }>();
  
  const sectionLabels: Record<string, string> = {
    'reading': 'Reading',
    'writing': 'Writing',
    'language': 'Language Conventions',
    'numeracy': 'Numeracy (Math)'
  };

  const sectionName = section ? sectionLabels[section] || section : 'Practice';
  const yearLabel = year ? `Year ${year}` : '';

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-blue-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center">
            <Link 
              to="/" 
              className="flex items-center text-blue-600 hover:text-blue-700 transition-colors"
            >
              <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Back to Home
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <div className="text-center">
          {/* Animated Icon */}
          <div className="text-8xl mb-8 animate-bounce">
            🚧
          </div>
          
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            Coming Soon!
          </h1>
          
          <h2 className="text-2xl text-gray-700 mb-8">
            {yearLabel} {sectionName}
          </h2>
          
          <p className="text-lg text-gray-600 mb-12 max-w-2xl mx-auto leading-relaxed">
            We're working hard to bring you comprehensive practice materials for {yearLabel} {sectionName}. 
            This section will include interactive exercises, practice tests, and detailed explanations 
            to help students excel in their NAPLAN assessments.
          </p>

          {/* Features Preview */}
          <div className="bg-white rounded-xl border border-gray-200 p-8 shadow-sm mb-12">
            <h3 className="text-xl font-bold text-gray-900 mb-6">
              What to Expect
            </h3>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-left">
              <div className="flex items-start space-x-3">
                <div className="text-2xl">📚</div>
                <div>
                  <h4 className="font-semibold text-gray-900 mb-1">Practice Questions</h4>
                  <p className="text-sm text-gray-600">Hundreds of questions aligned with NAPLAN standards</p>
                </div>
              </div>
              
              <div className="flex items-start space-x-3">
                <div className="text-2xl">📊</div>
                <div>
                  <h4 className="font-semibold text-gray-900 mb-1">Progress Tracking</h4>
                  <p className="text-sm text-gray-600">Monitor improvement and identify areas for growth</p>
                </div>
              </div>
              
              <div className="flex items-start space-x-3">
                <div className="text-2xl">🎯</div>
                <div>
                  <h4 className="font-semibold text-gray-900 mb-1">Targeted Practice</h4>
                  <p className="text-sm text-gray-600">Focus on specific skills and topic areas</p>
                </div>
              </div>
            </div>
          </div>

          {/* Available Alternative */}
          <div className="bg-green-50 border border-green-200 rounded-xl p-6 mb-8">
            <h3 className="text-lg font-semibold text-green-800 mb-2">
              Try Year 3 Numeracy Instead!
            </h3>
            <p className="text-green-700 mb-4">
              While we're preparing this section, you can practice with our available Year 3 Numeracy module.
            </p>
            <Link 
              to="/y3/numeracy"
              className="inline-flex items-center bg-green-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-green-700 transition-colors"
            >
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
              Try Year 3 Numeracy
            </Link>
          </div>

          {/* Newsletter Signup Placeholder */}
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-6">
            <h3 className="text-lg font-semibold text-blue-800 mb-2">
              Get Notified When It's Ready
            </h3>
            <p className="text-blue-700 mb-4">
              Be the first to know when {yearLabel} {sectionName} practice becomes available.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto">
              <input 
                type="email" 
                placeholder="Enter your email"
                className="flex-grow px-4 py-2 border border-blue-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button className="bg-blue-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-blue-700 transition-colors">
                Notify Me
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};
import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Y3MultiplicationPractice } from './Y3MultiplicationPractice';

export const Y3Multiplication: React.FC = () => {
  const [tab, setTab] = useState<'practice' | 'history'>('practice');
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-100 via-pink-50 to-yellow-100 p-4">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold text-purple-800">Multiplication</h1>
            <p className="text-purple-600 mt-2">Year 3 Numeracy</p>
          </div>
          <Link to="/y3/numeracy" className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300">
            ← Topics
          </Link>
        </div>

        <div className="flex gap-2 mb-4">
          <button
            type="button"
            onClick={() => setTab('practice')}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              tab === 'practice' ? 'bg-purple-700 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'
            }`}
          >
            Practice
          </button>
          <button
            type="button"
            onClick={() => navigate('/y3/numeracy/multiplication/history')}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              tab === 'history' ? 'bg-purple-700 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'
            }`}
          >
            History
          </button>
        </div>

        {tab === 'practice' ? (
          <Y3MultiplicationPractice />
        ) : (
          <div className="bg-white rounded-xl shadow-lg p-6">
            <div className="text-gray-800 font-semibold">History</div>
            <div className="text-gray-600 mt-1">Coming soon.</div>
          </div>
        )}
      </div>
    </div>
  );
};

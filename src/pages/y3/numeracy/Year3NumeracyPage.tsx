// src/pages/y3/numeracy/Year3NumeracyPage.tsx

import React from 'react';
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
    id: 'addition',
    title: 'Addition',
    description: 'Practice adding numbers up to 100 with carrying',
    icon: '➕',
    available: true,
    difficulty: 'Easy',
    estimatedTime: '15-20 min'
  },
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
    id: 'multiplication',
    title: 'Multiplication',
    description: 'Introduction to multiplication tables 2, 5, and 10',
    icon: '✖️',
    available: true,
    difficulty: 'Medium',
    estimatedTime: '20-25 min'
  },
  {
    id: 'measurement',
    title: 'Measurement',
    description: 'Length, mass, volume and capacity',
    icon: '📏',
    available: true,
    difficulty: 'Easy',
    estimatedTime: '15-20 min'
  },
  {
    id: 'geometry',
    title: 'Geometry',
    description: '2D shapes, angles and symmetry',
    icon: '🔷',
    available: true,
    difficulty: 'Medium',
    estimatedTime: '20-25 min'
  },
  {
    id: 'data-probability',
    title: 'Data & Probability',
    description: 'Graphs, charts and simple probability',
    icon: '📊',
    available: true,
    difficulty: 'Hard',
    estimatedTime: '25-30 min'
  }
];

export const Year3NumeracyPage: React.FC = () => {
  const navigate = useNavigate();

  const handleTopicClick = (topicId: string) => {
    if (topicId === 'addition') {
      navigate('/y3/numeracy/addition');
    } else if (topicId === 'subtraction') {
      navigate('/y3/numeracy/subtraction');
    } else if (topicId === 'multiplication') {
      navigate('/y3/numeracy/multiplication');
    } else if (topicId === 'measurement') {
      navigate('/y3/numeracy/measurement');
    } else if (topicId === 'geometry') {
      navigate('/y3/numeracy/geometry');
    } else if (topicId === 'data-probability') {
      navigate('/y3/numeracy/data-probability');
    } else {
      // Other topics not implemented yet
      navigate('/coming-soon');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-100 via-pink-50 to-yellow-100 p-4">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-purple-800">Choose a Topic</h1>
            <p className="text-purple-600 mt-2">Select a numeracy topic to practice</p>
          </div>
          <Link
            to="/"
            className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
          >
            ← Back
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {TOPICS.map((topic) => (
            <div
              key={topic.id}
              className={`
                bg-white rounded-xl shadow-lg p-6 transition-all duration-300
                ${topic.available
                  ? 'hover:shadow-xl hover:scale-105 cursor-pointer border-2 border-transparent hover:border-purple-200'
                  : 'opacity-60 cursor-not-allowed'
                }
              `}
              onClick={() => topic.available && handleTopicClick(topic.id)}
            >
              <div className="text-4xl mb-4 text-center">{topic.icon}</div>
              <h3 className="text-xl font-semibold text-gray-800 mb-2">{topic.title}</h3>
              <p className="text-gray-600 text-sm mb-4">{topic.description}</p>
              
              <div className="flex justify-between items-center mb-4">
                <span className={`
                  px-2 py-1 rounded-full text-xs font-medium
                  ${topic.difficulty === 'Easy' ? 'bg-green-100 text-green-800' :
                    topic.difficulty === 'Medium' ? 'bg-yellow-100 text-yellow-800' :
                    'bg-red-100 text-red-800'}
                `}>
                  {topic.difficulty}
                </span>
                <span className="text-xs text-gray-500">{topic.estimatedTime}</span>
              </div>

              {!topic.available && (
                <div className="text-center">
                  <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded">
                    Coming Soon
                  </span>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
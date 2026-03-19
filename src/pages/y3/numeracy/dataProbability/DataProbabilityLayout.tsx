import React from 'react';
import { Link, NavLink, Outlet } from 'react-router-dom';

export const DataProbabilityLayout: React.FC = () => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-100 via-pink-50 to-yellow-100">
      <div className="max-w-6xl mx-auto p-4">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold text-purple-800">Data &amp; Probability</h1>
            <p className="text-purple-600 mt-2">Year 3 Numeracy</p>
          </div>
          <Link to="/y3/numeracy" className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300">
            ← Topics
          </Link>
        </div>

        <div className="flex gap-2 mb-4">
          <NavLink
            to="/y3/numeracy/data-probability"
            end
            className={({ isActive }) =>
              `px-4 py-2 rounded-lg font-medium transition-colors ${
                isActive ? 'bg-purple-700 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'
              }`
            }
          >
            Practice
          </NavLink>
          <NavLink
            to="/y3/numeracy/data-probability/history"
            className={({ isActive }) =>
              `px-4 py-2 rounded-lg font-medium transition-colors ${
                isActive ? 'bg-purple-700 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'
              }`
            }
          >
            History
          </NavLink>
        </div>

        <Outlet />
      </div>
    </div>
  );
};

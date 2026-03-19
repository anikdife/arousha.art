import React from 'react';
import { Link, NavLink, Outlet } from 'react-router-dom';

export const GeometryLayout: React.FC = () => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-purple-50">
      <div className="max-w-6xl mx-auto p-4">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Geometry</h1>
            <p className="text-gray-600 mt-2">Year 3 Numeracy</p>
          </div>
          <Link
            to="/y3/numeracy"
            className="px-4 py-2 text-sm font-semibold rounded-lg bg-gray-100 text-gray-800 hover:bg-gray-200"
          >
            ← Topics
          </Link>
        </div>

        <div className="flex gap-2 mb-4">
          <NavLink
            to="/y3/numeracy/geometry"
            end
            className={({ isActive }) =>
              `px-4 py-2 rounded-lg font-medium transition-colors border ${
                isActive
                  ? 'bg-gray-900 text-white border-gray-900'
                  : 'bg-white text-gray-700 hover:bg-gray-50 border-gray-200'
              }`
            }
          >
            Practice
          </NavLink>
          <NavLink
            to="/y3/numeracy/geometry/history"
            className={({ isActive }) =>
              `px-4 py-2 rounded-lg font-medium transition-colors border ${
                isActive
                  ? 'bg-gray-900 text-white border-gray-900'
                  : 'bg-white text-gray-700 hover:bg-gray-50 border-gray-200'
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

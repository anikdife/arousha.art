// src/pages/y3/languageConventions/Y3LanguageConventions.tsx

import React from 'react';
import { Link, NavLink, Outlet } from 'react-router-dom';

export const Y3LanguageConventions: React.FC = () => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-green-50 p-4">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Language Conventions</h1>
            <p className="text-gray-600 mt-2">Year 3 — Spelling, punctuation, grammar</p>
          </div>
          <Link
            to="/"
            className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
          >
            ← Home
          </Link>
        </div>

        <div className="flex gap-2 mb-4">
          <NavLink
            to="/y3/language-conventions"
            end
            className={({ isActive }) =>
              `px-4 py-2 rounded-lg font-medium transition-colors ${
                isActive ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50'
              }`
            }
          >
            Practice
          </NavLink>

          <NavLink
            to="/y3/language-conventions/history"
            className={({ isActive }) =>
              `px-4 py-2 rounded-lg font-medium transition-colors ${
                isActive ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50'
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

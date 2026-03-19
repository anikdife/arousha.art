import React from 'react';
import { Link } from 'react-router-dom';

export const OwnerHome: React.FC = () => {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Owner</h1>
            <div className="text-sm text-gray-600">Admin dashboard</div>
          </div>
          <Link to="/dashboard" className="px-3 py-2 rounded-lg bg-gray-200 text-gray-700 hover:bg-gray-300">
            Back
          </Link>
        </div>

        <div className="mt-6 bg-white border border-gray-200 rounded-xl p-6">
          <div className="text-lg font-semibold text-gray-900">Banks</div>
          <div className="text-sm text-gray-600 mt-1">Edit admin bank files stored in Firebase Storage.</div>

          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              to="/owner/banks/y3/language-conventions"
              className="inline-flex items-center px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700"
            >
              Year 3 • Language Conventions
            </Link>

            <Link
              to="/owner/banks/y3/reading-magazine"
              className="inline-flex items-center px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700"
            >
              Reading Magazine
            </Link>

            <Link
              to="/owner/banks/y3/writing"
              className="inline-flex items-center px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700"
            >
              Year 3 • Writing Prompts
            </Link>
          </div>
        </div>

        <div className="mt-6">
          <Link
            to="/owner/users/"
            className="block bg-white border border-gray-200 rounded-xl p-6 hover:bg-gray-50 transition-colors"
          >
            <div className="text-lg font-semibold text-gray-900">Users</div>
          </Link>
        </div>
      </div>
    </div>
  );
};

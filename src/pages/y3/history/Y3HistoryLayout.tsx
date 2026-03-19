import React from 'react';
import { NavLink, Outlet } from 'react-router-dom';

function tabClassName(isActive: boolean) {
  const base =
    'px-4 py-2 text-sm font-semibold border-b-2 transition-colors';
  return isActive
    ? `${base} border-purple-600 text-purple-700`
    : `${base} border-transparent text-gray-600 hover:text-gray-900 hover:border-gray-200`;
}

export const Y3HistoryLayout: React.FC = () => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-green-50">
      <header className="bg-white/80 backdrop-blur border-b">
        <div className="w-full px-4 sm:px-6 lg:px-8 py-6">
          <h1 className="text-3xl font-bold text-gray-900">Year 3 History</h1>
          <p className="text-gray-600 mt-1">Progress and session history</p>

          <div className="mt-5 flex items-center gap-2">
            <NavLink
              to="/y3/history"
              end
              className={({ isActive }) => tabClassName(isActive)}
            >
              Graph
            </NavLink>
            <NavLink
              to="/y3/history/list"
              className={({ isActive }) => tabClassName(isActive)}
            >
              List
            </NavLink>
          </div>
        </div>
      </header>

      <main className="w-full px-4 sm:px-6 lg:px-8 py-8">
        <Outlet />
      </main>
    </div>
  );
};

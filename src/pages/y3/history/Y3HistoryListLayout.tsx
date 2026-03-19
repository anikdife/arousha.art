import React from 'react';
import { NavLink, Outlet } from 'react-router-dom';

function tabClassName(isActive: boolean) {
  const base = 'px-4 py-2 text-sm font-semibold rounded-lg transition-colors';
  return isActive
    ? `${base} bg-purple-600 text-white`
    : `${base} bg-white text-gray-700 hover:bg-gray-100 border border-gray-200`;
}

export const Y3HistoryListLayout: React.FC = () => {
  return (
    <div className="w-full">
      <div className="flex items-center gap-3 mb-6">
        <NavLink
          to="/y3/history/list"
          end
          className={({ isActive }) => tabClassName(isActive)}
        >
          Subtraction
        </NavLink>
        <NavLink
          to="/y3/history/list/addition"
          className={({ isActive }) => tabClassName(isActive)}
        >
          Addition
        </NavLink>
        <NavLink
          to="/y3/history/list/measurement"
          className={({ isActive }) => tabClassName(isActive)}
        >
          Measurement
        </NavLink>
        <NavLink
          to="/y3/history/list/multiplication"
          className={({ isActive }) => tabClassName(isActive)}
        >
          Multiplication
        </NavLink>
      </div>

      <Outlet />
    </div>
  );
};

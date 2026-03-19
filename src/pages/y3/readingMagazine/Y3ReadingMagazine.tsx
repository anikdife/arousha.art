import React, { useState } from 'react';
import { NavLink, Route, Routes } from 'react-router-dom';
import { Y3ReadingTab } from './Y3ReadingTab';
import { Y3PracticeTab } from './Y3PracticeTab';
import { Y3ReadingHistoryTab } from './Y3ReadingHistoryTab';

function TabLink(props: { to: string; label: string; end?: boolean }) {
  return (
    <NavLink
      to={props.to}
      end={props.end}
      className={({ isActive }) =>
        `px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
          isActive ? 'bg-blue-600 text-white' : 'text-gray-700 hover:bg-gray-100'
        }`
      }
    >
      {props.label}
    </NavLink>
  );
}

export const Y3ReadingMagazine: React.FC = () => {
  const [overrideOffset, setOverrideOffset] = useState(0);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-10">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Year 3 • Reading Magazine</h1>
            <div className="text-sm text-gray-600 mt-1">Read one story each day.</div>
          </div>
        </div>

        <div className="mt-6">
          <div className="inline-flex rounded-xl border border-gray-200 bg-white p-1 shadow-sm">
            <TabLink to="/y3/reading-magazine" label="Reading" end />
            <TabLink to="/y3/reading-magazine/practice" label="Practice" />
            <TabLink to="/y3/reading-magazine/history" label="History" />
          </div>
        </div>
      </div>

      <Routes>
        <Route
          index
          element={(
            <Y3ReadingTab
              overrideOffset={overrideOffset}
              onNextStory={() => setOverrideOffset((n) => n + 1)}
            />
          )}
        />
        <Route path="practice" element={<Y3PracticeTab overrideOffset={overrideOffset} />} />
        <Route path="history" element={<Y3ReadingHistoryTab />} />
      </Routes>
    </div>
  );
};

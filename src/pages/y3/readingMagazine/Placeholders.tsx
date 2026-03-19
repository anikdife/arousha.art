import React from 'react';

export const ComingSoon: React.FC<{ label: string }> = ({ label }) => {
  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
        <div className="text-2xl font-bold text-gray-900">{label}</div>
        <div className="text-sm text-gray-600 mt-2">Coming soon</div>
      </div>
    </div>
  );
};

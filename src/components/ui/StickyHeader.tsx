import React from 'react';

export type StickyHeaderProps = {
  title: string;
  leftAction?: React.ReactNode;
  right?: React.ReactNode;
};

export const StickyHeader: React.FC<StickyHeaderProps> = ({ title, leftAction, right }) => {
  return (
    <div className="sticky top-0 z-40 bg-white/80 backdrop-blur border-b border-gray-200">
      <div className="px-4 py-3">
        <div className="grid grid-cols-3 items-center">
          <div className="justify-self-start">{leftAction}</div>
          <div className="justify-self-center text-sm font-bold text-gray-900 truncate">{title}</div>
          <div className="justify-self-end">{right}</div>
        </div>
      </div>
    </div>
  );
};

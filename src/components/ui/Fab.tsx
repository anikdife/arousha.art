import React from 'react';

export const Fab: React.FC<{
  onClick: () => void;
  ariaLabel: string;
}> = ({ onClick, ariaLabel }) => {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      onClick={onClick}
      className="fixed bottom-5 right-5 z-40 w-14 h-14 rounded-full bg-purple-600 text-white shadow-lg border border-purple-700 flex items-center justify-center"
    >
      <span className="text-2xl leading-none">+</span>
    </button>
  );
};

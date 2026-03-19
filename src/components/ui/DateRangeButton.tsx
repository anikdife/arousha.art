import React, { useMemo } from 'react';

function formatDisplay(iso: string): string {
  // iso yyyy-mm-dd
  const parts = iso.split('-');
  if (parts.length !== 3) return iso;
  const y = Number(parts[0]);
  const m = Number(parts[1]);
  const d = Number(parts[2]);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return iso;
  try {
    return new Date(y, m - 1, d).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return iso;
  }
}

export const DateRangeButton: React.FC<{
  fromDate: string;
  toDate: string;
  onClick: () => void;
  className?: string;
}> = ({ fromDate, toDate, onClick, className }) => {
  const label = useMemo(() => {
    return `${formatDisplay(fromDate)} – ${formatDisplay(toDate)}`;
  }, [fromDate, toDate]);

  return (
    <button
      type="button"
      onClick={onClick}
      className={
        'w-full px-4 py-3 rounded-2xl bg-white border border-gray-200 shadow-sm text-left flex items-center justify-between ' +
        (className ?? '')
      }
    >
      <div>
        <div className="text-xs font-semibold text-gray-600">Date range</div>
        <div className="text-sm font-semibold text-gray-900 mt-0.5">{label}</div>
      </div>
      <div className="text-gray-400 text-lg">›</div>
    </button>
  );
};

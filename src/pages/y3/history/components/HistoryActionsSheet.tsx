import React from 'react';
import { BottomSheet } from '../../../../components/ui/BottomSheet';
import type { SeriesEnabledMap } from './SeriesLegendSheet';

export const HistoryActionsSheet: React.FC<{
  open: boolean;
  onClose: () => void;
  onOpenSeries: () => void;
  onReset: () => void;
  seriesEnabled: SeriesEnabledMap;
}> = ({ open, onClose, onOpenSeries, onReset }) => {
  const exportAvailable = false;

  return (
    <BottomSheet open={open} onClose={onClose} title="Actions">
      <div className="space-y-2">
        <button
          type="button"
          onClick={() => {
            onClose();
            onOpenSeries();
          }}
          className="w-full px-4 py-3 rounded-2xl bg-white border border-gray-200 text-left"
        >
          <div className="text-sm font-semibold text-gray-900">Series</div>
          <div className="text-xs text-gray-500">Show/hide chart lines</div>
        </button>

        <button
          type="button"
          disabled={!exportAvailable}
          className={
            'w-full px-4 py-3 rounded-2xl text-left border ' +
            (exportAvailable
              ? 'bg-white border-gray-200'
              : 'bg-gray-50 border-gray-200 text-gray-400 cursor-not-allowed')
          }
        >
          <div className="text-sm font-semibold">Export (coming soon)</div>
          <div className="text-xs">No export action configured</div>
        </button>

        <button
          type="button"
          onClick={() => {
            onReset();
            onClose();
          }}
          className="w-full px-4 py-3 rounded-2xl bg-gray-100 text-gray-900 text-left"
        >
          <div className="text-sm font-semibold">Reset</div>
          <div className="text-xs text-gray-600">Reset date range and series</div>
        </button>
      </div>
    </BottomSheet>
  );
};

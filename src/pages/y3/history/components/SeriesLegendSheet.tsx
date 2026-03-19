import React from 'react';
import { BottomSheet } from '../../../../components/ui/BottomSheet';

export type NumeracySeriesKey = 'subtraction' | 'addition' | 'multiplication' | 'measurement' | 'geometry' | 'dataProbability';
export type SeriesEnabledMap = Record<NumeracySeriesKey, boolean>;

const SERIES: Array<{ key: NumeracySeriesKey; label: string }> = [
  { key: 'subtraction', label: 'Subtraction' },
  { key: 'addition', label: 'Addition' },
  { key: 'multiplication', label: 'Multiplication' },
  { key: 'measurement', label: 'Measurement' },
  { key: 'geometry', label: 'Geometry' },
  { key: 'dataProbability', label: 'Data & Probability' },
];

export const SeriesLegendSheet: React.FC<{
  open: boolean;
  onClose: () => void;
  enabled: SeriesEnabledMap;
  onChange: (next: SeriesEnabledMap) => void;
}> = ({ open, onClose, enabled, onChange }) => {
  return (
    <BottomSheet open={open} onClose={onClose} title="Series">
      <div className="space-y-3">
        {SERIES.map((s) => {
          const checked = !!enabled[s.key];
          return (
            <label key={s.key} className="flex items-center justify-between gap-3 p-3 rounded-2xl border border-gray-200 bg-white">
              <div className="text-sm font-semibold text-gray-900">{s.label}</div>
              <input
                type="checkbox"
                checked={checked}
                onChange={(e) => onChange({ ...enabled, [s.key]: e.target.checked })}
                className="h-5 w-5"
              />
            </label>
          );
        })}

        <button
          type="button"
          onClick={() =>
            onChange({
              subtraction: true,
              addition: true,
              multiplication: true,
              measurement: true,
              geometry: true,
              dataProbability: true,
            })
          }
          className="w-full px-4 py-2 rounded-xl bg-gray-100 text-gray-900 font-semibold"
        >
          Show all
        </button>
      </div>
    </BottomSheet>
  );
};

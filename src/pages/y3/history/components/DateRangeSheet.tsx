import React, { useEffect, useMemo, useState } from 'react';
import { BottomSheet } from '../../../../components/ui/BottomSheet';

function parseIsoDate(value: string): { y: number; m: number; d: number } | null {
  const parts = value.split('-');
  if (parts.length !== 3) return null;
  const y = Number(parts[0]);
  const m = Number(parts[1]);
  const d = Number(parts[2]);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null;
  if (m < 1 || m > 12) return null;
  if (d < 1 || d > 31) return null;
  return { y, m, d };
}

function toDayStartMs(iso: string): number {
  const p = parseIsoDate(iso);
  if (!p) return 0;
  return new Date(p.y, p.m - 1, p.d, 0, 0, 0, 0).getTime();
}

function toDayEndMs(iso: string): number {
  const p = parseIsoDate(iso);
  if (!p) return 0;
  return new Date(p.y, p.m - 1, p.d, 23, 59, 59, 999).getTime();
}

export function computeLocalDayRangeMs(fromDate: string, toDate: string): { startMs: number; endMs: number } | null {
  const a = toDayStartMs(fromDate);
  const b = toDayEndMs(toDate);
  if (!a || !b) return null;
  return { startMs: Math.min(a, b), endMs: Math.max(a, b) };
}

export const DateRangeSheet: React.FC<{
  open: boolean;
  onClose: () => void;
  fromDate: string;
  toDate: string;
  onApply: (next: { fromDate: string; toDate: string }) => void;
  onReset: () => void;
}> = ({ open, onClose, fromDate, toDate, onApply, onReset }) => {
  const [draftFrom, setDraftFrom] = useState(fromDate);
  const [draftTo, setDraftTo] = useState(toDate);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setDraftFrom(fromDate);
    setDraftTo(toDate);
    setError(null);
  }, [fromDate, open, toDate]);

  const rangeOk = useMemo(() => {
    const r = computeLocalDayRangeMs(draftFrom, draftTo);
    if (!r) return false;
    return r.startMs <= r.endMs;
  }, [draftFrom, draftTo]);

  const apply = () => {
    if (!rangeOk) {
      setError('Please select a valid date range.');
      return;
    }
    setError(null);
    onApply({ fromDate: draftFrom, toDate: draftTo });
    onClose();
  };

  return (
    <BottomSheet open={open} onClose={onClose} title="Date range">
      <div className="space-y-4">
        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">From</label>
          <input
            type="date"
            value={draftFrom}
            onChange={(e) => setDraftFrom(e.target.value)}
            className="w-full px-3 py-2 rounded-xl border border-gray-300 bg-white text-sm"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">To</label>
          <input
            type="date"
            value={draftTo}
            onChange={(e) => setDraftTo(e.target.value)}
            className="w-full px-3 py-2 rounded-xl border border-gray-300 bg-white text-sm"
          />
        </div>

        {error ? <div className="text-sm text-red-700">{error}</div> : null}

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              onReset();
              onClose();
            }}
            className="flex-1 px-4 py-2 rounded-xl bg-gray-100 text-gray-900 font-semibold"
          >
            Reset
          </button>
          <button
            type="button"
            onClick={apply}
            className="flex-1 px-4 py-2 rounded-xl bg-purple-600 text-white font-semibold"
          >
            Apply
          </button>
        </div>
      </div>
    </BottomSheet>
  );
};

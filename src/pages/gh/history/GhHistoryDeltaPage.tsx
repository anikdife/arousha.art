import React from 'react';
import { Link } from 'react-router-dom';
import { NAPLAN3DTemplate } from '../../../components/naplan3d/NAPLAN3DTemplate';

const SAMPLE_DOC = {
  student_id: 'DEMO-STUDENT',
  attempts: [{ domain: 'Numeracy', score: 540, date: '2025-10-05T10:00:00Z', metadata: { studentScore: 540 } }],
  benchmarks: { national: 510, school: 525 },
};

export function GhHistoryDeltaPage() {
  return (
    <NAPLAN3DTemplate title="NAPLAN 3D History" subtitle="Delta Comparison (Stub)" data={SAMPLE_DOC}>
      {() => (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
          <div className="text-lg font-semibold">Delta Comparison</div>
          <div className="mt-2 text-sm text-slate-300">
            This route is wired for Graph 2, but only Graph 1 is implemented per scope.
          </div>
          <div className="mt-4">
            <Link to="/gh/history" className="text-sm font-semibold text-cyan-300 hover:text-cyan-200">
              ← Back to Growth Mountain
            </Link>
          </div>
        </div>
      )}
    </NAPLAN3DTemplate>
  );
}

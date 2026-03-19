import React from 'react';
import { Link } from 'react-router-dom';
import { NAPLAN3DTemplate } from '../../../components/naplan3d/NAPLAN3DTemplate';

const SAMPLE_DOC = {
  student_id: 'DEMO-STUDENT',
  attempts: [{ domain: 'Reading', score: 520, date: '2025-09-12T10:00:00Z', metadata: { proficiencyStrands: {} } }],
  benchmarks: { national: 510, school: 525 },
};

export function GhHistoryMasteryPage() {
  return (
    <NAPLAN3DTemplate title="NAPLAN 3D History" subtitle="Mastery Radar (Stub)" data={SAMPLE_DOC}>
      {() => (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
          <div className="text-lg font-semibold">Mastery Radar</div>
          <div className="mt-2 text-sm text-slate-300">
            This route is wired for Graph 3, but only Graph 1 is implemented per scope.
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

import React from 'react';
import type { NaplanHistoryParsed } from './types';
import { parseNaplanHistoryDoc } from './types';

export function NAPLAN3DTemplate(props: {
  title: string;
  subtitle?: string;
  data: unknown;
  children: (parsed: NaplanHistoryParsed) => React.ReactNode;
}) {
  const parsed = React.useMemo(() => parseNaplanHistoryDoc(props.data), [props.data]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="max-w-6xl mx-auto px-4 py-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{props.title}</h1>
            <div className="mt-1 text-sm text-slate-300">{props.subtitle ?? 'NAPLAN 3D analytics'}</div>
          </div>
          {parsed ? (
            <div className="text-xs text-slate-300 bg-white/5 border border-white/10 rounded-lg px-3 py-2">
              <div className="font-semibold text-slate-100">Student</div>
              <div className="mt-0.5">{parsed.student_id}</div>
              <div className="mt-1">Attempts: {parsed.attempts.length}</div>
            </div>
          ) : null}
        </div>

        {!parsed ? (
          <div className="mt-6 rounded-xl border border-red-500/30 bg-red-500/10 p-4">
            <div className="font-semibold">Invalid data for NAPLAN3DTemplate</div>
            <div className="mt-1 text-sm text-slate-200">
              Expected Firestore-shaped JSON:
              <pre className="mt-2 text-xs overflow-auto bg-black/30 border border-white/10 rounded-lg p-3">
{`{
  "student_id": "string",
  "attempts": [{ "domain": "Numeracy", "score": 540, "date": "timestamp", "metadata": { } }],
  "benchmarks": { "national": 510, "school": 525 }
}`}
              </pre>
            </div>
          </div>
        ) : (
          <div className="mt-6">{props.children(parsed)}</div>
        )}
      </div>
    </div>
  );
}

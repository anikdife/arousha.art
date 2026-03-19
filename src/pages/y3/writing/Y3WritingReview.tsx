import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { buildWritingAssessmentPdf } from '../../../lib/writing/writingAssessmentPdf';
import { loadWritingIndexY3 } from '../../../lib/writing/storageIndex';
import { loadPromptById, type WritingPromptY3 } from '../../../lib/writing/promptLoader';
import { downloadWritingAnswerText, writingAttemptDocRef } from '../../../lib/writing/attemptService';
import { getDoc } from 'firebase/firestore';

GlobalWorkerOptions.workerSrc = `${(process.env.PUBLIC_URL || '').replace(/\/$/, '')}/pdfjs/pdf.worker.min.mjs`;

type ReviewState = {
  studentUid: string;
  attemptId: string;
  backgroundLocation?: any;
};

function safeParseJson(text: string): { ok: true; value: any } | { ok: false; error: string } {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch (e: any) {
    return { ok: false, error: String(e?.message ?? e) };
  }
}

function titleCaseFromKey(key: string): string {
  const spaced = String(key)
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .trim();
  return spaced.length ? spaced.charAt(0).toUpperCase() + spaced.slice(1) : '';
}

function isPlainObject(value: any): value is Record<string, any> {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function pickJsonFeedback(attemptData: any): { format: 'json'; value: any } | { format: 'text' } {
  const format = attemptData?.commentFormat;
  const commentJson = attemptData?.commentJson;
  const comment = typeof attemptData?.comment === 'string' ? attemptData.comment : '';

  if (format === 'json' && commentJson != null) return { format: 'json', value: commentJson };

  // Back-compat: if comment looks like JSON, try parsing.
  const trimmed = comment.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    const parsed = safeParseJson(trimmed);
    if (parsed.ok) return { format: 'json', value: parsed.value };
  }

  return { format: 'text' };
}

export const Y3WritingReview: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();

  const openedInOverlay = !!(location.state as any)?.backgroundLocation;

  const state = (location.state as any) as ReviewState | undefined;
  const studentUid = state?.studentUid;
  const attemptId = state?.attemptId;

  const backHref = '/y3/history';

  const [pdfDoc, setPdfDoc] = useState<any | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pageNumber, setPageNumber] = useState<number>(1);
  const [isRenderingPage, setIsRenderingPage] = useState<boolean>(false);

  const [feedbackFormat, setFeedbackFormat] = useState<'text' | 'json'>('text');
  const [feedbackJson, setFeedbackJson] = useState<any>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [containerWidth, setContainerWidth] = useState<number>(0);
  const [containerHeight, setContainerHeight] = useState<number>(0);
  const lastMeasuredSizeRef = useRef<{ w: number; h: number }>({ w: 0, h: 0 });

  const [isMobileLayout, setIsMobileLayout] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia?.('(max-width: 767px)')?.matches ?? false;
  });

  const totalPdfPages = pdfDoc?.numPages ?? 0;

  const pageLabels = useMemo(
    () => [
      { n: 1, label: 'Prompt' },
      { n: 2, label: 'Answer' },
      { n: 3, label: 'Feedback' },
    ],
    []
  );

  useEffect(() => {
    const measure = () => {
      const el = containerRef.current;
      if (!el) return;

      const w = Math.floor(el.clientWidth);
      const h = Math.floor(el.clientHeight);

      const prev = lastMeasuredSizeRef.current;
      if (prev.w === w && prev.h === h) return;
      lastMeasuredSizeRef.current = { w, h };
      setContainerWidth(w);
      setContainerHeight(h);
    };

    const raf = window.requestAnimationFrame(measure);
    window.addEventListener('resize', measure);
    window.addEventListener('orientationchange', measure);

    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      const el = containerRef.current;
      if (el) {
        ro = new ResizeObserver(() => measure());
        ro.observe(el);
      }
    }

    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener('resize', measure);
      window.removeEventListener('orientationchange', measure);
      ro?.disconnect();
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;

    const mq = window.matchMedia('(max-width: 767px)');
    const onChange = () => setIsMobileLayout(mq.matches);

    onChange();
    mq.addEventListener?.('change', onChange);
    return () => {
      mq.removeEventListener?.('change', onChange);
    };
  }, []);

  useEffect(() => {
    if (!studentUid || !attemptId) {
      setLoadError('Session not found');
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        setLoadError(null);
        setPdfDoc(null);

        const snap = await getDoc(writingAttemptDocRef(studentUid, attemptId));
        if (!snap.exists()) throw new Error('Writing attempt not found');
        const data = snap.data() as any;

        const picked = pickJsonFeedback(data);
        setFeedbackFormat(picked.format);
        setFeedbackJson(picked.format === 'json' ? picked.value : null);

        const promptId = typeof data.promptId === 'string' ? data.promptId : '';
        const promptTitle = typeof data.promptTitle === 'string' ? data.promptTitle : 'Writing prompt';
        const answerStoragePath = typeof data.answerStoragePath === 'string' ? data.answerStoragePath : '';

        const scorePercent = typeof data.scorePercent === 'number' ? data.scorePercent : 0;
        const comment = typeof data.comment === 'string' ? data.comment : '';
        const assessedAtMillis = typeof data.assessedAt?.toDate === 'function' ? data.assessedAt.toDate().getTime() : null;

        // Best-effort prompt loading: older attempts might not have a promptId,
        // or the prompt bank may be unavailable. Fall back to a placeholder.
        let prompt: WritingPromptY3 = {
          promptId: promptId || 'unknown',
          year: 3,
          type: 'narrative',
          title: promptTitle,
          taskIntro: '(Original prompt could not be loaded.)',
          guidance: ['Write in full sentences.', 'Organise your ideas.', 'Use correct punctuation.'],
          remember: ['Plan your writing.', 'Use paragraphs.', 'Check spelling.', 'Reread and edit.'],
          version: 1,
        };
        let promptImageUrl = '';

        try {
          const index = await loadWritingIndexY3();
          const item = (index.items ?? []).find((it) => it.promptId === promptId);
          if (item) {
            const loaded = await loadPromptById({ item, expectedPromptId: promptId });
            prompt = loaded.prompt;
            promptImageUrl = loaded.imageUrl;
          }
        } catch (e) {
          console.warn('Failed to load writing prompt assets; using placeholder prompt.', e);
        }

        const answerText = answerStoragePath ? await downloadWritingAnswerText(answerStoragePath) : '';

        const bytes = await buildWritingAssessmentPdf({
          title: `Writing Practice`,
          prompt,
          promptImageUrl,
          answerText,
          feedback: {
            scorePercent,
            comment,
            assessedAt: assessedAtMillis ?? undefined,
          },
        });

        if (cancelled) return;

        const doc = await (getDocument({ data: bytes }) as any).promise;
        if (cancelled) return;

        setPdfDoc(doc);
        setPageNumber(1);

        // Small title hint for non-overlay header (kept minimal)
        if (!openedInOverlay) {
          document.title = `${promptTitle} - Writing Review`;
        }
      } catch (e) {
        console.error('Failed to build/render Writing PDF:', e);
        if (!cancelled) {
          const msg = (e as any)?.message ? `Failed to render writing review: ${(e as any).message}` : 'Failed to render writing review';
          setLoadError(msg);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [attemptId, openedInOverlay, studentUid]);

  useEffect(() => {
    const shouldRenderPdf = !(pageNumber === 3 && feedbackFormat === 'json');
    if (!shouldRenderPdf) return;
    if (!pdfDoc || !canvasRef.current || !containerWidth || !containerHeight) return;

    let cancelled = false;

    (async () => {
      try {
        setIsRenderingPage(true);

        const page = await pdfDoc.getPage(pageNumber);
        if (cancelled) return;

        const viewport = page.getViewport({ scale: 1 });

        const scaleW = containerWidth / viewport.width;
        const scaleH = containerHeight / viewport.height;

        // On mobile, prefer fitting to width so the PDF feels "full size".
        // Allow vertical scroll if it becomes taller than the viewport.
        const scale = isMobileLayout ? Math.max(0.1, scaleW) : Math.max(0.1, Math.min(scaleW, scaleH));
        const scaledViewport = page.getViewport({ scale });

        const canvas = canvasRef.current!;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const dpr = window.devicePixelRatio || 1;
        canvas.width = Math.floor(scaledViewport.width * dpr);
        canvas.height = Math.floor(scaledViewport.height * dpr);
        canvas.style.width = `${Math.floor(scaledViewport.width)}px`;
        canvas.style.height = `${Math.floor(scaledViewport.height)}px`;

        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, Math.floor(scaledViewport.width), Math.floor(scaledViewport.height));

        const renderTask = page.render({ canvasContext: ctx, viewport: scaledViewport });
        await renderTask.promise;
      } catch (e) {
        console.error('Failed to render PDF page:', e);
        if (!cancelled) setLoadError('Failed to render page');
      } finally {
        if (!cancelled) setIsRenderingPage(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [containerHeight, containerWidth, pageNumber, pdfDoc]);

  const renderJsonValue = (value: any) => {
    if (value == null) return <div className="text-sm text-gray-500">(empty)</div>;
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      return <div className="text-sm text-gray-800 whitespace-pre-wrap">{String(value)}</div>;
    }
    if (Array.isArray(value)) {
      return (
        <ul className="mt-1 space-y-1 list-disc list-inside text-sm text-gray-800">
          {value.map((v, idx) => (
            <li key={idx} className="whitespace-pre-wrap">
              {typeof v === 'string' ? v : JSON.stringify(v)}
            </li>
          ))}
        </ul>
      );
    }
    if (isPlainObject(value)) {
      return (
        <div className="mt-2 space-y-3">
          {Object.entries(value).map(([k, v]) => (
            <div key={k} className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm border-l-4 border-l-indigo-300">
              <div className="text-xs font-semibold text-slate-700">{titleCaseFromKey(k)}</div>
              <div className="mt-1">{renderJsonValue(v)}</div>
            </div>
          ))}
        </div>
      );
    }
    return <pre className="text-xs text-gray-800 whitespace-pre-wrap">{JSON.stringify(value, null, 2)}</pre>;
  };

  const jsonFeedbackPanel = useMemo(() => {
    if (feedbackFormat !== 'json') return null;
    const obj = feedbackJson;

    // If it matches the expected assessor shape, render a nicer layout.
    if (isPlainObject(obj) && (obj.studentPerformance || obj.criteriaAnalysis || obj.strengths || obj.areasForImprovement || obj.evidence)) {
      const sp = obj.studentPerformance;
      const ca = obj.criteriaAnalysis;
      const strengths = obj.strengths;
      const areas = obj.areasForImprovement;
      const evidence = obj.evidence;

      return (
        <div className="w-full max-w-4xl mx-auto p-4 sm:p-6">
          <div className="rounded-3xl border border-slate-200/80 bg-white/90 shadow-xl overflow-hidden backdrop-blur">
            <div className="p-5 border-b border-slate-200/60 bg-gradient-to-r from-sky-50 via-white to-indigo-50">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-base font-bold text-slate-900">Teacher feedback</div>
                  <div className="text-xs text-slate-600 mt-1">Clear, structured notes to help you improve</div>
                </div>
                <div className="shrink-0 inline-flex items-center rounded-full bg-indigo-100 text-indigo-800 px-3 py-1 text-xs font-semibold">
                  JSON
                </div>
              </div>
            </div>

            <div className="p-5 sm:p-6 space-y-5 bg-gradient-to-b from-white to-slate-50/60">
              {sp && (
                <div className="rounded-2xl border border-sky-100 bg-sky-50/60 p-5 shadow-sm">
                  <div className="text-xs font-semibold text-sky-900">Student performance</div>
                  <div className="mt-2 grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="rounded-2xl bg-white border border-sky-100 p-4 shadow-sm">
                      <div className="text-[11px] font-semibold text-slate-600 uppercase tracking-wide">Total score estimate</div>
                      <div className="mt-1 text-sm font-bold text-slate-900">{String(sp.totalScoreEstimate ?? '')}</div>
                    </div>
                    <div className="rounded-2xl bg-white border border-sky-100 p-4 shadow-sm">
                      <div className="text-[11px] font-semibold text-slate-600 uppercase tracking-wide">Level</div>
                      <div className="mt-1 text-sm font-bold text-slate-900">{String(sp.level ?? '')}</div>
                    </div>
                    <div className="rounded-2xl bg-white border border-sky-100 p-4 shadow-sm sm:col-span-3">
                      <div className="text-[11px] font-semibold text-slate-600 uppercase tracking-wide">Summary</div>
                      <div className="mt-1 text-sm text-gray-800 whitespace-pre-wrap">{String(sp.summary ?? '')}</div>
                    </div>
                  </div>
                </div>
              )}

              {isPlainObject(ca) && (
                <div className="rounded-2xl border border-indigo-100 bg-indigo-50/50 p-5 shadow-sm">
                  <div className="text-xs font-semibold text-indigo-900">Criteria analysis</div>
                  <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {Object.entries(ca).map(([k, v]) => {
                      const score = isPlainObject(v) ? v.score : undefined;
                      const feedback = isPlainObject(v) ? v.feedback : v;
                      return (
                        <div key={k} className="rounded-2xl bg-white border border-indigo-100 p-4 shadow-sm">
                          <div className="flex items-start justify-between gap-2">
                            <div className="text-sm font-bold text-slate-900">{titleCaseFromKey(k)}</div>
                            {score != null && (
                              <div className="text-xs font-bold px-2.5 py-1 rounded-full bg-indigo-100 text-indigo-800">
                                {String(score)}
                              </div>
                            )}
                          </div>
                          <div className="mt-2 text-sm text-gray-800 whitespace-pre-wrap">{String(feedback ?? '')}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {Array.isArray(strengths) && strengths.length > 0 && (
                <div className="rounded-2xl border border-emerald-100 bg-emerald-50/50 p-5 shadow-sm">
                  <div className="text-xs font-semibold text-emerald-900">Strengths</div>
                  <ul className="mt-3 list-disc list-inside text-sm text-gray-800 space-y-2">
                    {strengths.map((s: any, idx: number) => (
                      <li key={idx} className="whitespace-pre-wrap">{String(s)}</li>
                    ))}
                  </ul>
                </div>
              )}

              {Array.isArray(areas) && areas.length > 0 && (
                <div className="rounded-2xl border border-amber-100 bg-amber-50/60 p-5 shadow-sm">
                  <div className="text-xs font-semibold text-amber-900">Areas for improvement</div>
                  <ul className="mt-3 list-disc list-inside text-sm text-gray-800 space-y-2">
                    {areas.map((s: any, idx: number) => (
                      <li key={idx} className="whitespace-pre-wrap">{String(s)}</li>
                    ))}
                  </ul>
                </div>
              )}

              {Array.isArray(evidence) && evidence.length > 0 && (
                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="text-xs font-semibold text-slate-800">Evidence</div>
                  <ul className="mt-2 space-y-2">
                    {evidence.map((q: any, idx: number) => (
                      <li
                        key={idx}
                        className="rounded-2xl border border-slate-200 bg-slate-50/40 p-4 text-sm text-gray-800 whitespace-pre-wrap border-l-4 border-l-violet-300"
                      >
                        {String(q)}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Fallback: render remaining keys if present */}
              {renderJsonValue(
                isPlainObject(obj)
                  ? Object.fromEntries(
                      Object.entries(obj).filter(
                        ([k]) => !['studentPerformance', 'criteriaAnalysis', 'strengths', 'areasForImprovement', 'evidence'].includes(k)
                      )
                    )
                  : obj
              )}
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="w-full max-w-4xl mx-auto p-4 sm:p-6">
        <div className="rounded-3xl border border-slate-200/80 bg-white/90 shadow-xl p-5 backdrop-blur">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-base font-bold text-slate-900">Teacher feedback</div>
              <div className="text-xs text-slate-600 mt-1">Structured feedback (JSON)</div>
            </div>
            <div className="shrink-0 inline-flex items-center rounded-full bg-indigo-100 text-indigo-800 px-3 py-1 text-xs font-semibold">
              JSON
            </div>
          </div>
          <div className="mt-4">{renderJsonValue(obj)}</div>
        </div>
      </div>
    );
  }, [feedbackFormat, feedbackJson]);

  if (!studentUid || !attemptId) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-green-50 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-gray-800 mb-4">Session not found</h2>
          <Link to={backHref} className="text-blue-600 hover:text-blue-700">
            Back to History
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-green-50">
      {!openedInOverlay && (
        <header className="bg-white/80 backdrop-blur border-b">
          <div className="w-full px-4 sm:px-6 lg:px-8 py-6">
            <Link to={backHref} className="inline-flex items-center text-blue-600 hover:text-blue-700 transition-colors">
              <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Back to History
            </Link>

            <div className="mt-3 flex items-start justify-between gap-4">
              <div>
                <h1 className="text-3xl font-bold text-gray-900">Writing Review</h1>
                <div className="text-gray-500 mt-1 text-sm">Attempt ID: {attemptId}</div>
              </div>
            </div>
          </div>
        </header>
      )}

      <main className="w-full px-4 sm:px-6 lg:px-8 py-8">
        {loadError && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-4">
            <div className="text-red-800 font-medium">{loadError}</div>
          </div>
        )}

        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
          <div className={`grid ${isMobileLayout ? 'grid-rows-[1fr]' : 'grid-cols-[320px_1fr]'} h-[75vh] min-h-[520px]`}>
            {!isMobileLayout && (
              <div className="border-b md:border-b-0 md:border-r border-gray-100 p-4">
                <div className="text-sm font-semibold text-gray-900">Pages</div>
                <div className="mt-2 text-sm text-gray-600">1. Prompt</div>
                <div className="text-sm text-gray-600">2. Answer</div>
                <div className="text-sm text-gray-600">3. Feedback</div>

                <div className="mt-4 flex items-center gap-2">
                  <button
                    type="button"
                    disabled={!pdfDoc || pageNumber <= 1 || isRenderingPage}
                    onClick={() => setPageNumber((p) => Math.max(1, p - 1))}
                    className="px-3 py-2 text-sm font-semibold rounded-lg bg-gray-100 text-gray-800 hover:bg-gray-200 disabled:opacity-60"
                  >
                    Prev
                  </button>
                  <button
                    type="button"
                    disabled={!pdfDoc || (totalPdfPages > 0 && pageNumber >= totalPdfPages) || isRenderingPage}
                    onClick={() => setPageNumber((p) => (totalPdfPages > 0 ? Math.min(totalPdfPages, p + 1) : p + 1))}
                    className="px-3 py-2 text-sm font-semibold rounded-lg bg-gray-900 text-white hover:bg-gray-800 disabled:opacity-60"
                  >
                    Next
                  </button>
                </div>

                <div className="mt-3 text-xs text-gray-500">{pdfDoc ? `Page ${pageNumber} of ${totalPdfPages}` : 'Loading…'}</div>
              </div>
            )}

            <div
              ref={containerRef}
              className={
                isMobileLayout
                  ? 'relative bg-gray-50 overflow-auto'
                  : pageNumber === 3 && feedbackFormat === 'json'
                    ? 'relative bg-gray-50 overflow-auto'
                    : 'relative bg-gray-50 flex items-center justify-center overflow-hidden'
              }
            >
              {isMobileLayout && (
                <div className="absolute top-0 left-0 right-0 z-10 bg-white/95 backdrop-blur border-b border-gray-200">
                  <div className="px-3 py-2 text-xs text-gray-700 flex items-center gap-2 overflow-x-auto whitespace-nowrap">
                    {pageLabels.map((p) => (
                      <button
                        key={p.n}
                        type="button"
                        onClick={() => setPageNumber(p.n)}
                        disabled={!pdfDoc || isRenderingPage}
                        className={
                          pageNumber === p.n
                            ? 'px-2.5 py-1 rounded-full bg-gray-900 text-white font-semibold'
                            : 'px-2.5 py-1 rounded-full bg-gray-100 text-gray-800 font-semibold'
                        }
                      >
                        {p.n}. {p.label}
                      </button>
                    ))}
                    <div className="ml-auto text-[11px] text-gray-500">{pdfDoc ? `${pageNumber}/${totalPdfPages}` : 'Loading…'}</div>
                  </div>
                </div>
              )}

              {pageNumber === 3 && feedbackFormat === 'json' ? (
                <div className={isMobileLayout ? 'pt-11' : ''}>{jsonFeedbackPanel}</div>
              ) : (
                <div className={isMobileLayout ? 'pt-11 flex justify-center' : ''}>
                  <canvas ref={canvasRef} className="block bg-white shadow-sm" />
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

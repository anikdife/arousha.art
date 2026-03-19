import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { buildGeometryPdf } from '../../../../lib/geometryPdf';
import { signalHistoryOpenComplete } from '../../../../lib/historyOpenSignal';

GlobalWorkerOptions.workerSrc = `${(process.env.PUBLIC_URL || '').replace(/\/$/, '')}/pdfjs/pdf.worker.min.mjs`;

type SessionData = {
  sessionId: string;
  submittedAt?: string;
  createdAt?: string;
  score?: { percentage: number; correct: number; total: number };
  topic?: string;
  setNo?: number;
  page?: any;
  answers?: Record<string, string>;
};

export const Y3GeometryReview: React.FC = () => {
  const location = useLocation();

  const didSignalOpenCompleteRef = useRef<boolean>(false);

  const openedInOverlay = !!(location.state as any)?.backgroundLocation;

  const session = location.state?.session as SessionData | undefined;
  const studentName = (location.state as any)?.studentName as string | undefined;
  const sessionId = session?.sessionId;

  const backHref = '/y3/history';

  const sessionTitle = useMemo(() => 'Geometry Practice Session', []);

  const [pdfDoc, setPdfDoc] = useState<any | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pageNumber, setPageNumber] = useState<number>(1);
  const [isRenderingPage, setIsRenderingPage] = useState<boolean>(false);

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

  useEffect(() => {
    // Clear per-row "Opening..." state immediately after navigation,
    // even if PDF build/render takes time or fails.
    if (didSignalOpenCompleteRef.current) return;
    const id = String(sessionId ?? '');
    if (!id) return;
    didSignalOpenCompleteRef.current = true;
    signalHistoryOpenComplete(id);
  }, [sessionId]);

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
    if (!session?.page?.problems?.length) {
      setLoadError('Session not found');
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        setLoadError(null);
        setPdfDoc(null);

        const bytes = await buildGeometryPdf({ title: sessionTitle, session, studentName });
        if (cancelled) return;

        const doc = await (getDocument({ data: bytes }) as any).promise;
        if (cancelled) return;

        setPdfDoc(doc);
        setPageNumber(1);
      } catch (e) {
        console.error('Failed to build/render Geometry PDF:', e);
        if (!cancelled) setLoadError('Failed to render session');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [session, sessionTitle]);

  useEffect(() => {
    if (!pdfDoc || !canvasRef.current || !containerWidth || !containerHeight) return;

    let cancelled = false;

    (async () => {
      try {
        setIsRenderingPage(true);

        const page = await pdfDoc.getPage(pageNumber);
        if (cancelled) return;

        const viewport = page.getViewport({ scale: 1 });

        // Fit to container (keep aspect)
        const scaleW = containerWidth / viewport.width;
        const scaleH = containerHeight / viewport.height;
        const scale = Math.max(0.1, Math.min(scaleW, scaleH));
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

        if (!cancelled && !didSignalOpenCompleteRef.current) {
          const id = String(sessionId ?? '');
          if (id) {
            didSignalOpenCompleteRef.current = true;
            signalHistoryOpenComplete(id);
          }
        }
      } catch (e) {
        console.error('Failed to render PDF page:', e);
        if (!cancelled) setLoadError('Failed to render page');

        if (!cancelled && !didSignalOpenCompleteRef.current) {
          const id = String(sessionId ?? '');
          if (id) {
            didSignalOpenCompleteRef.current = true;
            signalHistoryOpenComplete(id);
          }
        }
      } finally {
        if (!cancelled) setIsRenderingPage(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [containerHeight, containerWidth, pageNumber, pdfDoc, sessionId]);

  if (!session) {
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
                <h1 className="text-3xl font-bold text-gray-900">Geometry Practice Session</h1>
                {typeof session.setNo === 'number' && <div className="text-gray-600 mt-1">Set: {session.setNo}</div>}
                <div className="text-gray-500 mt-1 text-sm">Session ID: {session.sessionId}</div>
              </div>

              <div className="flex items-center gap-3">
                <div className="inline-flex items-center px-4 py-2 rounded-full font-bold text-white bg-purple-600">
                  {session.score?.percentage ?? 0}%
                </div>
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
          <div className={`grid ${isMobileLayout ? 'grid-rows-[auto_1fr]' : 'grid-cols-[320px_1fr]'} h-[75vh] min-h-[520px]`}>
            <div className="border-b md:border-b-0 md:border-r border-gray-100 p-4">
              <div className="text-gray-900 font-bold">Review</div>
              <div className="text-gray-600 text-sm mt-1">PDF preview</div>

              <div className="mt-4 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPageNumber((p) => Math.max(1, p - 1))}
                  disabled={!totalPdfPages || pageNumber <= 1 || isRenderingPage}
                  className="px-3 py-2 text-sm font-semibold rounded-lg bg-gray-100 text-gray-800 hover:bg-gray-200 disabled:opacity-50"
                >
                  Prev
                </button>
                <button
                  type="button"
                  onClick={() => setPageNumber((p) => Math.min(totalPdfPages, p + 1))}
                  disabled={!totalPdfPages || pageNumber >= totalPdfPages || isRenderingPage}
                  className="px-3 py-2 text-sm font-semibold rounded-lg bg-gray-100 text-gray-800 hover:bg-gray-200 disabled:opacity-50"
                >
                  Next
                </button>
              </div>

              <div className="mt-3 text-xs text-gray-600">
                {totalPdfPages ? `Page ${pageNumber} of ${totalPdfPages}` : 'Loading…'}
              </div>
            </div>

            <div ref={containerRef} className="bg-gray-50 flex items-center justify-center overflow-hidden">
              <canvas ref={canvasRef} className="block mx-auto" />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

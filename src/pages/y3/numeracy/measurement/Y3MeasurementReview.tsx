import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { buildMeasurementPdf } from '../../../../lib/measurementPdf';
import { signalHistoryOpenComplete } from '../../../../lib/historyOpenSignal';

GlobalWorkerOptions.workerSrc = `${(process.env.PUBLIC_URL || '').replace(/\/$/, '')}/pdfjs/pdf.worker.min.mjs`;

type SessionData = {
  sessionId: string;
  submittedAt?: string;
  createdAt?: string;
  score?: {
    percentage: number;
    correct: number;
    total: number;
  };
  topic?: string;
  pages: any[];
};

export const Y3MeasurementReview: React.FC = () => {
  const location = useLocation();
  const openedInOverlay = !!(location.state as any)?.backgroundLocation;

  const session = location.state?.session as SessionData | undefined;
  const studentName = (location.state as any)?.studentName as string | undefined;
  const backHref = '/y3/history';

  const didSignalOpenCompleteRef = useRef<boolean>(false);

  const sessionTitle = useMemo(() => 'Measurement Practice', []);

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
    if (didSignalOpenCompleteRef.current) return;
    const id = String(session?.sessionId ?? '');
    if (!id) return;
    didSignalOpenCompleteRef.current = true;
    signalHistoryOpenComplete(id);
  }, [session]);

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
    let cancelled = false;

    (async () => {
      try {
        setLoadError(null);
        setPdfDoc(null);

        if (!session) return;

        const bytes = await buildMeasurementPdf({
          title: sessionTitle,
          session,
          createdAtIso: session.submittedAt ?? session.createdAt,
          studentName,
          score: session.score,
          sessionId: session.sessionId,
        });

        if (cancelled) return;

        const doc = await (getDocument({ data: bytes }) as any).promise;
        if (cancelled) return;

        setPdfDoc(doc);
        setPageNumber(1);
      } catch (e) {
        console.error('Failed to build/render Measurement PDF:', e);
        if (!cancelled) setLoadError('Failed to render session');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [session, sessionTitle]);

  useEffect(() => {
    if (!pdfDoc) return;
    if (!canvasRef.current) return;
    if (!containerWidth) return;
    if (!containerHeight) return;
    if (pageNumber < 1 || pageNumber > totalPdfPages) return;

    let cancelled = false;

    (async () => {
      try {
        setIsRenderingPage(true);
        setLoadError(null);

        const page = await pdfDoc.getPage(pageNumber);
        if (cancelled) return;

        const unscaledViewport = page.getViewport({ scale: 1 });
        const desiredWidth = Math.max(1, containerWidth);
        const desiredHeight = Math.max(1, containerHeight);

        const scaleToWidth = desiredWidth / unscaledViewport.width;
        const scaleToHeight = desiredHeight / unscaledViewport.height;

        const scale = isMobileLayout ? scaleToWidth : scaleToHeight;
        const viewport = page.getViewport({ scale });

        const canvas = canvasRef.current!;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const dpr = window.devicePixelRatio || 1;
        canvas.width = Math.floor(viewport.width * dpr);
        canvas.height = Math.floor(viewport.height * dpr);
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;

        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, viewport.width, viewport.height);

        const renderTask = page.render({ canvasContext: ctx, viewport });
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
  }, [containerWidth, containerHeight, isMobileLayout, pageNumber, pdfDoc, totalPdfPages]);

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

  const percent = session.score?.percentage ?? 0;

  return (
    <div className="min-h-screen md:h-screen bg-gradient-to-br from-blue-50 via-white to-green-50">
      <div className="h-full flex flex-col md:flex-row">
        <aside className="px-4 pt-4 pb-3 md:py-0 md:w-[340px] md:flex md:items-center md:justify-center">
          <div className="w-full max-w-sm text-center md:text-left">
            {!openedInOverlay && (
              <>
                <Link to={backHref} className="inline-flex items-center text-blue-600 hover:text-blue-700 transition-colors">
                  <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                  Back to History
                </Link>

                <div className="mt-3">
                  <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Practice Session</h1>
                  <div className="mt-2 text-sm text-gray-600">PDF view (mobile-friendly)</div>
                </div>

                <div className="mt-4 flex items-center justify-center md:justify-start">
                  <div
                    className={`inline-flex items-center px-4 py-2 rounded-full font-bold text-white ${
                      percent >= 90
                        ? 'bg-green-500'
                        : percent >= 75
                          ? 'bg-yellow-500'
                          : percent >= 60
                            ? 'bg-orange-500'
                            : 'bg-red-500'
                    }`}
                  >
                    {percent}%
                  </div>
                </div>
              </>
            )}

            <div className="mt-4 flex items-center justify-center md:justify-start">
              <div className="bg-white border border-gray-200 rounded-xl shadow-sm px-4 py-3 flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setPageNumber((p) => Math.max(1, p - 1))}
                  disabled={pageNumber <= 1 || isRenderingPage}
                  className="px-3 py-2 text-sm font-semibold rounded-lg bg-gray-100 text-gray-800 hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Prev
                </button>

                <div className="text-sm text-gray-700 font-semibold">
                  Page {pageNumber} / {totalPdfPages || 1}
                </div>

                <button
                  type="button"
                  onClick={() => setPageNumber((p) => Math.min(totalPdfPages || 1, p + 1))}
                  disabled={pageNumber >= (totalPdfPages || 1) || isRenderingPage}
                  className="px-3 py-2 text-sm font-semibold rounded-lg bg-gray-100 text-gray-800 hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Next
                </button>
              </div>
            </div>

            {loadError && (
              <div className="mt-4 bg-red-50 border border-red-200 rounded-xl p-4">
                <div className="text-red-800 font-medium">{loadError}</div>
              </div>
            )}
          </div>
        </aside>

        <main className="flex-1 px-3 pb-3 md:p-4">
          <div className="w-full h-[70vh] md:h-full bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
            <div ref={containerRef} className="w-full h-full flex items-center justify-center bg-gray-50">
              <canvas ref={canvasRef} />
            </div>
          </div>
        </main>
      </div>
    </div>
  );
};

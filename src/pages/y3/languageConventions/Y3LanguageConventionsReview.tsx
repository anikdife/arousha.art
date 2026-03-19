// src/pages/y3/languageConventions/Y3LanguageConventionsReview.tsx

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../../auth/AuthProvider';
import { loadSessionJsonByStoragePath } from '../../../lib/session/loadSessionJsonByPath';
import type { LCSession } from '../../../lib/languageConventions/types';
import { buildLanguageConventionsPdf } from '../../../lib/languageConventions/pdfExport';
import { getActiveStudentName } from '../../../lib/activeStudent';
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { signalHistoryOpenComplete } from '../../../lib/historyOpenSignal';

GlobalWorkerOptions.workerSrc = `${(process.env.PUBLIC_URL || '').replace(/\/$/, '')}/pdfjs/pdf.worker.min.mjs`;

const LC_REVIEW_ARGS_KEY = 'lcReviewArgs.v1';

type LcReviewArgs = {
  storagePath: string;
  studentUid?: string;
};

function readReviewArgsFromSessionStorage(): LcReviewArgs | null {
  try {
    const raw = window.sessionStorage.getItem(LC_REVIEW_ARGS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as any;
    const storagePath = typeof parsed?.storagePath === 'string' ? parsed.storagePath : '';
    const studentUid = typeof parsed?.studentUid === 'string' ? parsed.studentUid : undefined;
    if (!storagePath) return null;
    return { storagePath, studentUid };
  } catch {
    return null;
  }
}

function writeReviewArgsToSessionStorage(args: LcReviewArgs): void {
  try {
    window.sessionStorage.setItem(LC_REVIEW_ARGS_KEY, JSON.stringify(args));
  } catch {
    // ignore
  }
}

export const Y3LanguageConventionsReview: React.FC = () => {
  const location = useLocation();
  const { currentUser } = useAuth();

  const didSignalOpenCompleteRef = useRef<boolean>(false);

  const stateAny = location.state as any;
  const openedInOverlay = !!stateAny?.backgroundLocation;
  const stateItem = stateAny?.indexItem as { sessionId?: string; storagePath?: string } | undefined;
  const sessionIdFromState = typeof stateAny?.sessionId === 'string' ? stateAny.sessionId : undefined;
  const storagePathFromState = typeof stateAny?.storagePath === 'string' ? stateAny.storagePath : undefined;
  const studentUidFromState = typeof stateAny?.studentUid === 'string' ? stateAny.studentUid : undefined;
  const studentNameFromState = typeof stateAny?.studentName === 'string' ? stateAny.studentName : undefined;

  const persistedArgs = useMemo(() => readReviewArgsFromSessionStorage(), []);

  const storagePath = useMemo(() => {
    return String(storagePathFromState ?? stateItem?.storagePath ?? persistedArgs?.storagePath ?? '');
  }, [persistedArgs?.storagePath, stateItem?.storagePath, storagePathFromState]);

  const studentUid = useMemo(() => {
    return String(studentUidFromState ?? persistedArgs?.studentUid ?? '');
  }, [persistedArgs?.studentUid, studentUidFromState]);

  const [session, setSession] = useState<LCSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  const historyHref = '/y3/language-conventions/history';

  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!storagePath) {
        setError('Missing storagePath');
        setLoading(false);
        return;
      }

      writeReviewArgsToSessionStorage({ storagePath, studentUid: studentUid || undefined });

      setLoading(true);
      setError(null);
      try {
        const json = (await loadSessionJsonByStoragePath(storagePath)) as LCSession;
        if (cancelled) return;
        setSession(json);
      } catch (e) {
        console.error('Failed to load session:', e);
        if (cancelled) return;
        setError('Failed to load session');
        setSession(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [storagePath, studentUid]);

  useEffect(() => {
    if (!session?.pages?.length) return;

    let cancelled = false;

    (async () => {
      try {
        setLoadError(null);
        setPdfDoc(null);

        const studentName = studentNameFromState ?? getActiveStudentName() ?? currentUser?.displayName ?? 'Student';
        const bytes = await buildLanguageConventionsPdf({ title: 'Language Conventions Practice', session, studentName });
        if (cancelled) return;

        const doc = await (getDocument({ data: bytes }) as any).promise;
        if (cancelled) return;
        setPdfDoc(doc);
        setPageNumber(1);
      } catch (e) {
        console.error('Failed to build/render PDF:', e);
        if (cancelled) return;
        setLoadError('Failed to render session');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [currentUser?.displayName, session, studentNameFromState]);

  const sessionIdForSignal = useMemo(() => {
    return String(sessionIdFromState ?? (session as any)?.sessionId ?? stateItem?.sessionId ?? '');
  }, [sessionIdFromState, session, stateItem?.sessionId]);

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

        if (!cancelled && !didSignalOpenCompleteRef.current) {
          if (sessionIdForSignal) {
            didSignalOpenCompleteRef.current = true;
            signalHistoryOpenComplete(sessionIdForSignal);
          }
        }
      } catch (e) {
        console.error('Failed to render PDF page:', e);
        setLoadError('Failed to render page');

        if (!cancelled && !didSignalOpenCompleteRef.current) {
          if (sessionIdForSignal) {
            didSignalOpenCompleteRef.current = true;
            signalHistoryOpenComplete(sessionIdForSignal);
          }
        }
      } finally {
        if (!cancelled) setIsRenderingPage(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [containerHeight, containerWidth, isMobileLayout, pageNumber, pdfDoc, sessionIdForSignal, totalPdfPages]);

  if (!currentUser) {
    return <div className="bg-white rounded-xl border border-gray-200 p-6">Please sign in to review sessions.</div>;
  }

  if (!loading && !session) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-green-50 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-gray-800 mb-4">Session not found</h2>
          <Link to={historyHref} className="text-blue-600 hover:text-blue-700">
            Back to History
          </Link>
        </div>
      </div>
    );
  }

  const pct = session?.summary?.percentage ?? 0;
  const scoreLabel = session?.summary ? `${session.summary.correct}/${session.summary.total}` : '';

  return (
    <div className="min-h-screen md:h-screen bg-gradient-to-br from-blue-50 via-white to-green-50">
      <div className="h-full flex flex-col md:flex-row">
        <aside className="px-4 pt-4 pb-3 md:py-0 md:w-[340px] md:flex md:items-center md:justify-center">
          <div className="w-full max-w-sm text-center md:text-left">
            {!openedInOverlay && (
              <>
                <Link to={historyHref} className="inline-flex items-center text-blue-600 hover:text-blue-700 transition-colors">
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
                      pct >= 90 ? 'bg-green-500' : pct >= 75 ? 'bg-yellow-500' : pct >= 60 ? 'bg-orange-500' : 'bg-red-500'
                    }`}
                  >
                    {pct}%{scoreLabel ? ` (${scoreLabel})` : ''}
                  </div>
                </div>
              </>
            )}

            <div className="mt-4 flex items-center justify-center md:justify-start">
              <div className="bg-white border border-gray-200 rounded-xl shadow-sm px-4 py-3 flex items-center gap-3">
                <button
                  onClick={() => setPageNumber((p) => Math.max(1, p - 1))}
                  disabled={pageNumber <= 1}
                  className="px-4 py-2 rounded-lg bg-gray-200 text-gray-700 hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Previous
                </button>

                <div className="text-sm text-gray-700 font-medium whitespace-nowrap">
                  Page {pageNumber} / {totalPdfPages || 1}
                </div>

                <button
                  onClick={() => setPageNumber((p) => Math.min(totalPdfPages || 1, p + 1))}
                  disabled={!totalPdfPages || pageNumber >= totalPdfPages}
                  className="px-4 py-2 rounded-lg bg-gray-200 text-gray-700 hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Next
                </button>
              </div>
            </div>

            {(error || loadError) && (
              <div className="mt-4 bg-red-50 border border-red-200 rounded-lg p-4">
                <div className="text-red-800 font-medium">{error ?? loadError}</div>
              </div>
            )}

            {!error && !loadError && (loading || !pdfDoc) && (
              <div className="mt-4 flex items-center justify-center md:justify-start">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
                <span className="ml-2 text-gray-600">Rendering session</span>
              </div>
            )}
          </div>
        </aside>

        <section className="flex-1 px-3 pb-4 md:py-4 md:pr-6">
          <div className="h-full w-full flex items-stretch justify-stretch">
            <div
              ref={containerRef}
              className="relative w-full h-full overflow-hidden bg-white rounded-xl border border-gray-200 shadow-sm p-3 flex items-center justify-center"
            >
              <div className="w-full">
                {isRenderingPage && (
                  <div className="pointer-events-none absolute inset-x-0 top-2 text-center text-sm text-gray-500">Rendering page</div>
                )}
                <canvas ref={canvasRef} className="block mx-auto" />
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};

import React, { useEffect, useRef, useState } from 'react';

type PdfJsModule = typeof import('pdfjs-dist/legacy/build/pdf.mjs');

let pdfJsPromise: Promise<PdfJsModule> | null = null;

async function loadPdfJs(): Promise<PdfJsModule> {
  if (!pdfJsPromise) {
    pdfJsPromise = import('pdfjs-dist/legacy/build/pdf.mjs').then((mod) => {
      // Serve worker from our own origin to avoid CORS/CDN issues.
      const publicUrl = (process.env.PUBLIC_URL || '').replace(/\/$/, '');
      mod.GlobalWorkerOptions.workerSrc = `${publicUrl}/pdfjs/pdf.worker.min.mjs`;
      return mod;
    });
  }
  return pdfJsPromise;
}

export type OverlayTarget = { kind: 'pdf'; title: string; bytes: Uint8Array };

const PdfCanvasViewer: React.FC<{ title: string; bytes: Uint8Array; onClose: () => void; onOpenComplete?: () => void }> = ({
  title,
  bytes,
  onClose,
  onOpenComplete,
}) => {
  const [pdfDoc, setPdfDoc] = useState<any | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pageNumber, setPageNumber] = useState<number>(1);
  const [isRendering, setIsRendering] = useState<boolean>(false);

  const didSignalOpenCompleteRef = useRef<boolean>(false);
  const onOpenCompleteRef = useRef<typeof onOpenComplete>(onOpenComplete);

  useEffect(() => {
    onOpenCompleteRef.current = onOpenComplete;
  }, [onOpenComplete]);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [containerWidth, setContainerWidth] = useState<number>(0);
  const [containerHeight, setContainerHeight] = useState<number>(0);
  const lastMeasuredSizeRef = useRef<{ w: number; h: number }>({ w: 0, h: 0 });
  const renderTaskRef = useRef<any | null>(null);

  const totalPages = pdfDoc?.numPages ?? 0;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { getDocument } = await loadPdfJs();
        setLoadError(null);
        setPdfDoc(null);
        didSignalOpenCompleteRef.current = false;
        // pdfjs transfers the provided ArrayBuffer into the worker (detaching it).
        // Always pass a fresh copy so repeated opens/renders never hit DataCloneError.
        const loadingTask = getDocument({ data: bytes.slice() });
        const doc = await loadingTask.promise;
        if (cancelled) return;
        setPdfDoc(doc);
        setPageNumber(1);
      } catch (e) {
        console.error('Failed to load PDF:', e);
        if (!cancelled) setLoadError('Failed to load PDF');
        if (!cancelled && onOpenCompleteRef.current && !didSignalOpenCompleteRef.current) {
          didSignalOpenCompleteRef.current = true;
          onOpenCompleteRef.current();
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [bytes]);

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
      ro?.disconnect();
    };
  }, []);

  useEffect(() => {
    if (!pdfDoc || !canvasRef.current || !containerWidth || !containerHeight) return;

    let cancelled = false;

    // Cancel any in-progress render using the same canvas.
    if (renderTaskRef.current) {
      try {
        renderTaskRef.current.cancel?.();
      } catch {
        // ignore
      }
      renderTaskRef.current = null;
    }

    (async () => {
      try {
        setIsRendering(true);
        const page = await pdfDoc.getPage(pageNumber);
        if (cancelled) return;

        const dpr = window.devicePixelRatio || 1;
        const viewport = page.getViewport({ scale: 1 });
        const scaleW = containerWidth / viewport.width;
        const scaleH = containerHeight / viewport.height;
        const scale = Math.max(0.1, Math.min(scaleW, scaleH));
        const scaledViewport = page.getViewport({ scale });

        const canvas = canvasRef.current!;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        canvas.width = Math.floor(scaledViewport.width * dpr);
        canvas.height = Math.floor(scaledViewport.height * dpr);
        canvas.style.width = `${Math.floor(scaledViewport.width)}px`;
        canvas.style.height = `${Math.floor(scaledViewport.height)}px`;

        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, Math.floor(scaledViewport.width), Math.floor(scaledViewport.height));

        const renderTask = page.render({ canvasContext: ctx, viewport: scaledViewport });
        renderTaskRef.current = renderTask;
        await renderTask.promise;

        if (!cancelled && onOpenCompleteRef.current && !didSignalOpenCompleteRef.current) {
          didSignalOpenCompleteRef.current = true;
          onOpenCompleteRef.current();
        }
      } catch (e) {
        console.error('Failed to render PDF page:', e);
        if (!cancelled) setLoadError('Failed to render PDF');
        if (!cancelled && onOpenCompleteRef.current && !didSignalOpenCompleteRef.current) {
          didSignalOpenCompleteRef.current = true;
          onOpenCompleteRef.current();
        }
      } finally {
        if (renderTaskRef.current) {
          renderTaskRef.current = null;
        }
        if (!cancelled) setIsRendering(false);
      }
    })();

    return () => {
      cancelled = true;
      if (renderTaskRef.current) {
        try {
          renderTaskRef.current.cancel?.();
        } catch {
          // ignore
        }
        renderTaskRef.current = null;
      }
    };
  }, [containerWidth, containerHeight, pageNumber, pdfDoc]);

  return (
    <div className="w-full h-full flex flex-col">
      <div className="relative px-4 py-3 border-b border-gray-200 bg-white flex items-center gap-3">
        <div className="min-w-0 pr-24">
          <div className="text-sm font-semibold text-gray-900 truncate">{title}</div>
          <div className="text-xs text-gray-600">{totalPages ? `Page ${pageNumber} of ${totalPages}` : 'Loading…'}</div>
        </div>

        <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-2">
          <button
            type="button"
            className="px-3 py-2 text-sm font-semibold rounded-lg bg-gray-100 text-gray-800 hover:bg-gray-200 disabled:opacity-50"
            onClick={() => setPageNumber((p) => Math.max(1, p - 1))}
            disabled={!totalPages || pageNumber <= 1 || isRendering}
          >
            Prev
          </button>
          <button
            type="button"
            className="px-3 py-2 text-sm font-semibold rounded-lg bg-gray-100 text-gray-800 hover:bg-gray-200 disabled:opacity-50"
            onClick={() => setPageNumber((p) => Math.min(totalPages, p + 1))}
            disabled={!totalPages || pageNumber >= totalPages || isRendering}
          >
            Next
          </button>
        </div>

        <div className="absolute right-2 top-1/2 -translate-y-1/2">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-2 text-sm font-semibold rounded-lg bg-gray-100 text-gray-800 hover:bg-gray-200"
          >
            Close
          </button>
        </div>
      </div>

      <div ref={containerRef} className="flex-1 overflow-hidden bg-gray-50 p-2 flex items-center justify-center">
        {loadError ? (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4">
            <div className="text-red-800 font-medium">{loadError}</div>
          </div>
        ) : (
          <canvas ref={canvasRef} className="block" />
        )}
      </div>
    </div>
  );
};

export const ParentSessionOverlay: React.FC<{
  target: OverlayTarget | null;
  onClose: () => void;
  onOpenComplete?: () => void;
}> = ({ target, onClose, onOpenComplete }) => {
  const isOpen = !!target;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="absolute inset-0 p-2 sm:p-4 flex items-center justify-center">
        <div className="relative w-full h-full max-w-[1200px] max-h-[95vh] bg-white rounded-2xl shadow-lg border border-gray-200 overflow-hidden">
          <div className="w-full h-full overflow-hidden">
            <PdfCanvasViewer title={target.title} bytes={target.bytes} onClose={onClose} onOpenComplete={onOpenComplete} />
          </div>
        </div>
      </div>
    </div>
  );
};

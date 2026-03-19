import React, { useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';

export type BottomSheetProps = {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  className?: string;
};

function getPortalRoot(): HTMLElement {
  if (typeof document === 'undefined') {
    // SSR safeguard
    return {} as any;
  }
  return document.body;
}

export const BottomSheet: React.FC<BottomSheetProps> = ({ open, onClose, title, children, className }) => {
  const portalRoot = useMemo(() => getPortalRoot(), []);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    document.addEventListener('keydown', onKeyDown);

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose, open]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        aria-label="Close"
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
      />

      <div className="absolute inset-x-0 bottom-0">
        <div
          className={
            `mx-auto w-full max-w-xl rounded-t-3xl bg-white shadow-xl border border-gray-200 ` +
            `animate-[sheetIn_220ms_cubic-bezier(0.2,0.8,0.2,1)] ` +
            (className ?? '')
          }
          role="dialog"
          aria-modal="true"
          aria-label={title ?? 'Bottom sheet'}
        >
          <div className="px-4 pt-3 pb-2">
            <div className="mx-auto h-1.5 w-12 rounded-full bg-gray-200" />
            {title ? <div className="mt-3 text-sm font-semibold text-gray-900">{title}</div> : null}
          </div>
          <div className="px-4 pb-5 max-h-[75vh] overflow-auto">{children}</div>
        </div>
      </div>
    </div>,
    portalRoot
  );
};

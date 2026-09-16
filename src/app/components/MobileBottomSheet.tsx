/**
 * Phone/tablet bottom sheet: overlay + drag handle, swipe-down or backdrop to dismiss.
 */
import { useEffect, useRef, useState, type ReactNode, type PointerEvent as ReactPointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useChromeOverlay } from '../chromeDismiss';

export interface MobileBottomSheetProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  /** `full` ≈ phone full-screen drawer; `tall` ≈ ~78dvh sheet; `peek` ≈ half so the canvas stays visible; `auto` sizes to content. */
  size?: 'auto' | 'tall' | 'full' | 'peek';
  children: ReactNode;
  /** Optional footer pinned below scroll body. */
  footer?: ReactNode;
  className?: string;
  /** aria-label when title omitted */
  ariaLabel?: string;
  /** When false, no dim overlay — canvas above the sheet stays visible and tappable. */
  dimBackdrop?: boolean;
}

const DISMISS_PX = 72;

export function MobileBottomSheet({
  open,
  onClose,
  title,
  subtitle,
  size = 'auto',
  children,
  footer,
  className = '',
  ariaLabel,
  dimBackdrop = true,
}: MobileBottomSheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const dragStartY = useRef<number | null>(null);
  const [dragY, setDragY] = useState(0);
  const [dragging, setDragging] = useState(false);
  useChromeOverlay(open, onClose, 'modal');

  useEffect(() => {
    if (!open) {
      setDragY(0);
      setDragging(false);
      dragStartY.current = null;
      return;
    }
    const prev = dimBackdrop ? document.body.style.overflow : null;
    if (dimBackdrop) document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      if (prev != null) document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey, true);
    };
  }, [open, onClose, dimBackdrop]);

  if (!open || typeof document === 'undefined') return null;

  const onHandlePointerDown = (e: ReactPointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragStartY.current = e.clientY;
    setDragging(true);
  };

  const onHandlePointerMove = (e: ReactPointerEvent) => {
    if (dragStartY.current == null) return;
    const dy = Math.max(0, e.clientY - dragStartY.current);
    setDragY(dy);
  };

  const endDrag = (e: ReactPointerEvent) => {
    if (dragStartY.current == null) return;
    const dy = Math.max(0, e.clientY - dragStartY.current);
    dragStartY.current = null;
    setDragging(false);
    if (dy >= DISMISS_PX) {
      setDragY(0);
      onClose();
      return;
    }
    setDragY(0);
  };

  return createPortal(
    <div
      className={`mobile-sheet${className ? ` ${className}` : ''}${
        dimBackdrop ? '' : ' mobile-sheet--canvas-visible'
      }`}
      role="presentation"
    >
      {dimBackdrop ? (
        <button
          type="button"
          className="mobile-sheet__backdrop"
          aria-label="Dismiss"
          onClick={onClose}
        />
      ) : null}
      <div
        ref={sheetRef}
        className={`mobile-sheet__panel mobile-sheet__panel--${size}${dragging ? ' mobile-sheet__panel--dragging' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel ?? title ?? 'Sheet'}
        style={dragY ? { transform: `translateY(${dragY}px)` } : undefined}
      >
        <div
          className="mobile-sheet__handle-hit"
          onPointerDown={onHandlePointerDown}
          onPointerMove={onHandlePointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          <div className="mobile-sheet__handle" aria-hidden />
        </div>
        <header className="mobile-sheet__header">
          <div className="mobile-sheet__heading">
            {title ? <h2 className="mobile-sheet__title">{title}</h2> : <span className="mobile-sheet__title" />}
            {subtitle ? <p className="mobile-sheet__subtitle">{subtitle}</p> : null}
          </div>
          <button
            type="button"
            className="mobile-sheet__close"
            onClick={e => {
              e.stopPropagation();
              onClose();
            }}
            aria-label="Close"
          >
            <X size={16} strokeWidth={2} aria-hidden />
          </button>
        </header>
        <div className="mobile-sheet__body">{children}</div>
        {footer ? <footer className="mobile-sheet__footer">{footer}</footer> : null}
      </div>
    </div>,
    document.body,
  );
}

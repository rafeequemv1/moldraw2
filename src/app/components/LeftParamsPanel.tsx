/**
 * Closable parameter panel for generators (graphene / COF / MOF / arrays…).
 * Desktop: docked at the left edge like the Color & style panel.
 * Compact: a short, undimmed bottom sheet so the canvas stays visible.
 */
import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { MobileBottomSheet } from './MobileBottomSheet';
import { useCompactViewport } from '../hooks/useCompactViewport';
import { useLeftDockExclusive } from '../leftDockExclusive';

export interface LeftParamsPanelProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  ariaLabel?: string;
  /** Stacking order among simultaneously open params panels (0 = topmost slot). */
  slot?: number;
  className?: string;
}

const HOST_ID = 'moldraw-left-params-dock';

function dockHost(): HTMLElement | null {
  if (typeof document === 'undefined') return null;
  let host = document.getElementById(HOST_ID);
  if (!host) {
    host = document.createElement('div');
    host.id = HOST_ID;
    host.className = 'left-params-dock';
    document.body.appendChild(host);
  }
  return host;
}

export function LeftParamsPanel({
  title,
  onClose,
  children,
  ariaLabel,
  slot = 0,
  className = '',
}: LeftParamsPanelProps) {
  const isCompact = useCompactViewport();
  useLeftDockExclusive('params', !isCompact, onClose);

  useEffect(() => {
    if (isCompact) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isCompact, onClose]);

  if (isCompact) {
    return (
      <MobileBottomSheet
        open
        onClose={onClose}
        title={title}
        size="peek"
        dimBackdrop={false}
        className={`mobile-sheet--params${className ? ` ${className}` : ''}`}
        ariaLabel={ariaLabel ?? title}
      >
        <div className="left-params-panel__body left-params-panel__body--sheet">{children}</div>
      </MobileBottomSheet>
    );
  }

  const host = dockHost();
  if (!host) return null;
  return createPortal(
    <section
      className={`format-left-panel left-params-panel${className ? ` ${className}` : ''}`}
      style={{ order: slot }}
      role="dialog"
      aria-label={ariaLabel ?? title}
    >
      <div className="format-left-panel__head">
        <div className="mol-color-side-panel-title">{title}</div>
        <button
          type="button"
          className="format-left-panel__close"
          onClick={onClose}
          aria-label={`Close ${title}`}
        >
          <X size={14} strokeWidth={2} aria-hidden />
        </button>
      </div>
      <div className="format-left-panel__scroll left-params-panel__body">{children}</div>
    </section>,
    host,
  );
}

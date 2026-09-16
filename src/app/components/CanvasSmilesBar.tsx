/**
 * Top-bar clipboard: Copy dropdown (ChemDraw-style Copy as …) + Paste.
 * Compact: Copy opens a bottom sheet instead of a clipped menu.
 */
import { useEffect, useId, useRef, useState } from 'react';
import { ChevronDown, ClipboardPaste, Copy } from 'lucide-react';
import { COPY_AS_FORMAT_ITEMS } from '../copyAsFormats';
import type { CopyAsFormat } from '../types';
import { MobileBottomSheet } from './MobileBottomSheet';
import { useChromeOverlay } from '../chromeDismiss';

export interface CanvasSmilesBarProps {
  onCopyAs: (format: CopyAsFormat) => void;
  onPaste: () => void;
  copyDisabled?: boolean;
  pasteDisabled?: boolean;
  statusHint?: string;
  /** Phone/tablet: Copy as… opens as a bottom sheet. */
  preferSheet?: boolean;
}

export function CanvasSmilesBar({
  onCopyAs,
  onPaste,
  copyDisabled = false,
  pasteDisabled = false,
  statusHint = '',
  preferSheet = false,
}: CanvasSmilesBarProps) {
  const [copyOpen, setCopyOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  useChromeOverlay(copyOpen, () => setCopyOpen(false));

  useEffect(() => {
    if (!copyOpen || preferSheet) return;
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setCopyOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setCopyOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [copyOpen, preferSheet]);

  const copyItems = COPY_AS_FORMAT_ITEMS.map(item => {
    const disabled = copyDisabled || !item.available;
    return (
      <button
        key={item.key}
        type="button"
        role="menuitem"
        className={preferSheet ? 'mobile-sheet-list__btn' : 'app-top-bar__clip-menu-item'}
        disabled={disabled}
        title={!item.available ? (item.unavailableReason ?? 'Not available yet') : item.label}
        onClick={() => {
          onCopyAs(item.key);
          setCopyOpen(false);
        }}
      >
        <span>{item.label}</span>
      </button>
    );
  });

  return (
    <div className="app-top-bar__clip" role="toolbar" aria-label="Clipboard">
      <div ref={wrapRef} className="app-top-bar__clip-copy-wrap">
        <button
          type="button"
          className={`app-top-bar__clip-btn app-top-bar__clip-btn--labeled${copyOpen ? ' is-open' : ''}`}
          title="Copy as…"
          aria-label="Copy"
          aria-haspopup={preferSheet ? 'dialog' : 'menu'}
          aria-expanded={copyOpen}
          aria-controls={menuId}
          disabled={copyDisabled}
          onClick={() => setCopyOpen(v => !v)}
        >
          <Copy size={14} strokeWidth={2} aria-hidden />
          <span className="app-top-bar__clip-btn-label">Copy</span>
          {!preferSheet ? <ChevronDown size={10} strokeWidth={2.5} aria-hidden /> : null}
        </button>
        {preferSheet ? (
          <MobileBottomSheet
            open={copyOpen}
            onClose={() => setCopyOpen(false)}
            title="Copy as…"
            size="auto"
            className="mobile-sheet--menu"
          >
            <div id={menuId} className="mobile-sheet-list" role="menu" aria-label="Copy as">
              {copyItems}
            </div>
          </MobileBottomSheet>
        ) : copyOpen ? (
          <div id={menuId} className="app-top-bar__clip-menu" role="menu" aria-label="Copy as">
            {copyItems}
          </div>
        ) : null}
      </div>
      <button
        type="button"
        className="app-top-bar__clip-btn app-top-bar__clip-btn--labeled"
        title="Paste (SMILES, structure, or image from clipboard)"
        aria-label="Paste"
        disabled={pasteDisabled}
        onClick={onPaste}
      >
        <ClipboardPaste size={14} strokeWidth={2} aria-hidden />
        <span className="app-top-bar__clip-btn-label">Paste</span>
      </button>
      {statusHint && !preferSheet ? (
        <span className="app-top-bar__smiles-hint" aria-live="polite">
          {statusHint}
        </span>
      ) : null}
    </div>
  );
}

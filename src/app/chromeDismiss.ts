/**
 * Chrome overlay stack: header/tool menus, docks, and modals that should close
 * when the drawing canvas is pressed. Confirmation dialogs stay registered
 * as `confirm` so a canvas click cannot dismiss a destructive prompt.
 */
import { useEffect, useRef } from 'react';

export type ChromeOverlayKind = 'menu' | 'modal' | 'dock' | 'confirm';

type OverlayEntry = {
  kind: ChromeOverlayKind;
  close: () => void;
};

let nextId = 1;
const overlays = new Map<number, OverlayEntry>();

export function registerChromeOverlay(kind: ChromeOverlayKind, close: () => void): () => void {
  const id = nextId++;
  overlays.set(id, { kind, close });
  return () => {
    overlays.delete(id);
  };
}

function hasBlockingConfirm(): boolean {
  for (const overlay of overlays.values()) {
    if (overlay.kind === 'confirm') return true;
  }
  return false;
}

/** True when a canvas press should close chrome (and skip starting a draw). */
export function hasDismissibleChrome(): boolean {
  if (hasBlockingConfirm()) return false;
  for (const overlay of overlays.values()) {
    if (overlay.kind !== 'confirm') return true;
  }
  return false;
}

/**
 * Close menus, docks, and modals. Leaves confirmation dialogs open.
 * Returns true if anything was dismissed.
 */
export function dismissChromeOverlays(): boolean {
  if (hasBlockingConfirm()) return false;
  const toClose = [...overlays.values()].filter(overlay => overlay.kind !== 'confirm');
  if (toClose.length === 0) return false;
  for (const overlay of toClose) overlay.close();
  return true;
}

/** Register `onClose` while `open` so a canvas pointerdown can dismiss this overlay. */
export function useChromeOverlay(
  open: boolean,
  onClose: () => void,
  kind: ChromeOverlayKind = 'menu',
): void {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    return registerChromeOverlay(kind, () => onCloseRef.current());
  }, [open, kind]);
}

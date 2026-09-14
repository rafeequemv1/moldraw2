import type { CSSProperties } from 'react';

const PANEL_WIDTH = 280;
const PANEL_MAX_H = 420;

/**
 * Fixed position for FG / ligand popovers.
 * Top-bar tools open upward; left-rail tools open to the right and clamp
 * vertically so the panel stays on-screen.
 */
export function computeToolbarFgPanelStyle(anchor: DOMRect): CSSProperties {
  const maxH = Math.min(PANEL_MAX_H, Math.floor(window.innerHeight * 0.78));
  const width = Math.min(PANEL_WIDTH, window.innerWidth - 16);
  const pad = 8;
  const inTopBar = anchor.top < 120; // tools row / top strip

  if (inTopBar) {
    // Open below the tools row so the grid stays on-screen (opening upward
    // from a 32px header would pin the panel off the top of the viewport).
    const top = anchor.bottom + 4;
    let left = anchor.left;
    if (left + width > window.innerWidth - pad) left = window.innerWidth - width - pad;
    if (left < pad) left = pad;
    return {
      position: 'fixed',
      left,
      right: 'auto',
      top,
      bottom: 'auto',
      width,
      maxHeight: Math.min(maxH, window.innerHeight - top - pad),
    };
  }

  // Left rail: open to the right of the trigger; clamp so it doesn't clip off-screen.
  let left = anchor.right + 4;
  if (left + width > window.innerWidth - pad) {
    left = Math.max(pad, anchor.left - width - 4);
  }

  const spaceBelow = window.innerHeight - anchor.top - pad;
  let top = anchor.top;
  if (spaceBelow < maxH * 0.55 && anchor.bottom > maxH) {
    // Near bottom of viewport — pin to bottom edge so the panel grows upward.
    return {
      position: 'fixed',
      left,
      right: 'auto',
      bottom: pad,
      top: 'auto',
      width,
      maxHeight: Math.min(maxH, window.innerHeight - pad * 2),
    };
  }
  if (top + maxH > window.innerHeight - pad) {
    top = Math.max(pad, window.innerHeight - maxH - pad);
  }

  return {
    position: 'fixed',
    left,
    right: 'auto',
    top,
    bottom: 'auto',
    width,
    maxHeight: maxH,
  };
}

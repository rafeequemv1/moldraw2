import type { CSSProperties } from 'react';

/** Place a fixed portal menu so it stays on-screen (drop down, or drop up if needed). */
export type AnchoredMenuPos = {
  top?: number;
  bottom?: number;
  left: number;
  maxHeight: number;
  openUp: boolean;
};

export function visualViewportBox(): { width: number; height: number } {
  const vv = window.visualViewport;
  return {
    width: vv?.width ?? window.innerWidth,
    height: vv?.height ?? window.innerHeight,
  };
}

function px(value: string | number | undefined, fallback: string): string {
  if (typeof value === 'number' && Number.isFinite(value)) return `${value}px`;
  if (typeof value === 'string' && value.length > 0) return value;
  return fallback;
}

export function triggerIsInLowerViewport(anchor: DOMRect, ratio = 0.45): boolean {
  return anchor.top > visualViewportBox().height * ratio;
}

/** Trigger lives in the phone/tablet bottom dock (strip, categories, rings). */
export function isBottomDockTrigger(el: HTMLElement): boolean {
  if (el.closest('.toolbar--mobile-strip, .toolbar-mobile-categories, .toolbar-bottom')) {
    return true;
  }
  return (
    document.documentElement.classList.contains('app-mobile-compact') &&
    Boolean(el.closest('.toolbar'))
  );
}

/**
 * Vertical left tool column (or the Draw flyout beside it). Bottom dock /
 * mobile strip stay upward; compact class must not reclassify a left rail.
 */
export function isLeftRailTrigger(el: HTMLElement): boolean {
  if (el.closest('.toolbar--mobile-strip, .toolbar-mobile-categories, .toolbar-bottom')) {
    return false;
  }
  return Boolean(el.closest('.toolbar, .toolbar-draw-panel'));
}

export function leftRailColumnRect(el: HTMLElement): DOMRect | null {
  const col = el.closest('.toolbar, .toolbar-draw-panel') as HTMLElement | null;
  return col?.getBoundingClientRect() ?? null;
}

/**
 * Place a flyout in the canvas, flush to the **right edge of the left toolbar
 * column**. Never flips above/over the rail.
 */
export function placeLeftRailFlyout(
  trigger: DOMRect,
  opts?: {
    menuWidth?: number;
    menuHeight?: number;
    gap?: number;
    pad?: number;
  },
  column?: DOMRect | null,
): SideFlyoutPos {
  const gap = opts?.gap ?? 4;
  const pad = opts?.pad ?? 8;
  const menuH = opts?.menuHeight ?? 280;
  const { height: vh } = visualViewportBox();
  const colRight = column?.right ?? trigger.right;
  const left = Math.max(pad, colRight + gap);
  let top = trigger.top;
  const maxHeight = Math.max(96, vh - pad * 2);
  if (top + Math.min(menuH, maxHeight) > vh - pad) {
    top = Math.max(pad, vh - pad - Math.min(menuH, maxHeight));
  }
  if (top < pad) top = pad;
  return { top, left, maxHeight: Math.min(maxHeight, vh - pad - top) };
}

export function placeAnchoredMenu(
  anchor: DOMRect,
  opts?: {
    menuWidth?: number;
    menuHeight?: number;
    gap?: number;
    pad?: number;
    forceUp?: boolean;
    align?: 'left' | 'right';
    /** Extra shift after align (negative = left). Applied before viewport clamp. */
    offsetX?: number;
  },
): AnchoredMenuPos {
  const gap = opts?.gap ?? 4;
  const pad = opts?.pad ?? 8;
  const menuW = opts?.menuWidth ?? 200;
  const menuH = opts?.menuHeight ?? 280;
  const { width: vw, height: vh } = visualViewportBox();
  const spaceBelow = vh - anchor.bottom - pad;
  const spaceAbove = anchor.top - pad;
  const need = Math.min(menuH, 240);
  const forceUp =
    opts?.forceUp === true ||
    (typeof document !== 'undefined' &&
      document.documentElement.classList.contains('app-mobile-compact') &&
      anchor.top > vh * 0.38);
  const openUp = forceUp || (spaceBelow < need && spaceAbove > spaceBelow);
  const maxHeight = Math.max(96, (openUp ? spaceAbove : spaceBelow) - gap);

  let left = opts?.align === 'right' ? anchor.right - menuW : anchor.left;
  left += opts?.offsetX ?? 0;
  if (left + menuW > vw - pad) left = Math.max(pad, vw - pad - menuW);
  if (left < pad) left = pad;

  if (openUp) {
    return { bottom: menuBottomAboveAnchor(anchor), left, maxHeight, openUp: true };
  }
  return { top: anchor.bottom + gap, left, maxHeight, openUp: false };
}

/** Pixels from the viewport bottom so a menu sits just above `anchor` and the dock. */
export function menuBottomAboveAnchor(anchor: DOMRect): number {
  const pad = 8;
  const gap = 4;
  const layoutH = window.innerHeight;
  const clientH = document.documentElement.clientHeight || layoutH;
  const { height: visualH } = visualViewportBox();
  const aboveTrigger = Math.max(
    layoutH - anchor.top + gap,
    clientH - anchor.top + gap,
    visualH - anchor.top + gap,
  );
  let chrome = 0;
  for (const sel of [
    '.toolbar-mobile-categories',
    '.toolbar--mobile-strip',
    '.toolbar-bottom',
    '#app-status-host',
    '.site-footer-root',
  ]) {
    const node = document.querySelector(sel);
    if (!node) continue;
    const box = node.getBoundingClientRect();
    if (box.height < 2 || box.width < 2) continue;
    chrome = Math.max(chrome, layoutH - box.top, visualH - box.top);
  }
  return Math.max(pad, aboveTrigger, chrome + 4);
}

/** Bottom-dock / lower-viewport triggers must open onto the canvas above. */
export function shouldOpenMenuAbove(el: HTMLElement, anchor: DOMRect): boolean {
  if (isLeftRailTrigger(el)) return false;
  if (isBottomDockTrigger(el)) return true;
  const vh = visualViewportBox().height;
  return anchor.bottom > vh - 180 || triggerIsInLowerViewport(anchor, 0.45);
}

/**
 * Pin a tall catalog (apparatus / glassware) to the shared left-dock box —
 * same top, left, width, and max-height as Color & style (`format-left-panel`).
 */
export function pinMenuAsLeftDock(menu: HTMLElement) {
  menu.style.setProperty('position', 'fixed', 'important');
  menu.style.setProperty('top', 'var(--app-left-dock-top)', 'important');
  menu.style.setProperty('bottom', 'auto', 'important');
  menu.style.setProperty('left', 'var(--app-left-dock-left)', 'important');
  menu.style.setProperty('right', 'auto', 'important');
  menu.style.setProperty('width', 'var(--app-left-dock-width)', 'important');
  menu.style.setProperty('min-width', 'var(--app-left-dock-width)', 'important');
  menu.style.setProperty('max-width', 'var(--app-left-dock-width)', 'important');
  menu.style.setProperty('max-height', 'var(--app-left-dock-max-height)', 'important');
  menu.style.setProperty('height', 'auto', 'important');
  menu.style.setProperty('overflow', 'hidden', 'important');
  menu.style.setProperty('overflow-x', 'hidden', 'important');
  menu.style.setProperty('overflow-y', 'hidden', 'important');
  menu.style.setProperty('z-index', '11', 'important');
  menu.style.setProperty('transform', 'none', 'important');
  menu.style.setProperty('--split-menu-top', 'var(--app-left-dock-top)');
  menu.style.setProperty('--split-menu-left', 'var(--app-left-dock-left)');
  menu.style.setProperty('--split-menu-bottom', 'auto');
  menu.dataset.placement = 'right';
}

/** Inline `!important` so drop-up CSS cannot pin a left-rail menu over the tools. */
export function pinMenuRightOfRail(menu: HTMLElement, trigger: HTMLElement, menuWidth?: number) {
  const col = leftRailColumnRect(trigger);
  const anchor = trigger.getBoundingClientRect();
  const pos = placeLeftRailFlyout(anchor, { menuWidth: menuWidth ?? 168, menuHeight: 280 }, col);
  const top = `${pos.top}px`;
  const left = `${pos.left}px`;
  const width = px(menuWidth ?? Math.max(148, menu.offsetWidth || 168), '168px');
  menu.style.setProperty('position', 'fixed', 'important');
  menu.style.setProperty('top', top, 'important');
  menu.style.setProperty('bottom', 'auto', 'important');
  menu.style.setProperty('left', left, 'important');
  menu.style.setProperty('right', 'auto', 'important');
  menu.style.setProperty('width', width, 'important');
  menu.style.setProperty('max-height', `${pos.maxHeight}px`, 'important');
  menu.style.setProperty('z-index', '24000', 'important');
  menu.style.setProperty('overflow-y', 'auto', 'important');
  menu.style.setProperty('transform', 'none', 'important');
  menu.style.setProperty('--split-menu-top', top);
  menu.style.setProperty('--split-menu-left', left);
  menu.style.setProperty('--split-menu-bottom', 'auto');
  menu.dataset.placement = 'right';
}

/** CSS for a portal menu whose bottom edge sits just above `anchor` (no transform — WebView-safe). */
export function dropUpMenuStyle(anchor: DOMRect, menuWidth = 168): CSSProperties {
  const pad = 8;
  const { width: vw, height: vh } = visualViewportBox();
  const width = Math.min(Math.max(menuWidth, 148), vw - pad * 2);
  let left = anchor.left;
  if (left + width > vw - pad) left = vw - width - pad;
  if (left < pad) left = pad;
  const bottom = menuBottomAboveAnchor(anchor);
  // Room between the menu's bottom edge and the top of the viewport.
  const room = Math.min(anchor.top - pad, vh - bottom - pad);
  return {
    position: 'fixed',
    top: 'auto',
    bottom,
    left,
    right: 'auto',
    width,
    maxHeight: Math.max(96, room),
    zIndex: 60000,
    overflowY: 'auto',
    transform: 'none',
    ['--split-menu-bottom' as string]: `${bottom}px`,
    ['--split-menu-left' as string]: `${left}px`,
  };
}

/** Inline `!important` so base `.toolbar-split-tool__menu { top: 0; left: 100% }` cannot win. */
export function pinMenuAboveAnchor(menu: HTMLElement, anchor: DOMRect, menuWidth?: number) {
  const style = dropUpMenuStyle(anchor, menuWidth ?? Math.max(148, menu.offsetWidth || 168));
  const bottom = typeof style.bottom === 'number' ? `${style.bottom}px` : '96px';
  const left = px(style.left, '8px');
  // Same mechanism for every bottom-docked trigger (desktop C6 rings bar and the
  // compact phone dock): measured `bottom` from the trigger's top edge / dock
  // chrome, applied inline with !important so no stylesheet can flip it downward.
  menu.style.setProperty('position', 'fixed', 'important');
  menu.style.setProperty('top', 'auto', 'important');
  menu.style.setProperty('bottom', bottom, 'important');
  menu.style.setProperty('left', left, 'important');
  menu.style.setProperty('right', 'auto', 'important');
  menu.style.setProperty('width', px(style.width, '168px'), 'important');
  menu.style.setProperty('max-height', px(style.maxHeight, '240px'), 'important');
  menu.style.setProperty('z-index', '60000', 'important');
  menu.style.setProperty('overflow-y', 'auto', 'important');
  menu.style.setProperty('transform', 'none', 'important');
  menu.style.setProperty('--split-menu-bottom', bottom);
  menu.style.setProperty('--split-menu-left', left);
}

export function anchoredMenuStyle(pos: AnchoredMenuPos): CSSProperties {
  return {
    position: 'fixed',
    left: pos.left,
    right: 'auto',
    top: pos.openUp ? 'auto' : pos.top,
    bottom: pos.openUp ? pos.bottom : 'auto',
    width: 'max-content',
    maxHeight: pos.maxHeight,
    zIndex: 24000,
    overflowY: 'auto',
    transform: 'none',
  };
}

/** Nested flyout to the side of a menu row (File → Save as, Select submenus). */
export type SideFlyoutPos = {
  top: number;
  left: number;
  maxHeight: number;
};

export function placeSideFlyout(
  anchor: DOMRect,
  opts?: {
    menuWidth?: number;
    menuHeight?: number;
    gap?: number;
    pad?: number;
    prefer?: 'right' | 'left';
    /** Keep the panel on the preferred side (do not flip over a left rail). */
    lockPrefer?: boolean;
  },
): SideFlyoutPos {
  const gap = opts?.gap ?? 4;
  const pad = opts?.pad ?? 8;
  const menuW = opts?.menuWidth ?? 210;
  const menuH = opts?.menuHeight ?? 280;
  const prefer = opts?.prefer ?? 'right';
  const { width: vw, height: vh } = visualViewportBox();

  const openRight = anchor.right + gap;
  const openLeft = anchor.left - gap - menuW;
  let left = prefer === 'left' ? openLeft : openRight;
  if (!opts?.lockPrefer) {
    if (left + menuW > vw - pad) left = Math.max(pad, openLeft);
    if (left < pad) left = Math.min(openRight, Math.max(pad, vw - pad - menuW));
  } else if (left < pad) {
    left = pad;
  }

  let top = anchor.top;
  const maxHeight = Math.max(96, vh - pad * 2);
  if (top + Math.min(menuH, maxHeight) > vh - pad) {
    top = Math.max(pad, vh - pad - Math.min(menuH, maxHeight));
  }
  if (top < pad) top = pad;

  return { top, left, maxHeight: Math.min(maxHeight, vh - pad - top) };
}

export function sideFlyoutStyle(pos: SideFlyoutPos): CSSProperties {
  return {
    position: 'fixed',
    top: pos.top,
    left: pos.left,
    right: 'auto',
    width: 'max-content',
    maxHeight: pos.maxHeight,
    zIndex: 25000,
    overflowY: 'auto',
    transform: 'none',
  };
}

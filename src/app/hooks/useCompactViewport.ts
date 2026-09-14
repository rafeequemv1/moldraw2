/**
 * App chrome layout: portrait phones keep the compact dock; landscape (or a
 * forced landscape view) uses desktop-like left toolbar / bottom rings / side panes.
 */
import { useCallback, useEffect, useState } from 'react';

export type AppLayout = {
  /** Portrait phone/tablet chrome (category dock, sheets). */
  isCompact: boolean;
  /** Phone/tablet in landscape — desktop-like chrome. */
  isPhoneLandscape: boolean;
  /** Either compact or landscape-phone (show rotate control). */
  isMobile: boolean;
  /** Software landscape while the device is still physically portrait. */
  cssForceRotate: boolean;
  toggleLandscape: () => void;
};

type Size = { w: number; h: number };

let sharedForceLandscape = false;
const forceListeners = new Set<() => void>();

function setSharedForceLandscape(next: boolean): void {
  if (sharedForceLandscape === next) return;
  sharedForceLandscape = next;
  forceListeners.forEach(fn => fn());
}

function readSize(): Size {
  if (typeof window === 'undefined') return { w: 1280, h: 800 };
  return { w: window.innerWidth, h: window.innerHeight };
}

function deriveLayout(
  size: Size,
  forceLandscape: boolean,
  breakpoint: number,
): Omit<AppLayout, 'toggleLandscape'> {
  const physicalLandscape = size.w > size.h;
  const landscape = physicalLandscape || forceLandscape;
  const isMobile = size.w <= breakpoint || forceLandscape;
  const isCompact = isMobile && !landscape;
  const isPhoneLandscape = isMobile && landscape;
  const cssForceRotate = forceLandscape && !physicalLandscape;
  return { isCompact, isPhoneLandscape, isMobile, cssForceRotate };
}

async function tryLockOrientation(mode: 'landscape' | 'portrait'): Promise<boolean> {
  const orientation = typeof screen !== 'undefined' ? screen.orientation : undefined;
  const lock = orientation && 'lock' in orientation ? orientation.lock.bind(orientation) : undefined;
  if (typeof lock !== 'function') return false;
  try {
    await lock(mode);
    return true;
  } catch {
    return false;
  }
}

function tryUnlockOrientation(): void {
  try {
    screen.orientation?.unlock();
  } catch {
    /* iOS / unsupported */
  }
}

const readTouchUi = (): boolean => {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(pointer: coarse)').matches || window.matchMedia('(hover: none)').matches;
};

/**
 * True when the primary pointer is a finger (coarse / no hover) — the same
 * signal that toggles the `touch-ui` root class. Components use it to swap
 * hover-only affordances for tap-friendly ones (e.g. the atom label keypad).
 */
export function useIsTouchUi(): boolean {
  const [touch, setTouch] = useState<boolean>(readTouchUi);
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const coarse = window.matchMedia('(pointer: coarse)');
    const noHover = window.matchMedia('(hover: none)');
    const apply = () => setTouch(coarse.matches || noHover.matches);
    apply();
    coarse.addEventListener?.('change', apply);
    noHover.addEventListener?.('change', apply);
    return () => {
      coarse.removeEventListener?.('change', apply);
      noHover.removeEventListener?.('change', apply);
    };
  }, []);
  return touch;
}

/**
 * Tracks whether the viewport is below `breakpoint` px wide.
 * Portrait-only: landscape phones use desktop-like chrome.
 */
export function useCompactViewport(breakpoint = 1024): boolean {
  return useAppLayout(breakpoint).isCompact;
}

export function useAppLayout(breakpoint = 1024): AppLayout {
  const [size, setSize] = useState<Size>(readSize);
  const [forceLandscape, setForceLandscape] = useState(() => sharedForceLandscape);

  useEffect(() => {
    const syncForce = () => setForceLandscape(sharedForceLandscape);
    forceListeners.add(syncForce);
    return () => {
      forceListeners.delete(syncForce);
    };
  }, []);

  useEffect(() => {
    const onResize = () => {
      const next = readSize();
      setSize(next);
      if (next.w > next.h) setSharedForceLandscape(false);
    };
    onResize();
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    const orientation = screen.orientation;
    orientation?.addEventListener?.('change', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
      orientation?.removeEventListener?.('change', onResize);
    };
  }, []);

  const layout = deriveLayout(size, forceLandscape, breakpoint);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('app-mobile-compact', layout.isCompact);
    root.classList.toggle('app-phone-landscape', layout.isPhoneLandscape);
    root.classList.toggle('app-force-landscape', layout.cssForceRotate);
  }, [layout.isCompact, layout.isPhoneLandscape, layout.cssForceRotate]);

  // `touch-ui` is independent of width: a 12" tablet in landscape is wider
  // than the compact breakpoint but still needs finger-sized targets and no
  // hover-only affordances. Follows the primary pointer, so a tablet with a
  // trackpad attached drops back to the desktop chrome.
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const root = document.documentElement;
    const coarse = window.matchMedia('(pointer: coarse)');
    const noHover = window.matchMedia('(hover: none)');
    const apply = () => {
      root.classList.toggle('touch-ui', coarse.matches || noHover.matches);
    };
    apply();
    coarse.addEventListener?.('change', apply);
    noHover.addEventListener?.('change', apply);
    return () => {
      coarse.removeEventListener?.('change', apply);
      noHover.removeEventListener?.('change', apply);
    };
  }, []);

  const toggleLandscape = useCallback(() => {
    const current = readSize();
    const physicalLandscape = current.w > current.h;
    const landscape = physicalLandscape || sharedForceLandscape;

    if (landscape) {
      setSharedForceLandscape(false);
      tryUnlockOrientation();
      void tryLockOrientation('portrait');
      return;
    }

    void (async () => {
      const locked = await tryLockOrientation('landscape');
      const after = readSize();
      if (!locked || after.w <= after.h) {
        setSharedForceLandscape(true);
      }
    })();
  }, []);

  return { ...layout, toggleLandscape };
}

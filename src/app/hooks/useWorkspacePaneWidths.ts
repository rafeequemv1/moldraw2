import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';

const STORAGE_CHAT = 'moldraw.workspace.chatWidth';
const STORAGE_VIEWER3D = 'moldraw.workspace.viewer3dWidth';

const CHAT_DEFAULT = 340;
/** Previous factory pixel width — treat as unset so the 50% default applies. */
const VIEWER3D_LEGACY_DEFAULT_PX = 420;
/** Default 3D pane share of the editor (2D + 3D, excluding chat). */
const VIEWER3D_DEFAULT_RATIO = 0.5;
const CHAT_MIN = 260;
const CHAT_MAX = 560;
const VIEWER3D_MIN = 280;
/** High enough that a 50% default is not clipped on typical/wide monitors. */
const VIEWER3D_MAX = 2400;
const PANE2D_MIN = 200;

function readStored(key: string, fallback: number): number {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : fallback;
  } catch {
    return fallback;
  }
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function fallbackViewer3DWidth(): number {
  const w = typeof window === 'undefined' ? 1200 : window.innerWidth;
  return clamp(Math.round(w * VIEWER3D_DEFAULT_RATIO), VIEWER3D_MIN, VIEWER3D_MAX);
}

/** Custom saved widths are kept; missing or old factory 420px uses half the editor. */
function readStoredViewer3DWidth(): number {
  try {
    const raw = localStorage.getItem(STORAGE_VIEWER3D);
    if (!raw) return fallbackViewer3DWidth();
    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 0) return fallbackViewer3DWidth();
    if (n === VIEWER3D_LEGACY_DEFAULT_PX) return fallbackViewer3DWidth();
    return n;
  } catch {
    return fallbackViewer3DWidth();
  }
}

function writeStored(key: string, value: number): void {
  try {
    localStorage.setItem(key, String(Math.round(value)));
  } catch {
    /* ignore quota / private mode */
  }
}

export function useWorkspacePaneWidths(showChatPanel: boolean, show3DViewer: boolean) {
  const [chatWidth, setChatWidth] = useState(() => readStored(STORAGE_CHAT, CHAT_DEFAULT));
  const [viewer3DWidth, setViewer3DWidth] = useState(readStoredViewer3DWidth);
  const bodyRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (showChatPanel) writeStored(STORAGE_CHAT, chatWidth);
  }, [chatWidth, showChatPanel]);

  useEffect(() => {
    if (show3DViewer) writeStored(STORAGE_VIEWER3D, viewer3DWidth);
  }, [viewer3DWidth, show3DViewer]);

  const getBodyWidth = useCallback(() => {
    const el = bodyRef.current;
    return el?.clientWidth ?? window.innerWidth;
  }, []);

  const clampChatWidth = useCallback(
    (next: number) => {
      const body = getBodyWidth();
      const reserved3d = show3DViewer ? viewer3DWidth : 0;
      const max = Math.min(CHAT_MAX, body - reserved3d - PANE2D_MIN);
      return clamp(next, CHAT_MIN, Math.max(CHAT_MIN, max));
    },
    [getBodyWidth, show3DViewer, viewer3DWidth],
  );

  const clampViewer3DWidth = useCallback(
    (next: number) => {
      const body = getBodyWidth();
      const reservedChat = showChatPanel ? chatWidth : 0;
      const max = Math.min(VIEWER3D_MAX, body - reservedChat - PANE2D_MIN);
      return clamp(next, VIEWER3D_MIN, Math.max(VIEWER3D_MIN, max));
    },
    [chatWidth, getBodyWidth, showChatPanel],
  );

  const beginResize = useCallback(
    (
      e: ReactPointerEvent<HTMLDivElement>,
      mode: 'chat' | 'viewer3d',
      startWidth: number,
    ) => {
      e.preventDefault();
      const handle = e.currentTarget;
      const startX = e.clientX;
      handle.setPointerCapture(e.pointerId);
      document.body.classList.add('workspace-pane-resizing');

      const onMove = (ev: PointerEvent) => {
        const delta = ev.clientX - startX;
        if (mode === 'chat') {
          setChatWidth(clampChatWidth(startWidth + delta));
        } else {
          setViewer3DWidth(clampViewer3DWidth(startWidth - delta));
        }
      };

      const onUp = () => {
        handle.releasePointerCapture(e.pointerId);
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        document.body.classList.remove('workspace-pane-resizing');
        window.dispatchEvent(new Event('resize'));
      };

      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    },
    [clampChatWidth, clampViewer3DWidth],
  );

  const onChatResizePointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => beginResize(e, 'chat', chatWidth),
    [beginResize, chatWidth],
  );

  const onViewer3DResizePointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => beginResize(e, 'viewer3d', viewer3DWidth),
    [beginResize, viewer3DWidth],
  );

  const setBodyRef = useCallback((el: HTMLElement | null) => {
    bodyRef.current = el;
  }, []);

  return {
    chatWidth,
    viewer3DWidth,
    onChatResizePointerDown,
    onViewer3DResizePointerDown,
    setBodyRef,
  };
}

/**
 * Safe wrapper around `$3Dmol.createViewer`.
 *
 * 3Dmol's Renderer prefers OffscreenCanvas + webgl2. When that getContext()
 * returns null it still assigns `_gl = null` and later crashes on
 * `clearDepth` / `getParameter`. We force the classic HTMLCanvasElement path
 * for a reliable single-viewer pane.
 */
import * as $3Dmol from '3dmol';

export type Viewer3DHandle = {
  clear: () => void;
  addModel: (data: string, format: string) => unknown;
  addLine: (spec: object) => void;
  addSphere: (spec: object) => void;
  zoomTo: (sel?: object, animationDuration?: number) => void;
  center?: (sel?: object, animationDuration?: number) => void;
  render: () => void;
  resize: () => void;
  pngURI: () => string;
  getCanvas: () => HTMLCanvasElement;
  setBackgroundColor: (hex: number | string, a?: number) => void;
  /** Camera quaternion + pan + zoom. Restoring this avoids a scene reset. */
  getView?: () => number[];
  setView?: (view: number[]) => void;
  setViewChangeCallback?: (cb: ((view: number[]) => void) | null) => void;
  removeAllModels?: () => void;
  removeAllShapes?: () => void;
  removeAllLabels?: () => void;
  removeAllSurfaces: () => void;
  addSurface: (
    stype: string | number,
    style?: object,
    atomsel?: object,
    allsel?: object,
  ) => unknown;
  mapAtomProperties?: (fn: (atom: Record<string, unknown>) => void) => void;
  setStyle: (sel: object, style: object) => void;
  addCylinder?: (spec: object) => unknown;
  addShape?: (spec: object) => unknown;
  /** Outline / AO global effect (3Dmol ViewStyle). */
  setViewStyle?: (params: {
    style?: string;
    color?: string | number;
    width?: number;
    maxpixels?: number;
  }) => void;
};

/** Keep rotation as the main gesture: modest zoom in/out, small pan from home. */
export const VIEWER_3D_CAMERA_LIMITS = {
  lowerZoomLimit: 48,
  upperZoomLimit: 160,
  maxPanFromHome: 22,
} as const;

const resolveCreateViewer = ():
  | ((el: HTMLElement, opts: object) => Viewer3DHandle | null | undefined)
  | null => {
  const mod = $3Dmol as unknown as {
    createViewer?: (el: HTMLElement, opts: object) => Viewer3DHandle | null | undefined;
    default?: {
      createViewer?: (el: HTMLElement, opts: object) => Viewer3DHandle | null | undefined;
    };
  };
  return mod.createViewer ?? mod.default?.createViewer ?? null;
};

/**
 * Hide OffscreenCanvas while `fn` runs so 3Dmol uses a normal canvas WebGL
 * context (avoids the null-GL clearDepth crash).
 */
const withClassicCanvasWebGLPath = <T>(fn: () => T): T => {
  const g = globalThis as typeof globalThis & { OffscreenCanvas?: unknown };
  if (typeof g.OffscreenCanvas !== 'function') return fn();

  const desc = Object.getOwnPropertyDescriptor(g, 'OffscreenCanvas');
  try {
    Object.defineProperty(g, 'OffscreenCanvas', {
      value: undefined,
      configurable: true,
      writable: true,
    });
  } catch {
    try {
      delete (g as { OffscreenCanvas?: unknown }).OffscreenCanvas;
    } catch {
      return fn();
    }
  }
  try {
    return fn();
  } finally {
    try {
      if (desc) Object.defineProperty(g, 'OffscreenCanvas', desc);
      else delete (g as { OffscreenCanvas?: unknown }).OffscreenCanvas;
    } catch {
      /* ignore restore failures */
    }
  }
};

type PanHome = { x: number; y: number };

const panHomeByViewer = new WeakMap<object, PanHome>();

export const noteViewerPanHome = (viewer: Viewer3DHandle): void => {
  try {
    const view = viewer.getView?.();
    if (!Array.isArray(view) || view.length < 2) return;
    panHomeByViewer.set(viewer, { x: view[0] ?? 0, y: view[1] ?? 0 });
  } catch {
    /* ignore */
  }
};

export const frameViewerSelection = (
  viewer: Viewer3DHandle,
  sel: object | undefined,
  zoom: boolean,
): void => {
  try {
    if (zoom) viewer.zoomTo(sel ?? {});
    else viewer.center?.(sel ?? {});
    noteViewerPanHome(viewer);
  } catch {
    try {
      if (zoom) viewer.zoomTo();
      else viewer.center?.();
      noteViewerPanHome(viewer);
    } catch {
      /* ignore */
    }
  }
};

const attachLimitedPan = (viewer: Viewer3DHandle): void => {
  if (typeof viewer.setViewChangeCallback !== 'function' || typeof viewer.setView !== 'function') {
    return;
  }
  let clamping = false;
  viewer.setViewChangeCallback(view => {
    if (clamping || !Array.isArray(view) || view.length < 2) return;
    const home = panHomeByViewer.get(viewer) ?? { x: 0, y: 0 };
    const max = VIEWER_3D_CAMERA_LIMITS.maxPanFromHome;
    const x = view[0] ?? 0;
    const y = view[1] ?? 0;
    const nx = Math.max(home.x - max, Math.min(home.x + max, x));
    const ny = Math.max(home.y - max, Math.min(home.y + max, y));
    if (nx === x && ny === y) return;
    const next = view.slice();
    next[0] = nx;
    next[1] = ny;
    clamping = true;
    try {
      viewer.setView?.(next);
    } finally {
      clamping = false;
    }
  });
};

export const create3DmolViewer = (
  host: HTMLElement,
  config: object = { backgroundColor: '#f8fafc' },
): Viewer3DHandle => {
  const createViewer = resolveCreateViewer();
  if (!createViewer) {
    throw new Error('3Dmol createViewer not found');
  }

  const viewerConfig = {
    backgroundColor: '#f8fafc',
    antialias: true,
    lowerZoomLimit: VIEWER_3D_CAMERA_LIMITS.lowerZoomLimit,
    upperZoomLimit: VIEWER_3D_CAMERA_LIMITS.upperZoomLimit,
    ...(config as Record<string, unknown>),
  };

  const viewer = withClassicCanvasWebGLPath(() => createViewer(host, viewerConfig));
  if (!viewer) {
    throw new Error(
      'Browser could not create a WebGL context. Enable hardware acceleration, then click Retry.',
    );
  }
  attachLimitedPan(viewer);
  // Smoke-check: catch silent null-GL construction before the panel mounts.
  try {
    viewer.resize();
    viewer.render();
  } catch (err) {
    host.replaceChildren();
    throw err instanceof Error
      ? err
      : new Error(String(err) || 'WebGL viewer failed during first render');
  }
  return viewer;
};

export const disposeViewerHost = (host: HTMLElement | null) => {
  if (!host) return;
  host.replaceChildren();
};

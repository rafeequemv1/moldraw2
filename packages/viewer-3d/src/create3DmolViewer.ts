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
  selectedAtoms?: (sel?: object) => Array<{ x?: number; y?: number; z?: number; elem?: string }>;
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

/** Keep rotation as the main gesture: modest zoom in/out, no pan. */
export const VIEWER_3D_CAMERA_LIMITS = {
  lowerZoomLimit: 48,
  upperZoomLimit: 160,
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

type PanHome = { x: number; y: number; z: number };

type PanLock = {
  home: PanHome;
  /** Skip pin while zoomTo/center writes the camera. */
  suspend: boolean;
};

const panLockByViewer = new WeakMap<object, PanLock>();

const getPanLock = (viewer: object): PanLock => {
  let lock = panLockByViewer.get(viewer);
  if (!lock) {
    lock = { home: { x: 0, y: 0, z: 0 }, suspend: false };
    panLockByViewer.set(viewer, lock);
  }
  return lock;
};

export const noteViewerPanHome = (viewer: Viewer3DHandle): void => {
  try {
    const view = viewer.getView?.();
    if (!Array.isArray(view) || view.length < 3) return;
    const lock = getPanLock(viewer);
    lock.home = { x: view[0] ?? 0, y: view[1] ?? 0, z: view[2] ?? 0 };
  } catch {
    /* ignore */
  }
};

const withPanPinSuspended = (viewer: Viewer3DHandle, fn: () => void): void => {
  const lock = getPanLock(viewer);
  lock.suspend = true;
  try {
    fn();
    noteViewerPanHome(viewer);
  } finally {
    lock.suspend = false;
  }
};

export const frameViewerSelection = (
  viewer: Viewer3DHandle,
  sel: object | undefined,
  zoom: boolean,
): void => {
  withPanPinSuspended(viewer, () => {
    try {
      if (zoom) viewer.zoomTo(sel ?? {});
      else viewer.center?.(sel ?? {});
    } catch {
      try {
        if (zoom) viewer.zoomTo();
        else viewer.center?.();
      } catch {
        /* ignore */
      }
    }
  });
};

export type ViewerAtomXyz = { x?: number; y?: number; z?: number };

/**
 * Bounding-box center of the current 3D atoms (visual middle of the structure).
 * Used as the orbit pivot so rotation stays on the molecule, not world origin.
 */
export const orbitCenterOfAtoms = (
  atoms: ReadonlyArray<ViewerAtomXyz>,
): { x: number; y: number; z: number } | null => {
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  let n = 0;
  for (const atom of atoms) {
    const x = atom?.x;
    const y = atom?.y;
    const z = atom?.z;
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) continue;
    n += 1;
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (z < minZ) minZ = z;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
    if (z > maxZ) maxZ = z;
  }
  if (n === 0) return null;
  return {
    x: (minX + maxX) / 2,
    y: (minY + maxY) / 2,
    z: (minZ + maxZ) / 2,
  };
};

export const atomsFromViewerModels = (
  models: ReadonlyArray<{
    selectedAtoms?: (sel: object) => ViewerAtomXyz[];
  }>,
): ViewerAtomXyz[] => {
  const out: ViewerAtomXyz[] = [];
  for (const model of models) {
    const atoms = model.selectedAtoms?.({}) ?? [];
    for (const atom of atoms) out.push(atom);
  }
  return out;
};

const atomsFromViewer = (viewer: Viewer3DHandle): ViewerAtomXyz[] => {
  try {
    return viewer.selectedAtoms?.({}) ?? [];
  } catch {
    return [];
  }
};

const resetCameraLookAtOrigin = (viewer: Viewer3DHandle): void => {
  const gl = viewer as Viewer3DHandle & {
    lookingAt?: { set: (x: number, y: number, z: number) => void };
    camera?: { lookAt: (target: unknown) => void };
  };
  try {
    gl.lookingAt?.set(0, 0, 0);
    if (gl.lookingAt) gl.camera?.lookAt(gl.lookingAt);
  } catch {
    /* older / stubbed 3Dmol builds */
  }
};

/**
 * Same framing used by the molecule and protein viewers: zoom to the current
 * structure, then orbit around its bounding-box center (not world origin).
 * Zoom limits and pan lock come from `create3DmolViewer`.
 */
export const applyViewer3DCameraPolicy = (
  viewer: Viewer3DHandle,
  atoms?: ReadonlyArray<ViewerAtomXyz>,
): void => {
  frameViewerSelection(viewer, {}, true);
  retargetViewerToAtomCentroid(viewer, atoms);
};

/**
 * Point the camera at the current structure's bounding-box center and make that
 * the rotate/orbit pivot. Keeps zoom and orientation (no framing jump).
 */
export const retargetViewerToAtomCentroid = (
  viewer: Viewer3DHandle,
  atoms?: ReadonlyArray<ViewerAtomXyz>,
): void => {
  const pts = atoms && atoms.length > 0 ? atoms : atomsFromViewer(viewer);
  const center = orbitCenterOfAtoms(pts);

  withPanPinSuspended(viewer, () => {
    resetCameraLookAtOrigin(viewer);
    if (center && typeof viewer.setView === 'function') {
      try {
        const view = viewer.getView?.();
        if (Array.isArray(view) && view.length >= 8) {
          const next = view.slice();
          next[0] = -center.x;
          next[1] = -center.y;
          next[2] = -center.z;
          if (next.length > 8) {
            next[8] = 0;
            next[9] = 0;
          }
          viewer.setView(next);
          return;
        }
      } catch {
        /* fall through to 3Dmol.center */
      }
    }
    try {
      viewer.center?.({});
    } catch {
      try {
        viewer.center?.();
      } catch {
        /* ignore */
      }
    }
  });
};

/**
 * 3Dmol pan is middle-drag, ctrl/meta-drag, and three-finger touch.
 * Right-drag / shift-drag / pinch / wheel stay as zoom; left-drag stays rotate.
 */
const isPanGestureEvent = (ev: Event): boolean => {
  if (ev.type.startsWith('touch')) {
    const touch = ev as TouchEvent;
    return (touch.targetTouches?.length ?? 0) >= 3;
  }
  const mouse = ev as MouseEvent;
  if (mouse.ctrlKey || mouse.metaKey) return true;
  if (ev.type === 'mousedown' && mouse.button === 1) return true;
  if (ev.type === 'mousemove' && (mouse.buttons & 4) !== 0) return true;
  return false;
};

const disableViewerPan = (viewer: Viewer3DHandle): void => {
  const panApi = viewer as Viewer3DHandle & {
    translate?: (...args: unknown[]) => Viewer3DHandle;
    translateScene?: (...args: unknown[]) => Viewer3DHandle;
  };
  panApi.translate = () => viewer;
  panApi.translateScene = () => viewer;

  let canvas: HTMLCanvasElement | null = null;
  try {
    canvas = typeof viewer.getCanvas === 'function' ? viewer.getCanvas() : null;
  } catch {
    canvas = null;
  }
  if (canvas) {
    const blockPanGesture = (ev: Event): void => {
      if (!isPanGestureEvent(ev)) return;
      ev.stopImmediatePropagation();
      if (ev.cancelable) ev.preventDefault();
    };
    const opts: AddEventListenerOptions = { capture: true, passive: false };
    canvas.addEventListener('mousedown', blockPanGesture, opts);
    canvas.addEventListener('mousemove', blockPanGesture, opts);
    canvas.addEventListener('touchstart', blockPanGesture, opts);
    canvas.addEventListener('touchmove', blockPanGesture, opts);
  }

  if (typeof viewer.setViewChangeCallback !== 'function' || typeof viewer.setView !== 'function') {
    return;
  }
  let pinning = false;
  viewer.setViewChangeCallback(view => {
    const lock = getPanLock(viewer);
    if (pinning || lock.suspend || !Array.isArray(view) || view.length < 3) return;
    const { home } = lock;
    const x = view[0] ?? 0;
    const y = view[1] ?? 0;
    const z = view[2] ?? 0;
    if (x === home.x && y === home.y && z === home.z) return;
    const next = view.slice();
    next[0] = home.x;
    next[1] = home.y;
    next[2] = home.z;
    pinning = true;
    try {
      viewer.setView?.(next);
    } finally {
      pinning = false;
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
  disableViewerPan(viewer);
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

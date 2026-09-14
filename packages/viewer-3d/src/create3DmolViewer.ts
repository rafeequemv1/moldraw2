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
  zoomTo: () => void;
  render: () => void;
  resize: () => void;
  pngURI: () => string;
  getCanvas: () => HTMLCanvasElement;
  setBackgroundColor: (hex: number | string, a?: number) => void;
  /** Camera quaternion + pan + zoom. Restoring this avoids a scene reset. */
  getView?: () => number[];
  setView?: (view: number[]) => void;
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

export const create3DmolViewer = (
  host: HTMLElement,
  config: object = { backgroundColor: '#f8fafc' },
): Viewer3DHandle => {
  const createViewer = resolveCreateViewer();
  if (!createViewer) {
    throw new Error('3Dmol createViewer not found');
  }

  const viewer = withClassicCanvasWebGLPath(() => createViewer(host, config));
  if (!viewer) {
    throw new Error(
      'Browser could not create a WebGL context. Enable hardware acceleration, then click Retry.',
    );
  }
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

import { lazy, memo, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import {
  DEFAULT_DISPLAY_SETTINGS,
  DISPLAY_MODE_OPTIONS,
  DisplayDropdown,
  applyAtomDisplayStyle,
  applyOutlineViewStyle,
  type ViewerDisplayMode,
  type ViewerDisplaySettings,
} from './display';
import {
  DEFAULT_SURFACE_SETTINGS,
  SurfacesDropdown,
  applyViewerSurface,
  type ViewerSurfaceSettings,
} from './surfaces';
import { Viewer3DExportBar } from './export';
import type { Viewer3DExportViewer } from './export';
import {
  create3DmolViewer,
  disposeViewerHost,
  type Viewer3DHandle,
} from './create3DmolViewer';

/** Multi-conformer OCL gallery limit (keep in sync with generateOclConformers). */
const CONFORMER_MAX_HEAVY = 80;

const STORAGE_ISLAND_MINIMIZED = 'moldraw.viewer3d.islandMinimized';
const STORAGE_DISPLAY_MODE = 'moldraw.viewer3d.displayMode';
const DISPLAY_MODE_IDS = new Set(DISPLAY_MODE_OPTIONS.map(o => o.id));

function readDisplayMode(): ViewerDisplayMode {
  try {
    const stored = localStorage.getItem(STORAGE_DISPLAY_MODE);
    if (stored && DISPLAY_MODE_IDS.has(stored as ViewerDisplayMode)) {
      return stored as ViewerDisplayMode;
    }
  } catch {
    /* ignore quota / private mode */
  }
  return DEFAULT_DISPLAY_SETTINGS.mode;
}

function writeDisplayMode(mode: ViewerDisplayMode): void {
  try {
    localStorage.setItem(STORAGE_DISPLAY_MODE, mode);
  } catch {
    /* ignore quota / private mode */
  }
}

function readIslandMinimized(): boolean {
  try {
    return localStorage.getItem(STORAGE_ISLAND_MINIMIZED) === '1';
  } catch {
    return false;
  }
}

function writeIslandMinimized(minimized: boolean): void {
  try {
    localStorage.setItem(STORAGE_ISLAND_MINIMIZED, minimized ? '1' : '0');
  } catch {
    /* ignore quota / private mode */
  }
}

/** Lazy: OpenChemLib ConformerGenerator UI — kept out of the initial bundle. */
const ConformerGalleryModal = lazy(() =>
  import('./conformers/ConformerGalleryModal').then(m => ({
    default: m.ConformerGalleryModal,
  })),
);

/** Native 3D pipeline status shown as a small icon in the viewer chrome. */
export type Viewer3DComputeStatus =
  | 'idle'
  | 'preview'
  | 'computing'
  | 'ready'
  | 'error'
  | 'large';

export interface Molecule3DPanelProps {
  molblock: string;
  moleculeTitle?: string;
  showHydrogens: boolean;
  onToggleHydrogens: (v: boolean) => void;
  sourceLabel?: string;
  /** UFF energy of the displayed conformer (kcal/mol), when computed natively. */
  energyKcal?: number | null;
  /** Native embed / UFF progress: spinning while worker runs, check when done. */
  computeStatus?: Viewer3DComputeStatus;
  /** Optional heavy-atom count for the large-molecule hint. */
  heavyAtomCount?: number;
  stereoHints?: Array<{ fromAtomIdx: number; toAtomIdx: number; stereo: 'wedge' | 'dash' }>;
  /** Unsatisfied 2D→3D stereo constraints — orange markers in the viewer. */
  stereoIssues?: Array<{ atomIndices: number[]; label: string }>;
  selectedAtomIndices?: number[];
  onAtomPick?: (pick: { atomIndex: number; modelIndex: number; element?: string }) => void;
  /** Manual rebuild when progressive/auto 3D stalls or looks flat. */
  onRebuild3D?: () => void;
  rebuildBusy?: boolean;
  /**
   * When the user applies an OpenChemLib gallery pose, notify the parent so
   * the main 3D molblock state stays in sync (optional).
   */
  onApplyOclConformer?: (molblock: string) => void;
  /**
   * When MMFF94 minimization finishes, notify the parent with the refined
   * molblock and MMFF94 energy (kcal/mol).
   */
  onApplyMmff94?: (payload: { molblock: string; energyKcal: number }) => void;
  /** Register a getter for the live 3Dmol viewer (File → Export 3D screenshots). */
  onRegisterExportViewer?: (getViewer: () => Viewer3DExportViewer | null) => void;
  /** Viewer clear color (hex). Follows app UI theme when provided. */
  backgroundColor?: string;
}

const STATUS_META: Record<
  Viewer3DComputeStatus,
  { label: string; title: string; className: string }
> = {
  idle: {
    label: '3D',
    title: 'No molecule',
    className: 'viewer3d-status viewer3d-status--idle',
  },
  preview: {
    label: 'Preview',
    title: 'Fast native 3D preview — refined conformer pending',
    className: 'viewer3d-status viewer3d-status--preview',
  },
  computing: {
    label: 'Building…',
    title: 'Native 3D growing center-out (shell by shell)',
    className: 'viewer3d-status viewer3d-status--computing',
  },
  ready: {
    label: 'Native',
    title: 'Native 3D conformer ready (local engine)',
    className: 'viewer3d-status viewer3d-status--ready',
  },
  error: {
    label: 'Failed',
    title: 'Native 3D computation failed — showing last preview',
    className: 'viewer3d-status viewer3d-status--error',
  },
  large: {
    label: 'Large',
    title:
      'Molecule is too large for full native UFF sampling — showing light preview only',
    className: 'viewer3d-status viewer3d-status--large',
  },
};

type OverlayModel = {
  selectedAtoms?: (sel: object) => Array<{
    elem?: string;
    serial?: number;
    x?: number;
    y?: number;
    z?: number;
  }>;
  setStyle?: (sel: object, style: object) => void;
  setClickable?: (
    sel: object,
    clickable: boolean,
    callback: (atom: { index?: number; serial?: number; elem?: string }) => void,
  ) => void;
};

/** V2000 atom block → 3D coordinates (domain Atom has no z). */
const parseMolblockAtomXyz = (
  molblock: string,
): Array<{ x: number; y: number; z: number; elem: string }> => {
  const lines = molblock.replace(/\r\n/g, '\n').split('\n');
  const counts = lines[3];
  if (!counts) return [];
  const nAtoms = Number.parseInt(counts.slice(0, 3), 10);
  if (!Number.isFinite(nAtoms) || nAtoms < 1) return [];
  const out: Array<{ x: number; y: number; z: number; elem: string }> = [];
  for (let i = 0; i < nAtoms; i++) {
    const line = lines[4 + i];
    if (!line || line.length < 34) return [];
    const x = Number.parseFloat(line.slice(0, 10));
    const y = Number.parseFloat(line.slice(10, 20));
    const z = Number.parseFloat(line.slice(20, 30));
    const elem = line.slice(31, 34).trim();
    if (![x, y, z].every(Number.isFinite) || !elem) return [];
    out.push({ x, y, z, elem });
  }
  return out;
};

const captureViewerView = (viewer: Viewer3DHandle): number[] | null => {
  try {
    const view = viewer.getView?.();
    return Array.isArray(view) && view.length > 0 ? view : null;
  } catch {
    return null;
  }
};

const restoreViewerView = (viewer: Viewer3DHandle, view: number[] | null): void => {
  if (!view || typeof viewer.setView !== 'function') return;
  try {
    viewer.setView(view);
  } catch {
    /* older 3Dmol builds */
  }
};

/**
 * Drop models/shapes without `viewer.clear()`. 3Dmol's `removeAllLabels()` and
 * `removeAllSurfaces()` each call `show()` internally — an empty-scene render
 * before the new model is added — so they are only invoked when something is
 * actually there to remove (this panel never adds labels).
 */
const unloadModelsKeepCamera = (viewer: Viewer3DHandle, hasSurface: boolean): void => {
  try {
    if (typeof viewer.removeAllModels === 'function') viewer.removeAllModels();
    else viewer.clear();
    viewer.removeAllShapes?.();
    if (hasSurface) viewer.removeAllSurfaces();
  } catch {
    try {
      viewer.clear();
    } catch {
      /* ignore */
    }
  }
};

const applyStereoOverlays = (
  viewer: Viewer3DHandle,
  models: OverlayModel[],
  stereoHints: Array<{ fromAtomIdx: number; toAtomIdx: number; stereo: 'wedge' | 'dash' }>,
  stereoIssues: Array<{ atomIndices: number[]; label: string }>,
): void => {
  if (models.length !== 1) return;
  const atoms = models[0]?.selectedAtoms?.({}) ?? [];
  for (const s of stereoHints) {
    const a = atoms[s.fromAtomIdx];
    const b = atoms[s.toAtomIdx];
    if (!a || !b) continue;
    viewer.addLine({
      start: { x: a.x, y: a.y, z: a.z },
      end: { x: b.x, y: b.y, z: b.z },
      color: s.stereo === 'wedge' ? '#7c3aed' : '#0ea5e9',
      dashed: s.stereo === 'dash',
      linewidth: s.stereo === 'wedge' ? 3.2 : 2.6,
    });
  }
  for (const issue of stereoIssues) {
    for (const idx of issue.atomIndices) {
      const a = atoms[idx];
      if (!a) continue;
      viewer.addSphere({
        center: { x: a.x, y: a.y, z: a.z },
        radius: 0.42,
        color: '#ea580c',
        opacity: 0.55,
      });
    }
  }
};

function Molecule3DPanelInner({
  molblock,
  moleculeTitle = '',
  showHydrogens,
  onToggleHydrogens,
  sourceLabel,
  energyKcal,
  computeStatus = 'idle',
  heavyAtomCount,
  stereoHints = [],
  stereoIssues = [],
  onAtomPick,
  onRebuild3D,
  rebuildBusy = false,
  onApplyOclConformer,
  onApplyMmff94,
  onRegisterExportViewer,
  backgroundColor = '#f8fafc',
}: Molecule3DPanelProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const viewerRef = useRef<Viewer3DHandle | null>(null);
  const backgroundColorRef = useRef(backgroundColor);
  /** Bump to tear down + recreate the WebGL viewer (retry / HMR recovery). */
  const [viewerEpoch, setViewerEpoch] = useState(0);
  const [viewerReady, setViewerReady] = useState(false);
  /** Collapse the whole bottom controls island (toolbar + export), not export alone. */
  const [islandMinimized, setIslandMinimized] = useState(readIslandMinimized);

  const toggleIslandMinimized = useCallback(() => {
    setIslandMinimized(prev => {
      const next = !prev;
      writeIslandMinimized(next);
      return next;
    });
  }, []);

  useEffect(() => {
    if (!onRegisterExportViewer) return;
    onRegisterExportViewer(() => viewerRef.current as Viewer3DExportViewer | null);
    return () => onRegisterExportViewer(() => null);
  }, [onRegisterExportViewer]);
  /** Skip zoomTo while progressive shells stream — zoom every frame freezes the UI. */
  const hadModelRef = useRef(false);
  const modelsRef = useRef<OverlayModel[]>([]);
  const lastLoadedMolblockRef = useRef('');
  const lastStyleKeyRef = useRef('');
  const onAtomPickRef = useRef(onAtomPick);
  const stereoHintsRef = useRef(stereoHints);
  const stereoIssuesRef = useRef(stereoIssues);
  const hostSizeRef = useRef({ w: 0, h: 0 });
  const [galleryOpen, setGalleryOpen] = useState(false);
  /** Local override when user applies OCL conformer / MMFF94 (cleared when parent molblock changes). */
  const [localPose, setLocalPose] = useState<{
    molblock: string;
    label: string;
    energyKcal: number | null;
    energyKind: 'mmff94' | null;
  } | null>(null);
  const [mmffBusy, setMmffBusy] = useState(false);
  const [mmffError, setMmffError] = useState<string | null>(null);
  /** WebGL / 3Dmol init failure — overlay only; host stays mounted for retry. */
  const [viewerInitError, setViewerInitError] = useState<string | null>(null);
  const [displayMode, setDisplayMode] = useState<ViewerDisplaySettings['mode']>(
    readDisplayMode,
  );
  const [surfaceSettings, setSurfaceSettings] = useState<ViewerSurfaceSettings>(
    DEFAULT_SURFACE_SETTINGS,
  );
  const prevMolblockRef = useRef(molblock);

  const displaySettings: ViewerDisplaySettings = {
    mode: displayMode,
    showHydrogens,
  };

  useEffect(() => {
    backgroundColorRef.current = backgroundColor;
    onAtomPickRef.current = onAtomPick;
    stereoHintsRef.current = stereoHints;
    stereoIssuesRef.current = stereoIssues;
  });

  useEffect(() => {
    if (prevMolblockRef.current !== molblock) {
      prevMolblockRef.current = molblock;
      setLocalPose(null);
      setMmffError(null);
    }
  }, [molblock]);

  const displayMolblock = localPose?.molblock ?? molblock;
  const displaySourceLabel = localPose?.label ?? sourceLabel;
  const displayEnergyKcal =
    localPose?.energyKind === 'mmff94' && typeof localPose.energyKcal === 'number'
      ? localPose.energyKcal
      : energyKcal;
  const sourceImpliesMmff94 =
    !!displaySourceLabel && /mmff94/i.test(displaySourceLabel);
  const displayEnergyKind: 'uff' | 'mmff94' | null =
    localPose?.energyKind === 'mmff94' || sourceImpliesMmff94
      ? typeof displayEnergyKcal === 'number' && Number.isFinite(displayEnergyKcal)
        ? 'mmff94'
        : null
      : typeof energyKcal === 'number' && Number.isFinite(energyKcal)
        ? 'uff'
        : null;

  // Never show Failed when a usable 3D model is already on screen.
  const effectiveStatus: Viewer3DComputeStatus =
    computeStatus === 'error' && displayMolblock.trim() ? 'preview' : computeStatus;
  const status = STATUS_META[effectiveStatus];
  const statusTitle =
    effectiveStatus === 'large' && heavyAtomCount != null
      ? `${status.title} (${heavyAtomCount} heavy atoms)`
      : status.title;
  const isBuilding = rebuildBusy || effectiveStatus === 'computing';
  // Always offer Calculate structure when there is a molecule — including mid-build —
  // so a stranded flat seed can be re-triggered from the 3D pane.
  const showRebuild = !!onRebuild3D && !!molblock.trim() && effectiveStatus !== 'idle';
  const showConformerGallery = !!molblock.trim() && effectiveStatus !== 'idle';
  const showMmff94 = !!displayMolblock.trim() && effectiveStatus !== 'idle';

  const runMmff94 = async () => {
    if (mmffBusy || !displayMolblock.trim()) return;
    setMmffBusy(true);
    setMmffError(null);
    try {
      // Lazy-load MMFF94 (+ OpenChemLib) only when the user clicks the button.
      const { minimizeMmff94 } = await import('./mmff94');
      const result = await minimizeMmff94(displayMolblock, { table: 'MMFF94', maxIts: 2000 });
      setLocalPose({
        molblock: result.molblock,
        label: 'MMFF94 minimized',
        energyKcal: result.energyKcal,
        energyKind: 'mmff94',
      });
      onApplyMmff94?.({ molblock: result.molblock, energyKcal: result.energyKcal });
    } catch (err) {
      setMmffError(err instanceof Error ? err.message : String(err));
    } finally {
      setMmffBusy(false);
    }
  };

  const retryViewer = useCallback(() => {
    viewerRef.current = null;
    setViewerReady(false);
    setViewerInitError(null);
    disposeViewerHost(hostRef.current);
    setViewerEpoch(n => n + 1);
  }, []);

  // Create WebGL viewer once the host has a real layout box (3Dmol fails on 0×0).
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let cancelled = false;
    let created = false;
    let failed = false;

    const tryCreate = () => {
      if (cancelled || created || failed || viewerRef.current) return;
      if (host.clientWidth < 8 || host.clientHeight < 8) return;

      host.style.position = 'relative';
      host.style.width = '100%';
      host.style.height = '100%';
      disposeViewerHost(host);

      try {
        const viewer = create3DmolViewer(host, {
          backgroundColor: backgroundColorRef.current,
          antialias: true,
        });
        viewerRef.current = viewer;
        created = true;
        lastLoadedMolblockRef.current = '';
        lastStyleKeyRef.current = '';
        modelsRef.current = [];
        hadModelRef.current = false;
        setViewerInitError(null);
        setViewerReady(true);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.warn('3Dmol createViewer failed:', err);
        failed = true;
        viewerRef.current = null;
        disposeViewerHost(host);
        setViewerInitError(message || 'WebGL viewer failed to start');
      }
    };

    tryCreate();
    const ro =
      typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => tryCreate()) : null;
    ro?.observe(host);
    // Layout often settles a frame later after the split pane opens.
    const raf = requestAnimationFrame(tryCreate);
    const t = window.setTimeout(tryCreate, 120);

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      window.clearTimeout(t);
      ro?.disconnect();
      viewerRef.current = null;
      disposeViewerHost(host);
    };
  }, [viewerEpoch]);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || !viewerReady || viewerInitError) return;
    try {
      viewer.setBackgroundColor(backgroundColor, 1);
      viewer.render();
    } catch {
      // ignore — viewer may be mid-dispose
    }
  }, [backgroundColor, viewerReady, viewerInitError]);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || !viewerReady || viewerInitError) return;
    const styleKey = `${displaySettings.mode}|${displaySettings.showHydrogens ? 1 : 0}`;
    const molblockUnchanged =
      displayMolblock === lastLoadedMolblockRef.current &&
      (modelsRef.current.length > 0 || !displayMolblock.trim());
    if (molblockUnchanged && styleKey === lastStyleKeyRef.current) {
      return;
    }
    if (!molblockUnchanged) {
      lastLoadedMolblockRef.current = displayMolblock;
      if (displayMolblock.trim()) {
        const existingAtoms = modelsRef.current[0]?.selectedAtoms?.({}) ?? [];
        const nextCoords = parseMolblockAtomXyz(displayMolblock);
        const canPatchCoords =
          hadModelRef.current &&
          modelsRef.current.length === 1 &&
          nextCoords.length > 0 &&
          nextCoords.length === existingAtoms.length &&
          nextCoords.every((c, i) => {
            const elem = existingAtoms[i]?.elem;
            return !elem || elem === c.elem;
          });
        if (canPatchCoords) {
          for (let i = 0; i < existingAtoms.length; i++) {
            const atom = existingAtoms[i]!;
            const c = nextCoords[i]!;
            atom.x = c.x;
            atom.y = c.y;
            atom.z = c.z;
          }
          try {
            viewer.removeAllShapes?.();
          } catch {
            /* ignore */
          }
          const customSticks =
            displaySettings.mode === 'stick' || displaySettings.mode === 'toonish';
          if (customSticks || styleKey !== lastStyleKeyRef.current) {
            applyAtomDisplayStyle({
              viewer,
              models: modelsRef.current,
              mode: displaySettings.mode,
              showHydrogens: displaySettings.showHydrogens,
              selectedAtomIndices: [],
              onAtomPick: pick => onAtomPickRef.current?.(pick),
            });
            applyOutlineViewStyle(viewer, displaySettings.mode === 'toonish');
          }
          applyStereoOverlays(
            viewer,
            modelsRef.current,
            stereoHintsRef.current,
            stereoIssuesRef.current,
          );
          lastStyleKeyRef.current = styleKey;
          viewer.render();
          return;
        }

        const savedView = captureViewerView(viewer);
        unloadModelsKeepCamera(viewer, surfaceSettings.kind != null);
        modelsRef.current = [];
        const modelBlocks = displayMolblock.includes('$$$$')
          ? displayMolblock.split('$$$$').map(s => s.trim()).filter(Boolean)
          : [displayMolblock.trim()];
        const models = modelBlocks
          .map(block => {
            try {
              return viewer.addModel(block, 'sdf') as OverlayModel;
            } catch (err) {
              console.warn('3Dmol addModel failed:', err);
              return null;
            }
          })
          .filter((m): m is OverlayModel => m != null);
        modelsRef.current = models;
        lastStyleKeyRef.current = styleKey;
        if (models.length === 0) return;
        applyAtomDisplayStyle({
          viewer,
          models,
          mode: displaySettings.mode,
          showHydrogens: displaySettings.showHydrogens,
          selectedAtomIndices: [],
          onAtomPick: pick => onAtomPickRef.current?.(pick),
        });
        applyOutlineViewStyle(viewer, displaySettings.mode === 'toonish');
        applyStereoOverlays(viewer, models, stereoHintsRef.current, stereoIssuesRef.current);
        if (savedView) restoreViewerView(viewer, savedView);
        else if (!hadModelRef.current) viewer.zoomTo();
        hadModelRef.current = true;
        if (surfaceSettings.kind) {
          applyViewerSurface({
            viewer,
            settings: surfaceSettings,
            showHydrogens: displaySettings.showHydrogens,
          });
        }
        viewer.render();
        return;
      }
      hadModelRef.current = false;
      unloadModelsKeepCamera(viewer, surfaceSettings.kind != null);
      modelsRef.current = [];
      applyOutlineViewStyle(viewer, false);
      lastStyleKeyRef.current = styleKey;
      viewer.render();
      return;
    }
    lastStyleKeyRef.current = styleKey;
    const models = modelsRef.current;
    if (models.length === 0) return;
    applyAtomDisplayStyle({
      viewer,
      models,
      mode: displaySettings.mode,
      showHydrogens: displaySettings.showHydrogens,
      selectedAtomIndices: [],
      onAtomPick: pick => onAtomPickRef.current?.(pick),
    });
    applyOutlineViewStyle(viewer, displaySettings.mode === 'toonish');
    viewer.render();
  }, [
    viewerReady,
    viewerInitError,
    displayMolblock,
    displaySettings.mode,
    displaySettings.showHydrogens,
    surfaceSettings,
  ]);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || !viewerReady || viewerInitError) return;
    if (!surfaceSettings.kind) {
      try {
        viewer.removeAllSurfaces();
      } catch {
        /* none */
      }
      return;
    }
    applyViewerSurface({
      viewer,
      settings: surfaceSettings,
      showHydrogens: displaySettings.showHydrogens,
    });
  }, [
    viewerReady,
    viewerInitError,
    surfaceSettings,
    displaySettings.showHydrogens,
    displaySettings.mode,
  ]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const resizeIfNeeded = () => {
      const v = viewerRef.current;
      if (!v || !viewerReady) return;
      const w = Math.round(host.clientWidth);
      const h = Math.round(host.clientHeight);
      if (w < 8 || h < 8) return;
      if (w === hostSizeRef.current.w && h === hostSizeRef.current.h) return;
      hostSizeRef.current = { w, h };
      v.resize();
      v.render();
    };

    resizeIfNeeded();
    const ro =
      typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resizeIfNeeded) : null;
    ro?.observe(host);
    window.addEventListener('resize', resizeIfNeeded);
    return () => {
      ro?.disconnect();
      window.removeEventListener('resize', resizeIfNeeded);
    };
  }, [viewerReady, viewerEpoch]);

  return (
    <div className="viewer3d-shell">
      <div className="viewer3d-stage">
        {moleculeTitle ? (
          <div className="viewer3d-molecule-title" title={moleculeTitle}>
            {moleculeTitle}
          </div>
        ) : null}
        <div ref={hostRef} className="viewer3d-canvas" />
        {viewerInitError ? (
          <div className="viewer3d-init-overlay" role="alert">
            <p className="viewer3d-init-error">
              3D view unavailable (needs WebGL). The 2D editor can still run on the CPU. In Chrome /
              Edge: paste <code>chrome://settings/system</code> → turn on{' '}
              <strong>Use graphics acceleration when available</strong> → <strong>Relaunch</strong>,
              then Retry. Also close other WebGL tabs (maps, games, other 3D pages).
            </p>
            <p className="viewer3d-init-error viewer3d-init-error--detail" title={viewerInitError}>
              {viewerInitError}
            </p>
            <button type="button" className="viewer3d-init-retry" onClick={retryViewer}>
              Retry 3D
            </button>
          </div>
        ) : null}
      </div>
      <div
        className={`viewer3d-island${islandMinimized ? ' viewer3d-island--minimized' : ''}`}
        aria-label="3D controls"
      >
        <button
          type="button"
          className="viewer3d-island__toggle"
          onClick={toggleIslandMinimized}
          aria-expanded={!islandMinimized}
          title={
            islandMinimized
              ? 'Expand 3D controls (display, surfaces, export…)'
              : 'Minimize 3D controls'
          }
        >
          <span className="viewer3d-island__toggle-label">
            {islandMinimized ? '3D controls' : 'Controls'}
          </span>
          <span className="viewer3d-island__toggle-caret" aria-hidden>
            {islandMinimized ? '▲' : '▼'}
          </span>
        </button>
        {!islandMinimized ? (
          <>
            <div className="viewer3d-toolbar">
              <DisplayDropdown
                settings={displaySettings}
                onChange={next => {
                  setDisplayMode(next.mode);
                  writeDisplayMode(next.mode);
                  if (next.showHydrogens !== showHydrogens) {
                    onToggleHydrogens(next.showHydrogens);
                  }
                }}
                onToggleHydrogens={onToggleHydrogens}
              />
              <button
                type="button"
                className={`viewer3d-rebuild${showHydrogens ? ' is-on' : ''}`}
                aria-pressed={showHydrogens}
                title={showHydrogens ? 'Hide hydrogens in 3D' : 'Show hydrogens in 3D'}
                onClick={() => onToggleHydrogens(!showHydrogens)}
              >
                {showHydrogens ? 'H on' : 'H off'}
              </button>
              <SurfacesDropdown settings={surfaceSettings} onChange={setSurfaceSettings} />
              <span className={status.className} title={statusTitle} aria-live="polite">
                <span className="viewer3d-status__icon" aria-hidden="true" />
                <span className="viewer3d-status__label">{status.label}</span>
              </span>
              {displaySourceLabel ? (
                <span className="viewer3d-toggle__source" title={displaySourceLabel}>
                  {displaySourceLabel}
                </span>
              ) : null}
              {stereoIssues.length > 0 ? (
                <span
                  className="viewer3d-stereo-warn"
                  title={stereoIssues.map(i => i.label).join('\n')}
                >
                  Stereo!
                </span>
              ) : null}
              {displayEnergyKind &&
              typeof displayEnergyKcal === 'number' &&
              Number.isFinite(displayEnergyKcal) ? (
                <span
                  className="viewer3d-toggle__energy"
                  title={
                    displayEnergyKind === 'mmff94'
                      ? 'MMFF94 total energy after minimization (OpenChemLib)'
                      : 'UFF energy of this conformer (native engine)'
                  }
                >
                  {`${displayEnergyKind === 'mmff94' ? 'MMFF94' : 'UFF'} ${displayEnergyKcal.toFixed(1)} kcal/mol`}
                </span>
              ) : null}
              {showConformerGallery ? (
                <button
                  type="button"
                  className={`viewer3d-rebuild${
                    typeof heavyAtomCount === 'number' && heavyAtomCount > CONFORMER_MAX_HEAVY
                      ? ' viewer3d-rebuild--muted'
                      : ''
                  }`}
                  onClick={() => setGalleryOpen(true)}
                  title={
                    typeof heavyAtomCount === 'number' && heavyAtomCount > CONFORMER_MAX_HEAVY
                      ? `Conformers not supported for larger molecules (${heavyAtomCount} heavy atoms; limit ${CONFORMER_MAX_HEAVY}). Use Calculate structure.`
                      : `OpenChemLib ConformerGenerator — collision-free torsion poses (up to ${CONFORMER_MAX_HEAVY} heavy atoms)`
                  }
                >
                  {typeof heavyAtomCount === 'number' && heavyAtomCount > CONFORMER_MAX_HEAVY
                    ? 'Conformers (N/A)'
                    : 'Conformers…'}
                </button>
              ) : null}
              {showMmff94 ? (
                <button
                  type="button"
                  className="viewer3d-rebuild"
                  disabled={mmffBusy || isBuilding}
                  onClick={() => void runMmff94()}
                  title="MMFF94 minimize — organic force field (OpenChemLib). Needs a 3D pose first."
                >
                  {mmffBusy ? 'MMFF94…' : 'MMFF94'}
                </button>
              ) : null}
              {showRebuild ? (
                <button
                  type="button"
                  className="viewer3d-rebuild"
                  onClick={onRebuild3D}
                  title="Calculate 3D structure (progressive center-out optimization)"
                >
                  {isBuilding ? 'Building… · Calculate' : 'Calculate structure'}
                </button>
              ) : null}
              {mmffError ? (
                <span className="viewer3d-toggle__error" title={mmffError}>
                  {mmffError}
                </span>
              ) : null}
            </div>
            <Viewer3DExportBar
              molblock={displayMolblock}
              title={moleculeTitle}
              disabled={!displayMolblock.trim()}
              getViewer={() => viewerRef.current as Viewer3DExportViewer | null}
            />
          </>
        ) : null}
      </div>
      {galleryOpen ? (
        <Suspense fallback={null}>
          <ConformerGalleryModal
            open={galleryOpen}
            molblock={molblock}
            heavyAtomCount={heavyAtomCount}
            onClose={() => setGalleryOpen(false)}
            onApply={mb => {
              setLocalPose({
                molblock: mb,
                label: 'OpenChemLib conformer',
                energyKcal: null,
                energyKind: null,
              });
              setMmffError(null);
              onApplyOclConformer?.(mb);
            }}
          />
        </Suspense>
      ) : null}
    </div>
  );
}

/**
 * Re-rendering this panel never touches WebGL: the model / style / surface
 * effects key off `molblock`, display settings and `backgroundColor` only, and
 * callbacks are read through refs. The comparator therefore only has to skip
 * renders whose props are all unchanged (App re-renders on every 2D click);
 * label props are compared so the island (title, source, energy, status)
 * stays live. Callback identity is intentionally ignored.
 */
export const Molecule3DPanel = memo(Molecule3DPanelInner, (prev, next) => {
  if (prev.molblock !== next.molblock) return false;
  if (prev.moleculeTitle !== next.moleculeTitle) return false;
  if (prev.showHydrogens !== next.showHydrogens) return false;
  if (prev.sourceLabel !== next.sourceLabel) return false;
  if (prev.energyKcal !== next.energyKcal) return false;
  if (prev.computeStatus !== next.computeStatus) return false;
  if (prev.heavyAtomCount !== next.heavyAtomCount) return false;
  if (prev.rebuildBusy !== next.rebuildBusy) return false;
  if (prev.backgroundColor !== next.backgroundColor) return false;
  if (prev.stereoHints !== next.stereoHints) return false;
  if (prev.stereoIssues !== next.stereoIssues) return false;
  return true;
});
Molecule3DPanel.displayName = 'Molecule3DPanel';


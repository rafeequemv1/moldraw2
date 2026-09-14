import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import * as $3Dmol from '3dmol';
import {
  DEFAULT_DISPLAY_SETTINGS,
  DisplayDropdown,
  applyAtomDisplayStyle,
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

/** Multi-conformer OCL gallery limit (keep in sync with generateOclConformers). */
const CONFORMER_MAX_HEAVY = 80;

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

export function Molecule3DPanel({
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
  selectedAtomIndices = [],
  onAtomPick,
  onRebuild3D,
  rebuildBusy = false,
  onApplyOclConformer,
  onApplyMmff94,
  onRegisterExportViewer,
}: Molecule3DPanelProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const viewerRef = useRef<{
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
    removeAllSurfaces: () => void;
    addSurface: (
      stype: string | number,
      style?: object,
      atomsel?: object,
      allsel?: object,
    ) => unknown;
    mapAtomProperties?: (fn: (atom: Record<string, unknown>) => void) => void;
    setStyle: (sel: object, style: object) => void;
  } | null>(null);

  useEffect(() => {
    if (!onRegisterExportViewer) return;
    onRegisterExportViewer(() => viewerRef.current as Viewer3DExportViewer | null);
    return () => onRegisterExportViewer(() => null);
  }, [onRegisterExportViewer]);
  /** Skip zoomTo while progressive shells stream — zoom every frame freezes the UI. */
  const hadModelRef = useRef(false);
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
  const [displayMode, setDisplayMode] = useState<ViewerDisplaySettings['mode']>(
    DEFAULT_DISPLAY_SETTINGS.mode,
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

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    if (!viewerRef.current) {
      viewerRef.current = ($3Dmol as unknown as {
        createViewer: (
          el: HTMLElement,
          opts: object,
        ) => NonNullable<typeof viewerRef.current>;
      }).createViewer(host, {
        backgroundColor: '#f8fafc',
      });
    }
    const viewer = viewerRef.current;
    viewer.clear();
    if (displayMolblock.trim()) {
      const modelBlocks = displayMolblock.includes('$$$$')
        ? displayMolblock.split('$$$$').map(s => s.trim()).filter(Boolean)
        : [displayMolblock.trim()];
      const models = modelBlocks
        .map(block => {
          try {
            return viewer.addModel(block, 'sdf') as {
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
                callback: (atom: {
                  index?: number;
                  serial?: number;
                  elem?: string;
                }) => void,
              ) => void;
            };
          } catch (err) {
            console.warn('3Dmol addModel failed:', err);
            return null;
          }
        })
        .filter((m): m is NonNullable<typeof m> => m != null);

      applyAtomDisplayStyle({
        viewer,
        models,
        mode: displaySettings.mode,
        showHydrogens: displaySettings.showHydrogens,
        selectedAtomIndices,
        onAtomPick,
      });

      // Stereo cues from 2D wedges/dashes: overlay line hints in 3D.
      if (models.length === 1) {
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
      }
      // Progressive shells: keep camera. Zoom only on first model or when build finishes.
      const shouldZoom =
        !hadModelRef.current ||
        effectiveStatus === 'ready' ||
        effectiveStatus === 'preview' ||
        effectiveStatus === 'large';
      if (shouldZoom) viewer.zoomTo();
      hadModelRef.current = true;
      viewer.render();
    } else {
      hadModelRef.current = false;
      viewer.render();
    }
  }, [
    displayMolblock,
    displaySettings.mode,
    displaySettings.showHydrogens,
    stereoHints,
    stereoIssues,
    selectedAtomIndices,
    onAtomPick,
    effectiveStatus,
  ]);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || !displayMolblock.trim()) return;
    applyViewerSurface({
      viewer,
      settings: surfaceSettings,
      showHydrogens: displaySettings.showHydrogens,
    });
  }, [
    surfaceSettings,
    displaySettings.showHydrogens,
    displayMolblock,
    displaySettings.mode,
    selectedAtomIndices,
    effectiveStatus,
  ]);

  useEffect(() => {
    const onResize = () => {
      const v = viewerRef.current;
      if (!v) return;
      v.resize();
      v.render();
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  return (
    <div className="viewer3d-shell">
      <div className="viewer3d-stage">
        {moleculeTitle ? (
          <div className="viewer3d-molecule-title" title={moleculeTitle}>
            {moleculeTitle}
          </div>
        ) : null}
        <div ref={hostRef} className="viewer3d-canvas" />
      </div>
      <div className="viewer3d-island" aria-label="3D controls">
        <div className="viewer3d-toolbar">
          <DisplayDropdown
            settings={displaySettings}
            onChange={next => {
              setDisplayMode(next.mode);
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

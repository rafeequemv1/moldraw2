/**
 * 3D viewer sync: dedicated molecule3dWorker lifecycle, progressive/region
 * updates from the 2D molecule, and 2D↔3D selection mapping.
 *
 * Owns viewer3D* display state (not the top-bar show/minimize chrome).
 * When `enabled` is false, the worker is not spawned and sync is idle.
 *
 * Rebuild rules:
 * - Structure / stereo / 3D-depth of the *pinned* fragment only
 * - Canvas click / deselect / drawing a new disconnected molecule must not
 *   steal or reload the current 3D view
 * - Selecting a different fragment → show that fragment (cached pose if any)
 * - Keep the last 3D model on screen while a new embed computes (no flat flash)
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Bond, Molecule } from '@moldraw/domain';
import {
  cofStackAtomIds,
  expandInstanceArrays,
  molblock3DFromPerspectivePose,
  perspectiveZFingerprint,
} from '@moldraw/core';
import { expandAliasesFor3D } from '@moldraw/core/expand/aliasesFor3D';
import {
  createMoleculeWorkerClient,
  type MoleculeWorkerClient,
} from '@moldraw/core/moleculeWorker/client';
import type {
  Molecule3dWorkerRequest,
  Molecule3dWorkerResponse,
} from '@moldraw/core/moleculeWorker/messages3d';
import { engine } from '@moldraw/engine';
import {
  choose3DUpdatePath,
  dirtyAtomIdsFromEdit,
  isOptimized3DSource,
  NATIVE_3D_FULL_HEAVY_LIMIT,
  NATIVE_3D_PREVIEW_HEAVY_LIMIT,
  pickFocusFragment,
  retainPinnedFocus,
  refine3DRegion,
  structureKeyFor3D,
} from '@moldraw/engine-3d';
import type { Viewer3DComputeStatus } from '@moldraw/viewer-3d';
import Molecule3DWorker from '../../workers/molecule3dWorker.ts?worker';

export type BatchWorkerWaitMap = Map<
  string,
  { resolve: (v: unknown) => void; reject: (e: Error) => void }
>;

export interface StereoIssueMarker {
  atomIndices: number[];
  label: string;
}

type PoseCacheEntry = {
  molblock: string;
  energy: number | null;
  source: string;
};

export interface UseViewer3DSyncOptions {
  molecule: Molecule;
  selectedAtomIds: string[];
  selectedBondIds?: string[];
  setSelectedAtomIds: (ids: string[] | ((prev: string[]) => string[])) => void;
  /** Shared with 2D worker / batch pipeline for promise correlation. */
  batchWorkerWaitRef: React.MutableRefObject<BatchWorkerWaitMap>;
  /** When false, tear down the 3D worker and skip GENERATE_3D / progressive sync. */
  enabled?: boolean;
}

/** Displayed atoms (seed + instance copies) above which 3D sync is rate-limited. */
const LARGE_SYNC_ATOMS = 1500;
/** Minimum spacing between 3D syncs for large lattices while they change rapidly. */
const LARGE_SYNC_INTERVAL_MS = 120;

const focusSourceSuffix = (reason: string, componentCount: number): string => {
  if (componentCount <= 1) return '';
  if (reason === 'selected') return ' · selected fragment';
  if (reason === 'pinned') return '';
  if (reason === 'newest') return ` · newest of ${componentCount}`;
  return '';
};

const focusCofStackOrFragment = (
  mol: Molecule,
  selectedAtomIds: string[],
): ReturnType<typeof pickFocusFragment> => {
  const stackIds = cofStackAtomIds(mol);
  if (!stackIds) return pickFocusFragment(mol, selectedAtomIds);
  const keep = new Set(stackIds);
  return {
    fragment: {
      ...mol,
      atoms: mol.atoms.filter(a => keep.has(a.id)),
      bonds: mol.bonds.filter(b => keep.has(b.fromAtomId) && keep.has(b.toAtomId)),
    },
    atomIds: stackIds,
    reason: 'single',
    componentCount: 1,
  };
};

/** Atom ids that should drive multi-fragment 3D focus (atoms + bond endpoints). */
const focusSeedAtomIds = (
  mol: Molecule,
  selectedAtomIds: string[],
  selectedBondIds: string[],
): string[] => {
  if (selectedBondIds.length === 0) return selectedAtomIds;
  const out = new Set(selectedAtomIds);
  const bondSet = new Set(selectedBondIds);
  for (const b of mol.bonds) {
    if (!bondSet.has(b.id)) continue;
    out.add(b.fromAtomId);
    out.add(b.toAtomId);
  }
  return out.size === selectedAtomIds.length ? selectedAtomIds : [...out];
};

const atomIndexMapEqual = (
  prev: Record<number, string>,
  next: Record<number, string>,
): boolean => {
  const nextKeys = Object.keys(next);
  if (Object.keys(prev).length !== nextKeys.length) return false;
  for (const k of nextKeys) {
    if (prev[Number(k)] !== next[Number(k)]) return false;
  }
  return true;
};

type FocusSnap = {
  mol: Molecule;
  seedsKey: string;
  pin: string[] | null;
  prevAtomIds: ReadonlySet<string>;
  focus: ReturnType<typeof pickFocusFragment>;
};

export function useViewer3DSync({
  molecule,
  selectedAtomIds,
  selectedBondIds = [],
  setSelectedAtomIds,
  batchWorkerWaitRef,
  enabled = true,
}: UseViewer3DSyncOptions) {
  const worker3dRef = useRef<MoleculeWorkerClient<
    Molecule3dWorkerRequest,
    Molecule3dWorkerResponse
  > | null>(null);

  const [viewer3DMolblock, setViewer3DMolblock] = useState('');
  const [viewer3DShowHydrogens, setViewer3DShowHydrogens] = useState(true);
  const [viewer3DSource, setViewer3DSource] = useState('');
  const [viewer3DEnergy, setViewer3DEnergy] = useState<number | null>(null);
  const [viewer3DComputeStatus, setViewer3DComputeStatus] =
    useState<Viewer3DComputeStatus>('idle');
  const [viewer3DHeavyCount, setViewer3DHeavyCount] = useState(0);
  const [viewer3DLinkHint, setViewer3DLinkHint] = useState('');
  const [viewer3DAtomIndexTo2DId, setViewer3DAtomIndexTo2DId] = useState<
    Record<number, string>
  >({});
  const [stereoIssues3D, setStereoIssues3D] = useState<StereoIssueMarker[]>([]);

  const latest3DRequestRef = useRef<string>('');
  const lastPushedMolblockRef = useRef('');
  const moleculeUpdateSeqRef = useRef(0);
  const viewer3DDebounceRef = useRef<number | null>(null);
  const viewer3DSoftTimeoutRef = useRef<number | null>(null);
  const prevMoleculeFor3DRef = useRef<Molecule | null>(null);
  const lastGood3DMolblockRef = useRef('');
  const hasOptimized3DRef = useRef(false);
  /** Keep the last 3D model on screen until GENERATE_3D finishes (no flat/shell flash). */
  const holdViewerUntilDoneRef = useRef(false);
  const last3DRequestKeyRef = useRef('');
  const flatSeedAutoRetryKeyRef = useRef('');
  const poseCacheRef = useRef(new Map<string, PoseCacheEntry>());
  const lastPerspectiveFpRef = useRef('');
  const perspectivePreviewRafRef = useRef<number | null>(null);
  const pendingPerspectivePreviewRef = useRef<string | null>(null);
  const progressive3DRafRef = useRef<number | null>(null);
  const pendingProgressive3DRef = useRef<{
    molblock: string;
    energy?: number;
    done: boolean;
    shell: number;
  } | null>(null);
  const focusMetaRef = useRef<{ reason: string; componentCount: number }>({
    reason: 'single',
    componentCount: 1,
  });
  const selectedAtomIdsRef = useRef(selectedAtomIds);
  const selectedBondIdsRef = useRef(selectedBondIds);
  useEffect(() => {
    selectedAtomIdsRef.current = selectedAtomIds;
    selectedBondIdsRef.current = selectedBondIds;
  }, [selectedAtomIds, selectedBondIds]);

  /**
   * Large lattices (COF / MOF / graphene packs) can change every animation
   * frame while a packing slider is scrubbed. Expanding instances, fingerprinting
   * ~30k atoms and re-loading 3Dmol per frame would stall the canvas, so above
   * `LARGE_SYNC_ATOMS` the 3D side follows at most every `LARGE_SYNC_INTERVAL_MS`
   * (leading + trailing edge — the final size is always synced). Small molecules
   * are untouched: `moleculeForSync === molecule`.
   */
  const displayedAtomCount = useMemo(() => {
    let n = molecule.atoms.length;
    for (const arr of molecule.instanceArrays ?? []) n += arr.sites.length * arr.seedAtomIds.length;
    return n;
  }, [molecule]);
  const throttleSync = displayedAtomCount > LARGE_SYNC_ATOMS;
  // `armed` = the held molecule is being kept current by the timer below. While
  // not armed (small molecules, or the first render after crossing the size
  // threshold) the live molecule is used directly, so nothing stale ever shows.
  const [heldSync, setHeldSync] = useState<{ mol: Molecule; armed: boolean }>(() => ({
    mol: molecule,
    armed: false,
  }));
  const latestMoleculeRef = useRef(molecule);
  const lastLargeSyncAtRef = useRef(0);
  useEffect(() => {
    latestMoleculeRef.current = molecule;
  }, [molecule]);
  const moleculeForSync = throttleSync && heldSync.armed ? heldSync.mol : molecule;
  useEffect(() => {
    if (!throttleSync) {
      if (!heldSync.armed) return;
      const t = window.setTimeout(() => {
        setHeldSync(prev => (prev.armed ? { mol: prev.mol, armed: false } : prev));
      }, 0);
      return () => window.clearTimeout(t);
    }
    if (heldSync.armed && heldSync.mol === molecule) return;
    // Trailing-edge throttle: every change re-arms the timer for the remainder
    // of the interval since the last sync, so a fast scrub lands ~8×/s and the
    // final size always lands within one interval.
    const wait = heldSync.armed
      ? Math.max(0, LARGE_SYNC_INTERVAL_MS - (performance.now() - lastLargeSyncAtRef.current))
      : 0;
    const t = window.setTimeout(() => {
      lastLargeSyncAtRef.current = performance.now();
      setHeldSync({ mol: latestMoleculeRef.current, armed: true });
    }, wait);
    return () => window.clearTimeout(t);
  }, [throttleSync, heldSync, molecule]);

  /** Expand InstanceArrays so 3D never sees compact seed-only chemistry. */
  const molecule3d = useMemo(() => expandInstanceArrays(moleculeForSync), [moleculeForSync]);
  const molecule3dRef = useRef(molecule3d);
  useEffect(() => {
    molecule3dRef.current = molecule3d;
  }, [molecule3d]);

  const commitViewerMolblock = useCallback((mb: string) => {
    lastPushedMolblockRef.current = mb;
    setViewer3DMolblock(prev => (prev === mb ? prev : mb));
  }, []);

  const focusSeeds = useMemo(
    () => focusSeedAtomIds(molecule3d, selectedAtomIds, selectedBondIds),
    [molecule3d, selectedAtomIds, selectedBondIds],
  );
  const focusSeedsKey = focusSeeds.join('\0');
  const pickedFocus = useMemo(
    () => focusCofStackOrFragment(molecule3d, focusSeeds),
    [molecule3d, focusSeeds],
  );

  const [focusSnap, setFocusSnap] = useState<FocusSnap>(() => {
    const { focus, pin } = retainPinnedFocus(molecule3d, pickedFocus, null, new Set());
    return {
      mol: molecule3d,
      seedsKey: focusSeedsKey,
      pin,
      prevAtomIds: new Set(molecule3d.atoms.map(a => a.id)),
      focus,
    };
  });

  let displayFocus = focusSnap.focus;
  if (focusSnap.mol !== molecule3d || focusSnap.seedsKey !== focusSeedsKey) {
    const { focus, pin } = retainPinnedFocus(
      molecule3d,
      pickedFocus,
      focusSnap.pin,
      focusSnap.prevAtomIds,
    );
    displayFocus = focus;
    setFocusSnap({
      mol: molecule3d,
      seedsKey: focusSeedsKey,
      pin,
      prevAtomIds: new Set(molecule3d.atoms.map(a => a.id)),
      focus,
    });
  }
  const displayFocusRef = useRef(displayFocus);
  useEffect(() => {
    displayFocusRef.current = displayFocus;
  }, [displayFocus]);

  /**
   * One fingerprint pass per molecule revision. `structureKeyFor3D` sorts every
   * bond, so on a 30k-atom lattice computing it 4–5× per render (as the effect,
   * the stereo hints and the sync key used to) was the dominant main-thread cost.
   */
  const syncKeys = useMemo(() => {
    const fragmentKey = structureKeyFor3D(displayFocus.fragment);
    if (molecule3d.atoms.length === 0) {
      return { fragmentKey, molFor3D: displayFocus.fragment, requestKey: '', zFp: '' };
    }
    const molFor3D = expandAliasesFor3D(displayFocus.fragment);
    const requestKey = `${fragmentKey}>${structureKeyFor3D(molFor3D)}`;
    const zFp = perspectiveZFingerprint({
      ...displayFocus.fragment,
      perspective3D: molecule3d.perspective3D,
    });
    return { fragmentKey, molFor3D, requestKey, zFp };
  }, [molecule3d, displayFocus]);
  /** Changes only when 3D must rebuild — ignores 2D x/y layout and canvas clicks. */
  const chemSyncKey = syncKeys.requestKey ? `${syncKeys.requestKey}::${syncKeys.zFp}` : '';

  const rememberPose = useCallback((key: string, entry: PoseCacheEntry) => {
    if (!key || !entry.molblock.trim()) return;
    const cache = poseCacheRef.current;
    if (cache.has(key)) cache.delete(key);
    cache.set(key, entry);
    const MAX_POSE_CACHE = 24;
    while (cache.size > MAX_POSE_CACHE) {
      const oldest = cache.keys().next().value;
      if (oldest == null) break;
      cache.delete(oldest);
    }
  }, []);

  const stereoHintsKey = syncKeys.fragmentKey;
  const stereoHints3D = useMemo(
    () =>
      displayFocus.fragment.bonds
        .filter(
          (b): b is Bond & { stereo: 'wedge' | 'dash' } =>
            b.stereo === 'wedge' || b.stereo === 'dash',
        )
        .map(b => ({
          fromAtomIdx: displayFocus.fragment.atoms.findIndex(a => a.id === b.fromAtomId),
          toAtomIdx: displayFocus.fragment.atoms.findIndex(a => a.id === b.toAtomId),
          stereo: b.stereo,
        }))
        .filter(s => s.fromAtomIdx >= 0 && s.toAtomIdx >= 0),
    // Layout-only 2D moves keep this key stable so 3D props do not churn.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [stereoHintsKey],
  );

  const selected3DAtomIndices = useMemo(() => {
    const selectedSet = new Set(selectedAtomIds);
    return Object.entries(viewer3DAtomIndexTo2DId)
      .filter(([, atomId]) => selectedSet.has(atomId))
      .map(([idx]) => Number(idx))
      .filter(Number.isFinite);
  }, [selectedAtomIds, viewer3DAtomIndexTo2DId]);

  const handle3DAtomPick = useCallback(
    (pick: { atomIndex: number; modelIndex: number; element?: string }) => {
      if (pick.modelIndex !== 0 || pick.atomIndex < 0) return;
      const mappedId = viewer3DAtomIndexTo2DId[pick.atomIndex];
      if (mappedId) {
        setSelectedAtomIds([mappedId]);
        setViewer3DLinkHint('');
        return;
      }
      if (viewer3DSource.includes('multifragment') || pick.element === 'H') {
        setViewer3DLinkHint('3D picked atom has no direct 2D anchor.');
        return;
      }
      setViewer3DLinkHint('Selection mapping unavailable for this 3D atom.');
    },
    [viewer3DAtomIndexTo2DId, viewer3DSource, setSelectedAtomIds],
  );

  const applyExternal3DPose = useCallback(
    (molblock: string, sourceLabel: string, energyKcal?: number | null) => {
      commitViewerMolblock(molblock);
      setViewer3DSource(sourceLabel);
      setViewer3DEnergy(
        typeof energyKcal === 'number' && Number.isFinite(energyKcal)
          ? energyKcal
          : null,
      );
      setViewer3DComputeStatus('ready');
      setStereoIssues3D([]);
      if (molblock.trim()) {
        lastGood3DMolblockRef.current = molblock;
        hasOptimized3DRef.current = true;
        const key = last3DRequestKeyRef.current;
        if (key) {
          rememberPose(key, {
            molblock,
            energy:
              typeof energyKcal === 'number' && Number.isFinite(energyKcal)
                ? energyKcal
                : null,
            source: sourceLabel,
          });
        }
      }
    },
    [rememberPose, commitViewerMolblock],
  );

  /**
   * Live canvas perspective / drag preview → right 3D panel (rAF-throttled).
   * Does not rewrite chemistry pose-cache keys so a later structure edit can still re-embed.
   */
  const applyPerspectivePreviewMolblock = useCallback((molblock: string) => {
    if (!molblock.trim()) return;
    pendingPerspectivePreviewRef.current = molblock;
    if (perspectivePreviewRafRef.current != null) return;
    perspectivePreviewRafRef.current = window.requestAnimationFrame(() => {
      perspectivePreviewRafRef.current = null;
      const mb = pendingPerspectivePreviewRef.current;
      pendingPerspectivePreviewRef.current = null;
      if (!mb || mb === lastPushedMolblockRef.current) return;
      commitViewerMolblock(mb);
      lastGood3DMolblockRef.current = mb;
      hasOptimized3DRef.current = true;
      setViewer3DSource(prev => (prev === 'canvas-perspective' ? prev : 'canvas-perspective'));
      setViewer3DComputeStatus(prev => (prev === 'ready' ? prev : 'ready'));
      setViewer3DEnergy(prev => (prev == null ? prev : null));
    });
  }, [commitViewerMolblock]);

  const handleRebuild3D = useCallback(() => {
    const worker = worker3dRef.current;
    const molNow = molecule3dRef.current;
    if (!enabled || !worker || molNow.atoms.length === 0) return;
    const focusNow = displayFocusRef.current;
    focusMetaRef.current = {
      reason: focusNow.reason,
      componentCount: focusNow.componentCount,
    };
    const molFor3D = expandAliasesFor3D(focusNow.fragment);
    if (cofStackAtomIds(molNow)) {
      const fragForPose: Molecule = {
        ...focusNow.fragment,
        perspective3D: molNow.perspective3D,
      };
      const templateMb =
        molblock3DFromPerspectivePose(fragForPose) ?? engine.toMolblock(molFor3D);
      applyPerspectivePreviewMolblock(templateMb);
      setViewer3DSource('canvas-perspective');
      setViewer3DEnergy(null);
      setViewer3DComputeStatus('ready');
      setStereoIssues3D([]);
      lastGood3DMolblockRef.current = templateMb;
      last3DRequestKeyRef.current = `${structureKeyFor3D(focusNow.fragment)}>${structureKeyFor3D(molFor3D)}`;
      prevMoleculeFor3DRef.current = molFor3D;
      hasOptimized3DRef.current = true;
      return;
    }
    const expandedMolBlock = engine.toMolblock(molFor3D);
    const heavyCount = molFor3D.atoms.filter(a => a.element !== 'H').length;
    const chemKey = `${structureKeyFor3D(focusNow.fragment)}>${structureKeyFor3D(molFor3D)}`;
    poseCacheRef.current.delete(chemKey);
    const keepOnScreen = hasOptimized3DRef.current && !!lastGood3DMolblockRef.current;
    holdViewerUntilDoneRef.current = true;
    if (!keepOnScreen) {
      hasOptimized3DRef.current = false;
      setViewer3DSource(
        `computing${focusSourceSuffix(focusNow.reason, focusNow.componentCount)}`,
      );
    }
    setViewer3DEnergy(null);
    setViewer3DComputeStatus('computing');
    setStereoIssues3D([]);
    last3DRequestKeyRef.current = '';
    prevMoleculeFor3DRef.current = null;
    if (viewer3DDebounceRef.current != null) {
      window.clearTimeout(viewer3DDebounceRef.current);
      viewer3DDebounceRef.current = null;
    }
    if (viewer3DSoftTimeoutRef.current != null) {
      window.clearTimeout(viewer3DSoftTimeoutRef.current);
      viewer3DSoftTimeoutRef.current = null;
    }
    const nextSeq = ++moleculeUpdateSeqRef.current;
    const id = `gen3d-rebuild-${nextSeq}-${Date.now()}`;
    latest3DRequestRef.current = id;
    last3DRequestKeyRef.current = chemKey;
    worker.post({
      type: 'GENERATE_3D',
      payload: {
        molBlock: expandedMolBlock,
        fallbackMolBlock: engine.toMolblock(focusNow.fragment),
        includeHydrogens: true,
        sequence: nextSeq,
        heavyAtomHint: heavyCount,
        progressive: true,
      },
      id,
    });
    viewer3DSoftTimeoutRef.current = window.setTimeout(() => {
      if (latest3DRequestRef.current !== id) return;
      setViewer3DComputeStatus(prev => (prev === 'computing' ? 'preview' : prev));
      viewer3DSoftTimeoutRef.current = null;
    }, 12000);
  }, [enabled, applyPerspectivePreviewMolblock, commitViewerMolblock]);

  useEffect(() => {
    if (!enabled) {
      worker3dRef.current = null;
      return;
    }

    const client3d = createMoleculeWorkerClient<
      Molecule3dWorkerRequest,
      Molecule3dWorkerResponse
    >(new Molecule3DWorker());
    worker3dRef.current = client3d;

    const unsubscribe = client3d.onMessage((msg: Molecule3dWorkerResponse) => {
      const suffix = focusSourceSuffix(
        focusMetaRef.current.reason,
        focusMetaRef.current.componentCount,
      );
      const cacheKey = last3DRequestKeyRef.current;
      if (msg.type === 'GENERATE_3D_PROGRESS') {
        if (msg.id !== latest3DRequestRef.current) return;
        const mb = msg.payload.molBlock3D || '';
        if (!mb) return;
        if (msg.payload.done || (msg.payload.shell ?? 0) >= 2) {
          hasOptimized3DRef.current = true;
        }
        pendingProgressive3DRef.current = {
          molblock: mb,
          energy: msg.payload.energy,
          done: !!msg.payload.done,
          shell: msg.payload.shell ?? 0,
        };
        if (progressive3DRafRef.current != null) return;
        progressive3DRafRef.current = window.requestAnimationFrame(() => {
          progressive3DRafRef.current = null;
          const pending = pendingProgressive3DRef.current;
          if (!pending) return;
          pendingProgressive3DRef.current = null;
          if (holdViewerUntilDoneRef.current && !pending.done && (pending.shell ?? 0) < 2) {
            setViewer3DComputeStatus('computing');
            return;
          }
          holdViewerUntilDoneRef.current = false;
          commitViewerMolblock(pending.molblock);
          lastGood3DMolblockRef.current = pending.molblock;
          const src = `native-3d-progressive${suffix}`;
          setViewer3DSource(src);
          if (typeof pending.energy === 'number') setViewer3DEnergy(pending.energy);
          setViewer3DComputeStatus(pending.done ? 'ready' : 'computing');
          if (pending.done) {
            setStereoIssues3D([]);
            rememberPose(cacheKey, {
              molblock: pending.molblock,
              energy: typeof pending.energy === 'number' ? pending.energy : null,
              source: 'native-3d-progressive',
            });
          }
        });
      } else if (msg.type === 'GENERATE_3D_SUCCESS') {
        const batchWait = batchWorkerWaitRef.current.get(msg.id);
        if (batchWait) {
          batchWorkerWaitRef.current.delete(msg.id);
          batchWait.resolve(msg.payload);
          return;
        }
        if (msg.id !== latest3DRequestRef.current) return;
        holdViewerUntilDoneRef.current = false;
        if (viewer3DSoftTimeoutRef.current != null) {
          window.clearTimeout(viewer3DSoftTimeoutRef.current);
          viewer3DSoftTimeoutRef.current = null;
        }
        if (progressive3DRafRef.current != null) {
          window.cancelAnimationFrame(progressive3DRafRef.current);
          progressive3DRafRef.current = null;
        }
        pendingProgressive3DRef.current = null;
        const mb = msg.payload.molBlock3D || '';
        commitViewerMolblock(mb);
        if (mb) lastGood3DMolblockRef.current = mb;
        const baseSrc = msg.payload.source || 'native-3d';
        const src = `${baseSrc}${suffix}`;
        setViewer3DSource(src);
        hasOptimized3DRef.current = !!mb && isOptimized3DSource(src);
        const energy =
          typeof msg.payload.energy === 'number' ? msg.payload.energy : null;
        setViewer3DEnergy(energy);
        setStereoIssues3D([]);
        setViewer3DComputeStatus(
          !mb
            ? 'error'
            : msg.payload.source === 'native-3d-light' ||
                msg.payload.source === 'native-3d-large'
              ? 'large'
              : msg.payload.source === 'native-3d-fallback'
                ? 'preview'
                : 'ready',
        );
        if (mb) {
          rememberPose(cacheKey, { molblock: mb, energy, source: baseSrc });
        }
      } else if (msg.type === 'GENERATE_3D_ERROR') {
        const batchWait = batchWorkerWaitRef.current.get(msg.id);
        if (batchWait) {
          batchWorkerWaitRef.current.delete(msg.id);
          batchWait.reject(new Error(msg.error));
          return;
        }
        if (msg.id !== latest3DRequestRef.current) return;
        holdViewerUntilDoneRef.current = false;
        if (viewer3DSoftTimeoutRef.current != null) {
          window.clearTimeout(viewer3DSoftTimeoutRef.current);
          viewer3DSoftTimeoutRef.current = null;
        }
        console.warn('GENERATE_3D_ERROR (kept preview):', msg.error);
        if (lastGood3DMolblockRef.current) {
          commitViewerMolblock(lastGood3DMolblockRef.current);
          setViewer3DComputeStatus('preview');
        } else {
          setViewer3DComputeStatus(prev => (prev === 'idle' ? 'error' : 'preview'));
        }
      }
    });

    client3d.post({ type: 'INIT', id: 'init-3d' });

    return () => {
      if (progressive3DRafRef.current != null) {
        window.cancelAnimationFrame(progressive3DRafRef.current);
        progressive3DRafRef.current = null;
      }
      if (perspectivePreviewRafRef.current != null) {
        window.cancelAnimationFrame(perspectivePreviewRafRef.current);
        perspectivePreviewRafRef.current = null;
      }
      pendingProgressive3DRef.current = null;
      pendingPerspectivePreviewRef.current = null;
      last3DRequestKeyRef.current = '';
      lastPerspectiveFpRef.current = '';
      unsubscribe();
      client3d.terminate();
      worker3dRef.current = null;
    };
  }, [batchWorkerWaitRef, enabled, rememberPose, commitViewerMolblock]);

  /* eslint-disable react-hooks/set-state-in-effect -- mirrors molecule document into 3D viewer state */
  useEffect(() => {
    if (!enabled) return;
    const worker = worker3dRef.current;
    if (!worker) return;
    if (molecule3d.atoms.length === 0) {
      commitViewerMolblock('');
      setViewer3DSource('');
      setViewer3DEnergy(null);
      setViewer3DComputeStatus('idle');
      setViewer3DHeavyCount(0);
      setViewer3DAtomIndexTo2DId({});
      setStereoIssues3D([]);
      last3DRequestKeyRef.current = '';
      lastPerspectiveFpRef.current = '';
      prevMoleculeFor3DRef.current = null;
      lastGood3DMolblockRef.current = '';
      hasOptimized3DRef.current = false;
      holdViewerUntilDoneRef.current = false;
      flatSeedAutoRetryKeyRef.current = '';
      poseCacheRef.current.clear();
      if (viewer3DDebounceRef.current != null) {
        window.clearTimeout(viewer3DDebounceRef.current);
        viewer3DDebounceRef.current = null;
      }
      if (viewer3DSoftTimeoutRef.current != null) {
        window.clearTimeout(viewer3DSoftTimeoutRef.current);
        viewer3DSoftTimeoutRef.current = null;
      }
      return;
    }

    const focusNow = displayFocus;
    const stackIds = cofStackAtomIds(molecule3d);
    focusMetaRef.current = {
      reason: focusNow.reason,
      componentCount: focusNow.componentCount,
    };
    // Fingerprint unexpanded + expanded: FG/alias label edits must invalidate
    // even when expandAliasesFor3D clears aliases on the expanded graph.
    // (Computed once per revision in `syncKeys`; chemSyncKey is derived from it.)
    const { molFor3D, requestKey, zFp } = syncKeys;

    const fragForPose: Molecule = {
      ...focusNow.fragment,
      perspective3D: molecule3d.perspective3D,
    };
    const chemistryUnchanged = requestKey === last3DRequestKeyRef.current;
    const zUnchanged = zFp === lastPerspectiveFpRef.current;

    // 2D move / rotate / scale: same chemistry and same 3D depths — keep the viewer.
    if (chemistryUnchanged && zUnchanged) {
      prevMoleculeFor3DRef.current = molFor3D;
      return;
    }

    const indexMap: Record<number, string> = {};
    for (let i = 0; i < molFor3D.atoms.length; i++) {
      indexMap[i] = molFor3D.atoms[i].id;
    }
    setViewer3DAtomIndexTo2DId(prev => (atomIndexMapEqual(prev, indexMap) ? prev : indexMap));

    // Same graph, 3D depth changed (3D Clean Up or Perspective orbit).
    if (chemistryUnchanged && zFp && !zUnchanged) {
      const poseMb = molblock3DFromPerspectivePose(fragForPose);
      if (poseMb) {
        lastPerspectiveFpRef.current = zFp;
        applyPerspectivePreviewMolblock(poseMb);
        rememberPose(requestKey, {
          molblock: poseMb,
          energy: null,
          source: 'canvas-perspective',
        });
        last3DRequestKeyRef.current = requestKey;
        prevMoleculeFor3DRef.current = molFor3D;
        if (stackIds) return;
      }
    }

    if (!zFp) {
      lastPerspectiveFpRef.current = '';
    }

    // Any COF (including a single sheet): show the 2D/pose template, no GENERATE_3D.
    if (stackIds) {
      const templateMb =
        molblock3DFromPerspectivePose(fragForPose) ?? engine.toMolblock(molFor3D);
      applyPerspectivePreviewMolblock(templateMb);
      rememberPose(requestKey, {
        molblock: templateMb,
        energy: null,
        source: 'canvas-perspective',
      });
      last3DRequestKeyRef.current = requestKey;
      lastPerspectiveFpRef.current = zFp;
      prevMoleculeFor3DRef.current = molFor3D;
      return;
    }

    if (chemistryUnchanged) {
      prevMoleculeFor3DRef.current = molFor3D;
      return;
    }

    const heavyCount = molFor3D.atoms.filter(a => a.element !== 'H').length;
    setViewer3DHeavyCount(heavyCount);
    const suffix = focusSourceSuffix(focusNow.reason, focusNow.componentCount);

    // Switch back to a previously embedded fragment without recalculating.
    const cached = poseCacheRef.current.get(requestKey);
    if (cached?.molblock) {
      commitViewerMolblock(cached.molblock);
      lastGood3DMolblockRef.current = cached.molblock;
      hasOptimized3DRef.current = isOptimized3DSource(cached.source);
      setViewer3DSource(`${cached.source}${suffix}`);
      setViewer3DEnergy(cached.energy);
      setViewer3DComputeStatus('ready');
      setStereoIssues3D([]);
      last3DRequestKeyRef.current = requestKey;
      lastPerspectiveFpRef.current = zFp;
      prevMoleculeFor3DRef.current = molFor3D;
      return;
    }

    last3DRequestKeyRef.current = requestKey;
    lastPerspectiveFpRef.current = zFp;

    // Infinity move threshold: 2D pan/drag of atoms must not dirty 3D.
    const edit = dirtyAtomIdsFromEdit(
      prevMoleculeFor3DRef.current,
      molFor3D,
      Number.POSITIVE_INFINITY,
    );
    const path = choose3DUpdatePath({
      heavyCount,
      heavyDelta: edit.heavyDelta,
      majorChange: edit.majorChange,
      topologyChanged: edit.topologyChanged,
      dirtyAtomIds: edit.dirtyAtomIds,
      hasOptimized3D: hasOptimized3DRef.current && !!lastGood3DMolblockRef.current,
      fullHeavyLimit: NATIVE_3D_FULL_HEAVY_LIMIT,
      previewHeavyLimit: NATIVE_3D_PREVIEW_HEAVY_LIMIT,
    });
    const canRegionRefine = path.kind === 'region';
    const instantMainThread = path.kind === 'region' && path.instant;
    const useProgressive = path.kind === 'progressive';
    const willRefine = path.kind === 'region' || path.kind === 'progressive';
    const expandedMolBlock = engine.toMolblock(molFor3D);

    if (instantMainThread && path.kind === 'region') {
      try {
        const result = refine3DRegion(molFor3D, {
          dirtyAtomIds: path.dirtyAtomIds,
          previousMolblock3D: lastGood3DMolblockRef.current,
          includeHydrogens: true,
          bondBuffer: 2,
          maxIterations: 28,
        });
        commitViewerMolblock(result.molblock);
        lastGood3DMolblockRef.current = result.molblock;
        hasOptimized3DRef.current = true;
        setViewer3DSource(`${result.source}${suffix}`);
        setViewer3DEnergy(typeof result.energy === 'number' ? result.energy : null);
        setViewer3DComputeStatus('ready');
        setStereoIssues3D([]);
        rememberPose(requestKey, {
          molblock: result.molblock,
          energy: typeof result.energy === 'number' ? result.energy : null,
          source: result.source,
        });
        prevMoleculeFor3DRef.current = molFor3D;
        return;
      } catch {
        holdViewerUntilDoneRef.current = true;
        setViewer3DComputeStatus('computing');
      }
    } else if (canRegionRefine) {
      if (hasOptimized3DRef.current && lastGood3DMolblockRef.current) {
        holdViewerUntilDoneRef.current = true;
      }
      setViewer3DComputeStatus('computing');
    } else if (path.kind === 'large-preview') {
      commitViewerMolblock(expandedMolBlock);
      setViewer3DSource(`preview-connectivity-large${suffix}`);
      setViewer3DEnergy(null);
      setViewer3DComputeStatus('large');
      hasOptimized3DRef.current = false;
    } else if (useProgressive) {
      holdViewerUntilDoneRef.current = true;
      setViewer3DComputeStatus('computing');
      if (!(hasOptimized3DRef.current && lastGood3DMolblockRef.current)) {
        hasOptimized3DRef.current = false;
        setViewer3DSource(`computing${suffix}`);
        setViewer3DEnergy(null);
      }
    }

    if (viewer3DDebounceRef.current != null) {
      window.clearTimeout(viewer3DDebounceRef.current);
      viewer3DDebounceRef.current = null;
    }
    if (viewer3DSoftTimeoutRef.current != null) {
      window.clearTimeout(viewer3DSoftTimeoutRef.current);
      viewer3DSoftTimeoutRef.current = null;
    }
    const nextSeq = ++moleculeUpdateSeqRef.current;

    const postGenerate3D = () => {
      prevMoleculeFor3DRef.current = molFor3D;
      const id = `gen3d-${nextSeq}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      latest3DRequestRef.current = id;
      if (willRefine) {
        setViewer3DComputeStatus('computing');
      }
      const fallbackMolBlock = engine.toMolblock(focusNow.fragment);
      worker.post({
        type: 'GENERATE_3D',
        payload: {
          molBlock: expandedMolBlock,
          fallbackMolBlock,
          includeHydrogens: true,
          sequence: nextSeq,
          heavyAtomHint: heavyCount,
          progressive: true,
        },
        id,
      });
      viewer3DSoftTimeoutRef.current = window.setTimeout(() => {
        if (latest3DRequestRef.current !== id) return;
        setViewer3DComputeStatus(prev => (prev === 'computing' ? 'preview' : prev));
        viewer3DSoftTimeoutRef.current = null;
      }, 12000);
    };

    if (useProgressive) {
      postGenerate3D();
      return;
    }

    if (path.kind === 'large-preview' || path.kind === 'none') {
      prevMoleculeFor3DRef.current = molFor3D;
      return;
    }

    const debounceMs = 16;
    viewer3DDebounceRef.current = window.setTimeout(() => {
      prevMoleculeFor3DRef.current = molFor3D;
      const id = `gen3d-${nextSeq}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      latest3DRequestRef.current = id;
      if (willRefine) {
        setViewer3DComputeStatus('computing');
      }

      if (canRegionRefine && path.kind === 'region') {
        worker.post({
          type: 'REFINE_3D_REGION',
          payload: {
            molBlock: expandedMolBlock,
            previousMolBlock3D: lastGood3DMolblockRef.current,
            dirtyAtomIds: path.dirtyAtomIds,
            includeHydrogens: true,
            bondBuffer: 2,
            maxIterations: 28,
            sequence: nextSeq,
          },
          id,
        });
        viewer3DSoftTimeoutRef.current = window.setTimeout(() => {
          if (latest3DRequestRef.current !== id) return;
          setViewer3DComputeStatus(prev => (prev === 'computing' ? 'preview' : prev));
          viewer3DSoftTimeoutRef.current = null;
        }, 2500);
        return;
      }
    }, debounceMs);
    return () => {
      if (viewer3DDebounceRef.current != null) {
        window.clearTimeout(viewer3DDebounceRef.current);
        viewer3DDebounceRef.current = null;
      }
    };
    // molecule3d / focusSeeds are encoded in chemSyncKey (ignores 2D x/y).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chemSyncKey, enabled, rememberPose, applyPerspectivePreviewMolblock]);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    if (!enabled) return;
    if (cofStackAtomIds(molecule3d)) return;
    if (viewer3DSource !== 'preview-flat-seed' && !viewer3DSource.startsWith('preview-flat-seed'))
      return;
    if (molecule3d.atoms.length === 0) return;
    if (viewer3DComputeStatus === 'ready') return;
    const focusNow = displayFocus;
    const molFor3D = expandAliasesFor3D(focusNow.fragment);
    const key = `${structureKeyFor3D(focusNow.fragment)}>${structureKeyFor3D(molFor3D)}`;
    if (flatSeedAutoRetryKeyRef.current === key) return;
    const t = window.setTimeout(() => {
      if (flatSeedAutoRetryKeyRef.current === key) return;
      flatSeedAutoRetryKeyRef.current = key;
      handleRebuild3D();
    }, 1800);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 2D layout must not restart auto-retry
  }, [viewer3DSource, viewer3DComputeStatus, chemSyncKey, enabled]);

  return {
    worker3dRef,
    viewer3DMolblock,
    viewer3DShowHydrogens,
    setViewer3DShowHydrogens,
    viewer3DSource,
    viewer3DEnergy,
    viewer3DComputeStatus,
    viewer3DHeavyCount,
    viewer3DLinkHint,
    viewer3DAtomIndexTo2DId,
    stereoHints3D,
    stereoIssues3D,
    selected3DAtomIndices,
    handle3DAtomPick,
    handleRebuild3D,
    applyExternal3DPose,
    applyPerspectivePreviewMolblock,
  };
}

export type UseViewer3DSync = ReturnType<typeof useViewer3DSync>;

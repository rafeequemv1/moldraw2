/**
 * Indigo engine toolbar actions + CIP/structure-check state.
 * Extracted from App.tsx (local cleanup, automap, CIP fetch, structure handlers).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Molecule } from '@moldraw/domain';
import { ringConformationsInAtomSet } from '@moldraw/domain';
import { moleculeToMolblock } from '@moldraw/core/io/molblock';
import { structureKeyFor3D } from '@moldraw/engine-3d';
import { aromatizeMolecule } from '@moldraw/engine';
import { expandAtomIdsToConnectedFragments } from '@moldraw/canvas/geometry';
import {
  buildCleanupWorkerPayload,
  collectConnectedComponent,
} from '@moldraw/core/io/localCleanup';
import { cipTagsById, type CipStereoTags, type StructureCheckResult } from '@moldraw/engine-2d';
import { reactionSmilesSplit } from '@moldraw/core/molecule/partition';
import { CMD } from '@moldraw/core/commands/registry';
import type { CommandResult } from '@moldraw/core/commands';
import type { MoleculeWorkerClient } from '@moldraw/core/moleculeWorker/client';

export interface UseIndigoEngineActionsOptions {
  molecule: Molecule;
  moleculeRef: React.MutableRefObject<Molecule>;
  workerRef: React.MutableRefObject<MoleculeWorkerClient | null>;
  applyCommand: (commandId: string, input: unknown) => CommandResult;
  bondLengthPxRef: React.MutableRefObject<number>;
  bondLengthPx: number; // resolvedCanvasPreferences.bondLengthPx
  selectedAtomIds: string[];
  selectedBondIds?: string[];
  resetAutoCleanup: () => void;
  setShowInfoPanel: React.Dispatch<React.SetStateAction<boolean>>;
  /**
   * When false, Cleanup / local cleanup force native 2D layout (skip Indigo).
   * Default true. Aromatize/dearomatize run natively; CIP still uses the worker.
   */
  preferIndigo2d?: boolean;
  /** When true, fetch and expose CIP tags for canvas labels. Default false. */
  showCipLabels?: boolean;
}

export function useIndigoEngineActions(opts: UseIndigoEngineActionsOptions) {
  const {
    molecule,
    moleculeRef,
    workerRef,
    applyCommand,
    bondLengthPxRef,
    bondLengthPx,
    selectedAtomIds,
    selectedBondIds = [],
    resetAutoCleanup,
    setShowInfoPanel,
    preferIndigo2d = true,
    showCipLabels = false,
  } = opts;

  /**
   * Pending local-cleanup requests sent to the molecule engine worker. Keyed by the
   * message `id` we generate (`cleanup-local:<token>`); value is the ordered
   * subset of atom IDs in the SAME order they were written into the molblock,
   * so the response can be spliced back by index.
   */
  const localCleanupRequestsRef = useRef<Map<string, string[]>>(new Map());
  /** Pending automap: reactant/product atom ids in molblock write order. */
  const automapPendingRef = useRef<{
    reactAtomIds: string[];
    prodAtomIds: string[];
  } | null>(null);
  /** Clears if CLEANUP_* never returns (dead worker / stuck Indigo load). */
  const cleanupWatchdogRef = useRef<number | null>(null);
  const clearCleanupWatchdogRef = useRef(() => {
    if (cleanupWatchdogRef.current != null) {
      window.clearTimeout(cleanupWatchdogRef.current);
      cleanupWatchdogRef.current = null;
    }
  });
  const clearCleanupWatchdog = () => clearCleanupWatchdogRef.current();

  const latestStereoRequestRef = useRef<string>('');
  const [cipStereoTags, setCipStereoTags] = useState<CipStereoTags | null>(null);
  const [structureCheck, setStructureCheck] = useState<StructureCheckResult | null>(null);
  /** CIP is chemistry/stereo — ignore 2D x/y so a canvas move does not refetch labels. */
  const cipChemKey = useMemo(
    () => (showCipLabels && molecule.atoms.length > 0 ? structureKeyFor3D(molecule) : ''),
    [molecule, showCipLabels],
  );

  /**
   * Local-cleanup launcher. Discovers the connected component containing the
   * recently-touched atoms and asks the engine to re-lay it out in isolation. If
   * the component is the entire molecule we fall back to the regular global
   * cleanup channel ('cleanup' id) so the existing CLEANUP_SUCCESS path
   * handles the response. Otherwise we mint a `cleanup-local:<token>` id,
   * stash the subset's write-order atom IDs in a ref, and let the splice
   * helper put the result back without disturbing other fragments.
   */
  const runLocalCleanup = useCallback((seedAtomIds: Set<string>) => {
    const mol = moleculeRef.current;
    if (mol.atoms.length < 3) return;
    // Worker CLEANUP prefers Indigo when allowed + ready, else native.
    // Fall back to the sync native command only when the worker is missing.
    if (!workerRef.current) {
      applyCommand(CMD.Cleanup, { bondLengthPx: bondLengthPxRef.current });
      return;
    }
    const componentIds = collectConnectedComponent(mol, seedAtomIds);
    if (componentIds.length < 3) return;

    const isWholeMolecule = componentIds.length === mol.atoms.length;
    if (isWholeMolecule) {
      workerRef.current?.post({
        type: 'CLEANUP',
        payload: buildCleanupWorkerPayload(mol, {
          bondLengthPx: bondLengthPxRef.current,
          preferIndigo: preferIndigo2d,
        }),
        id: 'cleanup',
      });
      return;
    }

    const componentSet = new Set(componentIds);
    const subsetConfs = ringConformationsInAtomSet(mol, componentSet);
    const subset: Molecule = {
      atoms: mol.atoms.filter(a => componentSet.has(a.id)),
      bonds: mol.bonds.filter(
        b => componentSet.has(b.fromAtomId) && componentSet.has(b.toAtomId),
      ),
      strokes: [],
      reactionArrows: [],
      canvasTexts: [],
      ringFills: {},
      ...(subsetConfs ? { ringConformations: subsetConfs } : {}),
    };
    const reqId = `cleanup-local:${Math.random().toString(36).slice(2, 9)}`;
    localCleanupRequestsRef.current.set(reqId, componentIds);
    workerRef.current?.post({
      type: 'CLEANUP',
      payload: buildCleanupWorkerPayload(subset, {
        bondLengthPx: bondLengthPxRef.current,
        preferIndigo: preferIndigo2d,
      }),
      id: reqId,
    });
  }, [applyCommand, moleculeRef, workerRef, bondLengthPxRef, preferIndigo2d]);

  /* eslint-disable react-hooks/set-state-in-effect -- CIP tags come from the 2D worker */
  useEffect(() => {
    const worker = workerRef.current;
    if (!showCipLabels || !worker || !preferIndigo2d) {
      if (!showCipLabels || !preferIndigo2d) setCipStereoTags(null);
      return;
    }
    if (!cipChemKey) {
      setCipStereoTags(null);
      return;
    }
    const id = `stereo-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    latestStereoRequestRef.current = id;
    worker.post({
      type: 'GET_STEREO_TAGS',
      payload: { molBlock: moleculeToMolblock(molecule) },
      id,
    });
    // molecule is read only when cipChemKey changes (layout-only 2D moves keep it stable).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cipChemKey, workerRef, preferIndigo2d, showCipLabels]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const handleCleanupStructure = useCallback(() => {
    // Prefer ref so we never clean an empty stale render closure.
    const mol = moleculeRef.current;
    if (mol.atoms.length === 0) {
      alert('Nothing to clean up — draw or import a structure first.');
      return;
    }
    const worker = workerRef.current;
    // Always use the worker for Cleanup (Indigo loads there). Sync CMD.Cleanup
    // has no WASM on the main thread and used to fail silently.
    if (worker) {
      if (cleanupWatchdogRef.current != null) {
        window.clearTimeout(cleanupWatchdogRef.current);
      }
      cleanupWatchdogRef.current = window.setTimeout(() => {
        cleanupWatchdogRef.current = null;
        alert(
          preferIndigo2d
            ? 'Cleanup is taking too long. The 2D worker may still be loading Indigo — try again in a few seconds, or hard-refresh (Ctrl+F5).'
            : 'Native cleanup is taking too long. Try a smaller structure, or hard-refresh (Ctrl+F5).',
        );
      }, 20000);
      worker.post({
        type: 'CLEANUP',
        payload: buildCleanupWorkerPayload(mol, {
          bondLengthPx: bondLengthPx,
          preferIndigo: preferIndigo2d,
        }),
        id: 'cleanup',
      });
      resetAutoCleanup();
      return;
    }
    const result = applyCommand(CMD.Cleanup, {
      bondLengthPx: bondLengthPx,
    });
    if (!result.ok) {
      alert(result.error?.message ?? 'Cleanup failed — structure worker is not ready.');
    }
    resetAutoCleanup();
  }, [resetAutoCleanup, applyCommand, bondLengthPx, workerRef, moleculeRef, preferIndigo2d]);

  const handleAromatize = useCallback(
    (mode: 'aromatize' | 'dearomatize') => {
      const mol = moleculeRef.current;
      if (mol.atoms.length === 0) return;
      const next = aromatizeMolecule(mol, mode);
      const molBlock = moleculeToMolblock(next);
      const seeds = [...selectedAtomIds];
      for (const bid of selectedBondIds) {
        const b = mol.bonds.find(x => x.id === bid);
        if (b) {
          seeds.push(b.fromAtomId, b.toAtomId);
        }
      }
      const atomIds =
        seeds.length > 0 ? expandAtomIdsToConnectedFragments(mol, seeds) : undefined;
      const result = applyCommand(CMD.Aromatize, {
        mode,
        molBlock,
        ...(atomIds && atomIds.length > 0 ? { atomIds } : {}),
      });
      if (!result.ok) {
        alert(result.error?.message ?? 'Aromatize/dearomatize failed');
      }
    },
    [applyCommand, moleculeRef, selectedAtomIds, selectedBondIds],
  );

  /**
   * Top-bar H: Indigo convert_explicit_hydrogens (auto = unfold if no H, else fold).
   * Replaces the old display-only implicit-H preference toggle.
   */
  const handleToggleExplicitHydrogens = useCallback(
    (opts?: { mode?: 'fold' | 'unfold' | 'auto'; cleanupAfter?: boolean }) => {
      const fromClick = opts != null && typeof opts === 'object' && 'nativeEvent' in opts;
      const mode = fromClick ? 'auto' : (opts?.mode ?? 'auto');
      const cleanupAfter = fromClick ? false : Boolean(opts?.cleanupAfter);
      const mol = moleculeRef.current;
      if (mol.atoms.length === 0) {
        alert('Nothing to convert — draw or import a structure first.');
        return;
      }
      if (!preferIndigo2d) {
        alert(
          'Explicit H fold/unfold needs Indigo. Turn on “Prefer Indigo for 2D layout” in Settings.',
        );
        return;
      }
      const worker = workerRef.current;
      if (!worker) {
        alert('Structure worker is not ready.');
        return;
      }
      worker.post({
        type: 'CONVERT_EXPLICIT_HYDROGENS',
        payload: { molBlock: moleculeToMolblock(mol), mode },
        id: cleanupAfter ? 'explicit-hydrogens-cleanup' : 'explicit-hydrogens',
      });
    },
    [moleculeRef, workerRef, preferIndigo2d],
  );

  const handleCheckStructure = useCallback(() => {
    if (molecule.atoms.length === 0) return;
    const worker = workerRef.current;
    if (!worker) {
      alert('Structure worker is not ready.');
      return;
    }
    worker.post({
      type: 'CHECK_STRUCTURE',
      payload: { molBlock: moleculeToMolblock(molecule) },
      id: 'check-structure',
    });
    if (selectedAtomIds.length > 0) setShowInfoPanel(true);
  }, [molecule, selectedAtomIds.length, workerRef, setShowInfoPanel]);

  const handleAutomap = useCallback((requestId = 'automap'): boolean => {
    if (molecule.atoms.length === 0) return false;
    const worker = workerRef.current;
    if (!worker) {
      if (!requestId.startsWith('ai-')) alert('Structure worker is not ready.');
      return false;
    }
    const split = reactionSmilesSplit(molecule);
    if (!split) {
      if (!requestId.startsWith('ai-')) {
        alert(
          'Automap needs reactants and products separated by a reaction arrow.\n\nTip: click the beaker button to insert a demo reaction, then Automap.',
        );
      }
      return false;
    }
    automapPendingRef.current = {
      reactAtomIds: split.reactMol.atoms.map(a => a.id),
      prodAtomIds: split.prodMol.atoms.map(a => a.id),
    };
    worker.post({
      type: 'AUTOMAP',
      payload: {
        input: '',
        mode: 'discard',
        reactMolBlock: moleculeToMolblock(split.reactMol),
        prodMolBlock: moleculeToMolblock(split.prodMol),
      },
      id: requestId,
    });
    return true;
  }, [molecule, workerRef]);

  const handleInsertAutomapDemo = useCallback(() => {
    const worker = workerRef.current;
    if (!worker) {
      alert('Structure worker is not ready.');
      return;
    }
    worker.post({ type: 'AUTOMAP_DEMO', id: 'automap-demo' });
  }, [workerRef]);

  const cipLabelMaps = useMemo(() => {
    if (!cipStereoTags) return { atoms: null as Map<string, string> | null, bonds: null as Map<string, string> | null };
    const mapped = cipTagsById(
      cipStereoTags,
      molecule.atoms.map(a => a.id),
      molecule.bonds.map(b => b.id),
    );
    return {
      atoms: mapped.atoms.size > 0 ? mapped.atoms : null,
      bonds: mapped.bonds.size > 0 ? mapped.bonds : null,
    };
  }, [cipStereoTags, molecule.atoms, molecule.bonds]);

  return {
    localCleanupRequestsRef,
    automapPendingRef,
    latestStereoRequestRef,
    clearCleanupWatchdog,
    cipStereoTags,
    setCipStereoTags,
    structureCheck,
    setStructureCheck,
    cipLabelMaps,
    runLocalCleanup,
    handleCleanupStructure,
    handleAromatize,
    handleToggleExplicitHydrogens,
    handleCheckStructure,
    handleAutomap,
    handleInsertAutomapDemo,
  };
}

/**
 * ChemDraw-style canvas 3D Clean Up / Structure Perspective.
 *
 * First run: native 2D cleanup, then molecule3dWorker GENERATE_3D → apply3DPose.
 * While a pose is active ("3D cleanup mode"), Clean Up re-minimizes the
 * current 3D geometry in place: the pose seeds the embed (so ligands / cage
 * atoms the user just drew settle into proper 3D sites), and the result is
 * rigidly aligned back onto the previous pose so the orbit is kept.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Molecule } from '@moldraw/domain';
import {
  CMD,
  poseFromMolblock3D,
  hasPerspectivePose,
  isBuckminsterfullereneC60,
  buildC60SpherePose,
  alignPositionsToReference,
  displayCoordsMolecule,
  joinAtomsIntoPerspectivePose,
  perspectivePoseSeedAngstrom,
} from '@moldraw/core';
import type { CommandResult } from '@moldraw/core';
import { expandAliasesFor3D } from '@moldraw/core/expand/aliasesFor3D';
import {
  enforceStereoOnMolblock3D,
  moleculeHasStereoConstraints,
  pickFocusFragment,
} from '@moldraw/engine-3d';
import { engine } from '@moldraw/engine';
import {
  createMoleculeWorkerClient,
  type MoleculeWorkerClient,
} from '@moldraw/core/moleculeWorker/client';
import type {
  Molecule3dWorkerRequest,
  Molecule3dWorkerResponse,
} from '@moldraw/core/moleculeWorker/messages3d';
import Molecule3DWorker from '../../workers/molecule3dWorker.ts?worker';

export interface UseCanvasPerspectiveOptions {
  molecule: Molecule;
  /** Live store read after sync commands (2D cleanup updates present immediately). */
  getMolecule: () => Molecule;
  selectedAtomIds: string[];
  selectedBondIds: string[];
  applyCommand: (commandId: string, input: unknown) => CommandResult;
  setActiveTool: (tool: string) => void;
  bondLengthPx: number;
  /** Dedicated 3D worker (same as viewer); may be null when 3D pane is off. */
  worker3dRef: React.MutableRefObject<MoleculeWorkerClient<
    Molecule3dWorkerRequest,
    Molecule3dWorkerResponse
  > | null>;
  setSmilesBarHint?: (hint: string) => void;
  /** Drop atom/bond selection so 2D transform chrome does not steal the orbit drag. */
  clearSelection?: () => void;
  /**
   * Push the exact 3D conformer produced by canvas Clean Up into the right
   * viewer so the preview matches the canvas pose instead of a separate embed.
   */
  onApply3DPoseToViewer?: (
    molblock: string,
    sourceLabel: string,
    energyKcal?: number | null,
  ) => void;
}

const focusSeeds = (
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
  return [...out];
};

export function useCanvasPerspective({
  molecule,
  getMolecule,
  selectedAtomIds,
  selectedBondIds,
  applyCommand,
  setActiveTool,
  bondLengthPx,
  worker3dRef,
  setSmilesBarHint,
  onApply3DPoseToViewer,
  clearSelection,
}: UseCanvasPerspectiveOptions) {
  const [busy, setBusy] = useState(false);
  const pendingCleanUpRef = useRef<{
    requestId: string;
    atomIdsInOrder: string[];
    keepAtomIds: Set<string>;
    targetAtoms: { id: string; x: number; y: number }[];
    /** Fragment used for GENERATE_3D — stereo perception / hard-correct. */
    mol2d: Molecule;
    /** Previous pose (re-clean): align the new pose onto it to keep the orbit. */
    referencePositions: Record<string, { x: number; y: number; z: number }> | null;
  } | null>(null);
  const unsubRef = useRef<(() => void) | null>(null);
  const fallbackWorkerRef = useRef<MoleculeWorkerClient<
    Molecule3dWorkerRequest,
    Molecule3dWorkerResponse
  > | null>(null);

  useEffect(
    () => () => {
      fallbackWorkerRef.current?.terminate();
      fallbackWorkerRef.current = null;
    },
    [],
  );

  const ensureWorker3d = useCallback(() => {
    if (worker3dRef.current) return worker3dRef.current;
    if (!fallbackWorkerRef.current) {
      fallbackWorkerRef.current = createMoleculeWorkerClient<
        Molecule3dWorkerRequest,
        Molecule3dWorkerResponse
      >(new Molecule3DWorker());
    }
    return fallbackWorkerRef.current;
  }, [worker3dRef]);

  const perspectiveActive = hasPerspectivePose(molecule);

  const handleClear3DPose = useCallback(() => {
    if (!perspectiveActive) return;
    applyCommand(CMD.Clear3DPose, {});
    setActiveTool('select');
  }, [perspectiveActive, applyCommand, setActiveTool]);

  /** Flatten: write the projected pose x/y into the document, leave 3D mode. */
  const handleFlatten3DPose = useCallback(() => {
    if (!hasPerspectivePose(getMolecule())) return;
    applyCommand(CMD.Flatten3DPose, {});
    setActiveTool('select');
    setSmilesBarHint?.('Flattened — pose projected onto the 2D document');
    window.setTimeout(() => setSmilesBarHint?.(''), 2400);
  }, [getMolecule, applyCommand, setActiveTool, setSmilesBarHint]);

  const handleToggleDepthShading = useCallback(() => {
    if (!molecule.perspective3D) return;
    const next = molecule.perspective3D.depthShading === false;
    applyCommand(CMD.SetPerspectiveDepthShading, { depthShading: next });
  }, [molecule.perspective3D, applyCommand]);

  const depthFade =
    molecule.perspective3D?.depthFade == null
      ? 1
      : Math.min(1.5, Math.max(0, molecule.perspective3D.depthFade));
  const depthShadingOn = molecule.perspective3D?.depthShading !== false;
  const depthWedgesOn = molecule.perspective3D?.depthWedges === true;

  const handleDepthFadeChange = useCallback(
    (fade: number) => {
      if (!perspectiveActive) return;
      applyCommand(CMD.SetPerspectiveDepthFade, { depthFade: fade });
    },
    [perspectiveActive, applyCommand],
  );

  const handleToggleDepthWedges = useCallback(() => {
    if (!molecule.perspective3D) return;
    applyCommand(CMD.SetPerspectiveDepthWedges, {
      depthWedges: molecule.perspective3D.depthWedges !== true,
    });
  }, [molecule.perspective3D, applyCommand]);

  const handleRotate3DPoseCommit = useCallback(
    (dAngleX: number, dAngleY: number) => {
      if (!hasPerspectivePose(getMolecule())) return;
      applyCommand(CMD.Rotate3DPose, { dAngleX, dAngleY });
    },
    [getMolecule, applyCommand],
  );

  /**
   * ChemDraw-like pipeline: tidy 2D first, then embed → Structure Perspective.
   * Native 2D cleanup (sync) so we never race the Indigo worker listener.
   */
  const run2dCleanupBefore3d = useCallback((): Molecule | null => {
    const live = getMolecule();
    if (live.atoms.length === 0) return null;
    // Drop an old pose so cleanup edits document coords (not a stale overlay).
    if (hasPerspectivePose(live)) {
      applyCommand(CMD.Clear3DPose, {});
    }
    const cleaned = applyCommand(CMD.Cleanup, { bondLengthPx });
    if (!cleaned.ok) {
      setSmilesBarHint?.(
        cleaned.error?.message ?? '2D Clean Up before 3D failed — continuing with current layout',
      );
      window.setTimeout(() => setSmilesBarHint?.(''), 2800);
      return getMolecule();
    }
    return getMolecule();
  }, [getMolecule, applyCommand, bondLengthPx, setSmilesBarHint]);

  const handle3DCleanUp = useCallback(() => {
    const live = getMolecule();
    if (live.atoms.length === 0) return;
    if (live.cofLattices?.length) {
      setSmilesBarHint?.('COF uses the canvas template — 3D embed skipped');
      window.setTimeout(() => setSmilesBarHint?.(''), 2800);
      return;
    }

    setBusy(true);

    // "3D cleanup mode": a pose is active → re-minimize the current 3D geometry
    // in place. No 2D cleanup (it would scramble document coords under the
    // overlay), the pose seeds the embed, and the result is aligned back onto
    // the previous pose so the user's orbit is preserved.
    const reClean = hasPerspectivePose(live);
    const referencePositions = reClean ? { ...live.perspective3D!.positions } : null;

    let base: Molecule;
    if (reClean) {
      base = live;
    } else {
      setSmilesBarHint?.('2D Clean Up…');
      const after2d = run2dCleanupBefore3d();
      if (!after2d || after2d.atoms.length === 0) {
        setBusy(false);
        return;
      }
      base = after2d;
    }

    const seeds = focusSeeds(base, selectedAtomIds, selectedBondIds);
    const focus = pickFocusFragment(base, seeds);
    if (focus.fragment.atoms.length === 0) {
      setBusy(false);
      return;
    }

    // C₆₀: organic UFF cannot embed the cage — use spherical spring layout.
    if (isBuckminsterfullereneC60(focus.fragment)) {
      const pose = buildC60SpherePose(focus.fragment, bondLengthPx);
      if (!pose) {
        setSmilesBarHint?.('C₆₀ spherical layout failed');
        window.setTimeout(() => setSmilesBarHint?.(''), 2500);
        setBusy(false);
        return;
      }
      if (referencePositions) {
        pose.positions = alignPositionsToReference(pose.positions, referencePositions);
      }
      applyCommand(CMD.Apply3DPose, { pose });
      clearSelection?.();
      setActiveTool('perspective');
      setSmilesBarHint?.('3D Clean Up · C₆₀ spherical pose (special case)');
      window.setTimeout(() => setSmilesBarHint?.(''), 2800);
      setBusy(false);
      return;
    }

    const worker = ensureWorker3d();
    if (!worker) {
      setSmilesBarHint?.('3D Clean Up could not start the 3D worker');
      window.setTimeout(() => setSmilesBarHint?.(''), 3200);
      setBusy(false);
      return;
    }

    const keepAtomIds = new Set(focus.fragment.atoms.map(a => a.id));
    const molFor3D = expandAliasesFor3D(focus.fragment);
    const atomIdsInOrder = molFor3D.atoms.map(a => a.id);
    // Dative bonds travel as V2000 type 9 so metal–ligand identity survives
    // (donor keeps its H count; UFF treats the bond as coordination).
    const molBlock = engine.toMolblock(molFor3D, { dativeAsType9: true });
    const requestId = `canvas-3d-cleanup-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    // Re-clean: 3D seed from the pose. Atoms drawn since the last Clean Up (or
    // expanded alias atoms) get a depth from their bonded neighbours first so
    // every atom of the fragment starts in the same 3D frame.
    let seed3D: ({ x: number; y: number; z: number } | null)[] | undefined;
    let targetAtoms = focus.fragment.atoms.map(a => ({ id: a.id, x: a.x, y: a.y }));
    if (reClean && live.perspective3D) {
      const posed = joinAtomsIntoPerspectivePose(
        { ...molFor3D, perspective3D: live.perspective3D },
        atomIdsInOrder.filter(id => !live.perspective3D!.positions[id]),
      );
      seed3D = perspectivePoseSeedAngstrom(posed, atomIdsInOrder) ?? undefined;
      // Match the footprint the user currently sees (pose x/y), not the stale
      // flat document coords.
      const shown = displayCoordsMolecule(live);
      const shownById = new Map(shown.atoms.map(a => [a.id, a]));
      targetAtoms = focus.fragment.atoms.map(a => {
        const s = shownById.get(a.id);
        return { id: a.id, x: s?.x ?? a.x, y: s?.y ?? a.y };
      });
    }

    pendingCleanUpRef.current = {
      requestId,
      atomIdsInOrder,
      keepAtomIds,
      targetAtoms,
      mol2d: focus.fragment,
      referencePositions,
    };
    setSmilesBarHint?.(reClean ? 'Re-cleaning in 3D…' : '3D Clean Up…');

    unsubRef.current?.();
    unsubRef.current = worker.onMessage((msg: Molecule3dWorkerResponse) => {
      const pending = pendingCleanUpRef.current;
      if (!pending || msg.id !== pending.requestId) return;

      const finish = () => {
        pendingCleanUpRef.current = null;
        setBusy(false);
        unsubRef.current?.();
        unsubRef.current = null;
      };

      if (msg.type === 'GENERATE_3D_ERROR') {
        setSmilesBarHint?.(`3D Clean Up failed: ${msg.error}`);
        window.setTimeout(() => setSmilesBarHint?.(''), 3000);
        finish();
        return;
      }

      if (msg.type === 'GENERATE_3D_PROGRESS' && !msg.payload.done) return;

      let mb =
        msg.type === 'GENERATE_3D_SUCCESS' || msg.type === 'GENERATE_3D_PROGRESS'
          ? msg.payload.molBlock3D || ''
          : '';
      if (!mb) {
        setSmilesBarHint?.('3D Clean Up returned empty pose');
        window.setTimeout(() => setSmilesBarHint?.(''), 2500);
        finish();
        return;
      }

      // Hard-correct enantiomer / E–Z against 2D wedges before canvas mapping.
      let stereoNote = '';
      if (moleculeHasStereoConstraints(pending.mol2d)) {
        const stereoFixed = enforceStereoOnMolblock3D(
          pending.mol2d,
          mb,
          pending.atomIdsInOrder,
        );
        if (stereoFixed) {
          mb = stereoFixed.molblock;
          if (stereoFixed.verify.corrected) {
            stereoNote = stereoFixed.verify.allSatisfied
              ? ' · stereo corrected'
              : ' · stereo partially corrected';
          } else if (!stereoFixed.verify.allSatisfied) {
            stereoNote = ' · stereo warning';
          }
        }
      }

      const pose = poseFromMolblock3D(
        mb,
        pending.atomIdsInOrder,
        pending.keepAtomIds,
        pending.targetAtoms,
        bondLengthPx,
        pending.referencePositions ? { referencePositions: pending.referencePositions } : {},
      );
      if (!pose) {
        setSmilesBarHint?.('Could not map 3D pose to canvas atoms');
        window.setTimeout(() => setSmilesBarHint?.(''), 2500);
        finish();
        return;
      }

      // Re-clean: keep the user's display options (fade / depth taper) and any
      // posed atoms outside the focus fragment.
      const prevPose = getMolecule().perspective3D;
      const wasReClean = pending.referencePositions != null;
      if (wasReClean && prevPose) {
        pose.depthShading = prevPose.depthShading;
        pose.depthFade = prevPose.depthFade;
        pose.depthWedges = prevPose.depthWedges;
        for (const [id, p] of Object.entries(prevPose.positions)) {
          if (!pose.positions[id]) pose.positions[id] = p;
        }
      }

      applyCommand(CMD.Apply3DPose, { pose });
      // Mirror the exact conformer into the right viewer so the preview matches
      // the canvas pose (instead of the viewer running its own separate embed).
      const energy =
        (msg.type === 'GENERATE_3D_SUCCESS' || msg.type === 'GENERATE_3D_PROGRESS') &&
        typeof msg.payload.energy === 'number'
          ? msg.payload.energy
          : null;
      onApply3DPoseToViewer?.(mb, '3D Clean Up (canvas)', energy);
      if (wasReClean) {
        // Stay in the current drawing tool — the user is editing in 3D mode.
        setSmilesBarHint?.(`Re-cleaned in 3D — orientation kept${stereoNote}`);
      } else {
        clearSelection?.();
        setActiveTool('perspective');
        setSmilesBarHint?.(
          `3D Clean Up · Perspective tool active — drag to rotate${stereoNote}`,
        );
      }
      window.setTimeout(() => setSmilesBarHint?.(''), 2800);
      finish();
    });

    worker.post({
      type: 'GENERATE_3D',
      payload: {
        molBlock,
        fallbackMolBlock: engine.toMolblock(focus.fragment, { dativeAsType9: true }),
        includeHydrogens: true,
        sequence: Date.now() % 1_000_000,
        heavyAtomHint: molFor3D.atoms.filter(a => a.element !== 'H').length,
        progressive: true,
        ...(seed3D ? { seed3D } : {}),
      },
      id: requestId,
    });
  }, [
    getMolecule,
    run2dCleanupBefore3d,
    selectedAtomIds,
    selectedBondIds,
    worker3dRef,
    ensureWorker3d,
    clearSelection,
    bondLengthPx,
    applyCommand,
    setActiveTool,
    setSmilesBarHint,
    onApply3DPoseToViewer,
  ]);

  return {
    perspectiveActive,
    perspectiveBusy: busy,
    depthFade,
    depthShadingOn,
    depthWedgesOn,
    handle3DCleanUp,
    handleClear3DPose,
    handleFlatten3DPose,
    handleToggleDepthShading,
    handleDepthFadeChange,
    handleToggleDepthWedges,
    handleRotate3DPoseCommit,
  };
}

export type UseCanvasPerspective = ReturnType<typeof useCanvasPerspective>;

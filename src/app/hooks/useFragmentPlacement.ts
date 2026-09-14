/**
 * Fragment placement session + handlers (amino acids, functional groups, ligands, 3D cages).
 * Extracted from App.tsx (fable report 02 — hooks-first path).
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { Molecule } from '@moldraw/domain';
import { CMD } from '@moldraw/core/commands/registry';
import { buildC60SpherePose, isBuckminsterfullereneC60, normalizeMolBondLines } from '@moldraw/core';
import { parseMolblock } from '@moldraw/core/io/molblock';
import {
  PLACE_FRAGMENT_TOOL_ID,
  prepareFragmentFromSmilesMol,
  scaleFragmentToBondLength,
  type FragmentPlacementCommit,
  type FragmentPlacementSession,
} from '@moldraw/core/molecule/fragmentPlacement';
import {
  AMINO_ACID_BY_CODE,
  COF_PRESET_BY_ID,
  LIGAND_BY_ID,
  STRUCTURE_3D_BY_ID,
} from '@moldraw/templates';

/** Large scaffolds (e.g. COF pores) free-place only — no atom snap attach. */
const LARGE_TEMPLATE_ATOM_THRESHOLD = 40;

/** Avoid library card click-through placing/cancelling on the same pointer release. */
const deferAfterLibraryClose = (fn: () => void): void => {
  window.setTimeout(fn, 0);
};

export interface UseFragmentPlacementOptions {
  workerRef: React.MutableRefObject<{ post: (msg: unknown) => void } | null>; // MoleculeWorkerClient | null
  applyCommand: (commandId: string, input: unknown) => { ok: boolean; extra?: unknown; error?: { message: string } };
  activeTool: string;
  activeToolRef: React.MutableRefObject<string>;
  setActiveTool: (tool: string) => void;
  runLocalCleanup: (seedAtomIds: Set<string>) => void;
  bondLengthPx: number;
  bondAngleSnapDeg: number;
  setSelectedAtomIds: React.Dispatch<React.SetStateAction<string[]>>;
  setShowTemplateLibrary: (open: boolean) => void;
  /** Current molecule after commands (for C₆₀ sphere pose after place). */
  getMolecule: () => Molecule;
}

const fragmentFromAtomIds = (mol: Molecule, atomIds: string[]): Molecule => {
  const set = new Set(atomIds);
  return {
    ...mol,
    atoms: mol.atoms.filter(a => set.has(a.id)),
    bonds: mol.bonds.filter(b => set.has(b.fromAtomId) && set.has(b.toAtomId)),
  };
};

export function useFragmentPlacement({
  workerRef,
  applyCommand,
  activeTool,
  activeToolRef,
  setActiveTool,
  runLocalCleanup,
  bondLengthPx,
  bondAngleSnapDeg,
  setSelectedAtomIds,
  setShowTemplateLibrary,
  getMolecule,
}: UseFragmentPlacementOptions) {
  const [fragmentPlacement, setFragmentPlacement] = useState<FragmentPlacementSession | null>(null);
  const placementRestoreToolRef = useRef('select');
  /** When true, apply C₆₀ spherical Perspective pose after free place. */
  const pendingC60SphereRef = useRef(false);

  useEffect(() => {
    if (activeTool !== PLACE_FRAGMENT_TOOL_ID && fragmentPlacement) {
      setFragmentPlacement(null);
      pendingC60SphereRef.current = false;
    }
  }, [activeTool, fragmentPlacement]);

  const beginFragmentPlacement = useCallback((smiles: string, workerId: string) => {
    if (!workerRef.current) return;
    pendingC60SphereRef.current = false;
    placementRestoreToolRef.current = activeToolRef.current;
    // Arm the place-fragment tool immediately so the next canvas click is not
    // eaten by the previous bond/select tool while the molblock is converting.
    setActiveTool(PLACE_FRAGMENT_TOOL_ID);
    workerRef.current.post({
      type: 'SMILES_TO_MOLBLOCK',
      payload: { smiles },
      id: workerId,
    });
  }, [workerRef, activeToolRef, setActiveTool]);

  const beginMolblockPlacement = useCallback(
    (molblock: string, kind: 'template' | 'functional_group', asC60Sphere = false) => {
      placementRestoreToolRef.current = activeToolRef.current;
      const normalized = normalizeMolBondLines(molblock);
      const raw = parseMolblock(normalized);
      if (raw.atoms.length === 0) {
        console.warn('beginMolblockPlacement: molblock parsed with no atoms');
        return;
      }
      const scaled = scaleFragmentToBondLength(raw, bondLengthPx);
      const largeTemplate = kind === 'template' && scaled.atoms.length > LARGE_TEMPLATE_ATOM_THRESHOLD;
      const { fragment, connectionAtomId } = largeTemplate
        ? { fragment: scaled, connectionAtomId: null }
        : prepareFragmentFromSmilesMol(scaled, kind);
      pendingC60SphereRef.current = asC60Sphere || isBuckminsterfullereneC60(scaled);
      setFragmentPlacement({
        fragment,
        connectionAtomId,
        restoreTool: placementRestoreToolRef.current,
        kind,
      });
      setActiveTool(PLACE_FRAGMENT_TOOL_ID);
    },
    [activeToolRef, bondLengthPx, setActiveTool],
  );

  const handleBeginAminoPlacement = useCallback(
    (code: string) => {
      const t = AMINO_ACID_BY_CODE.get(code);
      if (!t) return;
      setShowTemplateLibrary(false);
      deferAfterLibraryClose(() => beginFragmentPlacement(t.smiles, `placement-prep:amino:${code}`));
    },
    [beginFragmentPlacement, setShowTemplateLibrary],
  );

  const handleBeginFunctionalGroupPlacement = useCallback(
    (smiles: string, _label?: string, molblock?: string | null) => {
      if (molblock?.trim()) {
        beginMolblockPlacement(molblock, 'functional_group');
        return;
      }
      beginFragmentPlacement(smiles, `placement-prep:fg:${crypto.randomUUID()}`);
    },
    [beginFragmentPlacement, beginMolblockPlacement],
  );

  const handleBeginLigandPlacement = useCallback(
    (id: string, molblock?: string | null) => {
      const t = LIGAND_BY_ID.get(id);
      if (!t) return;
      setShowTemplateLibrary(false);
      const attachable = t.smiles.includes('[*]');
      const start = () => {
        if (molblock?.trim()) {
          beginMolblockPlacement(molblock, attachable ? 'functional_group' : 'template');
          return;
        }
        const workerKind = attachable ? 'ligand' : 'structure3d';
        beginFragmentPlacement(t.smiles, `placement-prep:${workerKind}:${id}`);
      };
      // Library cards sit over the canvas — defer so the same pointer-up does
      // not free-place. Toolbar picks pass a molblock and start immediately.
      if (molblock?.trim()) start();
      else deferAfterLibraryClose(start);
    },
    [beginFragmentPlacement, beginMolblockPlacement, setShowTemplateLibrary],
  );

  const handleBeginStructure3DPlacement = useCallback(
    (id: string) => {
      const t = STRUCTURE_3D_BY_ID.get(id);
      if (!t) return;
      setShowTemplateLibrary(false);
      deferAfterLibraryClose(() => {
        if (t.molblock) {
          beginMolblockPlacement(t.molblock, 'template', id === 'c60' || !!t.coords3D);
          return;
        }
        if (t.smiles) {
          beginFragmentPlacement(t.smiles, `placement-prep:structure3d:${id}`);
        }
      });
    },
    [beginFragmentPlacement, beginMolblockPlacement, setShowTemplateLibrary],
  );

  const handleBeginCofPlacement = useCallback(
    (id: string) => {
      const preset = COF_PRESET_BY_ID.get(id);
      if (!preset?.molblock?.trim()) return;
      setShowTemplateLibrary(false);
      deferAfterLibraryClose(() => beginMolblockPlacement(preset.molblock, 'template', false));
    },
    [beginMolblockPlacement, setShowTemplateLibrary],
  );

  const handleCommitFragmentPlacement = useCallback(
    (commit: FragmentPlacementCommit) => {
      setFragmentPlacement(session => {
        if (!session) return null;
        const bondLen = bondLengthPx;
        const snapRad = (bondAngleSnapDeg * Math.PI) / 180;
        const wantC60 = pendingC60SphereRef.current;
        const result = applyCommand(CMD.CommitFragmentPlacement, {
          fragmentAtoms: session.fragment.atoms,
          fragmentBonds: session.fragment.bonds,
          connectionAtomId: session.connectionAtomId,
          placementKind: session.kind,
          commit,
          bondLengthPx: bondLen,
          bondAngleSnapRad: snapRad,
        });
        if (!result.ok) return session;
        const newAtomIds =
          (result.extra as { newAtomIds?: string[] } | undefined)?.newAtomIds ?? [];
        if (newAtomIds.length === 0) {
          return session;
        }
        setSelectedAtomIds(newAtomIds);

        if (wantC60 && commit.type === 'free') {
          pendingC60SphereRef.current = false;
          queueMicrotask(() => {
            const frag = fragmentFromAtomIds(getMolecule(), newAtomIds);
            const pose = buildC60SpherePose(frag, bondLen);
            if (pose) {
              applyCommand(CMD.Apply3DPose, { pose });
              setActiveTool('perspective');
            }
          });
          setActiveTool('perspective');
          return null;
        }

        pendingC60SphereRef.current = false;

        // Templates, AA, and FG all get a local cleanup so 2D/3D stay consistent.
        {
          const seedIds = new Set<string>(newAtomIds);
          if (commit.type === 'attach') seedIds.add(commit.targetAtomId);
          queueMicrotask(() => runLocalCleanup(seedIds));
        }

        if (session.kind === 'functional_group') {
          setActiveTool(PLACE_FRAGMENT_TOOL_ID);
          return session;
        }
        setActiveTool(session.restoreTool);
        return null;
      });
    },
    [
      bondLengthPx,
      bondAngleSnapDeg,
      applyCommand,
      runLocalCleanup,
      setSelectedAtomIds,
      setActiveTool,
      getMolecule,
    ],
  );

  return {
    fragmentPlacement,
    setFragmentPlacement,
    placementRestoreToolRef,
    beginFragmentPlacement,
    handleBeginAminoPlacement,
    handleBeginFunctionalGroupPlacement,
    handleBeginLigandPlacement,
    handleBeginStructure3DPlacement,
    handleBeginCofPlacement,
    handleCommitFragmentPlacement,
  };
}

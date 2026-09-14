/**
 * Named command registry.
 *
 * Every entry is a `MoleculeCommand` keyed by a stable string id (e.g.
 * `'molecule.addBond'`). The handlers are thin shims over the existing pure
 * mutations in `src/core/molecule/mutations.ts` so behaviour is shared with the
 * UI exactly.
 *
 * Why a registry?
 *  - **Undo/redo stays in `createMoleculeStore` / `MoleculeEditor`** — every command flows through
 *    the store so snapshots happen automatically.
 *  - **AI/MCP reuse** — `src/ai/registry.ts` reflects this surface so an agent
 *    can drive the editor with the same semantics a user click does.
 *  - **Replay / future server log** — commands are validated by Zod at the
 *    boundary, so the same payload is safe to ship over the wire later.
 */
import type { z } from 'zod';
import type { Atom, Bond, CanvasImage, CanvasShape } from '@moldraw/domain';
import { alignSelectedFragments, distributeSelectedFragments } from '../align/selectionArrange';
import * as Mut from '../molecule/mutations';
import { prepareImportFromMolblock } from '../molecule/importPrepare';
import { commitFragmentPlacement } from '../molecule/fragmentPlacement';
import { applyColorToMolecule, clearSelectionStrokeColors } from '../color/selectionColor';
import { upsertRingFillsForRings } from '@moldraw/domain';
import { validateAtomAliasForMolecule } from '@moldraw/domain';
import { getMaxLonePairsForAtom } from '@moldraw/domain';
import { expandAliasesFor3D } from '../expand/aliasesFor3D';
import { resolveCleanupBondLength, spliceLocalCleanup, mergeGlobalCleanup } from '../io/localCleanup';
import { cleanupIndigoSyncOrNull } from '@moldraw/engine-2d';
import { engine } from '@moldraw/engine';
import { schemas } from './schemas';
import type { MoleculeCommand } from './types';

const newId = () => Math.random().toString(36).slice(2, 11);

/** Stable, namespaced command ids. */
export const CMD = {
  AddAtom: 'molecule.addAtom',
  UpdateAtomElement: 'molecule.updateAtomElement',
  UpdateAtomCharge: 'molecule.updateAtomCharge',
  UpdateAtomLonePairs: 'molecule.updateAtomLonePairs',
  SetAtomIsotope: 'molecule.setAtomIsotope',
  SetAtomAlias: 'molecule.setAtomAlias',
  MoveAtoms: 'molecule.moveAtoms',
  RotateAtoms: 'molecule.rotateAtoms',
  AlignSelectedFragments: 'molecule.alignSelectedFragments',
  DistributeSelectedFragments: 'molecule.distributeSelectedFragments',
  DeleteAtoms: 'molecule.deleteAtoms',
  DeleteBonds: 'molecule.deleteBonds',
  DeleteSelection: 'molecule.deleteSelection',
  DuplicateAtoms: 'molecule.duplicateAtoms',

  AddBond: 'molecule.addBond',
  UpdateBond: 'molecule.updateBond',
  FlipBondEndpoints: 'molecule.flipBondEndpoints',
  InvertStereoAtAtom: 'molecule.invertStereoAtAtom',
  SwapAtomPositions: 'molecule.swapAtomPositions',

  AddRing: 'molecule.addRing',
  AddBoatRing: 'molecule.addBoatRing',
  AddChairRing: 'molecule.addChairRing',
  AddChain: 'molecule.addChain',

  AddStroke: 'molecule.addStroke',
  AddReactionArrow: 'molecule.addReactionArrow',
  UpdateReactionArrow: 'molecule.updateReactionArrow',
  DeleteReactionArrow: 'molecule.deleteReactionArrow',
  DuplicateReactionArrow: 'molecule.duplicateReactionArrow',
  AddReactionMultiStep: 'molecule.addReactionMultiStep',
  AddCanvasText: 'molecule.addCanvasText',
  UpdateCanvasText: 'molecule.updateCanvasText',
  DeleteCanvasText: 'molecule.deleteCanvasText',
  DuplicateCanvasText: 'molecule.duplicateCanvasText',
  DuplicateStroke: 'molecule.duplicateStroke',
  AddCanvasShape: 'molecule.addCanvasShape',
  DuplicateCanvasShape: 'molecule.duplicateCanvasShape',
  AddCanvasImage: 'molecule.addCanvasImage',
  DeleteCanvasImage: 'molecule.deleteCanvasImage',
  DuplicateCanvasImage: 'molecule.duplicateCanvasImage',

  ClearAll: 'molecule.clearAll',
  PasteFragment: 'molecule.pasteFragment',

  Erase: 'molecule.erase',
  DeleteStroke: 'molecule.deleteStroke',
  DeleteCanvasShape: 'molecule.deleteCanvasShape',
  ApplyRingFill: 'molecule.applyRingFill',
  ImportMolblock: 'molecule.importMolblock',
  ReplaceFromMolblock: 'molecule.replaceFromMolblock',
  Cleanup: 'molecule.cleanup',
  Aromatize: 'molecule.aromatize',
  ApplyAtomMaps: 'molecule.applyAtomMaps',
  ClearAtomMaps: 'molecule.clearAtomMaps',
  ImportSmiles: 'molecule.importSmiles',
  MergeImportedStructure: 'molecule.mergeImportedStructure',
  ReplaceImportedStructure: 'molecule.replaceImportedStructure',
  CommitFragmentPlacement: 'molecule.commitFragmentPlacement',
  CommitAtomAlias: 'molecule.commitAtomAlias',
  ExpandAlias: 'molecule.expandAlias',
  ApplySelectionColor: 'molecule.applySelectionColor',
  ClearSelectionColors: 'molecule.clearSelectionColors',
  ApplyCleanupResult: 'molecule.applyCleanupResult',
  InsertDemoReaction: 'molecule.insertDemoReaction',
} as const;

/** Commands that need `AiExecutionContext` async hooks; not runnable via pure `runCommand`. */
export const ASYNC_CONTEXT_COMMAND_IDS: ReadonlySet<string> = new Set([
  CMD.Cleanup,
  CMD.Aromatize,
  CMD.ImportSmiles,
]);

export type CommandId = (typeof CMD)[keyof typeof CMD];

// ─── Atom commands ─────────────────────────────────────────────────────────

const addAtomCmd: MoleculeCommand<z.infer<typeof schemas.addAtom>> = {
  id: CMD.AddAtom,
  description: 'Add a single atom (with element, position, optional charge/alias).',
  inputSchema: schemas.addAtom,
  apply: (prev, { atom }) => ({ next: Mut.addAtom(prev, atom as Atom) }),
};

const updateAtomElementCmd: MoleculeCommand<z.infer<typeof schemas.updateAtomElement>> = {
  id: CMD.UpdateAtomElement,
  description: "Change an atom's element symbol; clears alias.",
  inputSchema: schemas.updateAtomElement,
  apply: (prev, { atomId, element }) => ({ next: Mut.updateAtomElement(prev, atomId, element) }),
};

const updateAtomChargeCmd: MoleculeCommand<z.infer<typeof schemas.updateAtomCharge>> = {
  id: CMD.UpdateAtomCharge,
  description: "Increment/decrement an atom's formal charge by `delta`.",
  inputSchema: schemas.updateAtomCharge,
  apply: (prev, { atomId, delta }) => ({ next: Mut.updateAtomCharge(prev, atomId, delta) }),
};

const updateAtomLonePairsCmd: MoleculeCommand<z.infer<typeof schemas.updateAtomLonePairs>> = {
  id: CMD.UpdateAtomLonePairs,
  description: "Increment/decrement an atom's lone-pair count by `delta` (clamped to valency).",
  inputSchema: schemas.updateAtomLonePairs,
  apply: (prev, { atomId, delta }) => ({ next: Mut.updateAtomLonePairs(prev, atomId, delta) }),
};

const setAtomIsotopeCmd: MoleculeCommand<z.infer<typeof schemas.setAtomIsotope>> = {
  id: CMD.SetAtomIsotope,
  description: "Set or clear an atom's isotope mass number (e.g. 13 for 13C).",
  inputSchema: schemas.setAtomIsotope,
  apply: (prev, { atomId, isotope }) => ({ next: Mut.setAtomIsotope(prev, atomId, isotope) }),
};

const setAtomAliasCmd: MoleculeCommand<z.infer<typeof schemas.setAtomAlias>> = {
  id: CMD.SetAtomAlias,
  description: 'Set an atom alias (collapsed abbreviation like Me, Ph, Boc).',
  inputSchema: schemas.setAtomAlias,
  apply: (prev, { atomId, alias }) => ({ next: Mut.setAtomAlias(prev, atomId, alias) }),
};

const moveAtomsCmd: MoleculeCommand<z.infer<typeof schemas.moveAtoms>> = {
  id: CMD.MoveAtoms,
  description: 'Translate the given atoms by (dx, dy).',
  inputSchema: schemas.moveAtoms,
  apply: (prev, { atomIds, dx, dy }) => ({ next: Mut.moveAtoms(prev, atomIds, dx, dy) }),
};

const rotateAtomsCmd: MoleculeCommand<z.infer<typeof schemas.rotateAtoms>> = {
  id: CMD.RotateAtoms,
  description: 'Rotate atoms around (cx, cy) by `deltaRad` radians.',
  inputSchema: schemas.rotateAtoms,
  apply: (prev, { atomIds, cx, cy, deltaRad }) => ({
    next: Mut.rotateAtoms(prev, atomIds, cx, cy, deltaRad),
  }),
};

const alignSelectedFragmentsCmd: MoleculeCommand<z.infer<typeof schemas.alignSelectedFragments>> = {
  id: CMD.AlignSelectedFragments,
  description:
    'Align whole selected molecules by their top edge, center line, or bottom edge.',
  inputSchema: schemas.alignSelectedFragments,
  apply: (prev, { atomIds, mode }) => ({
    next: alignSelectedFragments(prev, atomIds, mode),
  }),
};

const distributeSelectedFragmentsCmd: MoleculeCommand<z.infer<typeof schemas.distributeSelectedFragments>> = {
  id: CMD.DistributeSelectedFragments,
  description:
    'Evenly distribute whole selected molecules horizontally or vertically by their centers.',
  inputSchema: schemas.distributeSelectedFragments,
  apply: (prev, { atomIds, axis }) => ({
    next: distributeSelectedFragments(prev, atomIds, axis),
  }),
};

const deleteAtomsCmd: MoleculeCommand<z.infer<typeof schemas.deleteAtoms>> = {
  id: CMD.DeleteAtoms,
  description: 'Delete atoms and any bonds that touch them.',
  inputSchema: schemas.deleteAtoms,
  apply: (prev, { atomIds }) => ({ next: Mut.deleteAtomSelection(prev, atomIds) }),
};

const deleteBondsCmd: MoleculeCommand<z.infer<typeof schemas.deleteBonds>> = {
  id: CMD.DeleteBonds,
  description: 'Delete bonds by id without removing their endpoint atoms.',
  inputSchema: schemas.deleteBonds,
  apply: (prev, { bondIds }) => {
    const bondSet = new Set(bondIds);
    return { next: { ...prev, bonds: prev.bonds.filter(b => !bondSet.has(b.id)) } };
  },
};

const deleteSelectionCmd: MoleculeCommand<z.infer<typeof schemas.deleteSelection>> = {
  id: CMD.DeleteSelection,
  description: 'Delete selected atoms (and incident bonds) and/or selected bonds in one undo step.',
  inputSchema: schemas.deleteSelection,
  apply: (prev, { atomIds, bondIds }) => {
    let next = prev;
    if (atomIds.length > 0) next = Mut.deleteAtomSelection(next, atomIds);
    if (bondIds.length > 0) {
      const bondSet = new Set(bondIds);
      next = { ...next, bonds: next.bonds.filter(b => !bondSet.has(b.id)) };
    }
    return { next };
  },
};

const duplicateAtomsCmd: MoleculeCommand<
  z.infer<typeof schemas.duplicateAtoms>,
  { newAtomIds: string[] }
> = {
  id: CMD.DuplicateAtoms,
  description: 'Duplicate atoms (with bonds wholly between them) shifted by (dx, dy).',
  inputSchema: schemas.duplicateAtoms,
  apply: (prev, { atomIds, dx, dy }) => {
    const r = Mut.duplicateAtoms(prev, atomIds, dx, dy);
    return { next: r.molecule, extra: { newAtomIds: r.newAtomIds } };
  },
};

// ─── Bond commands ─────────────────────────────────────────────────────────

const addBondCmd: MoleculeCommand<z.infer<typeof schemas.addBond>> = {
  id: CMD.AddBond,
  description: 'Add a bond. Rejected (no-op) if it duplicates an edge or violates valency.',
  inputSchema: schemas.addBond,
  apply: (prev, { bond }) => ({ next: Mut.addBondSafe(prev, bond as Bond) }),
};

const updateBondCmd: MoleculeCommand<z.infer<typeof schemas.updateBond>> = {
  id: CMD.UpdateBond,
  description: 'Update bond order and/or stereo. Valency-checked.',
  inputSchema: schemas.updateBond,
  apply: (prev, input) => {
    const patch: Partial<Pick<Bond, 'order' | 'stereo' | 'orderCycleRamp'>> = {};
    if (input.order !== undefined) patch.order = input.order;
    if ('stereo' in input) patch.stereo = input.stereo;
    if ('orderCycleRamp' in input) patch.orderCycleRamp = input.orderCycleRamp;
    return { next: Mut.updateBondSafe(prev, input.bondId, patch) };
  },
};

const flipBondEndpointsCmd: MoleculeCommand<z.infer<typeof schemas.flipBondEndpoints>> = {
  id: CMD.FlipBondEndpoints,
  description:
    "Swap a bond's endpoints (flips wedge/dash narrow→wide direction without changing chemistry). Used by the wedge tool's re-tap behavior.",
  inputSchema: schemas.flipBondEndpoints,
  apply: (prev, { bondId }) => ({ next: Mut.flipBondEndpoints(prev, bondId) }),
};

const invertStereoAtAtomCmd: MoleculeCommand<z.infer<typeof schemas.invertStereoAtAtom>> = {
  id: CMD.InvertStereoAtAtom,
  description:
    'Invert wedge/hash bonds around one atom (flip narrow/wide on every stereo bond incident on that center).',
  inputSchema: schemas.invertStereoAtAtom,
  apply: (prev, { atomId }) => ({ next: Mut.invertStereoAtAtom(prev, atomId) }),
};

const swapAtomPositionsCmd: MoleculeCommand<z.infer<typeof schemas.swapAtomPositions>> = {
  id: CMD.SwapAtomPositions,
  description: 'Swap the canvas positions of two atoms (interchange substituents visually).',
  inputSchema: schemas.swapAtomPositions,
  apply: (prev, { atomIdA, atomIdB }) => ({ next: Mut.swapAtomPositions(prev, atomIdA, atomIdB) }),
};

// ─── Rings / chains ────────────────────────────────────────────────────────

const addRingCmd: MoleculeCommand<z.infer<typeof schemas.addRing>> = {
  id: CMD.AddRing,
  description:
    'Add a ring (benzene = aromatic, cyclopentadiene = isCyclopentadiene). Optionally fuse via `fusedBondId` or attach via `rootAtomId`.',
  inputSchema: schemas.addRing,
  apply: (prev, params) => ({ next: Mut.addRing(prev, params) }),
};

const addBoatRingCmd: MoleculeCommand<z.infer<typeof schemas.addBoatRing>> = {
  id: CMD.AddBoatRing,
  description: 'Add a boat-conformer cyclohexane ring at `center`.',
  inputSchema: schemas.addBoatRing,
  apply: (prev, { center, bondLengthPx, rootAtomId, attachedViaBond }) => ({
    next: Mut.addBoatRing(prev, center, bondLengthPx ?? 40, rootAtomId, attachedViaBond),
  }),
};

const addChairRingCmd: MoleculeCommand<z.infer<typeof schemas.addChairRing>> = {
  id: CMD.AddChairRing,
  description: 'Add a chair-conformer cyclohexane ring at `center`.',
  inputSchema: schemas.addChairRing,
  apply: (prev, { center, bondLengthPx, rootAtomId, attachedViaBond }) => ({
    next: Mut.addChairRing(prev, center, bondLengthPx, rootAtomId, attachedViaBond),
  }),
};

const addChainCmd: MoleculeCommand<z.infer<typeof schemas.addChain>> = {
  id: CMD.AddChain,
  description: 'Add an alkyl chain through the given world points.',
  inputSchema: schemas.addChain,
  apply: (prev, { points, placementElement, startAtomId }) => ({
    next: Mut.addChain(prev, points, placementElement, startAtomId),
  }),
};

// ─── Strokes / arrows / text ───────────────────────────────────────────────

const addStrokeCmd: MoleculeCommand<z.infer<typeof schemas.addStroke>> = {
  id: CMD.AddStroke,
  description: 'Add a freehand pencil stroke.',
  inputSchema: schemas.addStroke,
  apply: (prev, { stroke }) => ({ next: Mut.addStroke(prev, stroke) }),
};

const addReactionArrowCmd: MoleculeCommand<z.infer<typeof schemas.addReactionArrow>> = {
  id: CMD.AddReactionArrow,
  description: 'Add a reaction arrow.',
  inputSchema: schemas.addReactionArrow,
  apply: (prev, { arrow }) => ({ next: Mut.addReactionArrow(prev, arrow) }),
};

const updateReactionArrowCmd: MoleculeCommand<z.infer<typeof schemas.updateReactionArrow>> = {
  id: CMD.UpdateReactionArrow,
  description: 'Patch a reaction arrow (endpoints, kind, curve controls, style).',
  inputSchema: schemas.updateReactionArrow,
  apply: (prev, { id, ...patch }) => ({
    next: Mut.updateReactionArrow(prev, id, patch),
  }),
};

const deleteReactionArrowCmd: MoleculeCommand<z.infer<typeof schemas.deleteReactionArrow>> = {
  id: CMD.DeleteReactionArrow,
  description: 'Delete a reaction arrow by id.',
  inputSchema: schemas.deleteReactionArrow,
  apply: (prev, { id }) => ({ next: Mut.deleteReactionArrow(prev, id) }),
};

const duplicateReactionArrowCmd: MoleculeCommand<
  z.infer<typeof schemas.duplicateReactionArrow>,
  { newId: string }
> = {
  id: CMD.DuplicateReactionArrow,
  description: 'Duplicate a reaction arrow shifted by (dx, dy).',
  inputSchema: schemas.duplicateReactionArrow,
  apply: (prev, { id, dx, dy }) => {
    const r = Mut.duplicateReactionArrow(prev, id, dx, dy);
    return { next: r.molecule, extra: { newId: r.newId } };
  },
};

const addReactionMultiStepCmd: MoleculeCommand<
  z.infer<typeof schemas.addReactionMultiStep>,
  { arrowIds: string[]; groupId: string }
> = {
  id: CMD.AddReactionMultiStep,
  description:
    'Add a multi-step synthesis route: horizontal row of reaction arrows with shared groupId, stepIndex, and per-step reagents/conditions (reagentAbove / reagentBelow, newline for multiple lines).',
  inputSchema: schemas.addReactionMultiStep,
  apply: (prev, input) => {
    const r = Mut.addReactionMultiStepRoute(prev, input);
    return { next: r.molecule, extra: { arrowIds: r.arrowIds, groupId: input.groupId } };
  },
};

const addCanvasTextCmd: MoleculeCommand<z.infer<typeof schemas.addCanvasText>> = {
  id: CMD.AddCanvasText,
  description: 'Add a free-floating text label on the canvas.',
  inputSchema: schemas.addCanvasText,
  apply: (prev, { text }) => ({ next: Mut.addCanvasText(prev, text) }),
};

const updateCanvasTextCmd: MoleculeCommand<z.infer<typeof schemas.updateCanvasText>> = {
  id: CMD.UpdateCanvasText,
  description: "Patch a canvas text's position, content, or style.",
  inputSchema: schemas.updateCanvasText,
  apply: (prev, { id, patch }) => ({ next: Mut.updateCanvasText(prev, id, patch) }),
};

const deleteCanvasTextCmd: MoleculeCommand<z.infer<typeof schemas.deleteCanvasText>> = {
  id: CMD.DeleteCanvasText,
  description: 'Delete a canvas text by id.',
  inputSchema: schemas.deleteCanvasText,
  apply: (prev, { id }) => ({ next: Mut.deleteCanvasText(prev, id) }),
};

const duplicateCanvasTextCmd: MoleculeCommand<
  z.infer<typeof schemas.duplicateCanvasText>,
  { newId: string }
> = {
  id: CMD.DuplicateCanvasText,
  description: 'Duplicate a canvas text label shifted by (dx, dy).',
  inputSchema: schemas.duplicateCanvasText,
  apply: (prev, { id, dx, dy }) => {
    const r = Mut.duplicateCanvasText(prev, id, dx, dy);
    return { next: r.molecule, extra: { newId: r.newId } };
  },
};

const duplicateStrokeCmd: MoleculeCommand<z.infer<typeof schemas.duplicateStroke>, { newId: string }> = {
  id: CMD.DuplicateStroke,
  description: 'Duplicate a pencil stroke shifted by (dx, dy).',
  inputSchema: schemas.duplicateStroke,
  apply: (prev, { id, dx, dy }) => {
    const r = Mut.duplicateStroke(prev, id, dx, dy);
    return { next: r.molecule, extra: { newId: r.newId } };
  },
};

const addCanvasShapeCmd: MoleculeCommand<z.infer<typeof schemas.addCanvasShape>> = {
  id: CMD.AddCanvasShape,
  description: 'Add a canvas annotation shape (rectangle, line, circle, triangle, or star).',
  inputSchema: schemas.addCanvasShape,
  apply: (prev, { shape }) => ({ next: Mut.addCanvasShape(prev, shape as CanvasShape) }),
};

const duplicateCanvasShapeCmd: MoleculeCommand<
  z.infer<typeof schemas.duplicateCanvasShape>,
  { newId: string }
> = {
  id: CMD.DuplicateCanvasShape,
  description: 'Duplicate a canvas shape shifted by (dx, dy).',
  inputSchema: schemas.duplicateCanvasShape,
  apply: (prev, { id, dx, dy }) => {
    const r = Mut.duplicateCanvasShape(prev, id, dx, dy);
    return { next: r.molecule, extra: { newId: r.newId } };
  },
};

const addCanvasImageCmd: MoleculeCommand<z.infer<typeof schemas.addCanvasImage>> = {
  id: CMD.AddCanvasImage,
  description: 'Add a raster image annotation to the canvas.',
  inputSchema: schemas.addCanvasImage,
  apply: (prev, { image }) => ({ next: Mut.addCanvasImage(prev, image as CanvasImage) }),
};

const deleteCanvasImageCmd: MoleculeCommand<z.infer<typeof schemas.deleteCanvasImage>> = {
  id: CMD.DeleteCanvasImage,
  description: 'Delete a canvas image by id.',
  inputSchema: schemas.deleteCanvasImage,
  apply: (prev, { id }) => ({ next: Mut.deleteCanvasImage(prev, id) }),
};

const duplicateCanvasImageCmd: MoleculeCommand<
  z.infer<typeof schemas.duplicateCanvasImage>,
  { newId: string }
> = {
  id: CMD.DuplicateCanvasImage,
  description: 'Duplicate a canvas image shifted by (dx, dy).',
  inputSchema: schemas.duplicateCanvasImage,
  apply: (prev, { id, dx, dy }) => {
    const r = Mut.duplicateCanvasImage(prev, id, dx, dy);
    return { next: r.molecule, extra: { newId: r.newId } };
  },
};

// ─── Whole document ────────────────────────────────────────────────────────

const clearAllCmd: MoleculeCommand<z.infer<typeof schemas.clearAll>> = {
  id: CMD.ClearAll,
  description: 'Replace the molecule with an empty document.',
  inputSchema: schemas.clearAll,
  apply: () => ({ next: Mut.clearAll() }),
};

const eraseCmd: MoleculeCommand<z.infer<typeof schemas.erase>> = {
  id: CMD.Erase,
  description: 'Erase one atom, bond, stroke, reaction arrow, canvas text, or shape by hit id.',
  inputSchema: schemas.erase,
  apply: (prev, hit) => ({ next: Mut.eraseAt(prev, hit) }),
};

const deleteStrokeCmd: MoleculeCommand<z.infer<typeof schemas.deleteStroke>> = {
  id: CMD.DeleteStroke,
  description: 'Delete a freehand stroke by id.',
  inputSchema: schemas.deleteStroke,
  apply: (prev, { id }) => ({ next: Mut.deleteStroke(prev, id) }),
};

const deleteCanvasShapeCmd: MoleculeCommand<z.infer<typeof schemas.deleteCanvasShape>> = {
  id: CMD.DeleteCanvasShape,
  description: 'Delete a canvas shape (ellipse, rectangle, etc.) by id.',
  inputSchema: schemas.deleteCanvasShape,
  apply: (prev, { id }) => ({ next: Mut.deleteCanvasShape(prev, id) }),
};

const applyRingFillCmd: MoleculeCommand<z.infer<typeof schemas.applyRingFill>> = {
  id: CMD.ApplyRingFill,
  description: 'Fill a ring defined by ordered atom ids with a color and opacity.',
  inputSchema: schemas.applyRingFill,
  apply: (prev, { ringAtomIds, color, opacity }) => ({
    next: upsertRingFillsForRings(prev, [ringAtomIds], color, opacity),
  }),
};

const importMolblockCmd: MoleculeCommand<
  z.infer<typeof schemas.importMolblock>,
  { newAtomIds: string[] }
> = {
  id: CMD.ImportMolblock,
  description:
    'Import a V2000 molblock (merge or replace). Scales bonds to bondLengthPx and places at origin or viewport grid.',
  inputSchema: schemas.importMolblock,
  apply: (prev, input) => {
    const prepared = prepareImportFromMolblock({
      molblock: input.molblock,
      bondLengthPx: input.bondLengthPx,
      placement: input.placement,
      viewport: input.viewport,
      windowWidth: input.windowWidth,
      windowHeight: input.windowHeight,
      gridSlot: input.gridSlot,
    });
    if (!prepared.ok) {
      throw new Error(prepared.error);
    }
    const next =
      input.mode === 'replace'
        ? Mut.replaceStructureFromImport(
            prev,
            prepared.atoms,
            prepared.bonds,
            input.keepAnnotations ?? true,
          )
        : Mut.mergeImportedStructure(prev, prepared.atoms, prepared.bonds);
    return { next, extra: { newAtomIds: prepared.atoms.map(a => a.id) } };
  },
};

const replaceFromMolblockCmd: MoleculeCommand<
  z.infer<typeof schemas.replaceFromMolblock>,
  { newAtomIds: string[] }
> = {
  id: CMD.ReplaceFromMolblock,
  description: 'Replace document atoms/bonds from a molblock; optional keep of strokes/text/arrows.',
  inputSchema: schemas.replaceFromMolblock,
  apply: (prev, input) => {
    const prepared = prepareImportFromMolblock({
      molblock: input.molblock,
      bondLengthPx: input.bondLengthPx,
      placement: input.placement,
      viewport: input.viewport,
      windowWidth: input.windowWidth,
      windowHeight: input.windowHeight,
      gridSlot: input.gridSlot,
    });
    if (!prepared.ok) {
      throw new Error(prepared.error);
    }
    const next = Mut.replaceStructureFromImport(
      prev,
      prepared.atoms,
      prepared.bonds,
      input.keepAnnotations ?? true,
    );
    return { next, extra: { newAtomIds: prepared.atoms.map(a => a.id) } };
  },
};

/**
 * Structure cleanup: Indigo when WASM is ready on this thread, else native.
 * In-app editor prefers the worker path (async Indigo + native fallback).
 */
const cleanupCmd: MoleculeCommand<z.infer<typeof schemas.cleanup>> = {
  id: CMD.Cleanup,
  description: 'Auto-layout (clean up) via Indigo when ready, else native 2D.',
  inputSchema: schemas.cleanup,
  apply: (prev, input) => {
    if (prev.atoms.length === 0) return { next: prev };
    const bondLen = resolveCleanupBondLength(prev, input.bondLengthPx);
    const next = cleanupIndigoSyncOrNull(prev, bondLen);
    if (!next) {
      throw new Error('Cleanup failed');
    }
    return { next };
  },
};

/**
 * Apply Indigo aromatize/dearomatize bond orders onto the live graph.
 * The worker produces `molBlock`; this command merges it for undo/redo.
 */
const aromatizeCmd: MoleculeCommand<z.infer<typeof schemas.aromatize>> = {
  id: CMD.Aromatize,
  description: 'Aromatize or dearomatize bonds via Indigo (Kekulé ↔ aromatic).',
  inputSchema: schemas.aromatize,
  apply: (prev, { molBlock }) => {
    if (prev.atoms.length === 0) return { next: prev };
    const next = Mut.mergeBondOrdersFromMolblock(prev, molBlock);
    if (next === prev) {
      throw new Error('Aromatize/dearomatize could not merge bond orders (topology mismatch).');
    }
    return { next };
  },
};

const applyAtomMapsCmd: MoleculeCommand<z.infer<typeof schemas.applyAtomMaps>> = {
  id: CMD.ApplyAtomMaps,
  description: 'Set atom-atom mapping numbers (reaction AAM / Indigo automap).',
  inputSchema: schemas.applyAtomMaps,
  apply: (prev, { mapsByAtomId }) => ({ next: Mut.applyAtomMaps(prev, mapsByAtomId) }),
};

const clearAtomMapsCmd: MoleculeCommand<z.infer<typeof schemas.clearAtomMaps>> = {
  id: CMD.ClearAtomMaps,
  description: 'Clear all atom-atom mapping numbers.',
  inputSchema: schemas.clearAtomMaps,
  apply: (prev) => ({ next: Mut.clearAtomMaps(prev) }),
};

/** Shift a freshly laid-out fragment to sit just right of existing content. */
const placeMergedFragment = (
  prev: { atoms: Atom[] },
  fragment: { atoms: Atom[]; bonds: Bond[] },
): { atoms: Atom[]; bonds: Bond[] } => {
  if (prev.atoms.length === 0 || fragment.atoms.length === 0) return fragment;
  const prevMaxX = Math.max(...prev.atoms.map(a => a.x));
  const prevMidY = prev.atoms.reduce((s, a) => s + a.y, 0) / prev.atoms.length;
  const fragMinX = Math.min(...fragment.atoms.map(a => a.x));
  const fragMidY = fragment.atoms.reduce((s, a) => s + a.y, 0) / fragment.atoms.length;
  const dx = prevMaxX + 80 - fragMinX;
  const dy = prevMidY - fragMidY;
  return {
    atoms: fragment.atoms.map(a => ({ ...a, x: a.x + dx, y: a.y + dy })),
    bonds: fragment.bonds,
  };
};

/**
 * Parse a SMILES string and add it to the canvas with Indigo 2D layout.
 * Requires Indigo WASM already loaded (in-app prefers worker SMILES_TO_MOLBLOCK).
 */
const importSmilesCmd: MoleculeCommand<
  z.infer<typeof schemas.importSmiles>,
  { newAtomIds: string[] }
> = {
  id: CMD.ImportSmiles,
  description:
    'Parse a SMILES string and add the structure (Indigo 2D when ready, else native).',
  inputSchema: schemas.importSmiles,
  apply: (prev, { smiles, mode }) => {
    const parsed = engine.parseSmiles(smiles);
    if (parsed.atoms.length === 0) {
      throw new Error(`Could not parse SMILES: ${smiles}`);
    }
    const laid = engine.generate2D(parsed);
    if (mode === 'replace') {
      return {
        next: Mut.replaceStructureFromImport(prev, laid.atoms, laid.bonds, true),
        extra: { newAtomIds: laid.atoms.map(a => a.id) },
      };
    }
    const placed = placeMergedFragment(prev, laid);
    return {
      next: Mut.mergeImportedStructure(prev, placed.atoms, placed.bonds),
      extra: { newAtomIds: placed.atoms.map(a => a.id) },
    };
  },
};

const pasteFragmentCmd: MoleculeCommand<
  z.infer<typeof schemas.pasteFragment>,
  { newAtomIds: string[] }
> = {
  id: CMD.PasteFragment,
  description:
    'Paste a fragment (atoms + bonds), regenerating ids and translating by (dx, dy). Returns the new atom ids.',
  inputSchema: schemas.pasteFragment,
  apply: (prev, { atoms, bonds, dx, dy }) => {
    const idMap = new Map<string, string>();
    const newAtoms: Atom[] = atoms.map((a) => {
      const id = newId();
      idMap.set(a.id, id);
      return { ...a, id, x: a.x + dx, y: a.y + dy } as Atom;
    });
    const newBonds: Bond[] = bonds
      .filter((b) => idMap.has(b.fromAtomId) && idMap.has(b.toAtomId))
      .map(
        (b) =>
          ({
            ...b,
            id: newId(),
            fromAtomId: idMap.get(b.fromAtomId)!,
            toAtomId: idMap.get(b.toAtomId)!,
          }) as Bond,
      );
    return {
      next: {
        ...prev,
        atoms: [...prev.atoms, ...newAtoms],
        bonds: [...prev.bonds, ...newBonds],
      },
      extra: { newAtomIds: newAtoms.map((a) => a.id) },
    };
  },
};

const mergeImportedStructureCmd: MoleculeCommand<
  z.infer<typeof schemas.mergeImportedStructure>,
  { newAtomIds: string[] }
> = {
  id: CMD.MergeImportedStructure,
  description: 'Merge already-placed atoms/bonds into the document (no re-layout).',
  inputSchema: schemas.mergeImportedStructure,
  apply: (prev, { atoms, bonds }) => ({
    next: Mut.mergeImportedStructure(prev, atoms as Atom[], bonds as Bond[]),
    extra: { newAtomIds: atoms.map(a => a.id) },
  }),
};

const replaceImportedStructureCmd: MoleculeCommand<
  z.infer<typeof schemas.replaceImportedStructure>,
  { newAtomIds: string[] }
> = {
  id: CMD.ReplaceImportedStructure,
  description: 'Replace document atoms/bonds with already-placed structure (e.g. CDXML).',
  inputSchema: schemas.replaceImportedStructure,
  apply: (prev, { atoms, bonds, keepAnnotations }) => ({
    next: Mut.replaceStructureFromImport(
      prev,
      atoms as Atom[],
      bonds as Bond[],
      keepAnnotations ?? false,
    ),
    extra: { newAtomIds: atoms.map(a => a.id) },
  }),
};

const commitFragmentPlacementCmd: MoleculeCommand<
  z.infer<typeof schemas.commitFragmentPlacement>,
  { newAtomIds: string[] }
> = {
  id: CMD.CommitFragmentPlacement,
  description: 'Attach or free-place a functional-group / template fragment.',
  inputSchema: schemas.commitFragmentPlacement,
  apply: (prev, input) => {
    const session = {
      fragment: {
        atoms: input.fragmentAtoms as Atom[],
        bonds: input.fragmentBonds as Bond[],
      },
      connectionAtomId: input.connectionAtomId,
      restoreTool: 'select',
      kind: 'functional_group' as const,
    };
    const r = commitFragmentPlacement(
      prev,
      session,
      input.commit,
      input.bondLengthPx,
      input.bondAngleSnapRad,
    );
    return { next: r.molecule, extra: { newAtomIds: r.newAtomIds } };
  },
};

const commitAtomAliasCmd: MoleculeCommand<z.infer<typeof schemas.commitAtomAlias>> = {
  id: CMD.CommitAtomAlias,
  description: 'Commit a validated atom alias (may update element and clamp lone pairs).',
  inputSchema: schemas.commitAtomAlias,
  apply: (prev, { atomId, alias }) => {
    const v = validateAtomAliasForMolecule(prev, atomId, alias);
    if (!v.ok) throw new Error(v.reason);
    const draft = alias.trim();
    return {
      next: {
        ...prev,
        atoms: prev.atoms.map(a => {
          if (a.id !== atomId) return a;
          if (!draft) {
            const next: Atom = { ...a };
            delete next.alias;
            return next;
          }
          const bondOrderSum = prev.bonds
            .filter(b => b.fromAtomId === a.id || b.toAtomId === a.id)
            .reduce((sum, b) => sum + b.order, 0);
          const maxLP = getMaxLonePairsForAtom(v.element, a.charge, bondOrderSum);
          const nextLP = Math.min(a.lonePairs ?? 0, maxLP);
          return { ...a, element: v.element, alias: draft, lonePairs: nextLP };
        }),
      },
    };
  },
};

const expandAliasCmd: MoleculeCommand<z.infer<typeof schemas.expandAlias>> = {
  id: CMD.ExpandAlias,
  description: 'Expand alias abbreviations on the given atoms into explicit atoms.',
  inputSchema: schemas.expandAlias,
  apply: (prev, { atomIds }) => ({
    next: expandAliasesFor3D(prev, new Set(atomIds)),
  }),
};

const applySelectionColorCmd: MoleculeCommand<z.infer<typeof schemas.applySelectionColor>> = {
  id: CMD.ApplySelectionColor,
  description: 'Apply a color to selected atoms/bonds/annotations per target flags.',
  inputSchema: schemas.applySelectionColor,
  apply: (prev, input) => ({
    next: applyColorToMolecule(prev, input.color, input.flags, {
      selectedAtomIds: input.selectedAtomIds,
      selectedCanvasTextId: input.selectedCanvasTextId,
      selectedReactionArrowId: input.selectedReactionArrowId,
      selectedStrokeId: input.selectedStrokeId,
      selectedCanvasShapeId: input.selectedCanvasShapeId,
      ringFillOpacity: input.ringFillOpacity,
      clearRingFill: input.clearRingFill,
      clearAllRingFills: input.clearAllRingFills,
    }),
  }),
};

const clearSelectionColorsCmd: MoleculeCommand<z.infer<typeof schemas.clearSelectionColors>> = {
  id: CMD.ClearSelectionColors,
  description: 'Clear custom stroke/label colors on selected atoms.',
  inputSchema: schemas.clearSelectionColors,
  apply: (prev, { atomIds }) => ({
    next: clearSelectionStrokeColors(prev, atomIds),
  }),
};

const applyCleanupResultCmd: MoleculeCommand<z.infer<typeof schemas.applyCleanupResult>> = {
  id: CMD.ApplyCleanupResult,
  description: 'Apply a worker cleanup result (local splice or global merge).',
  inputSchema: schemas.applyCleanupResult,
  apply: (prev, input) => {
    if (input.mode === 'local') {
      const next = spliceLocalCleanup(prev, input.subsetAtomIds, input.molBlock);
      if (next === prev) {
        throw new Error('Local cleanup could not be applied (atom mismatch).');
      }
      return { next };
    }
    const next = mergeGlobalCleanup(prev, input.molBlock);
    if (next === prev) {
      throw new Error('Cleanup could not be applied (structure mismatch).');
    }
    return { next };
  },
};

const insertDemoReactionCmd: MoleculeCommand<
  z.infer<typeof schemas.insertDemoReaction>,
  { newAtomIds: string[] }
> = {
  id: CMD.InsertDemoReaction,
  description: 'Insert a prepared demo reaction (reactants, products, and arrow) in one undo step.',
  inputSchema: schemas.insertDemoReaction,
  apply: (prev, input) => {
    const withReact = Mut.mergeImportedStructure(
      prev,
      input.reactAtoms as Atom[],
      input.reactBonds as Bond[],
    );
    const withProd = Mut.mergeImportedStructure(
      withReact,
      input.prodAtoms as Atom[],
      input.prodBonds as Bond[],
    );
    const next = Mut.addReactionArrow(withProd, input.arrow);
    return {
      next,
      extra: {
        newAtomIds: [...input.reactAtoms, ...input.prodAtoms].map(a => a.id),
      },
    };
  },
};

const ALL_COMMANDS: readonly MoleculeCommand<unknown, unknown>[] = [
  addAtomCmd,
  updateAtomElementCmd,
  updateAtomChargeCmd,
  updateAtomLonePairsCmd,
  setAtomIsotopeCmd,
  setAtomAliasCmd,
  moveAtomsCmd,
  rotateAtomsCmd,
  alignSelectedFragmentsCmd,
  distributeSelectedFragmentsCmd,
  deleteAtomsCmd,
  deleteBondsCmd,
  deleteSelectionCmd,
  duplicateAtomsCmd,
  addBondCmd,
  updateBondCmd,
  flipBondEndpointsCmd,
  invertStereoAtAtomCmd,
  swapAtomPositionsCmd,
  addRingCmd,
  addBoatRingCmd,
  addChairRingCmd,
  addChainCmd,
  addStrokeCmd,
  addReactionArrowCmd,
  updateReactionArrowCmd,
  deleteReactionArrowCmd,
  duplicateReactionArrowCmd,
  addReactionMultiStepCmd,
  addCanvasTextCmd,
  updateCanvasTextCmd,
  deleteCanvasTextCmd,
  duplicateCanvasTextCmd,
  duplicateStrokeCmd,
  addCanvasShapeCmd,
  duplicateCanvasShapeCmd,
  addCanvasImageCmd,
  deleteCanvasImageCmd,
  duplicateCanvasImageCmd,
  clearAllCmd,
  pasteFragmentCmd,
  eraseCmd,
  deleteStrokeCmd,
  deleteCanvasShapeCmd,
  applyRingFillCmd,
  importMolblockCmd,
  replaceFromMolblockCmd,
  cleanupCmd,
  aromatizeCmd,
  applyAtomMapsCmd,
  clearAtomMapsCmd,
  importSmilesCmd,
  mergeImportedStructureCmd,
  replaceImportedStructureCmd,
  commitFragmentPlacementCmd,
  commitAtomAliasCmd,
  expandAliasCmd,
  applySelectionColorCmd,
  clearSelectionColorsCmd,
  applyCleanupResultCmd,
  insertDemoReactionCmd,
] as readonly MoleculeCommand<unknown, unknown>[];

const REGISTRY: ReadonlyMap<string, MoleculeCommand<unknown, unknown>> = new Map(
  ALL_COMMANDS.map((c) => [c.id, c]),
);

export const getCommand = (id: string): MoleculeCommand<unknown, unknown> | undefined =>
  REGISTRY.get(id);

export const listCommandIds = (): string[] => [...REGISTRY.keys()];

export const listCommands = (): readonly MoleculeCommand<unknown, unknown>[] => ALL_COMMANDS;

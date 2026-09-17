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
import type { Atom, Bond, CanvasImage, CanvasOrbital, CanvasShape, Molecule } from '@moldraw/domain';
import { alignSelectedFragments, distributeSelectedFragments } from '../align/selectionArrange';
import { circularArrayAtoms } from '../align/circularArray';
import { linearArrayAtoms } from '../align/linearArray';
import { dendrimerArrayAtoms } from '../align/dendrimerArray';
import { applyMoleculeCoordsTable } from '../io/moleculeCoordsTable';
import {
  collectAtomsAsObjectCollection,
  groupAtomsAsObjectCollection,
  siblingShapeIdsInCollection,
  stripPatternPreviewState,
  ungroupAtomsFromObjectCollections,
} from '../molecule/arrayCollection';
import { generateGrapheneInMolecule } from '../molecule/grapheneSheet';
import { generateCofInMolecule } from '../cofs/generate';
import { generateDendrimerInMolecule } from '../dendrimers/generate';
import { generatePolymerInMolecule } from '../polymers/generate';
import {
  applyInstanceCopyRotation,
  applyInstanceCopyTranslation,
  expandInstanceArrays,
  growDendrimerSeed,
  instanceArrayIdsForAtomIds,
  partitionAtomIdsForInstances,
  rotateInstanceArrayPlacements,
  scaleInstanceArrayPlacements,
  syncDendrimerCoreCenters,
} from '../molecule/instanceArrays';
import { ensureFragmentIds } from '../molecule/fragmentIds';
import * as Mut from '../molecule/mutations';
import { buildDemoMechanismMolecule } from '../molecule/demoMechanism';
import { prepareImportFromMolblock } from '../molecule/importPrepare';
import {
  offsetImportedInViewport,
  placeUnbondedNeighbor,
  type ImportViewPlacement,
} from '../molecule/importPlacement';
import { commitFragmentPlacement } from '../molecule/fragmentPlacement';
import {
  apply3DPose,
  clear3DPose,
  flatten3DPose,
  joinAtomsIntoPerspectivePose,
  rotateCofViewOrPose,
  setPerspectiveDepthFade,
  setPerspectiveDepthShading,
  setPerspectiveDepthWedges,
} from '../molecule/perspective3D';
import { applyColorToMolecule, clearSelectionStrokeColors } from '../color/selectionColor';
import { applyMarkupHighlight } from '../molecule/highlight';
import { setStructureTheme } from '../molecule/structureTheme';
import { applySelectionDisplayStyle } from '../color/selectionDisplayStyle';
import {
  createObjectCollection,
  deleteObjectCollection,
  moveObjectOutline,
  placeObjectOutlineItem,
  renameObjectOutline,
  reorderObjectOutline,
  setObjectCollectionCollapsed,
  setObjectOutlineParent,
} from '../molecule/objectOutline';
import { addExplicitHydrogensToAtoms } from '../molecule/addExplicitHydrogen';
import { upsertRingFillsForRings } from '@moldraw/domain';
import {
  autocapitalizeAtomAliasDraft,
  looksLikeExpandableFormulaLabel,
  validateAtomAliasForMolecule,
} from '@moldraw/domain';
import { getMaxLonePairsForAtom } from '@moldraw/domain';
import { expandAliasesFor3D } from '../expand/aliasesFor3D';
import { condensedToSmiles } from '../expand/condensedFormulaExpand';
import {
  resolveCleanupBondLength,
  spliceLocalCleanup,
  mergeGlobalCleanup,
  alignCleanupCoordsPerComponent,
} from '../io/localCleanup';
import { mergeExplicitHydrogensFromMolblock } from '../molecule/explicitHydrogens';
import {
  applyModelStereoToDepiction,
  cleanupMolecule,
  engine,
  parseSmilesToMolecule,
} from '@moldraw/engine';
import { schemas } from './schemas';
import { transactionCmd } from './transaction';
import type { MoleculeCommand } from './types';

const newId = () => Math.random().toString(36).slice(2, 11);

/** Stable, namespaced command ids. */
export const CMD = {
  AddAtom: 'molecule.addAtom',
  UpdateAtomElement: 'molecule.updateAtomElement',
  UpdateAtomCharge: 'molecule.updateAtomCharge',
  SetAtomCharge: 'molecule.setAtomCharge',
  SetAtomDeltaCharge: 'molecule.setAtomDeltaCharge',
  SetAtomChargeOffset: 'molecule.setAtomChargeOffset',
  SetAtomDeltaChargeOffset: 'molecule.setAtomDeltaChargeOffset',
  UpdateAtomLonePairs: 'molecule.updateAtomLonePairs',
  SetAtomLonePairSide: 'molecule.setAtomLonePairSide',
  SetAtomRadical: 'molecule.setAtomRadical',
  SetAtomRadicalIon: 'molecule.setAtomRadicalIon',
  TranslateCanvasShapes: 'molecule.translateCanvasShapes',
  SetAtomIsotope: 'molecule.setAtomIsotope',
  SetAtomAlias: 'molecule.setAtomAlias',
  SetAtomsShowElementLabel: 'molecule.setAtomsShowElementLabel',
  AddExplicitHydrogens: 'molecule.addExplicitHydrogens',
  MoveAtoms: 'molecule.moveAtoms',
  ApplyCoordsTable: 'molecule.applyCoordsTable',
  RotateAtoms: 'molecule.rotateAtoms',
  ScaleAtoms: 'molecule.scaleAtoms',
  ReflectAtoms: 'molecule.reflectAtoms',
  AlignSelectedFragments: 'molecule.alignSelectedFragments',
  DistributeSelectedFragments: 'molecule.distributeSelectedFragments',
  CircularArraySelection: 'molecule.circularArraySelection',
  LinearArraySelection: 'molecule.linearArraySelection',
  DendrimerArraySelection: 'molecule.dendrimerArraySelection',
  GroupSelection: 'molecule.groupSelection',
  UngroupSelection: 'molecule.ungroupSelection',
  GenerateGraphene: 'molecule.generateGraphene',
  GenerateCof: 'molecule.generateCof',
  GenerateDendrimer: 'molecule.generateDendrimer',
  GeneratePolymer: 'molecule.generatePolymer',
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
  TranslateStroke: 'molecule.translateStroke',
  TranslateMarqueeSelection: 'molecule.translateMarqueeSelection',
  AddReactionArrow: 'molecule.addReactionArrow',
  UpdateReactionArrow: 'molecule.updateReactionArrow',
  DeleteReactionArrow: 'molecule.deleteReactionArrow',
  DuplicateReactionArrow: 'molecule.duplicateReactionArrow',
  AddReactionMultiStep: 'molecule.addReactionMultiStep',
  AddCanvasText: 'molecule.addCanvasText',
  UpdateCanvasText: 'molecule.updateCanvasText',
  DeleteCanvasText: 'molecule.deleteCanvasText',
  DuplicateCanvasText: 'molecule.duplicateCanvasText',
  AddSruBracket: 'molecule.addSruBracket',
  UpdateSruBracket: 'molecule.updateSruBracket',
  DeleteSruBracket: 'molecule.deleteSruBracket',
  DuplicateStroke: 'molecule.duplicateStroke',
  AddCanvasShape: 'molecule.addCanvasShape',
  AddCanvasOrbital: 'molecule.addCanvasOrbital',
  DeleteCanvasOrbital: 'molecule.deleteCanvasOrbital',
  UpdateCanvasOrbital: 'molecule.updateCanvasOrbital',
  UpdateCanvasShape: 'molecule.updateCanvasShape',
  DuplicateCanvasShape: 'molecule.duplicateCanvasShape',
  ReflectCanvasShape: 'molecule.reflectCanvasShape',
  AddCanvasImage: 'molecule.addCanvasImage',
  UpdateCanvasImage: 'molecule.updateCanvasImage',
  DeleteCanvasImage: 'molecule.deleteCanvasImage',
  DuplicateCanvasImage: 'molecule.duplicateCanvasImage',

  ClearAll: 'molecule.clearAll',
  PasteFragment: 'molecule.pasteFragment',
  MergeSketch: 'molecule.mergeSketch',

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
  ApplyMarkupHighlight: 'molecule.applyMarkupHighlight',
  SetStructureTheme: 'molecule.setStructureTheme',
  ApplySelectionColor: 'molecule.applySelectionColor',
  ClearSelectionColors: 'molecule.clearSelectionColors',
  ApplySelectionDisplayStyle: 'molecule.applySelectionDisplayStyle',

  CreateObjectCollection: 'molecule.createObjectCollection',
  RenameObjectOutline: 'molecule.renameObjectOutline',
  DeleteObjectCollection: 'molecule.deleteObjectCollection',
  SetObjectOutlineParent: 'molecule.setObjectOutlineParent',
  SetObjectCollectionCollapsed: 'molecule.setObjectCollectionCollapsed',
  ReorderObjectOutline: 'molecule.reorderObjectOutline',
  MoveObjectOutline: 'molecule.moveObjectOutline',
  PlaceObjectOutlineItem: 'molecule.placeObjectOutlineItem',
  ExpandInstanceArrays: 'molecule.expandInstanceArrays',

  Apply3DPose: 'molecule.apply3DPose',
  Clear3DPose: 'molecule.clear3DPose',
  Flatten3DPose: 'molecule.flatten3DPose',
  Rotate3DPose: 'molecule.rotate3DPose',
  SetPerspectiveDepthShading: 'molecule.setPerspectiveDepthShading',
  SetPerspectiveDepthFade: 'molecule.setPerspectiveDepthFade',
  SetPerspectiveDepthWedges: 'molecule.setPerspectiveDepthWedges',
  ApplyCleanupResult: 'molecule.applyCleanupResult',
  ApplyExplicitHydrogens: 'molecule.applyExplicitHydrogens',
  InsertDemoReaction: 'molecule.insertDemoReaction',
  InsertDemoMechanism: 'molecule.insertDemoMechanism',
  Transaction: 'molecule.transaction',
} as const;

/** Commands that need `AiExecutionContext` async hooks; not runnable via pure `runCommand`. */
export const ASYNC_CONTEXT_COMMAND_IDS: ReadonlySet<string> = new Set([
  CMD.Cleanup,
  CMD.Aromatize,
  CMD.ApplyExplicitHydrogens,
  CMD.ImportSmiles,
]);

export type CommandId = (typeof CMD)[keyof typeof CMD];

/** Ids created by a drawing command. Always present (possibly empty) so callers can tell fusion/snap from creation. */
export interface NewIdsExtra {
  newAtomIds: string[];
  newBondIds: string[];
  /** Existing atoms the new content was fused / snapped onto (ring fusion, chain start, …). */
  reusedAtomIds?: string[];
}

/** Diff atom + bond ids so AI chat can focus newly drawn content. */
function withNewAtomIds(
  prev: { atoms: { id: string }[]; bonds: { id: string }[] },
  next: Molecule,
  reusedAtomIds?: string[],
): { next: Molecule; extra: NewIdsExtra } {
  const before = new Set(prev.atoms.map(a => a.id));
  const beforeBonds = new Set(prev.bonds.map(b => b.id));
  const newAtomIds = next.atoms.filter(a => !before.has(a.id)).map(a => a.id);
  const newBondIds = next.bonds.filter(b => !beforeBonds.has(b.id)).map(b => b.id);
  const grown = growDendrimerSeed(next, newAtomIds);
  const extra: NewIdsExtra = { newAtomIds, newBondIds };
  if (reusedAtomIds?.length) extra.reusedAtomIds = reusedAtomIds;
  return { next: grown, extra };
}

// ─── Atom commands ─────────────────────────────────────────────────────────

const addAtomCmd: MoleculeCommand<z.infer<typeof schemas.addAtom>, NewIdsExtra> = {
  id: CMD.AddAtom,
  description:
    'Add a single free atom at world (x, y). Omit atom.id to have one generated; the id is returned in extra.newAtomIds. Use molecule.addBond to connect it.',
  inputSchema: schemas.addAtom,
  tags: ['atoms'],
  apply: (prev, { atom }) => {
    let id = atom.id ?? newId();
    if (prev.atoms.some(a => a.id === id)) {
      if (atom.id) throw new Error(`Atom id "${id}" already exists; omit id to auto-generate.`);
      id = newId();
    }
    const next = growDendrimerSeed(Mut.addAtom(prev, { ...atom, id } as Atom), [id]);
    return { next, extra: { newAtomIds: [id], newBondIds: [] } };
  },
};

const updateAtomElementCmd: MoleculeCommand<z.infer<typeof schemas.updateAtomElement>> = {
  id: CMD.UpdateAtomElement,
  description: "Change an atom's element symbol; clears alias.",
  inputSchema: schemas.updateAtomElement,
  apply: (prev, { atomId, element }) => ({ next: Mut.updateAtomElement(prev, atomId, element) }),
};

const updateAtomChargeCmd: MoleculeCommand<z.infer<typeof schemas.updateAtomCharge>> = {
  id: CMD.UpdateAtomCharge,
  description: "Increment/decrement an atom's formal charge by `delta` (clamped by valency).",
  inputSchema: schemas.updateAtomCharge,
  apply: (prev, { atomId, delta }) => ({ next: Mut.updateAtomCharge(prev, atomId, delta) }),
};

const setAtomChargeCmd: MoleculeCommand<z.infer<typeof schemas.setAtomCharge>> = {
  id: CMD.SetAtomCharge,
  description: 'Set an atom formal charge absolutely (0 clears; restores implicit H via valency).',
  inputSchema: schemas.setAtomCharge,
  apply: (prev, { atomId, charge, markStyle }) => ({
    next: Mut.setAtomCharge(prev, atomId, charge, markStyle),
  }),
};

const setAtomDeltaChargeCmd: MoleculeCommand<z.infer<typeof schemas.setAtomDeltaCharge>> = {
  id: CMD.SetAtomDeltaCharge,
  description: 'Set a partial-charge mark on an atom (δ+ / δ−); 0 clears.',
  inputSchema: schemas.setAtomDeltaCharge,
  apply: (prev, { atomId, deltaCharge }) => ({
    next: Mut.setAtomDeltaCharge(prev, atomId, deltaCharge),
  }),
};

const setAtomChargeOffsetCmd: MoleculeCommand<z.infer<typeof schemas.setAtomChargeOffset>> = {
  id: CMD.SetAtomChargeOffset,
  description: 'Nudge a formal-charge mark around its parent atom (fine adjust).',
  inputSchema: schemas.setAtomChargeOffset,
  apply: (prev, { atomId, offset }) => ({
    next: Mut.setAtomChargeOffset(prev, atomId, offset),
  }),
};

const setAtomDeltaChargeOffsetCmd: MoleculeCommand<
  z.infer<typeof schemas.setAtomDeltaChargeOffset>
> = {
  id: CMD.SetAtomDeltaChargeOffset,
  description: 'Nudge a δ± mark around its parent atom (fine adjust).',
  inputSchema: schemas.setAtomDeltaChargeOffset,
  apply: (prev, { atomId, offset }) => ({
    next: Mut.setAtomDeltaChargeOffset(prev, atomId, offset),
  }),
};

const updateAtomLonePairsCmd: MoleculeCommand<z.infer<typeof schemas.updateAtomLonePairs>> = {
  id: CMD.UpdateAtomLonePairs,
  description: "Increment/decrement an atom's lone-pair count by `delta` (clamped to valency).",
  inputSchema: schemas.updateAtomLonePairs,
  apply: (prev, { atomId, delta }) => ({ next: Mut.updateAtomLonePairs(prev, atomId, delta) }),
};

const setAtomLonePairSideCmd: MoleculeCommand<z.infer<typeof schemas.setAtomLonePairSide>> = {
  id: CMD.SetAtomLonePairSide,
  description: 'Place lone-pair dots above or below the atom (screen-upright).',
  inputSchema: schemas.setAtomLonePairSide,
  apply: (prev, { atomId, side }) => ({ next: Mut.setAtomLonePairSide(prev, atomId, side) }),
};

const setAtomRadicalCmd: MoleculeCommand<z.infer<typeof schemas.setAtomRadical>> = {
  id: CMD.SetAtomRadical,
  description: 'Set or clear a single free radical (unpaired electron) on an atom.',
  inputSchema: schemas.setAtomRadical,
  apply: (prev, { atomId, radical }) => ({ next: Mut.setAtomRadical(prev, atomId, radical) }),
};

const setAtomRadicalIonCmd: MoleculeCommand<z.infer<typeof schemas.setAtomRadicalIon>> = {
  id: CMD.SetAtomRadicalIon,
  description: 'Set or clear a radical ion (formal charge + unpaired electron) on an atom in one step.',
  inputSchema: schemas.setAtomRadicalIon,
  apply: (prev, { atomId, charge, radical }) => ({
    next: Mut.setAtomRadicalIon(prev, atomId, charge, radical),
  }),
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

const setAtomsShowElementLabelCmd: MoleculeCommand<
  z.infer<typeof schemas.setAtomsShowElementLabel>
> = {
  id: CMD.SetAtomsShowElementLabel,
  description:
    'Show or hide forced element symbols on atoms (teaching: explicit "C" on skeletal carbons).',
  inputSchema: schemas.setAtomsShowElementLabel,
  apply: (prev, { atomIds, show }) => ({
    next: Mut.setAtomsShowElementLabel(prev, atomIds, show),
  }),
};

const addExplicitHydrogensCmd: MoleculeCommand<z.infer<typeof schemas.addExplicitHydrogens>> = {
  id: CMD.AddExplicitHydrogens,
  description:
    'Add explicit H atoms to selected heavy atoms (one place / selection — not whole-molecule unfold).',
  inputSchema: schemas.addExplicitHydrogens,
  apply: (prev, input) => ({
    next: addExplicitHydrogensToAtoms(prev, input),
  }),
};

const moveAtomsCmd: MoleculeCommand<z.infer<typeof schemas.moveAtoms>> = {
  id: CMD.MoveAtoms,
  description: 'Translate the given atoms by (dx, dy) canvas px; bonds follow. Prefer molecule.move_fragment to move a whole molecule.',
  inputSchema: schemas.moveAtoms,
  apply: (prev, { atomIds, dx, dy }) => {
    const { realAtomIds, copySites } = partitionAtomIdsForInstances(prev, atomIds);
    if (copySites.length > 0 && realAtomIds.length === 0) {
      return { next: applyInstanceCopyTranslation(prev, copySites, dx, dy) };
    }
    if (realAtomIds.length === 0) return { next: prev };
    return { next: syncDendrimerCoreCenters(Mut.moveAtoms(prev, realAtomIds, dx, dy)) };
  },
};

const applyCoordsTableCmd: MoleculeCommand<
  z.infer<typeof schemas.applyCoordsTable>,
  { applied: number; skipped: number }
> = {
  id: CMD.ApplyCoordsTable,
  description:
    'Apply canvas x/y coordinates from a parsed coordinate table to the given atoms (matches Copy coordinates table format).',
  inputSchema: schemas.applyCoordsTable,
  apply: (prev, { atomIds, rows }) => {
    const result = applyMoleculeCoordsTable(prev, rows, atomIds);
    return {
      next: result.molecule,
      extra: { applied: result.applied, skipped: result.skipped },
    };
  },
};

const rotateAtomsCmd: MoleculeCommand<z.infer<typeof schemas.rotateAtoms>> = {
  id: CMD.RotateAtoms,
  description: 'Rotate atoms around (cx, cy) by `deltaRad` radians.',
  inputSchema: schemas.rotateAtoms,
  apply: (prev, { atomIds, cx, cy, deltaRad }) => {
    const { realAtomIds, copySites } = partitionAtomIdsForInstances(prev, atomIds);
    if (copySites.length > 0 && realAtomIds.length === 0) {
      return { next: applyInstanceCopyRotation(prev, copySites, cx, cy, deltaRad) };
    }
    const ids = realAtomIds.length > 0 ? realAtomIds : atomIds;
    if (ids.length === 0) return { next: prev };
    let next = Mut.rotateAtoms(prev, ids, cx, cy, deltaRad);
    const arrayIds = instanceArrayIdsForAtomIds(next, ids);
    if (arrayIds.length > 0) {
      next = rotateInstanceArrayPlacements(next, new Set(arrayIds), deltaRad);
    }
    return { next };
  },
};

const scaleAtomsCmd: MoleculeCommand<z.infer<typeof schemas.scaleAtoms>> = {
  id: CMD.ScaleAtoms,
  description: 'Scale atoms about (cx, cy) by `factor`. Instance-array copies follow the parent.',
  inputSchema: schemas.scaleAtoms,
  apply: (prev, { atomIds, cx, cy, factor, factorY }) => {
    const { realAtomIds } = partitionAtomIdsForInstances(prev, atomIds);
    const ids = realAtomIds.length > 0 ? realAtomIds : atomIds;
    if (ids.length === 0) return { next: prev };
    let next = Mut.scaleAtoms(prev, ids, cx, cy, factor, factorY);
    const arrayIds = instanceArrayIdsForAtomIds(next, ids);
    if (arrayIds.length > 0) {
      next = scaleInstanceArrayPlacements(next, new Set(arrayIds), factor);
    }
    return { next };
  },
};

const reflectAtomsCmd: MoleculeCommand<z.infer<typeof schemas.reflectAtoms>> = {
  id: CMD.ReflectAtoms,
  description:
    'Reflect selected atoms horizontally (left↔right) or vertically (top↔bottom) about (cx, cy). Preserves stereochemistry by flipping wedge/dash bond directions.',
  inputSchema: schemas.reflectAtoms,
  apply: (prev, { atomIds, cx, cy, axis }) => ({
    next: Mut.reflectAtoms(prev, atomIds, cx, cy, axis),
  }),
};

const alignSelectedFragmentsCmd: MoleculeCommand<z.infer<typeof schemas.alignSelectedFragments>> = {
  id: CMD.AlignSelectedFragments,
  description:
    'Align whole selected molecules by left/right/horizontal-center or top/vertical-center/bottom (fragment AABBs).',
  inputSchema: schemas.alignSelectedFragments,
  apply: (prev, { atomIds, mode }) => ({
    next: Mut.syncSruBracketsToAtoms(alignSelectedFragments(prev, atomIds, mode), atomIds),
  }),
};

const distributeSelectedFragmentsCmd: MoleculeCommand<z.infer<typeof schemas.distributeSelectedFragments>> = {
  id: CMD.DistributeSelectedFragments,
  description:
    'Space whole selected molecules: horizontal/vertical equal gaps, rearrange into a grid or circle, or a neat left-to-right row. For circle, optional radius sets the ring size.',
  inputSchema: schemas.distributeSelectedFragments,
  apply: (prev, { atomIds, axis, radius }) => ({
    next: Mut.syncSruBracketsToAtoms(
      distributeSelectedFragments(prev, atomIds, axis, { radius }),
      atomIds,
    ),
  }),
};

const circularArraySelectionCmd: MoleculeCommand<
  z.infer<typeof schemas.circularArraySelection>,
  { newAtomIds: string[]; allAtomIds: string[] }
> = {
  id: CMD.CircularArraySelection,
  description:
    'Create a circular (polar) array of the selection: count instances on a ring of given radius, optional angular spacing (degrees), and whether each copy rotates with its angle.',
  inputSchema: schemas.circularArraySelection,
  apply: (prev, { atomIds, count, radius, spacingDeg, rotate, replaceAtomIds }) => {
    const existing = prev.instanceArrays?.find(a =>
      a.seedAtomIds.some(id => atomIds.includes(id)),
    );
    const base = existing
      ? prev
      : stripPatternPreviewState(prev, atomIds, replaceAtomIds, (m, ids) =>
          Mut.deleteAtomSelection(m, ids),
        );
    const r = circularArrayAtoms(base, atomIds, {
      count,
      radius,
      spacingDeg,
      rotate,
    });
    let next = r.molecule;
    next = Mut.syncSruBracketsToAtoms(next, atomIds);
    next = ensureFragmentIds(next);
    next = collectAtomsAsObjectCollection(next, atomIds, 'Circular array');
    return {
      next,
      extra: { newAtomIds: r.newAtomIds, allAtomIds: atomIds },
    };
  },
};

const linearArraySelectionCmd: MoleculeCommand<
  z.infer<typeof schemas.linearArraySelection>,
  { newAtomIds: string[]; allAtomIds: string[] }
> = {
  id: CMD.LinearArraySelection,
  description:
    'Create a linear array of the selection: count instances along +X at a given center-to-center spacing.',
  inputSchema: schemas.linearArraySelection,
  apply: (prev, { atomIds, count, spacingPx, rotate, replaceAtomIds }) => {
    const existing = prev.instanceArrays?.find(a =>
      a.seedAtomIds.some(id => atomIds.includes(id)),
    );
    const base = existing
      ? prev
      : stripPatternPreviewState(prev, atomIds, replaceAtomIds, (m, ids) =>
          Mut.deleteAtomSelection(m, ids),
        );
    const r = linearArrayAtoms(base, atomIds, {
      count,
      spacingPx,
      rotate,
    });
    let next = r.molecule;
    next = Mut.syncSruBracketsToAtoms(next, atomIds);
    next = ensureFragmentIds(next);
    next = collectAtomsAsObjectCollection(next, atomIds, 'Linear array');
    return {
      next,
      extra: { newAtomIds: r.newAtomIds, allAtomIds: atomIds },
    };
  },
};

const dendrimerArraySelectionCmd: MoleculeCommand<z.infer<typeof schemas.dendrimerArraySelection>, { newAtomIds: string[]; allAtomIds: string[] }> = {
  id: CMD.DendrimerArraySelection,
  description:
    'Start a dendrimer (radial) array: shared core, one parent branch instanced around the core. Draw on the parent branch to clone live.',
  inputSchema: schemas.dendrimerArraySelection,
  apply: (prev, { atomIds, foldCount, coreAtomIds }) => {
    const r = dendrimerArrayAtoms(prev, atomIds, { foldCount, coreAtomIds });
    let next = r.molecule;
    const groupIds = [
      ...new Set([
        ...atomIds,
        ...(next.instanceArrays?.find(a => a.dendrimer)?.dendrimer?.coreAtomIds ?? []),
        ...(next.instanceArrays?.find(a => a.dendrimer)?.seedAtomIds ?? []),
      ]),
    ];
    next = Mut.syncSruBracketsToAtoms(next, groupIds);
    next = ensureFragmentIds(next);
    return {
      next,
      extra: { newAtomIds: r.newAtomIds, allAtomIds: r.allAtomIds },
    };
  },
};

const groupSelectionCmd: MoleculeCommand<z.infer<typeof schemas.groupSelection>> = {
  id: CMD.GroupSelection,
  description: 'Group selected fragments into an Objects-panel collection.',
  inputSchema: schemas.groupSelection,
  apply: (prev, { atomIds, name }) => ({
    next: groupAtomsAsObjectCollection(prev, atomIds, name ?? 'Group'),
  }),
};

const ungroupSelectionCmd: MoleculeCommand<z.infer<typeof schemas.ungroupSelection>> = {
  id: CMD.UngroupSelection,
  description:
    'Ungroup selected fragments into individual molecules (expands InstanceArrays; cannot keep pattern linkage).',
  inputSchema: schemas.ungroupSelection,
  apply: (prev, { atomIds }) => ({
    next: ungroupAtomsFromObjectCollections(prev, atomIds),
  }),
};

const generateDendrimerCmd: MoleculeCommand<
  z.infer<typeof schemas.generateDendrimer>,
  { newAtomIds: string[]; allAtomIds: string[] }
> = {
  id: CMD.GenerateDendrimer,
  description:
    'Place a large dendrimer preset (PAMAM G2 or Si–Fc G3) as an authored 2D template.',
  inputSchema: schemas.generateDendrimer,
  apply: (prev, input) => {
    const r = generateDendrimerInMolecule(prev, {
      presetId: input.presetId,
      bondLength: input.bondLengthPx,
      cx: input.cx,
      cy: input.cy,
      replaceAtomIds: input.replaceAtomIds,
    });
    return {
      next: r.molecule,
      extra: { newAtomIds: r.newAtomIds, allAtomIds: r.allAtomIds },
    };
  },
};

const generatePolymerCmd: MoleculeCommand<
  z.infer<typeof schemas.generatePolymer>,
  { newAtomIds: string[]; allAtomIds: string[]; sruBracketId?: string }
> = {
  id: CMD.GeneratePolymer,
  description:
    'Place a polymer SRU preset (PEG, PE, PET, P3HT, …) as one repeating unit with ChemDraw [ ]ₙ brackets.',
  inputSchema: schemas.generatePolymer,
  apply: (prev, input) => {
    const r = generatePolymerInMolecule(prev, {
      presetId: input.presetId,
      bondLength: input.bondLengthPx,
      cx: input.cx,
      cy: input.cy,
      replaceAtomIds: input.replaceAtomIds,
    });
    return {
      next: r.molecule,
      extra: {
        newAtomIds: r.newAtomIds,
        allAtomIds: r.allAtomIds,
        ...(r.sruBracketId ? { sruBracketId: r.sruBracketId } : {}),
      },
    };
  },
};

const generateCofCmd: MoleculeCommand<
  z.infer<typeof schemas.generateCof>,
  { newAtomIds: string[]; allAtomIds: string[]; latticeId: string }
> = {
  id: CMD.GenerateCof,
  description:
    'Generate a programmatic COF or 2D MOF lattice (preset + hexagonal H/V packing and optional layered depth). Outer terminals grow with packing; replaceAtomIds rebuilds in place.',
  inputSchema: schemas.generateCof,
  apply: (prev, input) => {
    const r = generateCofInMolecule(prev, {
      presetId: input.presetId,
      cols: input.cols,
      rows: input.rows,
      layers: input.layers,
      bondLength: input.bondLengthPx,
      cx: input.cx,
      cy: input.cy,
      replaceAtomIds: input.replaceAtomIds,
      latticeId: input.latticeId,
    });
    return {
      next: r.molecule,
      extra: { newAtomIds: r.newAtomIds, allAtomIds: r.allAtomIds, latticeId: r.latticeId },
    };
  },
};

const generateGrapheneCmd: MoleculeCommand<
  z.infer<typeof schemas.generateGraphene>,
  { newAtomIds: string[]; allAtomIds: string[] }
> = {
  id: CMD.GenerateGraphene,
  description:
    'Generate gapless HCP graphene (fused aromatic hexagons). Rectangular cols×rows by default, or circular; bondLengthPx, center cx/cy; optional replaceAtomIds for live regenerate.',
  inputSchema: schemas.generateGraphene,
  apply: (prev, input) => {
    const r = generateGrapheneInMolecule(prev, {
      cols: input.cols,
      rows: input.rows,
      shape: input.shape,
      bondLength: input.bondLengthPx,
      cx: input.cx,
      cy: input.cy,
      oxidation: input.oxidation,
      replaceAtomIds: input.replaceAtomIds,
    });
    return {
      next: r.molecule,
      extra: { newAtomIds: r.newAtomIds, allAtomIds: r.allAtomIds },
    };
  },
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

const addBondCmd: MoleculeCommand<z.infer<typeof schemas.addBond>, NewIdsExtra> = {
  id: CMD.AddBond,
  description:
    'Add a bond between two existing atoms. Fails with a reason if the atoms are already bonded; with strict=true also if the bond would exceed valency or break ring double-bond rules. Omit bond.id to auto-generate (returned in extra.newBondIds).',
  inputSchema: schemas.addBond,
  tags: ['bonds'],
  apply: (prev, { bond, strict }) => {
    const opts = { strict: strict === true };
    const reason = Mut.explainBondRejection(prev, bond, opts);
    if (reason) throw new Error(`Cannot add bond: ${reason}.`);
    let id = bond.id ?? newId();
    if (prev.bonds.some(b => b.id === id)) {
      if (bond.id) throw new Error(`Bond id "${id}" already exists; omit id to auto-generate.`);
      id = newId();
    }
    const next = growDendrimerSeed(Mut.addBondSafe(prev, { ...bond, id } as Bond, opts), [
      bond.fromAtomId,
      bond.toAtomId,
    ]);
    return { next, extra: { newAtomIds: [], newBondIds: [id] } };
  },
};

const updateBondCmd: MoleculeCommand<z.infer<typeof schemas.updateBond>> = {
  id: CMD.UpdateBond,
  description:
    'Update bond order, stereo, aromatic, query type, dative, dotted (H-bond), and/or bold. Applied even if valency is exceeded (the sketcher shows an octet warning) unless strict=true, which fails with a reason instead.',
  inputSchema: schemas.updateBond,
  apply: (prev, input) => {
    const patch: Partial<
      Pick<Bond, 'order' | 'stereo' | 'orderCycleRamp' | 'dative' | 'dotted' | 'aromatic' | 'queryType' | 'bold'>
    > = {};
    if (input.order !== undefined) patch.order = input.order;
    // `null` → clear (Zod omits bare `undefined`, so clients must send null).
    if ('stereo' in input) patch.stereo = input.stereo ?? undefined;
    if ('orderCycleRamp' in input) patch.orderCycleRamp = input.orderCycleRamp ?? undefined;
    if ('dative' in input) patch.dative = input.dative;
    if ('dotted' in input) patch.dotted = input.dotted;
    if ('aromatic' in input) patch.aromatic = input.aromatic;
    if ('queryType' in input) patch.queryType = input.queryType ?? undefined;
    if ('bold' in input) patch.bold = input.bold;
    const opts = { strict: input.strict === true };
    if (opts.strict) {
      const reason = Mut.explainBondUpdateRejection(prev, input.bondId, patch, opts);
      if (reason) throw new Error(`Cannot update bond: ${reason}.`);
    }
    return { next: Mut.updateBondSafe(prev, input.bondId, patch, opts) };
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

const addRingCmd: MoleculeCommand<z.infer<typeof schemas.addRing>, NewIdsExtra> = {
  id: CMD.AddRing,
  description:
    'Add a ring (benzene = aromatic, cyclopentadiene = isCyclopentadiene). Optionally fuse via `fusedBondId` or attach via `rootAtomId`.',
  inputSchema: schemas.addRing,
  apply: (prev, params) => {
    const reused: string[] = [];
    if (params.rootAtomId) reused.push(params.rootAtomId);
    if (params.fusedBondId) {
      const fb = prev.bonds.find(b => b.id === params.fusedBondId);
      if (fb) reused.push(fb.fromAtomId, fb.toAtomId);
    }
    return withNewAtomIds(prev, Mut.addRing(prev, params), reused);
  },
};

const addBoatRingCmd: MoleculeCommand<
  z.infer<typeof schemas.addBoatRing>,
  NewIdsExtra
> = {
  id: CMD.AddBoatRing,
  description: 'Add a boat-conformer cyclohexane ring at `center`.',
  inputSchema: schemas.addBoatRing,
  apply: (prev, { center, bondLengthPx, rootAtomId, attachedViaBond, rotationRad }) =>
    withNewAtomIds(
      prev,
      Mut.addBoatRing(
        prev,
        center,
        bondLengthPx ?? 40,
        rootAtomId,
        attachedViaBond,
        rotationRad,
      ),
    ),
};

const addChairRingCmd: MoleculeCommand<
  z.infer<typeof schemas.addChairRing>,
  NewIdsExtra
> = {
  id: CMD.AddChairRing,
  description: 'Add a chair-conformer cyclohexane ring at `center`.',
  inputSchema: schemas.addChairRing,
  apply: (prev, { center, bondLengthPx, rootAtomId, attachedViaBond, rotationRad }) =>
    withNewAtomIds(
      prev,
      Mut.addChairRing(prev, center, bondLengthPx, rootAtomId, attachedViaBond, rotationRad),
    ),
};

const addChainCmd: MoleculeCommand<z.infer<typeof schemas.addChain>, NewIdsExtra> = {
  id: CMD.AddChain,
  description: 'Add an alkyl chain through the given world points.',
  inputSchema: schemas.addChain,
  apply: (prev, { points, placementElement, startAtomId }) =>
    withNewAtomIds(
      prev,
      Mut.addChain(prev, points, placementElement, startAtomId),
      startAtomId ? [startAtomId] : undefined,
    ),
};

// ─── Strokes / arrows / text ───────────────────────────────────────────────

const addStrokeCmd: MoleculeCommand<z.infer<typeof schemas.addStroke>> = {
  id: CMD.AddStroke,
  description: 'Add a freehand pencil stroke (polyline of canvas points with colour and thickness) as a non-chemical annotation.',
  inputSchema: schemas.addStroke,
  apply: (prev, { stroke }) => ({ next: Mut.addStroke(prev, stroke) }),
};

const translateStrokeCmd: MoleculeCommand<z.infer<typeof schemas.translateStroke>> = {
  id: CMD.TranslateStroke,
  description: 'Move a pencil stroke by (dx, dy) canvas px; stroke ids come from molecule.list_annotations.',
  inputSchema: schemas.translateStroke,
  apply: (prev, { id, dx, dy }) => ({ next: Mut.translateStroke(prev, id, dx, dy) }),
};

const translateMarqueeSelectionCmd: MoleculeCommand<
  z.infer<typeof schemas.translateMarqueeSelection>
> = {
  id: CMD.TranslateMarqueeSelection,
  description: 'Move atoms and marquee-selected annotations together.',
  inputSchema: schemas.translateMarqueeSelection,
  apply: (prev, input) => ({ next: Mut.translateMarqueeSelection(prev, input) }),
};

const addReactionArrowCmd: MoleculeCommand<z.infer<typeof schemas.addReactionArrow>> = {
  id: CMD.AddReactionArrow,
  description:
    'Add a reaction arrow. kind: straight | curved | resonance (solid ↔) | electron_flow (mechanism) | equilibrium | … Prefer fromAnchor/toAnchor ({type:atom|bond|lone_pair}) for electron_flow; set headStyle single|pair and optional curveAmount. Absolute x1,y1,x2,y2 remain required fallbacks.',
  inputSchema: schemas.addReactionArrow,
  apply: (prev, { arrow }) => ({ next: Mut.addReactionArrow(prev, arrow) }),
};

const updateReactionArrowCmd: MoleculeCommand<z.infer<typeof schemas.updateReactionArrow>> = {
  id: CMD.UpdateReactionArrow,
  description:
    'Patch a reaction arrow (endpoints, kind, anchors, curveAmount, headStyle, reagents). Pass fromAnchor/toAnchor null to clear anchors.',
  inputSchema: schemas.updateReactionArrow,
  apply: (prev, { id, ...patch }) => ({
    next: Mut.updateReactionArrow(
      prev,
      id,
      patch as Parameters<typeof Mut.updateReactionArrow>[2],
    ),
  }),
};

const deleteReactionArrowCmd: MoleculeCommand<z.infer<typeof schemas.deleteReactionArrow>> = {
  id: CMD.DeleteReactionArrow,
  description: 'Delete a reaction arrow by id (ids from molecule.list_annotations or get_canvas_state). Molecules are untouched.',
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
  description: 'Delete a free-standing canvas text label by id (ids from molecule.list_annotations).',
  inputSchema: schemas.deleteCanvasText,
  apply: (prev, { id }) => ({ next: Mut.deleteCanvasText(prev, id) }),
};

const addSruBracketCmd: MoleculeCommand<z.infer<typeof schemas.addSruBracket>> = {
  id: CMD.AddSruBracket,
  description: 'Add ChemDraw-style polymer SRU brackets around a repeat unit.',
  inputSchema: schemas.addSruBracket,
  apply: (prev, { bracket }) => ({ next: Mut.addSruBracket(prev, bracket) }),
};

const updateSruBracketCmd: MoleculeCommand<z.infer<typeof schemas.updateSruBracket>> = {
  id: CMD.UpdateSruBracket,
  description: 'Patch polymer SRU bracket geometry, members, or subscript.',
  inputSchema: schemas.updateSruBracket,
  apply: (prev, { id, patch }) => ({ next: Mut.updateSruBracket(prev, id, patch) }),
};

const deleteSruBracketCmd: MoleculeCommand<z.infer<typeof schemas.deleteSruBracket>> = {
  id: CMD.DeleteSruBracket,
  description: 'Delete polymer SRU brackets (atoms are kept).',
  inputSchema: schemas.deleteSruBracket,
  apply: (prev, { id }) => ({ next: Mut.deleteSruBracket(prev, id) }),
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

const addCanvasOrbitalCmd: MoleculeCommand<z.infer<typeof schemas.addCanvasOrbital>> = {
  id: CMD.AddCanvasOrbital,
  description: 'Place an s / p / d atomic-orbital annotation on the canvas.',
  inputSchema: schemas.addCanvasOrbital,
  apply: (prev, { orbital }) => ({ next: Mut.addCanvasOrbital(prev, orbital as CanvasOrbital) }),
};

const deleteCanvasOrbitalCmd: MoleculeCommand<z.infer<typeof schemas.deleteCanvasOrbital>> = {
  id: CMD.DeleteCanvasOrbital,
  description: 'Delete an atomic-orbital annotation by id.',
  inputSchema: schemas.deleteCanvasOrbital,
  apply: (prev, { id }) => ({ next: Mut.deleteCanvasOrbital(prev, id) }),
};

const updateCanvasOrbitalCmd: MoleculeCommand<z.infer<typeof schemas.updateCanvasOrbital>> = {
  id: CMD.UpdateCanvasOrbital,
  description: 'Move, rotate, or reattach an atomic-orbital annotation.',
  inputSchema: schemas.updateCanvasOrbital,
  apply: (prev, { id, patch }) => ({
    next: Mut.updateCanvasOrbital(prev, id, patch as Parameters<typeof Mut.updateCanvasOrbital>[2]),
  }),
};

const addCanvasShapeCmd: MoleculeCommand<z.infer<typeof schemas.addCanvasShape>> = {
  id: CMD.AddCanvasShape,
  description:
    'Add a canvas annotation shape or lab glassware (rectangle/line/circle/triangle/star, or glassware kinds from GLASSWARE_SHAPE_KIND_ORDER such as round_bottom_flask, condenser, separatory_funnel). Prefer molecule.place_glassware for AI. Glassware outline is black; optional fillColor/fillLevel = liquid.',
  inputSchema: schemas.addCanvasShape,
  apply: (prev, { shape }) => ({ next: Mut.addCanvasShape(prev, shape as CanvasShape) }),
};

const updateCanvasShapeCmd: MoleculeCommand<z.infer<typeof schemas.updateCanvasShape>> = {
  id: CMD.UpdateCanvasShape,
  description:
    "Patch a canvas shape's geometry, outline, or glassware liquid fill (fillColor/fillLevel).",
  inputSchema: schemas.updateCanvasShape,
  apply: (prev, { id, patch }) => ({
    next: Mut.updateCanvasShape(prev, id, patch as Partial<Omit<CanvasShape, 'id'>>),
  }),
};

const translateCanvasShapesCmd: MoleculeCommand<z.infer<typeof schemas.translateCanvasShapes>> = {
  id: CMD.TranslateCanvasShapes,
  description: 'Translate one or more canvas shapes by the same world delta (grouped move).',
  inputSchema: schemas.translateCanvasShapes,
  apply: (prev, { ids, dx, dy }) => ({ next: Mut.translateCanvasShapes(prev, ids, dx, dy) }),
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

const reflectCanvasShapeCmd: MoleculeCommand<z.infer<typeof schemas.reflectCanvasShape>> = {
  id: CMD.ReflectCanvasShape,
  description:
    'Reflect a canvas shape or glassware horizontally (left↔right) or vertically (top↔bottom) about its center.',
  inputSchema: schemas.reflectCanvasShape,
  apply: (prev, { id, axis }) => ({
    next: Mut.reflectCanvasShape(prev, id, axis),
  }),
};

const addCanvasImageCmd: MoleculeCommand<z.infer<typeof schemas.addCanvasImage>> = {
  id: CMD.AddCanvasImage,
  description: 'Add a raster image annotation to the canvas.',
  inputSchema: schemas.addCanvasImage,
  apply: (prev, { image }) => ({ next: Mut.addCanvasImage(prev, image as CanvasImage) }),
};

const updateCanvasImageCmd: MoleculeCommand<z.infer<typeof schemas.updateCanvasImage>> = {
  id: CMD.UpdateCanvasImage,
  description: 'Patch a canvas image (position, size, rotation).',
  inputSchema: schemas.updateCanvasImage,
  apply: (prev, { id, patch }) => ({ next: Mut.updateCanvasImage(prev, id, patch) }),
};

const deleteCanvasImageCmd: MoleculeCommand<z.infer<typeof schemas.deleteCanvasImage>> = {
  id: CMD.DeleteCanvasImage,
  description: 'Delete an embedded canvas image by id (ids from molecule.list_annotations).',
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
  apply: (prev, hit) => {
    if (hit.type === 'canvasShape') {
      const ids = siblingShapeIdsInCollection(prev, hit.id);
      let next = prev;
      for (const id of ids) next = Mut.deleteCanvasShape(next, id);
      return { next };
    }
    return { next: Mut.eraseAt(prev, hit) };
  },
};

const deleteStrokeCmd: MoleculeCommand<z.infer<typeof schemas.deleteStroke>> = {
  id: CMD.DeleteStroke,
  description: 'Delete a freehand pencil stroke by id (ids from molecule.list_annotations).',
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
      gridOrigin: input.gridOrigin,
    });
    if (!prepared.ok) {
      throw new Error(prepared.error);
    }
    // Search / merge imports: stay in the current view and skip existing molecules.
    const placed =
      input.mode === 'merge' && prev.atoms.length > 0
        ? placeMergedFragment(prev, prepared, input.bondLengthPx, {
            viewport: input.viewport ?? { x: 0, y: 0, zoom: 1 },
            windowWidth: input.windowWidth ?? 1200,
            windowHeight: input.windowHeight ?? 800,
          })
        : prepared;
    const next =
      input.mode === 'replace'
        ? Mut.replaceStructureFromImport(
            prev,
            placed.atoms,
            placed.bonds,
            input.keepAnnotations ?? true,
          )
        : Mut.mergeImportedStructure(prev, placed.atoms, placed.bonds);
    return { next, extra: { newAtomIds: placed.atoms.map(a => a.id) } };
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
      gridOrigin: input.gridOrigin,
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
 * Structure cleanup on this thread via native 2D layout.
 * In-app editor prefers the worker path (async Indigo + native fallback) when
 * `@moldraw/engine-2d` is wired; this command stays free of that optional peer.
 */
const cleanupCmd: MoleculeCommand<z.infer<typeof schemas.cleanup>> = {
  id: CMD.Cleanup,
  description: 'Auto-layout (clean up) via native 2D engine (optional Indigo accelerator in worker).',
  inputSchema: schemas.cleanup,
  apply: (prev, input) => {
    if (prev.atoms.length === 0) return { next: prev };
    const bondLen = resolveCleanupBondLength(prev, input.bondLengthPx);
    const result = cleanupMolecule(prev, {
      bondLengthPx: bondLen,
      preserveOrientation: true,
    });
    const laid = result.molecule;
    if (!laid) {
      throw new Error('Cleanup failed');
    }
    // Rematch each fragment into its pre-cleanup local frame (position + heading).
    const cleanedById = new Map(laid.atoms.map(a => [a.id, { x: a.x, y: a.y }]));
    const next = alignCleanupCoordsPerComponent(prev, cleanedById);
    // Polymer SRU brackets track member atoms — resync AABB after layout.
    return { next: Mut.syncSruBracketsToAtoms(next) };
  },
};

/**
 * Apply Indigo aromatize/dearomatize bond orders onto the live graph.
 * The worker produces `molBlock`; this command merges it for undo/redo.
 */
const aromatizeCmd: MoleculeCommand<z.infer<typeof schemas.aromatize>> = {
  id: CMD.Aromatize,
  description: 'Aromatize or dearomatize bonds (native perceiveAromaticity / kekulize).',
  inputSchema: schemas.aromatize,
  apply: (prev, { molBlock, atomIds }) => {
    if (prev.atoms.length === 0) return { next: prev };
    const next = Mut.mergeBondOrdersFromMolblock(prev, molBlock, atomIds);
    if (next === prev) {
      throw new Error('Aromatize/dearomatize could not merge bond orders (topology mismatch).');
    }
    return { next };
  },
};

/**
 * Apply Indigo convert_explicit_hydrogens (fold / unfold) onto the live graph.
 * Worker produces `molBlock`; this command merges it for undo/redo.
 */
const applyExplicitHydrogensCmd: MoleculeCommand<
  z.infer<typeof schemas.applyExplicitHydrogens>
> = {
  id: CMD.ApplyExplicitHydrogens,
  description:
    'Fold or unfold explicit hydrogens via Indigo (convert_explicit_hydrogens).',
  inputSchema: schemas.applyExplicitHydrogens,
  apply: (prev, { molBlock }) => {
    if (prev.atoms.length === 0) return { next: prev };
    const next = mergeExplicitHydrogensFromMolblock(prev, molBlock);
    if (!next) {
      throw new Error('Explicit-hydrogen convert could not merge result.');
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
  description: 'Clear all reaction atom-atom mapping numbers (set by molecule.automap or setAtomMap) from every atom.',
  inputSchema: schemas.clearAtomMaps,
  apply: (prev) => ({ next: Mut.clearAtomMaps(prev) }),
};

/** Shift a freshly laid-out fragment into the current view without overlapping existing molecules. */
const placeMergedFragment = (
  prev: Molecule,
  fragment: { atoms: Atom[]; bonds: Bond[] },
  bondLengthPx = 40,
  view?: ImportViewPlacement,
): { atoms: Atom[]; bonds: Bond[] } => ({
  atoms: offsetImportedInViewport(prev, fragment.atoms, {
    bondLengthPx,
    viewport: view?.viewport,
    windowWidth: view?.windowWidth,
    windowHeight: view?.windowHeight,
  }),
  bonds: fragment.bonds,
});

/**
 * Parse a SMILES string and add it to the canvas with Indigo 2D layout.
 * Requires Indigo WASM already loaded (in-app prefers worker SMILES_TO_MOLBLOCK).
 */
const importSmilesCmd: MoleculeCommand<
  z.infer<typeof schemas.importSmiles>,
  NewIdsExtra
> = {
  id: CMD.ImportSmiles,
  description:
    'Parse a SMILES string (strict syntax check with positioned errors) and add the 2D-laid-out structure. Tetrahedral @/@@ and cis/trans marks become wedge/dash bonds. mode "merge" places it beside existing content; "replace" clears the structure first.',
  inputSchema: schemas.importSmiles,
  references: 'lenient',
  tags: ['import'],
  apply: (prev, { smiles, mode }) => {
    // Strict parse: throws `SmilesSyntaxError` with character positions.
    // Do not kekulize — aromatic SMILES stay aromatic on the canvas; Kekulé
    // SMILES stay explicit doubles. Toolbar Aromatize / Dearomatize convert later.
    const parsed = parseSmilesToMolecule(smiles, { strict: true });
    if (parsed.atoms.length === 0) {
      throw new Error(`Could not parse SMILES: ${smiles}`);
    }
    const laidRaw = engine.generate2D(parsed);
    const laid = applyModelStereoToDepiction(laidRaw);
    if (mode === 'replace') {
      return {
        next: Mut.replaceStructureFromImport(prev, laid.atoms, laid.bonds, true),
        extra: { newAtomIds: laid.atoms.map(a => a.id), newBondIds: laid.bonds.map(b => b.id) },
      };
    }
    const placed = placeMergedFragment(prev, laid, 40);
    return {
      next: Mut.mergeImportedStructure(prev, placed.atoms, placed.bonds),
      extra: {
        newAtomIds: placed.atoms.map(a => a.id),
        newBondIds: placed.bonds.map(b => b.id),
      },
    };
  },
};

const mergeSketchCmd: MoleculeCommand<z.infer<typeof schemas.mergeSketch>> = {
  id: CMD.MergeSketch,
  description:
    'Merge a recognized sketch (atoms + bonds) onto the molecule, snapping temp ids onto existing atoms. One undo step.',
  inputSchema: schemas.mergeSketch,
  apply: (prev, input) => ({ next: Mut.mergeSketch(prev, input) }),
};

const pasteFragmentCmd: MoleculeCommand<
  z.infer<typeof schemas.pasteFragment>,
  { newAtomIds: string[] }
> = {
  id: CMD.PasteFragment,
  description:
    'Paste a fragment (atoms + bonds), regenerating ids and translating by (dx, dy). Returns the new atom ids.',
  inputSchema: schemas.pasteFragment,
  apply: (prev, { atoms, bonds, dx, dy, viewport, windowWidth, windowHeight, bondLengthPx }) => {
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
    const placedAtoms = offsetImportedInViewport(prev, newAtoms, {
      bondLengthPx: bondLengthPx ?? 40,
      viewport,
      windowWidth,
      windowHeight,
    });
    const newAtomIds = placedAtoms.map(a => a.id);
    const joined = joinAtomsIntoPerspectivePose(
      {
        ...prev,
        atoms: [...prev.atoms, ...placedAtoms],
        bonds: [...prev.bonds, ...newBonds],
      },
      newAtomIds,
    );
    return {
      next: growDendrimerSeed(joined, newAtomIds),
      extra: { newAtomIds },
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
      kind: input.placementKind ?? ('functional_group' as const),
    };
    const r = commitFragmentPlacement(
      prev,
      session,
      input.commit,
      input.bondLengthPx,
      input.bondAngleSnapRad,
    );
    return {
      next: growDendrimerSeed(r.molecule, r.newAtomIds),
      extra: { newAtomIds: r.newAtomIds },
    };
  },
};

const commitAtomAliasCmd: MoleculeCommand<z.infer<typeof schemas.commitAtomAlias>> = {
  id: CMD.CommitAtomAlias,
  description:
    'Commit a validated atom alias (may update element/charge and clamp lone pairs). Trailing +/− set formal charge. BH4 → B−; NaBH4 → Na⁺ plus BH4− with no covalent Na–B bond. COONa stays a condensed alias (expand via show explicit).',
  inputSchema: schemas.commitAtomAlias,
  apply: (prev, { atomId, alias }) => {
    const formatted = autocapitalizeAtomAliasDraft(alias);
    const v = validateAtomAliasForMolecule(prev, atomId, formatted);
    if (!v.ok) throw new Error(v.reason);
    const draft = v.body.trim() ? v.body.trim() : '';
    const labelBody = v.body.trim();
    if (labelBody && looksLikeExpandableFormulaLabel(labelBody)) {
      const hasSymbolicRepeat = /\)[nm](?![A-Za-z0-9])/i.test(labelBody);
      if (!hasSymbolicRepeat && !condensedToSmiles(labelBody)) {
        throw new Error('Could not parse condensed formula label');
      }
    }
    let next: Molecule = {
      ...prev,
      atoms: prev.atoms.map(a => {
        if (a.id !== atomId) return a;
        if (!draft) {
          const cleared: Atom = { ...a };
          delete cleared.alias;
          return cleared;
        }
        const bondOrderSum = prev.bonds
          .filter(b => b.fromAtomId === a.id || b.toAtomId === a.id)
          .reduce((sum, b) => sum + b.order, 0);
        const nextCharge = v.charge != null ? v.charge : a.charge;
        const maxLP = getMaxLonePairsForAtom(v.element, nextCharge, bondOrderSum);
        const nextLP = Math.min(a.lonePairs ?? 0, maxLP);
        // Store body without charge suffix; formal charge is drawn separately.
        const body = v.body.trim();
        const aliasOut =
          !body || body.toUpperCase() === v.element.toUpperCase() ? undefined : body;
        const updated: Atom = {
          ...a,
          element: v.element,
          charge: nextCharge,
          lonePairs: nextLP,
        };
        if (aliasOut) updated.alias = aliasOut;
        else delete updated.alias;
        return updated;
      }),
    };
    if (v.nearbyIon) {
      const anchor = next.atoms.find(a => a.id === atomId);
      if (anchor) {
        const pos = placeUnbondedNeighbor(next.atoms, anchor);
        next = Mut.addAtom(next, {
          id: newId(),
          element: v.nearbyIon.element,
          x: pos.x,
          y: pos.y,
          charge: v.nearbyIon.charge,
        });
      }
    }
    return { next };
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

const applyMarkupHighlightCmd: MoleculeCommand<z.infer<typeof schemas.applyMarkupHighlight>> = {
  id: CMD.ApplyMarkupHighlight,
  description:
    'Add or clear an opaque highlighter fill on selected atoms/bonds without changing their color.',
  inputSchema: schemas.applyMarkupHighlight,
  apply: (prev, { color, atomIds, bondIds }) => ({
    next: applyMarkupHighlight(prev, color, atomIds, bondIds),
  }),
};

const setStructureThemeCmd: MoleculeCommand<z.infer<typeof schemas.setStructureTheme>> = {
  id: CMD.SetStructureTheme,
  description:
    'Set the 2D structure look: skeletal (Default) or ball-stick (Simple). Same command as the Style theme dropdown.',
  inputSchema: schemas.setStructureTheme,
  apply: (prev, input) => ({ next: setStructureTheme(prev, input) }),
};

const applySelectionColorCmd: MoleculeCommand<z.infer<typeof schemas.applySelectionColor>> = {
  id: CMD.ApplySelectionColor,
  description: 'Apply a color to selected atoms/bonds/annotations per target flags.',
  inputSchema: schemas.applySelectionColor,
  apply: (prev, input) => ({
    next: applyColorToMolecule(prev, input.color, input.flags, {
      selectedAtomIds: input.selectedAtomIds,
      selectedBondIds: input.selectedBondIds,
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

const applySelectionDisplayStyleCmd: MoleculeCommand<
  z.infer<typeof schemas.applySelectionDisplayStyle>
> = {
  id: CMD.ApplySelectionDisplayStyle,
  description:
    'Set or clear per-atom label font size, per-bond thickness, and/or opacity (0–1) for a selection.',
  inputSchema: schemas.applySelectionDisplayStyle,
  apply: (prev, input) => ({
    next: applySelectionDisplayStyle(prev, input),
  }),
};

const createObjectCollectionCmd: MoleculeCommand<
  z.infer<typeof schemas.createObjectCollection>,
  { collectionId: string }
> = {
  id: CMD.CreateObjectCollection,
  description: 'Create a renamable collection (folder) in the Objects panel outline.',
  inputSchema: schemas.createObjectCollection,
  apply: (prev, input) => {
    const r = createObjectCollection(prev, input);
    return { next: r.molecule, extra: { collectionId: r.collectionId } };
  },
};

const expandInstanceArraysCmd: MoleculeCommand<
  z.infer<typeof schemas.expandInstanceArrays>
> = {
  id: CMD.ExpandInstanceArrays,
  description:
    'Expand InstanceArray placements (hex/circular instancing) into real atoms and clear the arrays.',
  inputSchema: schemas.expandInstanceArrays,
  apply: prev => ({ next: expandInstanceArrays(prev) }),
};

const renameObjectOutlineCmd: MoleculeCommand<z.infer<typeof schemas.renameObjectOutline>> = {
  id: CMD.RenameObjectOutline,
  description: 'Rename an Objects-panel item or collection.',
  inputSchema: schemas.renameObjectOutline,
  apply: (prev, { key, name }) => ({ next: renameObjectOutline(prev, key, name) }),
};

const deleteObjectCollectionCmd: MoleculeCommand<z.infer<typeof schemas.deleteObjectCollection>> = {
  id: CMD.DeleteObjectCollection,
  description:
    'Delete an Objects-panel collection. With deleteContents, annotation children (shapes, text, …) are removed; molecule fragments are only unparented.',
  inputSchema: schemas.deleteObjectCollection,
  apply: (prev, { collectionId, deleteContents }) => ({
    next: deleteObjectCollection(prev, collectionId, { deleteContents }),
  }),
};

const setObjectOutlineParentCmd: MoleculeCommand<z.infer<typeof schemas.setObjectOutlineParent>> = {
  id: CMD.SetObjectOutlineParent,
  description: 'Move an Objects-panel item into or out of a collection.',
  inputSchema: schemas.setObjectOutlineParent,
  apply: (prev, { key, collectionId }) => ({
    next: setObjectOutlineParent(prev, key, collectionId),
  }),
};

const setObjectCollectionCollapsedCmd: MoleculeCommand<
  z.infer<typeof schemas.setObjectCollectionCollapsed>
> = {
  id: CMD.SetObjectCollectionCollapsed,
  description: 'Collapse or expand an Objects-panel collection.',
  inputSchema: schemas.setObjectCollectionCollapsed,
  apply: (prev, { collectionId, collapsed }) => ({
    next: setObjectCollectionCollapsed(prev, collectionId, collapsed),
  }),
};

const reorderObjectOutlineCmd: MoleculeCommand<z.infer<typeof schemas.reorderObjectOutline>> = {
  id: CMD.ReorderObjectOutline,
  description: 'Reorder Objects-panel items (drag-and-drop).',
  inputSchema: schemas.reorderObjectOutline,
  apply: (prev, { orderedKeys }) => ({ next: reorderObjectOutline(prev, orderedKeys) }),
};

const moveObjectOutlineCmd: MoleculeCommand<z.infer<typeof schemas.moveObjectOutline>> = {
  id: CMD.MoveObjectOutline,
  description: 'Move an Objects-panel item up or down among siblings.',
  inputSchema: schemas.moveObjectOutline,
  apply: (prev, { key, direction }) => ({ next: moveObjectOutline(prev, key, direction) }),
};

const placeObjectOutlineItemCmd: MoleculeCommand<
  z.infer<typeof schemas.placeObjectOutlineItem>
> = {
  id: CMD.PlaceObjectOutlineItem,
  description: 'Place an Objects-panel item before another item or into a collection (drag-drop).',
  inputSchema: schemas.placeObjectOutlineItem,
  apply: (prev, { key, targetKey }) => ({
    next: placeObjectOutlineItem(prev, key, targetKey),
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
      return { next: Mut.syncSruBracketsToAtoms(next, input.subsetAtomIds) };
    }
    const next = mergeGlobalCleanup(prev, input.molBlock);
    if (next === prev) {
      throw new Error('Cleanup could not be applied (structure mismatch).');
    }
    return { next: Mut.syncSruBracketsToAtoms(next) };
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

const insertDemoMechanismCmd: MoleculeCommand<
  z.infer<typeof schemas.insertDemoMechanism>,
  { newAtomIds: string[] }
> = {
  id: CMD.InsertDemoMechanism,
  description:
    'Replace the canvas with a multi-step carbonyl-addition mechanism plus enolate resonance (anchored electron_flow and ↔ arrows) for placement QA.',
  inputSchema: schemas.insertDemoMechanism,
  apply: () => {
    const next = buildDemoMechanismMolecule();
    return {
      next,
      extra: { newAtomIds: next.atoms.map(a => a.id) },
    };
  },
};

const apply3DPoseCmd: MoleculeCommand<z.infer<typeof schemas.apply3DPose>> = {
  id: CMD.Apply3DPose,
  description: 'Apply a canvas 3D perspective pose (ChemDraw-style Structure Perspective).',
  inputSchema: schemas.apply3DPose,
  apply: (prev, { pose }) => ({ next: apply3DPose(prev, pose) }),
};

const clear3DPoseCmd: MoleculeCommand<z.infer<typeof schemas.clear3DPose>> = {
  id: CMD.Clear3DPose,
  description: 'Clear the canvas 3D perspective pose without changing 2D atom coordinates.',
  inputSchema: schemas.clear3DPose,
  apply: prev => ({ next: clear3DPose(prev) }),
};

const flatten3DPoseCmd: MoleculeCommand<z.infer<typeof schemas.flatten3DPose>> = {
  id: CMD.Flatten3DPose,
  description: 'Project the 3D perspective pose onto Atom.x/y and clear the pose (Flatten to 2D).',
  inputSchema: schemas.flatten3DPose,
  apply: prev => ({ next: Mut.syncSruBracketsToAtoms(flatten3DPose(prev)) }),
};

const rotate3DPoseCmd: MoleculeCommand<z.infer<typeof schemas.rotate3DPose>> = {
  id: CMD.Rotate3DPose,
  description: 'Rotate the canvas 3D perspective pose about its centroid (radians about X then Y).',
  inputSchema: schemas.rotate3DPose,
  apply: (prev, { dAngleX, dAngleY }) => ({ next: rotateCofViewOrPose(prev, dAngleX, dAngleY) }),
};

const setPerspectiveDepthShadingCmd: MoleculeCommand<
  z.infer<typeof schemas.setPerspectiveDepthShading>
> = {
  id: CMD.SetPerspectiveDepthShading,
  description: 'Toggle depth shading for the active canvas 3D perspective pose.',
  inputSchema: schemas.setPerspectiveDepthShading,
  apply: (prev, { depthShading }) => ({ next: setPerspectiveDepthShading(prev, depthShading) }),
};

const setPerspectiveDepthFadeCmd: MoleculeCommand<
  z.infer<typeof schemas.setPerspectiveDepthFade>
> = {
  id: CMD.SetPerspectiveDepthFade,
  description: 'Set depth-fade strength (0–1.5) for the active canvas 3D perspective pose.',
  inputSchema: schemas.setPerspectiveDepthFade,
  apply: (prev, { depthFade }) => ({ next: setPerspectiveDepthFade(prev, depthFade) }),
};

const setPerspectiveDepthWedgesCmd: MoleculeCommand<
  z.infer<typeof schemas.setPerspectiveDepthWedges>
> = {
  id: CMD.SetPerspectiveDepthWedges,
  description:
    'Toggle ChemDraw-style depth taper (thick toward viewer, thin away) for the active perspective pose.',
  inputSchema: schemas.setPerspectiveDepthWedges,
  apply: (prev, { depthWedges }) => ({ next: setPerspectiveDepthWedges(prev, depthWedges) }),
};

const ALL_COMMANDS: readonly MoleculeCommand<unknown, unknown>[] = [
  addAtomCmd,
  updateAtomElementCmd,
  updateAtomChargeCmd,
  setAtomChargeCmd,
  setAtomDeltaChargeCmd,
  setAtomChargeOffsetCmd,
  setAtomDeltaChargeOffsetCmd,
  setAtomsShowElementLabelCmd,
  updateAtomLonePairsCmd,
  setAtomLonePairSideCmd,
  setAtomRadicalCmd,
  setAtomRadicalIonCmd,
  setAtomIsotopeCmd,
  setAtomAliasCmd,
  addExplicitHydrogensCmd,
  moveAtomsCmd,
  applyCoordsTableCmd,
  rotateAtomsCmd,
  scaleAtomsCmd,
  reflectAtomsCmd,
  alignSelectedFragmentsCmd,
  distributeSelectedFragmentsCmd,
  circularArraySelectionCmd,
  linearArraySelectionCmd,
  dendrimerArraySelectionCmd,
  groupSelectionCmd,
  ungroupSelectionCmd,
  generateCofCmd,
  generateDendrimerCmd,
  generatePolymerCmd,
  generateGrapheneCmd,
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
  translateStrokeCmd,
  translateMarqueeSelectionCmd,
  addReactionArrowCmd,
  updateReactionArrowCmd,
  deleteReactionArrowCmd,
  duplicateReactionArrowCmd,
  addReactionMultiStepCmd,
  addCanvasTextCmd,
  updateCanvasTextCmd,
  deleteCanvasTextCmd,
  duplicateCanvasTextCmd,
  addSruBracketCmd,
  updateSruBracketCmd,
  deleteSruBracketCmd,
  duplicateStrokeCmd,
  addCanvasOrbitalCmd,
  deleteCanvasOrbitalCmd,
  updateCanvasOrbitalCmd,
  addCanvasShapeCmd,
  updateCanvasShapeCmd,
  translateCanvasShapesCmd,
  duplicateCanvasShapeCmd,
  reflectCanvasShapeCmd,
  addCanvasImageCmd,
  updateCanvasImageCmd,
  deleteCanvasImageCmd,
  duplicateCanvasImageCmd,
  clearAllCmd,
  pasteFragmentCmd,
  mergeSketchCmd,
  eraseCmd,
  deleteStrokeCmd,
  deleteCanvasShapeCmd,
  applyRingFillCmd,
  importMolblockCmd,
  replaceFromMolblockCmd,
  cleanupCmd,
  aromatizeCmd,
  applyExplicitHydrogensCmd,
  applyAtomMapsCmd,
  clearAtomMapsCmd,
  importSmilesCmd,
  mergeImportedStructureCmd,
  replaceImportedStructureCmd,
  commitFragmentPlacementCmd,
  commitAtomAliasCmd,
  expandAliasCmd,
  applyMarkupHighlightCmd,
  setStructureThemeCmd,
  applySelectionColorCmd,
  clearSelectionColorsCmd,
  applySelectionDisplayStyleCmd,
  createObjectCollectionCmd,
  expandInstanceArraysCmd,
  renameObjectOutlineCmd,
  deleteObjectCollectionCmd,
  setObjectOutlineParentCmd,
  setObjectCollectionCollapsedCmd,
  reorderObjectOutlineCmd,
  moveObjectOutlineCmd,
  placeObjectOutlineItemCmd,
  applyCleanupResultCmd,
  insertDemoReactionCmd,
  insertDemoMechanismCmd,
  apply3DPoseCmd,
  clear3DPoseCmd,
  flatten3DPoseCmd,
  rotate3DPoseCmd,
  setPerspectiveDepthShadingCmd,
  setPerspectiveDepthFadeCmd,
  setPerspectiveDepthWedgesCmd,
  transactionCmd,
] as readonly MoleculeCommand<unknown, unknown>[];

const REGISTRY: ReadonlyMap<string, MoleculeCommand<unknown, unknown>> = new Map(
  ALL_COMMANDS.map((c) => [c.id, c]),
);

export const getCommand = (id: string): MoleculeCommand<unknown, unknown> | undefined =>
  REGISTRY.get(id);

export const listCommandIds = (): string[] => [...REGISTRY.keys()];

export const listCommands = (): readonly MoleculeCommand<unknown, unknown>[] => ALL_COMMANDS;

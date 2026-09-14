/**
 * Catalogue metadata for commands (visibility / destructive / idempotent / tags).
 *
 * Kept as a table so the registry entries stay thin and so the AI/MCP layer
 * can build toolsets (`core` ≈ everyday chemistry drawing, `advanced` adds
 * arrays / perspective / styling, `full` exposes canvas-tool plumbing too).
 * A command's own `visibility` / `destructive` / … fields override the table.
 */
import { CMD } from './registry';
import type { AnyMoleculeCommand, CommandVisibility } from './types';

export interface CommandMeta {
  visibility: CommandVisibility;
  destructive: boolean;
  idempotent: boolean;
  tags: readonly string[];
}

type MetaPatch = Partial<CommandMeta>;

const core = (tags: string[], patch: MetaPatch = {}): MetaPatch => ({ visibility: 'core', tags, ...patch });
const adv = (tags: string[], patch: MetaPatch = {}): MetaPatch => ({ visibility: 'advanced', tags, ...patch });
const internal = (tags: string[], patch: MetaPatch = {}): MetaPatch => ({
  visibility: 'internal',
  tags,
  ...patch,
});
const D = { destructive: true } as const;
const I = { idempotent: true } as const;

const TABLE: Record<string, MetaPatch> = {
  // Atoms
  [CMD.AddAtom]: core(['atoms', 'draw']),
  [CMD.UpdateAtomElement]: core(['atoms', 'edit'], I),
  [CMD.UpdateAtomCharge]: core(['atoms', 'edit']),
  [CMD.SetAtomCharge]: core(['atoms', 'edit'], I),
  [CMD.SetAtomDeltaCharge]: adv(['atoms', 'teaching'], I),
  [CMD.SetAtomChargeOffset]: adv(['atoms', 'layout'], I),
  [CMD.SetAtomDeltaChargeOffset]: adv(['atoms', 'layout'], I),
  [CMD.UpdateAtomLonePairs]: core(['atoms', 'edit']),
  [CMD.SetAtomLonePairSide]: adv(['atoms', 'layout'], I),
  [CMD.SetAtomRadical]: core(['atoms', 'edit'], I),
  [CMD.SetAtomRadicalIon]: adv(['atoms', 'edit'], I),
  [CMD.SetAtomIsotope]: core(['atoms', 'edit'], I),
  [CMD.SetAtomAlias]: core(['atoms', 'labels'], I),
  [CMD.SetAtomsShowElementLabel]: core(['atoms', 'labels'], I),
  [CMD.AddExplicitHydrogens]: core(['atoms', 'hydrogens']),
  [CMD.MoveAtoms]: core(['atoms', 'transform']),
  [CMD.ApplyCoordsTable]: adv(['atoms', 'transform']),
  [CMD.RotateAtoms]: core(['atoms', 'transform']),
  [CMD.ScaleAtoms]: core(['atoms', 'transform']),
  [CMD.ReflectAtoms]: core(['atoms', 'transform']),
  [CMD.AlignSelectedFragments]: core(['layout', 'fragments'], I),
  [CMD.DistributeSelectedFragments]: core(['layout', 'fragments'], I),
  [CMD.CircularArraySelection]: adv(['arrays']),
  [CMD.LinearArraySelection]: adv(['arrays']),
  [CMD.DendrimerArraySelection]: adv(['arrays']),
  [CMD.GroupSelection]: adv(['objects']),
  [CMD.UngroupSelection]: adv(['objects']),
  [CMD.GenerateGraphene]: adv(['materials', 'generate']),
  [CMD.GenerateCof]: adv(['materials', 'generate']),
  [CMD.GenerateDendrimer]: adv(['materials', 'generate']),
  [CMD.GeneratePolymer]: adv(['materials', 'generate']),
  [CMD.DeleteAtoms]: core(['atoms', 'delete'], D),
  [CMD.DeleteBonds]: core(['bonds', 'delete'], D),
  [CMD.DeleteSelection]: core(['delete'], D),
  [CMD.DuplicateAtoms]: core(['atoms', 'draw']),
  [CMD.TranslateCanvasShapes]: adv(['annotations', 'transform']),

  // Bonds
  [CMD.AddBond]: core(['bonds', 'draw']),
  [CMD.UpdateBond]: core(['bonds', 'edit'], I),
  [CMD.FlipBondEndpoints]: core(['bonds', 'stereo']),
  [CMD.InvertStereoAtAtom]: core(['atoms', 'stereo']),
  [CMD.SwapAtomPositions]: adv(['atoms', 'stereo']),

  // Rings / chains
  [CMD.AddRing]: core(['rings', 'draw']),
  [CMD.AddBoatRing]: adv(['rings', 'draw']),
  [CMD.AddChairRing]: adv(['rings', 'draw']),
  [CMD.AddChain]: core(['chains', 'draw']),

  // Annotations
  [CMD.AddStroke]: adv(['annotations', 'pencil']),
  [CMD.TranslateStroke]: adv(['annotations', 'pencil']),
  [CMD.DuplicateStroke]: adv(['annotations', 'pencil']),
  [CMD.DeleteStroke]: adv(['annotations', 'pencil'], D),
  [CMD.TranslateMarqueeSelection]: internal(['canvas-tool']),
  [CMD.AddReactionArrow]: core(['reactions', 'arrows']),
  [CMD.UpdateReactionArrow]: core(['reactions', 'arrows'], I),
  [CMD.DeleteReactionArrow]: core(['reactions', 'arrows'], D),
  [CMD.DuplicateReactionArrow]: adv(['reactions', 'arrows']),
  [CMD.AddReactionMultiStep]: adv(['reactions', 'arrows']),
  [CMD.AddCanvasText]: core(['annotations', 'text']),
  [CMD.UpdateCanvasText]: core(['annotations', 'text'], I),
  [CMD.DeleteCanvasText]: core(['annotations', 'text'], D),
  [CMD.DuplicateCanvasText]: adv(['annotations', 'text']),
  [CMD.AddSruBracket]: core(['polymers', 'brackets']),
  [CMD.UpdateSruBracket]: core(['polymers', 'brackets'], I),
  [CMD.DeleteSruBracket]: core(['polymers', 'brackets'], D),
  [CMD.AddCanvasShape]: adv(['annotations', 'shapes']),
  [CMD.UpdateCanvasShape]: adv(['annotations', 'shapes'], I),
  [CMD.DuplicateCanvasShape]: adv(['annotations', 'shapes']),
  [CMD.ReflectCanvasShape]: adv(['annotations', 'shapes']),
  [CMD.DeleteCanvasShape]: adv(['annotations', 'shapes'], D),
  [CMD.AddCanvasOrbital]: adv(['annotations', 'orbitals']),
  [CMD.UpdateCanvasOrbital]: adv(['annotations', 'orbitals'], I),
  [CMD.DeleteCanvasOrbital]: adv(['annotations', 'orbitals'], D),
  [CMD.AddCanvasImage]: adv(['annotations', 'images']),
  [CMD.UpdateCanvasImage]: adv(['annotations', 'images'], I),
  [CMD.DeleteCanvasImage]: adv(['annotations', 'images'], D),
  [CMD.DuplicateCanvasImage]: adv(['annotations', 'images']),

  // Document
  [CMD.ClearAll]: core(['document', 'delete'], { ...D, ...I }),
  [CMD.PasteFragment]: core(['fragments', 'draw']),
  [CMD.MergeSketch]: internal(['canvas-tool', 'sketch']),
  [CMD.Erase]: adv(['delete'], D),
  [CMD.ApplyRingFill]: core(['rings', 'style'], I),
  [CMD.ImportMolblock]: core(['import']),
  [CMD.ReplaceFromMolblock]: core(['import'], D),
  [CMD.Cleanup]: core(['layout', 'engine']),
  [CMD.Aromatize]: core(['engine']),
  [CMD.ApplyAtomMaps]: core(['reactions', 'mapping'], I),
  [CMD.ClearAtomMaps]: core(['reactions', 'mapping'], I),
  [CMD.ImportSmiles]: core(['import']),
  [CMD.MergeImportedStructure]: adv(['import']),
  [CMD.ReplaceImportedStructure]: adv(['import'], D),
  [CMD.CommitFragmentPlacement]: adv(['fragments', 'templates']),
  [CMD.CommitAtomAlias]: core(['atoms', 'labels'], I),
  [CMD.ExpandAlias]: core(['atoms', 'labels']),
  [CMD.ApplyMarkupHighlight]: adv(['style', 'teaching'], I),
  [CMD.SetStructureTheme]: adv(['style'], I),
  [CMD.ApplySelectionColor]: adv(['style', 'color'], I),
  [CMD.ClearSelectionColors]: adv(['style', 'color'], I),
  [CMD.ApplySelectionDisplayStyle]: adv(['style'], I),

  // Objects panel
  [CMD.CreateObjectCollection]: internal(['objects']),
  [CMD.RenameObjectOutline]: internal(['objects'], I),
  [CMD.DeleteObjectCollection]: internal(['objects'], D),
  [CMD.SetObjectOutlineParent]: internal(['objects'], I),
  [CMD.SetObjectCollectionCollapsed]: internal(['objects'], I),
  [CMD.ReorderObjectOutline]: internal(['objects']),
  [CMD.MoveObjectOutline]: internal(['objects']),
  [CMD.PlaceObjectOutlineItem]: internal(['objects']),
  [CMD.ExpandInstanceArrays]: internal(['arrays'], I),

  // Perspective
  [CMD.Apply3DPose]: adv(['perspective'], I),
  [CMD.Clear3DPose]: adv(['perspective'], I),
  [CMD.Flatten3DPose]: adv(['perspective'], I),
  [CMD.Rotate3DPose]: adv(['perspective']),
  [CMD.SetPerspectiveDepthShading]: adv(['perspective'], I),
  [CMD.SetPerspectiveDepthFade]: adv(['perspective'], I),
  [CMD.SetPerspectiveDepthWedges]: adv(['perspective'], I),
  [CMD.ApplyCleanupResult]: internal(['engine']),
  [CMD.ApplyExplicitHydrogens]: internal(['engine', 'hydrogens']),
  [CMD.InsertDemoReaction]: adv(['demo']),
  [CMD.InsertDemoMechanism]: adv(['demo']),
  [CMD.Transaction]: { visibility: 'core', destructive: false, idempotent: false, tags: ['meta'] },
};

const DEFAULT_META: CommandMeta = {
  visibility: 'advanced',
  destructive: false,
  idempotent: false,
  tags: [],
};

/** Effective metadata for a command: own fields > table > defaults. */
export function commandMeta(cmd: AnyMoleculeCommand): CommandMeta {
  const table = TABLE[cmd.id] ?? {};
  return {
    visibility: cmd.visibility ?? table.visibility ?? DEFAULT_META.visibility,
    destructive: cmd.destructive ?? table.destructive ?? DEFAULT_META.destructive,
    idempotent: cmd.idempotent ?? table.idempotent ?? DEFAULT_META.idempotent,
    tags: cmd.tags ?? table.tags ?? DEFAULT_META.tags,
  };
}

/** Command ids that have an explicit metadata entry (used by the catalogue test). */
export const COMMAND_META_IDS: ReadonlySet<string> = new Set(Object.keys(TABLE));

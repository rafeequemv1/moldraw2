import type { CanvasText, Molecule, ReactionArrow } from '@moldraw/domain';
import {
  ringsFullyInSelection,
  upsertRingFillsForRings,
  removeRingFillsForRings,
} from '@moldraw/domain';

export const COLOR_PRESETS = ['#0f172a', '#ef4444', '#3b82f6', '#22c55e', '#a855f7', '#f59e0b'] as const;

const HEX_RE = /^#[0-9A-Fa-f]{6}$/;

export function normalizeHexColor(raw: string, fallback = '#0f172a'): string {
  return HEX_RE.test(raw) ? raw : fallback;
}

export interface ColorApplyFlags {
  atomLabels: boolean;
  bonds: boolean;
  ringFill: boolean;
  text: boolean;
  arrowLine: boolean;
  arrowReagent: boolean;
  strokes: boolean;
  canvasShapes: boolean;
}

export type ColorTargetFlagKey = keyof ColorApplyFlags;

export const COLOR_TARGET_GROUPS = {
  structure: [
    { key: 'bonds' as const, label: 'Bonds' },
    { key: 'atomLabels' as const, label: 'Atom labels' },
    { key: 'ringFill' as const, label: 'Ring fill' },
  ],
  annotation: [
    { key: 'text' as const, label: 'Text / font' },
    { key: 'arrowLine' as const, label: 'Arrow line' },
    { key: 'arrowReagent' as const, label: 'Reagent label' },
    { key: 'strokes' as const, label: 'Pencil stroke' },
    { key: 'canvasShapes' as const, label: 'Shape outline' },
  ],
} as const;

/** Toggle every apply-target pref on or off (persisted). */
export function allColorTargetFlags(value: boolean): ColorApplyFlags {
  return {
    atomLabels: value,
    bonds: value,
    ringFill: value,
    text: value,
    arrowLine: value,
    arrowReagent: value,
    strokes: value,
    canvasShapes: value,
  };
}

export interface SelectionColorCapabilities {
  canAtoms: boolean;
  canRingFill: boolean;
  ringCount: number;
  canText: boolean;
  canArrowLine: boolean;
  canArrowReagent: boolean;
  canStroke: boolean;
  canCanvasShape: boolean;
  hasAnyRingFills: boolean;
  toolDefaultOnly: boolean;
  displayColor: string;
  defaultFlags: ColorApplyFlags;
  /** Short hint for disabled targets or empty selection. */
  selectionHint: string;
}

export function getSelectionColorCapabilities(
  molecule: Molecule,
  selectedAtomIds: string[],
  selectedCanvasText: CanvasText | null,
  selectedReactionArrow: ReactionArrow | null,
  activeColor: string,
  opts?: {
    selectedStrokeId?: string | null;
    selectedCanvasShapeId?: string | null;
    ringPaintActive?: boolean;
  },
): SelectionColorCapabilities {
  const ringPaths = ringsFullyInSelection(molecule, selectedAtomIds);
  const canAtoms = selectedAtomIds.length > 0;
  const canRingFill = ringPaths.length > 0;
  const canText = selectedCanvasText != null;
  const canArrowLine = selectedReactionArrow != null;
  const canArrowReagent = selectedReactionArrow != null;
  const strokeId = opts?.selectedStrokeId ?? null;
  const shapeId = opts?.selectedCanvasShapeId ?? null;
  const canStroke = strokeId != null && (molecule.strokes ?? []).some(s => s.id === strokeId);
  const canCanvasShape =
    shapeId != null && (molecule.canvasShapes ?? []).some(s => s.id === shapeId);
  const hasAnyRingFills =
    Object.keys(molecule.ringFills ?? {}).length > 0 || molecule.ringFill?.enabled === true;
  const canApply =
    canAtoms || canRingFill || canText || canArrowLine || canStroke || canCanvasShape;
  const toolDefaultOnly = !canApply;

  let displayColor = normalizeHexColor(activeColor);
  if (canText && selectedCanvasText) {
    displayColor = normalizeHexColor(selectedCanvasText.color, displayColor);
  } else if (canArrowLine && selectedReactionArrow?.color) {
    displayColor = normalizeHexColor(selectedReactionArrow.color, displayColor);
  } else if (canStroke && strokeId) {
    const s = molecule.strokes?.find(st => st.id === strokeId);
    if (s) displayColor = normalizeHexColor(s.color, displayColor);
  } else if (canCanvasShape && shapeId) {
    const sh = molecule.canvasShapes?.find(s => s.id === shapeId);
    if (sh) displayColor = normalizeHexColor(sh.color, displayColor);
  } else if (canAtoms) {
    const first = molecule.atoms.find(a => selectedAtomIds.includes(a.id) && a.color);
    if (first?.color) displayColor = normalizeHexColor(first.color, displayColor);
  }

  let selectionHint = 'Select atoms, text, arrows, or right‑click a stroke/shape to apply color.';
  if (opts?.ringPaintActive) {
    selectionHint = 'Ring tool + Ring fill: click rings to paint. Pick a swatch below.';
  } else if (canRingFill && ringPaths.length > 1) {
    selectionHint = `${ringPaths.length} full rings in selection — ring fill applies to all.`;
  } else if (canAtoms && !canRingFill) {
    selectionHint = 'Partial ring selection — select a full ring for fill, or use the Ring tool.';
  } else if (canApply) {
    selectionHint = 'Checked targets receive the swatch when you pick a color.';
  }

  return {
    canAtoms,
    canRingFill,
    ringCount: ringPaths.length,
    canText,
    canArrowLine,
    canArrowReagent,
    canStroke,
    canCanvasShape,
    hasAnyRingFills,
    toolDefaultOnly,
    displayColor,
    selectionHint,
    defaultFlags: {
      atomLabels: false,
      bonds: canAtoms,
      ringFill: canRingFill,
      text: canText,
      arrowLine: canArrowLine,
      arrowReagent: canArrowReagent,
      strokes: canStroke,
      canvasShapes: canCanvasShape,
    },
  };
}

export function applyColorToMolecule(
  prev: Molecule,
  color: string,
  flags: ColorApplyFlags,
  opts: {
    selectedAtomIds: string[];
    selectedCanvasTextId: string | null;
    selectedReactionArrowId: string | null;
    selectedStrokeId?: string | null;
    selectedCanvasShapeId?: string | null;
    ringFillOpacity: number;
    clearRingFill?: boolean;
    clearAllRingFills?: boolean;
  },
): Molecule {
  const hex = normalizeHexColor(color);
  let next = prev;
  const atomSet = new Set(opts.selectedAtomIds);

  if (flags.atomLabels && atomSet.size > 0) {
    next = {
      ...next,
      atoms: next.atoms.map(a => (atomSet.has(a.id) ? { ...a, color: hex } : a)),
    };
  }

  if (flags.bonds && atomSet.size > 0) {
    next = {
      ...next,
      bonds: next.bonds.map(b =>
        atomSet.has(b.fromAtomId) || atomSet.has(b.toAtomId) ? { ...b, color: hex } : b,
      ),
    };
  }

  if (opts.clearAllRingFills) {
    const { ringFills: _rf, ringFill: _legacy, ...rest } = next;
    next = rest as Molecule;
  }

  const ringPaths = ringsFullyInSelection(next, opts.selectedAtomIds);
  if (opts.clearRingFill && ringPaths.length > 0) {
    next = removeRingFillsForRings(next, ringPaths);
  } else if (flags.ringFill && ringPaths.length > 0) {
    next = upsertRingFillsForRings(next, ringPaths, hex, opts.ringFillOpacity);
  }

  if (flags.strokes && opts.selectedStrokeId) {
    next = {
      ...next,
      strokes: (next.strokes ?? []).map(s =>
        s.id === opts.selectedStrokeId ? { ...s, color: hex } : s,
      ),
    };
  }

  if (flags.canvasShapes && opts.selectedCanvasShapeId) {
    next = {
      ...next,
      canvasShapes: (next.canvasShapes ?? []).map(s =>
        s.id === opts.selectedCanvasShapeId ? { ...s, color: hex } : s,
      ),
    };
  }

  if (flags.text && opts.selectedCanvasTextId) {
    next = {
      ...next,
      canvasTexts: (next.canvasTexts ?? []).map(t =>
        t.id === opts.selectedCanvasTextId ? { ...t, color: hex } : t,
      ),
    };
  }

  if (opts.selectedReactionArrowId) {
    const patch: Partial<ReactionArrow> = {};
    if (flags.arrowLine) patch.color = hex;
    if (flags.arrowReagent) patch.reagentColor = hex;
    if (Object.keys(patch).length > 0) {
      next = {
        ...next,
        reactionArrows: (next.reactionArrows ?? []).map(a =>
          a.id === opts.selectedReactionArrowId ? { ...a, ...patch } : a,
        ),
      };
    }
  }

  return next;
}

export function clearAtomColors(prev: Molecule, atomIds: string[]): Molecule {
  const set = new Set(atomIds);
  if (set.size === 0) return prev;
  return {
    ...prev,
    atoms: prev.atoms.map(a => {
      if (!set.has(a.id) || a.color === undefined) return a;
      const { color: _c, ...rest } = a;
      return rest;
    }),
  };
}

export function clearBondColors(prev: Molecule, atomIds: string[]): Molecule {
  const set = new Set(atomIds);
  if (set.size === 0) return prev;
  return {
    ...prev,
    bonds: prev.bonds.map(b => {
      if (!set.has(b.fromAtomId) && !set.has(b.toAtomId)) return b;
      if (b.color === undefined) return b;
      const { color: _c, ...rest } = b;
      return rest;
    }),
  };
}

/** Clears custom label and bond stroke colors for bonds incident to the given atoms. */
export function clearSelectionStrokeColors(prev: Molecule, atomIds: string[]): Molecule {
  return clearBondColors(clearAtomColors(prev, atomIds), atomIds);
}

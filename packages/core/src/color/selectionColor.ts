import type { CanvasText, Molecule, ReactionArrow } from '@moldraw/domain';
import {
  isLabGlasswareShape,
  isLiquidGlasswareShape,
  ringsFullyInSelection,
  upsertRingFillsForRings,
  removeRingFillsForRings,
} from '@moldraw/domain';
import { siblingShapeIdsInCollection } from '../molecule/arrayCollection';

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
    { key: 'arrowLine' as const, label: 'Arrow line' },
    { key: 'arrowReagent' as const, label: 'Reagent label' },
    { key: 'strokes' as const, label: 'Pencil stroke' },
    { key: 'canvasShapes' as const, label: 'Shape outline' },
  ],
} as const;

export const SHAPE_STROKE_WIDTH_PRESETS = [1, 2, 4, 6, 8] as const;

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
  canBonds: boolean;
  canRingFill: boolean;
  ringCount: number;
  canText: boolean;
  canArrowLine: boolean;
  canArrowReagent: boolean;
  canStroke: boolean;
  canCanvasShape: boolean;
  /** True when outline color can be applied (not conical flask). */
  canCanvasShapeOutline: boolean;
  hasAnyRingFills: boolean;
  toolDefaultOnly: boolean;
  displayColor: string;
  defaultFlags: ColorApplyFlags;
  /** Short hint for disabled targets or empty selection. */
  selectionHint: string;
}

/** Only keep apply flags that are valid for the current selection. */
export function maskColorFlagsToCapabilities(
  flags: ColorApplyFlags,
  caps: SelectionColorCapabilities,
): ColorApplyFlags {
  return {
    atomLabels: flags.atomLabels && caps.canAtoms,
    bonds: flags.bonds && caps.canBonds,
    ringFill: flags.ringFill && caps.canRingFill,
    text: flags.text && caps.canText,
    arrowLine: flags.arrowLine && caps.canArrowLine,
    arrowReagent: flags.arrowReagent && caps.canArrowReagent,
    strokes: flags.strokes && caps.canStroke,
    canvasShapes: flags.canvasShapes && caps.canCanvasShapeOutline,
  };
}

/** What the color popover should show — driven by selection, not prefs. */
export type ColorMenuMode =
  | 'drawing'
  | 'text'
  | 'arrow'
  | 'stroke'
  | 'shape'
  | 'bond'
  | 'structure'
  | 'molecule';

export interface ColorMenuContext {
  mode: ColorMenuMode;
  /** Short title for the panel. */
  title: string;
  /** One-line guidance. */
  hint: string;
  /** Flags used when the user picks a color (no “Apply to” checkboxes needed). */
  applyFlags: ColorApplyFlags;
  /**
   * Optional structure toggles (only when more than one target makes sense).
   * Empty = color applies automatically to `applyFlags`.
   */
  structureToggles: Array<{ key: 'bonds' | 'atomLabels' | 'ringFill'; label: string }>;
}

const emptyFlags = (): ColorApplyFlags => ({
  atomLabels: false,
  bonds: false,
  ringFill: false,
  text: false,
  arrowLine: false,
  arrowReagent: false,
  strokes: false,
  canvasShapes: false,
});

/**
 * Infer a simple color UI from the current selection.
 * Bond / text / arrow / stroke / shape hide irrelevant targets.
 * Whole-molecule selection exposes bonds + labels + ring fill as toggles.
 */
export function resolveColorMenuContext(
  molecule: Molecule,
  selectedAtomIds: string[],
  caps: SelectionColorCapabilities,
  opts?: { selectedBondIds?: string[] },
): ColorMenuContext {
  if (caps.canCanvasShape && !caps.canAtoms && !caps.canBonds && !caps.canText && !caps.canArrowLine && !caps.canStroke) {
    return {
      mode: 'shape',
      title: 'Shape color',
      hint: 'Edit the selected shape.',
      applyFlags: emptyFlags(),
      structureToggles: [],
    };
  }
  if (caps.canText && !caps.canAtoms && !caps.canBonds) {
    return {
      mode: 'text',
      title: 'Text color',
      hint: 'Changes the selected text.',
      applyFlags: { ...emptyFlags(), text: true },
      structureToggles: [],
    };
  }
  if (caps.canStroke && !caps.canAtoms && !caps.canBonds) {
    return {
      mode: 'stroke',
      title: 'Stroke color',
      hint: 'Changes the selected pencil stroke.',
      applyFlags: { ...emptyFlags(), strokes: true },
      structureToggles: [],
    };
  }
  if (caps.canArrowLine && !caps.canAtoms && !caps.canBonds) {
    return {
      mode: 'arrow',
      title: 'Arrow color',
      hint: 'Colors the selected arrow line and reagent labels.',
      applyFlags: { ...emptyFlags(), arrowLine: true, arrowReagent: true },
      structureToggles: [],
    };
  }

  if (caps.toolDefaultOnly) {
    return {
      mode: 'drawing',
      title: 'Drawing color',
      hint: 'Used for new pencil strokes, shapes, and annotations. Select something to recolor it.',
      applyFlags: emptyFlags(),
      structureToggles: [],
    };
  }

  if (!caps.canAtoms && !caps.canBonds) {
    return {
      mode: 'drawing',
      title: 'Drawing color',
      hint: caps.selectionHint,
      applyFlags: emptyFlags(),
      structureToggles: [],
    };
  }

  const bondIds = opts?.selectedBondIds ?? [];
  const heavyIds = molecule.atoms.filter(a => a.element !== 'H').map(a => a.id);
  const selSet = new Set(selectedAtomIds);
  const wholeMolecule =
    heavyIds.length > 0 && heavyIds.every(id => selSet.has(id));

  const bondFocused = bondIds.length > 0 && selectedAtomIds.length === 0;

  if (bondFocused) {
    return {
      mode: 'bond',
      title: bondIds.length === 1 ? 'Bond color' : 'Bond colors',
      hint: 'Changes the selected bond(s) only.',
      applyFlags: { ...emptyFlags(), bonds: true },
      structureToggles: [],
    };
  }

  if (wholeMolecule) {
    return {
      mode: 'molecule',
      title: 'Molecule color',
      hint: 'Choose what to recolor on the whole structure.',
      applyFlags: {
        ...emptyFlags(),
        bonds: true,
        atomLabels: true,
        ringFill: caps.canRingFill,
      },
      structureToggles: [
        { key: 'bonds', label: 'Bonds' },
        { key: 'atomLabels', label: 'Atom labels' },
        ...(caps.canRingFill ? [{ key: 'ringFill' as const, label: 'Ring fill' }] : []),
      ],
    };
  }

  // Partial structure: only the selected atoms and/or bonds.
  const toggles: ColorMenuContext['structureToggles'] = [];
  if (bondIds.length > 0) toggles.push({ key: 'bonds', label: 'Bonds' });
  if (selectedAtomIds.length > 0) toggles.push({ key: 'atomLabels', label: 'Atom labels' });
  if (caps.canRingFill) toggles.push({ key: 'ringFill', label: 'Ring fill' });

  return {
    mode: 'structure',
    title: 'Selection color',
    hint:
      selectedAtomIds.length > 0 && bondIds.length === 0
        ? 'Changes the selected atom(s) only.'
        : bondIds.length > 0 && selectedAtomIds.length === 0
          ? 'Changes the selected bond(s) only.'
          : 'Changes the selected atoms and bonds only.',
    applyFlags: {
      ...emptyFlags(),
      bonds: bondIds.length > 0,
      atomLabels: selectedAtomIds.length > 0,
      ringFill: false,
    },
    structureToggles: toggles,
  };
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
    selectedBondIds?: string[];
    ringPaintActive?: boolean;
  },
): SelectionColorCapabilities {
  const ringPaths = ringsFullyInSelection(molecule, selectedAtomIds);
  const bondIds = opts?.selectedBondIds ?? [];
  const canAtoms = selectedAtomIds.length > 0;
  const canBonds = bondIds.length > 0;
  const canRingFill = ringPaths.length > 0;
  // Canvas text color is owned by the left-dock TextStylePanel, never the
  // molecule Color menu / atom–bond paint. Keep canText false so picking a
  // swatch cannot recolor a label (or individual glyphs) while typing.
  const canText = false;
  void selectedCanvasText;
  const canArrowLine = selectedReactionArrow != null;
  const canArrowReagent = selectedReactionArrow != null;
  const strokeId = opts?.selectedStrokeId ?? null;
  const shapeId = opts?.selectedCanvasShapeId ?? null;
  const canStroke = strokeId != null && (molecule.strokes ?? []).some(s => s.id === strokeId);
  const selectedShape =
    shapeId != null ? (molecule.canvasShapes ?? []).find(s => s.id === shapeId) : undefined;
  const canCanvasShape = selectedShape != null;
  /** Outline swatch applies to non-glassware shapes only (outline is always black). */
  const canCanvasShapeOutline =
    canCanvasShape && !isLabGlasswareShape(selectedShape!.kind);
  const hasAnyRingFills =
    Object.keys(molecule.ringFills ?? {}).length > 0 || molecule.ringFill?.enabled === true;
  const canApply =
    canAtoms || canBonds || canRingFill || canText || canArrowLine || canStroke || canCanvasShape;
  const toolDefaultOnly = !canApply;

  let displayColor = normalizeHexColor(activeColor);
  if (canText && selectedCanvasText) {
    displayColor = normalizeHexColor(selectedCanvasText.color, displayColor);
  } else if (canArrowLine && selectedReactionArrow?.color) {
    displayColor = normalizeHexColor(selectedReactionArrow.color, displayColor);
  } else if (canStroke && strokeId) {
    const s = molecule.strokes?.find(st => st.id === strokeId);
    if (s) displayColor = normalizeHexColor(s.color, displayColor);
  } else if (canCanvasShape && selectedShape) {
    if (isLiquidGlasswareShape(selectedShape.kind)) {
      displayColor = normalizeHexColor(selectedShape.fillColor ?? '#8ecae6', displayColor);
    } else if (!isLabGlasswareShape(selectedShape.kind)) {
      displayColor = normalizeHexColor(selectedShape.color, displayColor);
    }
  } else if (canAtoms) {
    const first = molecule.atoms.find(a => selectedAtomIds.includes(a.id) && a.color);
    if (first?.color) displayColor = normalizeHexColor(first.color, displayColor);
  } else if (canBonds) {
    const firstBond = molecule.bonds.find(b => bondIds.includes(b.id) && b.color);
    if (firstBond?.color) displayColor = normalizeHexColor(firstBond.color, displayColor);
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
    canBonds,
    canRingFill,
    ringCount: ringPaths.length,
    canText,
    canArrowLine,
    canArrowReagent,
    canStroke,
    canCanvasShape,
    canCanvasShapeOutline,
    hasAnyRingFills,
    toolDefaultOnly,
    displayColor,
    selectionHint,
    defaultFlags: {
      atomLabels: canAtoms,
      bonds: canBonds,
      ringFill: canRingFill,
      text: canText,
      arrowLine: canArrowLine,
      arrowReagent: canArrowReagent,
      strokes: canStroke,
      canvasShapes: canCanvasShapeOutline,
    },
  };
}

export function applyColorToMolecule(
  prev: Molecule,
  color: string,
  flags: ColorApplyFlags,
  opts: {
    selectedAtomIds: string[];
    selectedBondIds?: string[];
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
  const hasBondList = opts.selectedBondIds != null;
  const bondSet = hasBondList ? new Set(opts.selectedBondIds) : null;

  if (flags.atomLabels && atomSet.size > 0) {
    next = {
      ...next,
      atoms: next.atoms.map(a => (atomSet.has(a.id) ? { ...a, color: hex } : a)),
    };
  }

  if (flags.bonds) {
    if (bondSet && bondSet.size > 0) {
      next = {
        ...next,
        bonds: next.bonds.map(b => (bondSet.has(b.id) ? { ...b, color: hex } : b)),
      };
    } else if (!hasBondList && atomSet.size > 0) {
      next = {
        ...next,
        bonds: next.bonds.map(b =>
          atomSet.has(b.fromAtomId) || atomSet.has(b.toAtomId) ? { ...b, color: hex } : b,
        ),
      };
    }
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
    // Color the whole Objects collection (e.g. COF) when one member is selected.
    const shapeIds = new Set(
      siblingShapeIdsInCollection(next, opts.selectedCanvasShapeId),
    );
    next = {
      ...next,
      canvasShapes: (next.canvasShapes ?? []).map(s => {
        if (!shapeIds.has(s.id)) return s;
        // Glassware outline is always black — never recolor via the structure swatch.
        if (isLabGlasswareShape(s.kind)) return s;
        return { ...s, color: hex };
      }),
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

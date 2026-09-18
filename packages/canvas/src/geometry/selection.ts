/**
 * Selection bounding boxes, centroids, and the rotate-handle layout used by
 * the "select" tool. Also contains lasso → atom-id collection.
 */
import type { Atom, Molecule } from '@moldraw/domain';
import {
  condensedGroupLabelForAtom,
  getEffectiveValencyForImplicitHydrogen,
  isIsolatedWaterOxygen,
  orientFormulaLabel,
} from '@moldraw/domain';
import { pointInPolygon, type Point } from './polygons';
import { reactionArrowSelectionAabb } from './reactionArrow';
import { getCanvasShapeBox } from './canvasShapeTransform';
import { canvasTextBbox, estimateCanvasTextAabb } from './canvasText';
import { getHydrogenStubDirections, groupLabelTailGoesLeft, hGoesLeft, IMPLICIT_H_LABEL_DIST } from './hydrogenLayout';

export type MarqueeSelectionBoundsInput = {
  atomIds: string[];
  reactionArrowIds?: string[];
  strokeIds?: string[];
  canvasTextIds?: string[];
  canvasShapeIds?: string[];
  canvasImageIds?: string[];
};

const growAabb = (
  minX: number,
  maxX: number,
  minY: number,
  maxY: number,
  box: { minX: number; maxX: number; minY: number; maxY: number },
) => ({
  minX: Math.min(minX, box.minX),
  maxX: Math.max(maxX, box.maxX),
  minY: Math.min(minY, box.minY),
  maxY: Math.max(maxY, box.maxY),
});

export const hasMarqueeSelectionContent = (sel: MarqueeSelectionBoundsInput): boolean =>
  sel.atomIds.length > 0 ||
  (sel.reactionArrowIds?.length ?? 0) > 0 ||
  (sel.strokeIds?.length ?? 0) > 0 ||
  (sel.canvasTextIds?.length ?? 0) > 0 ||
  (sel.canvasShapeIds?.length ?? 0) > 0 ||
  (sel.canvasImageIds?.length ?? 0) > 0;

/** Union AABB for atoms plus marquee-selected annotations. */
export const getMarqueeSelectionAabb = (
  mol: Molecule,
  sel: MarqueeSelectionBoundsInput,
  canvasCtx: CanvasRenderingContext2D | null = null,
): SelectionAabb | null => {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  const atomAabb = getSelectionAabb(mol, sel.atomIds);
  if (atomAabb) {
    minX = atomAabb.minX;
    maxX = atomAabb.maxX;
    minY = atomAabb.minY;
    maxY = atomAabb.maxY;
  }

  const arrowSet = new Set(sel.reactionArrowIds ?? []);
  for (const a of mol.reactionArrows ?? []) {
    if (!arrowSet.has(a.id)) continue;
    const grown = growAabb(minX, maxX, minY, maxY, reactionArrowSelectionAabb(a));
    minX = grown.minX;
    maxX = grown.maxX;
    minY = grown.minY;
    maxY = grown.maxY;
  }

  const strokeSet = new Set(sel.strokeIds ?? []);
  for (const s of mol.strokes ?? []) {
    if (!strokeSet.has(s.id)) continue;
    for (const p of s.points) {
      const pad = s.thickness * 0.5 + 4;
      const grown = growAabb(minX, maxX, minY, maxY, {
        minX: p.x - pad,
        maxX: p.x + pad,
        minY: p.y - pad,
        maxY: p.y + pad,
      });
      minX = grown.minX;
      maxX = grown.maxX;
      minY = grown.minY;
      maxY = grown.maxY;
    }
  }

  const textSet = new Set(sel.canvasTextIds ?? []);
  for (const t of mol.canvasTexts ?? []) {
    if (!textSet.has(t.id)) continue;
    const box = canvasCtx
      ? (() => {
          const b = canvasTextBbox(canvasCtx, t);
          return { minX: b.left, maxX: b.right, minY: b.top, maxY: b.bottom };
        })()
      : estimateCanvasTextAabb(t);
    const grown = growAabb(minX, maxX, minY, maxY, box);
    minX = grown.minX;
    maxX = grown.maxX;
    minY = grown.minY;
    maxY = grown.maxY;
  }

  const shapeSet = new Set(sel.canvasShapeIds ?? []);
  for (const s of mol.canvasShapes ?? []) {
    if (!shapeSet.has(s.id)) continue;
    const box = getCanvasShapeBox(s);
    const grown = growAabb(minX, maxX, minY, maxY, {
      minX: box.x1,
      maxX: box.x2,
      minY: box.y1,
      maxY: box.y2,
    });
    minX = grown.minX;
    maxX = grown.maxX;
    minY = grown.minY;
    maxY = grown.maxY;
  }

  const imageSet = new Set(sel.canvasImageIds ?? []);
  for (const img of mol.canvasImages ?? []) {
    if (!imageSet.has(img.id)) continue;
    const grown = growAabb(minX, maxX, minY, maxY, {
      minX: img.x,
      maxX: img.x + img.width,
      minY: img.y,
      maxY: img.y + img.height,
    });
    minX = grown.minX;
    maxX = grown.maxX;
    minY = grown.minY;
    maxY = grown.maxY;
  }

  if (!Number.isFinite(minX)) return null;
  return { minX, maxX, minY, maxY, cx: (minX + maxX) / 2, cy: (minY + maxY) / 2 };
};

const layoutFromAabb = (raw: SelectionAabb): SelectionTransformLayout => {
  let minX = raw.minX;
  let maxX = raw.maxX;
  let minY = raw.minY;
  let maxY = raw.maxY;
  const w = maxX - minX;
  const h = maxY - minY;
  if (w < TRANSFORM_MIN_SPAN) {
    const e = (TRANSFORM_MIN_SPAN - w) / 2;
    minX -= e;
    maxX += e;
  }
  if (h < TRANSFORM_MIN_SPAN) {
    const e = (TRANSFORM_MIN_SPAN - h) / 2;
    minY -= e;
    maxY += e;
  }
  const boxMinX = minX - TRANSFORM_PAD;
  const boxMinY = minY - TRANSFORM_PAD;
  const boxW = maxX - minX + TRANSFORM_PAD * 2;
  const boxH = maxY - minY + TRANSFORM_PAD * 2;
  const handleX = boxMinX + boxW / 2;
  const handleY = boxMinY - ROTATE_HANDLE_OFFSET;
  const moveHandleX = handleX;
  const moveHandleY = boxMinY + boxH + MOVE_HANDLE_OFFSET;
  const scaleHandleX = boxMinX + boxW;
  const scaleHandleY = boxMinY + boxH;
  return {
    boxMinX,
    boxMinY,
    boxW,
    boxH,
    handleX,
    handleY,
    moveHandleX,
    moveHandleY,
    scaleHandleX,
    scaleHandleY,
  };
};

/** Padded transform box for atoms + marquee-selected annotations. */
export const getMarqueeSelectionTransformLayout = (
  mol: Molecule,
  sel: MarqueeSelectionBoundsInput,
  canvasCtx: CanvasRenderingContext2D | null = null,
): SelectionTransformLayout | null => {
  const raw = getMarqueeSelectionAabb(mol, sel, canvasCtx);
  if (!raw) return null;
  return layoutFromAabb(raw);
};

export type SelectionAabb = {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  cx: number;
  cy: number;
};

export const ROTATE_HANDLE_R = 11;
export const ROTATE_HANDLE_OFFSET = 32;
/** Move handle below the selection box (kept for hit-test compatibility; not drawn). */
export const MOVE_HANDLE_R = 16;
export const MOVE_HANDLE_OFFSET = 40;
/** @deprecated Separate scale disc removed — use box corner/edge handles. */
export const SCALE_HANDLE_R = 12;
/** Corner resize hit target (world px radius). */
export const BOX_CORNER_HANDLE = 8;
/** Edge resize hit target (world px radius). */
export const BOX_EDGE_HANDLE = 7;
export const TRANSFORM_PAD = 14;

export type SelectionBoxHandle = 'nw' | 'ne' | 'sw' | 'se' | 'n' | 's' | 'e' | 'w';

export type SelectionBoxHandlePositions = Record<SelectionBoxHandle, { x: number; y: number }>;

export const getSelectionBoxHandles = (L: SelectionTransformLayout): SelectionBoxHandlePositions => {
  const x0 = L.boxMinX;
  const y0 = L.boxMinY;
  const x1 = L.boxMinX + L.boxW;
  const y1 = L.boxMinY + L.boxH;
  const cx = L.boxMinX + L.boxW / 2;
  const cy = L.boxMinY + L.boxH / 2;
  return {
    nw: { x: x0, y: y0 },
    ne: { x: x1, y: y0 },
    sw: { x: x0, y: y1 },
    se: { x: x1, y: y1 },
    n: { x: cx, y: y0 },
    s: { x: cx, y: y1 },
    e: { x: x1, y: cy },
    w: { x: x0, y: cy },
  };
};

export const isUniformBoxHandle = (handle: SelectionBoxHandle): boolean =>
  handle === 'nw' || handle === 'ne' || handle === 'sw' || handle === 'se';

export const anchorForBoxHandle = (
  handle: SelectionBoxHandle,
  L: SelectionTransformLayout,
): { x: number; y: number } => {
  const h = getSelectionBoxHandles(L);
  switch (handle) {
    case 'nw':
      return h.se;
    case 'ne':
      return h.sw;
    case 'sw':
      return h.ne;
    case 'se':
      return h.nw;
    case 'n':
      return h.s;
    case 's':
      return h.n;
    case 'e':
      return h.w;
    case 'w':
      return h.e;
  }
};

export const scaleFactorsForBoxHandle = (
  handle: SelectionBoxHandle,
  anchorX: number,
  anchorY: number,
  startX: number,
  startY: number,
  wx: number,
  wy: number,
): { factorX: number; factorY: number } => {
  const clamp = (f: number) => Math.max(0.05, Math.min(20, f));
  if (isUniformBoxHandle(handle)) {
    const startDist = Math.max(12, Math.hypot(startX - anchorX, startY - anchorY));
    const curDist = Math.max(12, Math.hypot(wx - anchorX, wy - anchorY));
    const f = clamp(curDist / startDist);
    return { factorX: f, factorY: f };
  }
  if (handle === 'e' || handle === 'w') {
    const startSpan = Math.max(12, Math.abs(startX - anchorX));
    const curSpan = Math.max(12, Math.abs(wx - anchorX));
    return { factorX: clamp(curSpan / startSpan), factorY: 1 };
  }
  const startSpan = Math.max(12, Math.abs(startY - anchorY));
  const curSpan = Math.max(12, Math.abs(wy - anchorY));
  return { factorX: 1, factorY: clamp(curSpan / startSpan) };
};

export const pickSelectionBoxHandle = (
  wx: number,
  wy: number,
  L: SelectionTransformLayout,
): SelectionBoxHandle | null => {
  const handles = getSelectionBoxHandles(L);
  const corners: SelectionBoxHandle[] = ['nw', 'ne', 'sw', 'se'];
  for (const id of corners) {
    const p = handles[id];
    if (Math.hypot(wx - p.x, wy - p.y) <= BOX_CORNER_HANDLE) return id;
  }
  const edges: SelectionBoxHandle[] = ['n', 's', 'e', 'w'];
  for (const id of edges) {
    const p = handles[id];
    if (Math.hypot(wx - p.x, wy - p.y) <= BOX_EDGE_HANDLE) return id;
  }
  return null;
};
export const TRANSFORM_MIN_SPAN = 28;

/**
 * World AABB of a head-anchored label (bonding glyph centered on the atom;
 * tail extends away from the parent bond — H3C left, CH3 right).
 * Pure estimate — no canvas measure needed for selection chrome / hit-test.
 */
export const estimateLabelTextAabb = (
  atom: Atom,
  text: string | null | undefined,
  mol?: Molecule,
): { minX: number; maxX: number; minY: number; maxY: number } | null => {
  const label = text?.trim();
  if (!label) return null;
  const tailGoesLeft = mol
    ? atom.alias?.trim() === label
      ? groupLabelTailGoesLeft(atom, mol)
      : hGoesLeft(atom, mol)
    : false;
  const oriented = orientFormulaLabel(label, atom.element, tailGoesLeft);
  const charW = 9.5;
  const h = 22;
  const headW = 16;
  let left: number;
  let w: number;
  if (oriented.mode === 'block' && oriented.tailGoesLeft) {
    w = Math.max(16, 8 + oriented.text.length * charW);
    left = headW / 2 - w;
  } else if (oriented.mode === 'formula') {
    const prefixLen = oriented.headIndex;
    const suffixLen = Math.max(0, oriented.text.length - oriented.headIndex - oriented.head.length);
    left = -headW / 2 - prefixLen * charW;
    w = prefixLen * charW + headW + suffixLen * charW;
  } else {
    w = Math.max(16, 8 + oriented.text.length * charW);
    left = -8;
  }
  return {
    minX: atom.x + left,
    maxX: atom.x + left + w,
    minY: atom.y - h / 2,
    maxY: atom.y + h / 2,
  };
};

/** AABB for an explicit atom alias (COOH, Ph, …). */
export const estimateAliasLabelAabb = (
  atom: Atom,
  mol?: Molecule,
): { minX: number; maxX: number; minY: number; maxY: number } | null =>
  estimateLabelTextAabb(atom, atom.alias, mol);

/** Disk around an unlabeled vertex so the grab box matches the selection halo. */
const ATOM_DISK_R = 12;
const IMPLICIT_H_GLYPH_R = 12;

const bondOrderSumForAtom = (mol: Molecule, atomId: string): number => {
  let sum = 0;
  for (const b of mol.bonds) {
    if (b.fromAtomId === atomId || b.toAtomId === atomId) sum += b.order;
  }
  return sum;
};

/** Visual extent of one atom: disk + alias / condensed label + implicit-H glyphs. */
const estimateAtomVisualAabb = (
  atom: Atom,
  mol: Molecule,
): { minX: number; maxX: number; minY: number; maxY: number } => {
  let minX = atom.x - ATOM_DISK_R;
  let maxX = atom.x + ATOM_DISK_R;
  let minY = atom.y - ATOM_DISK_R;
  let maxY = atom.y + ATOM_DISK_R;
  const grow = (box: { minX: number; maxX: number; minY: number; maxY: number }) => {
    minX = Math.min(minX, box.minX);
    maxX = Math.max(maxX, box.maxX);
    minY = Math.min(minY, box.minY);
    maxY = Math.max(maxY, box.maxY);
  };
  const aliasBox = estimateAliasLabelAabb(atom, mol);
  if (aliasBox) {
    grow(aliasBox);
    return { minX, maxX, minY, maxY };
  }
  const v = bondOrderSumForAtom(mol, atom.id);
  const condensed = condensedGroupLabelForAtom(atom, mol, v);
  const labelBox = estimateLabelTextAabb(atom, condensed, mol);
  if (labelBox) {
    grow(labelBox);
    return { minX, maxX, minY, maxY };
  }
  const water = isIsolatedWaterOxygen(atom, mol, v);
  if (water || (atom.element === 'C' && !atom.showElementLabel)) {
    const implicitH = Math.max(
      0,
      getEffectiveValencyForImplicitHydrogen(atom.element, atom.charge || 0) - v,
    );
    if (implicitH > 0) {
      for (const dir of getHydrogenStubDirections(atom, mol, implicitH)) {
        const hx = atom.x + dir.x * IMPLICIT_H_LABEL_DIST;
        const hy = atom.y + dir.y * IMPLICIT_H_LABEL_DIST;
        grow({
          minX: hx - IMPLICIT_H_GLYPH_R,
          maxX: hx + IMPLICIT_H_GLYPH_R,
          minY: hy - IMPLICIT_H_GLYPH_R,
          maxY: hy + IMPLICIT_H_GLYPH_R,
        });
      }
    }
  }
  return { minX, maxX, minY, maxY };
};

/** Tight axis-aligned bbox covering all selected atoms (or null when empty). */
export const getSelectionAabb = (mol: Molecule, ids: string[]): SelectionAabb | null => {
  const set = new Set(ids);
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const a of mol.atoms) {
    if (!set.has(a.id)) continue;
    const box = estimateAtomVisualAabb(a, mol);
    minX = Math.min(minX, box.minX);
    maxX = Math.max(maxX, box.maxX);
    minY = Math.min(minY, box.minY);
    maxY = Math.max(maxY, box.maxY);
  }
  if (!Number.isFinite(minX)) return null;
  return { minX, maxX, minY, maxY, cx: (minX + maxX) / 2, cy: (minY + maxY) / 2 };
};

/** Geometric centroid of selected atoms (rotation pivot). */
export const getSelectionCentroid = (
  mol: Molecule,
  ids: string[],
): { cx: number; cy: number } | null => {
  const set = new Set(ids);
  let sx = 0;
  let sy = 0;
  let n = 0;
  for (const a of mol.atoms) {
    if (!set.has(a.id)) continue;
    sx += a.x;
    sy += a.y;
    n++;
  }
  return n ? { cx: sx / n, cy: sy / n } : null;
};

export interface SelectionTransformLayout {
  boxMinX: number;
  boxMinY: number;
  boxW: number;
  boxH: number;
  /** Rotate handle (above box top-center). */
  handleX: number;
  handleY: number;
  /** Move handle (below box bottom-center). */
  moveHandleX: number;
  moveHandleY: number;
  /** Scale handle (bottom-right corner). */
  scaleHandleX: number;
  scaleHandleY: number;
}

/** Padded selection box + rotate/move handles (shared by hit-test and draw). */
export const getSelectionTransformLayout = (
  mol: Molecule,
  ids: string[],
): SelectionTransformLayout | null => {
  const raw = getSelectionAabb(mol, ids);
  if (!raw) return null;
  return layoutFromAabb(raw);
};

/** True if the world-space point lies within the rotate handle. */
export const isNearTransformRotateHandle = (
  wx: number,
  wy: number,
  mol: Molecule,
  ids: string[],
  marquee?: MarqueeSelectionBoundsInput,
  canvasCtx?: CanvasRenderingContext2D | null,
): boolean => {
  const L = marquee
    ? getMarqueeSelectionTransformLayout(mol, marquee, canvasCtx ?? null)
    : getSelectionTransformLayout(mol, ids);
  if (!L) return false;
  return Math.hypot(wx - L.handleX, wy - L.handleY) <= ROTATE_HANDLE_R;
};

/** True if the pointer is on a box corner/edge resize handle. */
export const isNearTransformScaleHandle = (
  wx: number,
  wy: number,
  mol: Molecule,
  ids: string[],
  marquee?: MarqueeSelectionBoundsInput,
  canvasCtx?: CanvasRenderingContext2D | null,
): boolean => {
  const L = marquee
    ? getMarqueeSelectionTransformLayout(mol, marquee, canvasCtx ?? null)
    : getSelectionTransformLayout(mol, ids);
  if (!L) return false;
  return pickSelectionBoxHandle(wx, wy, L) != null;
};

export const pickTransformScaleHandle = (
  wx: number,
  wy: number,
  mol: Molecule,
  ids: string[],
  marquee?: MarqueeSelectionBoundsInput,
  canvasCtx?: CanvasRenderingContext2D | null,
): SelectionBoxHandle | null => {
  const L = marquee
    ? getMarqueeSelectionTransformLayout(mol, marquee, canvasCtx ?? null)
    : getSelectionTransformLayout(mol, ids);
  if (!L) return null;
  return pickSelectionBoxHandle(wx, wy, L);
};

/** True if the world-space point lies within the move handle. */
export const isNearTransformMoveHandle = (
  wx: number,
  wy: number,
  mol: Molecule,
  ids: string[],
  marquee?: MarqueeSelectionBoundsInput,
  canvasCtx?: CanvasRenderingContext2D | null,
): boolean => {
  const L = marquee
    ? getMarqueeSelectionTransformLayout(mol, marquee, canvasCtx ?? null)
    : getSelectionTransformLayout(mol, ids);
  if (!L) return false;
  return Math.hypot(wx - L.moveHandleX, wy - L.moveHandleY) <= MOVE_HANDLE_R;
};

/** True if the point lies inside the padded selection transform box (easy grab area). */
export const isInsideSelectionTransformBox = (
  wx: number,
  wy: number,
  mol: Molecule,
  ids: string[],
  marquee?: MarqueeSelectionBoundsInput,
  canvasCtx?: CanvasRenderingContext2D | null,
): boolean => {
  const L = marquee
    ? getMarqueeSelectionTransformLayout(mol, marquee, canvasCtx ?? null)
    : getSelectionTransformLayout(mol, ids);
  if (!L) return false;
  return (
    wx >= L.boxMinX &&
    wx <= L.boxMinX + L.boxW &&
    wy >= L.boxMinY &&
    wy <= L.boxMinY + L.boxH
  );
};

/**
 * Atoms whose centre lies inside a freeform lasso path. Bonds that merely cross
 * the lasso outline do NOT pull their endpoints in — a partially enclosed bond
 * is left unselected (so a subsequent delete only removes what was circled).
 * Bond selection is derived afterwards via `bondsFullyInAtomSet`, i.e. a bond
 * is selected only when both of its atoms are inside. Returns IDs in arbitrary order.
 */
export const collectAtomIdsFromLasso = (mol: Molecule, path: Point[]): string[] => {
  if (path.length < 3) return [];
  const picked: string[] = [];
  for (const a of mol.atoms) {
    if (pointInPolygon(a.x, a.y, path)) picked.push(a.id);
  }
  return picked;
};

/**
 * If any atom of a bonded fragment appears in `seeds`, include every atom in
 * that fragment. Isolated atoms stay single-atom selections.
 *
 * Used for arrange / copy-SMILES / “select connected fragment” — not for the
 * primary select tool (which selects individual atoms and bonds).
 */
export const expandAtomIdsToConnectedFragments = (mol: Molecule, seeds: string[]): string[] => {
  if (seeds.length === 0) return [];
  const seedSet = new Set(seeds);
  const visited = new Set<string>();
  const adj = new Map<string, string[]>();
  for (const b of mol.bonds) {
    if (!adj.has(b.fromAtomId)) adj.set(b.fromAtomId, []);
    if (!adj.has(b.toAtomId)) adj.set(b.toAtomId, []);
    adj.get(b.fromAtomId)!.push(b.toAtomId);
    adj.get(b.toAtomId)!.push(b.fromAtomId);
  }

  const components: string[][] = [];
  for (const a of mol.atoms) {
    if (visited.has(a.id)) continue;
    const comp: string[] = [];
    const q = [a.id];
    visited.add(a.id);
    while (q.length) {
      const u = q.pop()!;
      comp.push(u);
      for (const v of adj.get(u) ?? []) {
        if (!visited.has(v)) {
          visited.add(v);
          q.push(v);
        }
      }
    }
    components.push(comp);
  }

  const out = new Set<string>();
  for (const comp of components) {
    if (comp.some(id => seedSet.has(id))) {
      for (const id of comp) out.add(id);
    }
  }
  return mol.atoms.filter(a => out.has(a.id)).map(a => a.id);
};

/**
 * Atoms that should move/rotate with the current selection: explicitly selected
 * atoms plus both endpoints of any selected bonds.
 */
export const atomIdsForSelectionTransform = (
  mol: Molecule,
  selectedAtomIds: string[],
  selectedBondIds: string[] = [],
): string[] => {
  const out = new Set(selectedAtomIds);
  if (selectedBondIds.length === 0) return [...out];
  const bondSet = new Set(selectedBondIds);
  for (const b of mol.bonds) {
    if (!bondSet.has(b.id)) continue;
    out.add(b.fromAtomId);
    out.add(b.toAtomId);
  }
  return mol.atoms.filter(a => out.has(a.id)).map(a => a.id);
};

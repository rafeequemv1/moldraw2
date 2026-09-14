/**
 * Selection bounding boxes, centroids, and the rotate-handle layout used by
 * the "select" tool. Also contains lasso → atom-id collection.
 */
import type { Atom, Molecule } from '@moldraw/domain';
import { pointInPolygon, type Point } from './polygons';
import { sampleReactionArrowPolyline } from './reactionArrow';
import { getCanvasShapeBox } from './canvasShapeTransform';
import { canvasTextBbox, estimateCanvasTextAabb } from './canvasText';

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
    const pts = sampleReactionArrowPolyline(a);
    for (const p of pts) {
      const grown = growAabb(minX, maxX, minY, maxY, {
        minX: p.x - 8,
        maxX: p.x + 8,
        minY: p.y - 8,
        maxY: p.y + 8,
      });
      minX = grown.minX;
      maxX = grown.maxX;
      minY = grown.minY;
      maxY = grown.maxY;
    }
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

export const ROTATE_HANDLE_R = 14;
export const ROTATE_HANDLE_OFFSET = 34;
/** Move handle below the selection box (mirrors rotate on top). */
export const MOVE_HANDLE_R = 16;
export const MOVE_HANDLE_OFFSET = 40;
export const SCALE_HANDLE_R = 12;
export const TRANSFORM_PAD = 14;
export const TRANSFORM_MIN_SPAN = 28;

/**
 * World AABB of a head-anchored label (first glyph centered on the atom).
 * Pure estimate — no canvas measure needed for selection chrome / hit-test.
 */
export const estimateLabelTextAabb = (
  atom: Atom,
  text: string | null | undefined,
): { minX: number; maxX: number; minY: number; maxY: number } | null => {
  const label = text?.trim();
  if (!label) return null;
  // Matches drawAtomLabels head-anchored layout: first char on atom, rest to the right.
  const w = Math.max(16, 8 + label.length * 9.5);
  const h = 22;
  const left = -8;
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
): { minX: number; maxX: number; minY: number; maxY: number } | null =>
  estimateLabelTextAabb(atom, atom.alias);

/** Tight axis-aligned bbox covering all selected atoms (or null when empty). */
export const getSelectionAabb = (mol: Molecule, ids: string[]): SelectionAabb | null => {
  const set = new Set(ids);
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const a of mol.atoms) {
    if (!set.has(a.id)) continue;
    minX = Math.min(minX, a.x);
    maxX = Math.max(maxX, a.x);
    minY = Math.min(minY, a.y);
    maxY = Math.max(maxY, a.y);
    const labelBox = estimateAliasLabelAabb(a);
    if (labelBox) {
      minX = Math.min(minX, labelBox.minX);
      maxX = Math.max(maxX, labelBox.maxX);
      minY = Math.min(minY, labelBox.minY);
      maxY = Math.max(maxY, labelBox.maxY);
    }
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

/** True if the world-space point lies within the scale handle. */
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
  return Math.hypot(wx - L.scaleHandleX, wy - L.scaleHandleY) <= SCALE_HANDLE_R;
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
 * Atoms (and atoms whose connecting bond crosses the lasso) inside a freeform
 * lasso path. Returns IDs in arbitrary order.
 */
export const collectAtomIdsFromLasso = (mol: Molecule, path: Point[]): string[] => {
  if (path.length < 3) return [];
  const picked = new Set<string>();
  for (const a of mol.atoms) {
    if (pointInPolygon(a.x, a.y, path)) picked.add(a.id);
  }
  for (const b of mol.bonds) {
    const a1 = mol.atoms.find(x => x.id === b.fromAtomId);
    const a2 = mol.atoms.find(x => x.id === b.toAtomId);
    if (!a1 || !a2) continue;
    for (let k = 0; k <= 24; k++) {
      const t = k / 24;
      const x = a1.x + t * (a2.x - a1.x);
      const y = a1.y + t * (a2.y - a1.y);
      if (pointInPolygon(x, y, path)) {
        picked.add(a1.id);
        picked.add(a2.id);
        break;
      }
    }
  }
  return [...picked];
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

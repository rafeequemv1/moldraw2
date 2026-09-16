import type { Atom, Bond, Molecule } from '@moldraw/domain';

export type SelectionAlignMode = 'top' | 'center' | 'bottom' | 'left' | 'right' | 'centerX';
export type SelectionDistributeAxis = 'horizontal' | 'vertical' | 'grid' | 'circle' | 'row';

export type FragmentBox = {
  atomIds: string[];
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  cx: number;
  cy: number;
};

/** Minimum clear gap between fragment AABBs when they overlap / are too tight. */
const MIN_DISTRIBUTE_GAP = 36;

/** Bounding box from already-resolved atoms (no per-fragment scan, no arg spread). */
const boxForPickedAtoms = (picked: readonly Atom[], atomIds: string[]): FragmentBox | null => {
  if (picked.length === 0) return null;
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const a of picked) {
    if (a.x < minX) minX = a.x;
    if (a.x > maxX) maxX = a.x;
    if (a.y < minY) minY = a.y;
    if (a.y > maxY) maxY = a.y;
  }
  return {
    atomIds,
    minX,
    maxX,
    minY,
    maxY,
    cx: (minX + maxX) / 2,
    cy: (minY + maxY) / 2,
  };
};

const buildAdjacency = (mol: Molecule): Map<string, string[]> => {
  const adj = new Map<string, string[]>();
  for (const a of mol.atoms) adj.set(a.id, []);
  for (const b of mol.bonds) {
    adj.get(b.fromAtomId)?.push(b.toAtomId);
    adj.get(b.toAtomId)?.push(b.fromAtomId);
  }
  return adj;
};

/**
 * Component boxes keyed on the `atoms` / `bonds` array identities. Store
 * transforms that only touch metadata (fragment ids, outline, ring fills, pose)
 * spread the molecule but keep both arrays, so the many callers that run per
 * commit (ensureFragmentIds, outline reconcile, canvas snapshot, revision cache)
 * share one connected-components pass. Callers must treat the result as read-only.
 */
const fragmentBoxCache = new WeakMap<Atom[], { bonds: Bond[]; boxes: FragmentBox[] }>();

/** Every bonded connected component in the document (one box per molecule / fragment). */
export const documentFragmentBoxes = (mol: Molecule): FragmentBox[] => {
  if (mol.atoms.length === 0) return [];
  const hit = fragmentBoxCache.get(mol.atoms);
  if (hit && hit.bonds === mol.bonds) return hit.boxes;
  const boxes = computeDocumentFragmentBoxes(mol);
  fragmentBoxCache.set(mol.atoms, { bonds: mol.bonds, boxes });
  return boxes;
};

const computeDocumentFragmentBoxes = (mol: Molecule): FragmentBox[] => {
  const adj = buildAdjacency(mol);
  const atomById = new Map<string, Atom>();
  for (const a of mol.atoms) atomById.set(a.id, a);
  const visited = new Set<string>();
  const boxes: FragmentBox[] = [];
  for (const atom of mol.atoms) {
    if (visited.has(atom.id)) continue;
    const comp: string[] = [];
    const picked: Atom[] = [];
    const stack = [atom.id];
    visited.add(atom.id);
    while (stack.length) {
      const id = stack.pop()!;
      comp.push(id);
      const a = atomById.get(id);
      if (a) picked.push(a);
      for (const next of adj.get(id) ?? []) {
        if (!visited.has(next)) {
          visited.add(next);
          stack.push(next);
        }
      }
    }
    // Per-component atoms are collected during the walk: O(atoms) overall
    // instead of one full `atoms.filter` per fragment (quadratic on documents
    // with many molecules or many instance-array copies).
    const box = boxForPickedAtoms(picked, comp);
    if (box) boxes.push(box);
  }
  return boxes;
};

/**
 * Whole-molecule boxes for every document fragment that has at least one selected atom.
 * Align / distribute move entire molecules, not arbitrary atom subsets.
 */
export const selectedDocumentFragmentBoxes = (
  mol: Molecule,
  selectedAtomIds: string[],
): FragmentBox[] => {
  if (selectedAtomIds.length === 0) return [];
  const selected = new Set(selectedAtomIds);
  return documentFragmentBoxes(mol).filter(box => box.atomIds.some(id => selected.has(id)));
};

const translateByBox = (
  mol: Molecule,
  boxes: FragmentBox[],
  offsetFor: (box: FragmentBox, index: number) => { dx: number; dy: number },
): Molecule => {
  const offsets = new Map<string, { dx: number; dy: number }>();
  boxes.forEach((box, index) => {
    const offset = offsetFor(box, index);
    for (const id of box.atomIds) offsets.set(id, offset);
  });
  return {
    ...mol,
    atoms: mol.atoms.map(atom => {
      const offset = offsets.get(atom.id);
      return offset ? { ...atom, x: atom.x + offset.dx, y: atom.y + offset.dy } : atom;
    }),
  };
};

export const alignSelectedFragments = (
  mol: Molecule,
  selectedAtomIds: string[],
  mode: SelectionAlignMode,
): Molecule => {
  const boxes = selectedDocumentFragmentBoxes(mol, selectedAtomIds);
  if (boxes.length < 2) return mol;

  if (mode === 'left' || mode === 'right' || mode === 'centerX') {
    const target =
      mode === 'left'
        ? Math.min(...boxes.map(b => b.minX))
        : mode === 'right'
          ? Math.max(...boxes.map(b => b.maxX))
          : boxes.reduce((sum, b) => sum + b.cx, 0) / boxes.length;
    return translateByBox(mol, boxes, box => ({
      dx: target - (mode === 'left' ? box.minX : mode === 'right' ? box.maxX : box.cx),
      dy: 0,
    }));
  }

  const target =
    mode === 'top'
      ? Math.min(...boxes.map(b => b.minY))
      : mode === 'bottom'
        ? Math.max(...boxes.map(b => b.maxY))
        : boxes.reduce((sum, b) => sum + b.cy, 0) / boxes.length;
  return translateByBox(mol, boxes, box => ({
    dx: 0,
    dy: target - (mode === 'top' ? box.minY : mode === 'bottom' ? box.maxY : box.cy),
  }));
};

export type DistributeSelectedFragmentsOptions = {
  /** Circle layout only: center-to-center radius in world units. */
  radius?: number;
};

/**
 * Auto radius for circle arrange: clear neighboring AABBs and keep at least
 * the current radial spread.
 */
export const suggestCircleArrangeRadius = (boxes: FragmentBox[]): number => {
  const n = boxes.length;
  if (n < 2) return MIN_DISTRIBUTE_GAP;
  const cx = boxes.reduce((s, b) => s + b.cx, 0) / n;
  const cy = boxes.reduce((s, b) => s + b.cy, 0) / n;
  const halfDiags = boxes.map(b => {
    const w = Math.max(1, b.maxX - b.minX);
    const h = Math.max(1, b.maxY - b.minY);
    return 0.5 * Math.hypot(w, h);
  });
  let maxPairClearance = 0;
  for (let i = 0; i < n; i++) {
    const pair = halfDiags[i]! + halfDiags[(i + 1) % n]! + MIN_DISTRIBUTE_GAP;
    if (pair > maxPairClearance) maxPairClearance = pair;
  }
  const sinHalf = Math.sin(Math.PI / n);
  const radiusFromChord =
    sinHalf > 1e-9 ? maxPairClearance / (2 * sinHalf) : maxPairClearance;
  const maxHalf = Math.max(...halfDiags, 1);
  const currentR = Math.max(...boxes.map(b => Math.hypot(b.cx - cx, b.cy - cy)), 0);
  return Math.max(radiusFromChord, maxHalf * 1.25, currentR);
};

/**
 * Evenly space whole selected molecules along an axis by **equal gaps between
 * bounding boxes** (not equal center spacing). Overlapping / cramped groups
 * expand using {@link MIN_DISTRIBUTE_GAP}.
 *
 * `grid` / `circle` rearrange 2+ fragments into a neat layout around the
 * selection’s current top-left / centroid.
 */
export const distributeSelectedFragments = (
  mol: Molecule,
  selectedAtomIds: string[],
  axis: SelectionDistributeAxis,
  options?: DistributeSelectedFragmentsOptions,
): Molecule => {
  const boxes = selectedDocumentFragmentBoxes(mol, selectedAtomIds);
  if (boxes.length < 2) return mol;

  if (axis === 'grid') {
    return arrangeFragmentsInGrid(mol, boxes);
  }
  if (axis === 'circle') {
    return arrangeFragmentsInCircle(mol, boxes, options?.radius);
  }
  if (axis === 'row') {
    return arrangeSelectedFragmentsLinear(mol, boxes);
  }

  const sorted = [...boxes].sort((a, b) =>
    axis === 'horizontal' ? a.minX - b.minX || a.cx - b.cx : a.minY - b.minY || a.cy - b.cy,
  );

  if (axis === 'horizontal') {
    const widths = sorted.map(b => Math.max(1, b.maxX - b.minX));
    const totalWidth = widths.reduce((s, w) => s + w, 0);
    const first = sorted[0]!;
    const last = sorted[sorted.length - 1]!;
    const outerSpan = last.maxX - first.minX;
    const slots = sorted.length - 1;
    let gap = (outerSpan - totalWidth) / slots;
    if (!Number.isFinite(gap) || gap < MIN_DISTRIBUTE_GAP) {
      gap = MIN_DISTRIBUTE_GAP;
    }
    let cursor = first.minX;
    return translateByBox(mol, sorted, (box, index) => {
      const dx = cursor - box.minX;
      cursor += widths[index]! + gap;
      return { dx, dy: 0 };
    });
  }

  const heights = sorted.map(b => Math.max(1, b.maxY - b.minY));
  const totalHeight = heights.reduce((s, h) => s + h, 0);
  const first = sorted[0]!;
  const last = sorted[sorted.length - 1]!;
  const outerSpan = last.maxY - first.minY;
  const slots = sorted.length - 1;
  let gap = (outerSpan - totalHeight) / slots;
  if (!Number.isFinite(gap) || gap < MIN_DISTRIBUTE_GAP) {
    gap = MIN_DISTRIBUTE_GAP;
  }
  let cursor = first.minY;
  return translateByBox(mol, sorted, (box, index) => {
    const dy = cursor - box.minY;
    cursor += heights[index]! + gap;
    return { dx: 0, dy };
  });
};

/**
 * Neat linear row: left-to-right by current centroid X, shared centre Y,
 * equal AABB gaps. Translate only — internal geometry is unchanged.
 */
export const arrangeSelectedFragmentsLinear = (
  mol: Molecule,
  boxes: FragmentBox[],
): Molecule => {
  if (boxes.length < 2) return mol;
  const sorted = [...boxes].sort((a, b) => a.cx - b.cx || a.cy - b.cy || a.minX - b.minX);
  const targetCy = sorted.reduce((sum, b) => sum + b.cy, 0) / sorted.length;
  const widths = sorted.map(b => Math.max(1, b.maxX - b.minX));
  let bondSum = 0;
  let bondCount = 0;
  const atomById = new Map(mol.atoms.map(a => [a.id, a]));
  for (const b of mol.bonds) {
    const a1 = atomById.get(b.fromAtomId);
    const a2 = atomById.get(b.toAtomId);
    if (!a1 || !a2) continue;
    bondSum += Math.hypot(a1.x - a2.x, a1.y - a2.y);
    bondCount += 1;
  }
  const bond = bondCount > 0 ? bondSum / bondCount : 40;
  const gap = Math.max(MIN_DISTRIBUTE_GAP, bond * 1.5);
  let cursor = sorted[0]!.minX;
  return translateByBox(mol, sorted, (box, index) => {
    const dx = cursor - box.minX;
    const dy = targetCy - box.cy;
    cursor += widths[index]! + gap;
    return { dx, dy };
  });
};

const arrangeFragmentsInGrid = (mol: Molecule, boxes: FragmentBox[]): Molecule => {
  const cols = Math.max(1, Math.ceil(Math.sqrt(boxes.length)));
  const cellW =
    Math.max(...boxes.map(b => b.maxX - b.minX), 1) + MIN_DISTRIBUTE_GAP;
  const cellH =
    Math.max(...boxes.map(b => b.maxY - b.minY), 1) + MIN_DISTRIBUTE_GAP;
  const sorted = [...boxes].sort((a, b) => a.cy - b.cy || a.cx - b.cx);
  const originX = Math.min(...boxes.map(b => b.minX));
  const originY = Math.min(...boxes.map(b => b.minY));
  return translateByBox(mol, sorted, (box, index) => {
    const col = index % cols;
    const row = Math.floor(index / cols);
    const targetCx = originX + col * cellW + cellW / 2 - MIN_DISTRIBUTE_GAP / 2;
    const targetCy = originY + row * cellH + cellH / 2 - MIN_DISTRIBUTE_GAP / 2;
    return { dx: targetCx - box.cx, dy: targetCy - box.cy };
  });
};

/**
 * Place fragment centers on a common circle, equally spaced along the
 * circumference (equal arc length = equal angle step 2π/n). Relative order
 * around the ring is preserved from the current layout.
 * Optional `radius` overrides the auto-suggested size (clamped to a small minimum).
 */
const arrangeFragmentsInCircle = (
  mol: Molecule,
  boxes: FragmentBox[],
  radiusOverride?: number,
): Molecule => {
  const n = boxes.length;
  const cx = boxes.reduce((s, b) => s + b.cx, 0) / n;
  const cy = boxes.reduce((s, b) => s + b.cy, 0) / n;
  const sorted = [...boxes].sort(
    (a, b) => Math.atan2(a.cy - cy, a.cx - cx) - Math.atan2(b.cy - cy, b.cx - cx),
  );
  const autoRadius = suggestCircleArrangeRadius(sorted);
  const radius =
    typeof radiusOverride === 'number' && Number.isFinite(radiusOverride)
      ? Math.max(8, radiusOverride)
      : autoRadius;

  const step = (2 * Math.PI) / n;
  // Start at the first fragment’s current angle so the ring doesn’t jump.
  const startAngle = Math.atan2(sorted[0]!.cy - cy, sorted[0]!.cx - cx);
  return translateByBox(mol, sorted, (box, index) => {
    const angle = startAngle + step * index;
    const targetCx = cx + radius * Math.cos(angle);
    const targetCy = cy + radius * Math.sin(angle);
    return { dx: targetCx - box.cx, dy: targetCy - box.cy };
  });
};

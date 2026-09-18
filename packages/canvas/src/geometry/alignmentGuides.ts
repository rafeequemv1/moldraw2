/**
 * Figma-style alignment: compare moving geometry to other fragments’ AABBs
 * (overall molecule transform bounds), reaction arrows, and world origin —
 * not individual atom centers inside a molecule.
 */
import type { Molecule, ReactionArrow } from '@moldraw/domain';
import { documentFragmentBoxes } from '@moldraw/core';
import { getSelectionAabb } from './selection';
import {
  getReactionArrowKind,
  isFreeformCurveArrowKind,
  reactionArrowAfterDelta,
  reactionArrowEndpointResizePatch,
  type ReactionArrowEndpoint,
} from './reactionArrow';

export type AlignmentGuides = {
  verticalX: number[];
  horizontalY: number[];
};

/** Matches `drawGrid` minor spacing (world units). */
export const DEFAULT_GRID_SIZE = 50;

const uniqSorted = (xs: number[]): number[] => [...new Set(xs)].sort((a, b) => a - b);

/**
 * Alignment targets: each unselected fragment’s min/max/center, reaction-arrow
 * endpoints / midpoints, and world origin. Excludes fragments that intersect
 * `excludeAtomIds` (the moving selection).
 */
export const collectAlignmentTargets = (
  molecule: Molecule,
  excludeAtomIds: Set<string>,
): { targetsX: number[]; targetsY: number[] } => {
  const xs: number[] = [0];
  const ys: number[] = [0];

  for (const box of documentFragmentBoxes(molecule)) {
    if (box.atomIds.some(id => excludeAtomIds.has(id))) continue;
    xs.push(box.minX, box.maxX, box.cx);
    ys.push(box.minY, box.maxY, box.cy);
  }

  for (const a of molecule.reactionArrows ?? []) {
    xs.push(a.x1, a.x2, (a.x1 + a.x2) / 2);
    ys.push(a.y1, a.y2, (a.y1 + a.y2) / 2);
  }

  return { targetsX: uniqSorted(xs), targetsY: uniqSorted(ys) };
};

const guidesFromXRefs = (refs: number[], targetsX: number[], threshold: number): number[] => {
  const hit = new Set<number>();
  for (const ref of refs) {
    for (const t of targetsX) {
      if (Math.abs(ref - t) <= threshold) hit.add(t);
    }
  }
  return [...hit].sort((a, b) => a - b);
};

const guidesFromYRefs = (refs: number[], targetsY: number[], threshold: number): number[] => {
  const hit = new Set<number>();
  for (const ref of refs) {
    for (const t of targetsY) {
      if (Math.abs(ref - t) <= threshold) hit.add(t);
    }
  }
  return [...hit].sort((a, b) => a - b);
};

const bestAxisSnap = (
  refs: number[],
  targets: number[],
  threshold: number,
): number | null => {
  let bestD = threshold + 1;
  let bestDelta: number | null = null;
  for (const ref of refs) {
    for (const t of targets) {
      const d = Math.abs(ref - t);
      if (d <= threshold && d < bestD) {
        bestD = d;
        bestDelta = t - ref;
      }
    }
  }
  return bestDelta;
};

export const snapPointToGrid = (x: number, y: number, gridSize: number): { x: number; y: number } => {
  const g = gridSize > 0 ? gridSize : DEFAULT_GRID_SIZE;
  return {
    x: Math.round(x / g) * g,
    y: Math.round(y / g) * g,
  };
};

/**
 * Magnetic snap of a selection AABB to fragment/arrow targets, then optional
 * snap of the AABB center to the background grid.
 */
export const snapSelectionMovePointer = (
  molecule: Molecule,
  selectedAtomIds: string[],
  startX: number,
  startY: number,
  pointerWx: number,
  pointerWy: number,
  thresholdWorld: number,
  opts?: { snapToGrid?: boolean; gridSize?: number; disableAlignSnap?: boolean },
): { wx: number; wy: number } => {
  let dx = pointerWx - startX;
  let dy = pointerWy - startY;
  if (selectedAtomIds.length === 0) {
    return { wx: pointerWx, wy: pointerWy };
  }
  const aabb = getSelectionAabb(molecule, selectedAtomIds);
  if (!aabb) return { wx: pointerWx, wy: pointerWy };

  if (!opts?.disableAlignSnap) {
    const ex = new Set(selectedAtomIds);
    const { targetsX, targetsY } = collectAlignmentTargets(molecule, ex);
    const minX = aabb.minX + dx;
    const maxX = aabb.maxX + dx;
    const cx = aabb.cx + dx;
    const minY = aabb.minY + dy;
    const maxY = aabb.maxY + dy;
    const cy = aabb.cy + dy;
    const sdx = bestAxisSnap([minX, maxX, cx], targetsX, thresholdWorld);
    const sdy = bestAxisSnap([minY, maxY, cy], targetsY, thresholdWorld);
    if (sdx != null) dx += sdx;
    if (sdy != null) dy += sdy;
  }

  if (opts?.snapToGrid) {
    const g = opts.gridSize && opts.gridSize > 0 ? opts.gridSize : DEFAULT_GRID_SIZE;
    const snapped = snapPointToGrid(aabb.cx + dx, aabb.cy + dy, g);
    dx = snapped.x - aabb.cx;
    dy = snapped.y - aabb.cy;
  }

  return { wx: startX + dx, wy: startY + dy };
};

export const guidesForSelectionMove = (
  molecule: Molecule,
  selectedAtomIds: string[],
  dragDx: number,
  dragDy: number,
  thresholdWorld: number,
): AlignmentGuides => {
  if (selectedAtomIds.length === 0) return { verticalX: [], horizontalY: [] };
  const aabb = getSelectionAabb(molecule, selectedAtomIds);
  if (!aabb) return { verticalX: [], horizontalY: [] };
  const ex = new Set(selectedAtomIds);
  const { targetsX, targetsY } = collectAlignmentTargets(molecule, ex);
  const minX = aabb.minX + dragDx;
  const maxX = aabb.maxX + dragDx;
  const cx = aabb.cx + dragDx;
  const minY = aabb.minY + dragDy;
  const maxY = aabb.maxY + dragDy;
  const cy = aabb.cy + dragDy;
  return {
    verticalX: guidesFromXRefs([minX, maxX, cx], targetsX, thresholdWorld),
    horizontalY: guidesFromYRefs([minY, maxY, cy], targetsY, thresholdWorld),
  };
};

export const guidesForCanvasTextMove = (
  molecule: Molecule,
  origX: number,
  origY: number,
  dragDx: number,
  dragDy: number,
  thresholdWorld: number,
): AlignmentGuides => {
  const { targetsX, targetsY } = collectAlignmentTargets(molecule, new Set());
  const px = origX + dragDx;
  const py = origY + dragDy;
  return {
    verticalX: guidesFromXRefs([px], targetsX, thresholdWorld),
    horizontalY: guidesFromYRefs([py], targetsY, thresholdWorld),
  };
};

export const guidesForReactionArrowMove = (
  molecule: Molecule,
  origArrow: ReactionArrow,
  dragDx: number,
  dragDy: number,
  thresholdWorld: number,
): AlignmentGuides => {
  const a = reactionArrowAfterDelta(origArrow, dragDx, dragDy);
  const { targetsX, targetsY } = collectAlignmentTargets(molecule, new Set());
  const mx = (a.x1 + a.x2) / 2;
  const my = (a.y1 + a.y2) / 2;
  return {
    verticalX: guidesFromXRefs([a.x1, a.x2, mx], targetsX, thresholdWorld),
    horizontalY: guidesFromYRefs([a.y1, a.y2, my], targetsY, thresholdWorld),
  };
};

/** Alignment while dragging a reaction-arrow tail or head endpoint. */
export const guidesForReactionArrowResize = (
  molecule: Molecule,
  origArrow: ReactionArrow,
  endpoint: ReactionArrowEndpoint,
  dragDx: number,
  dragDy: number,
  thresholdWorld: number,
): AlignmentGuides => {
  // Freeform curve handle dots do not snap — no guide lines while adjusting them.
  if (
    endpoint === 'curve' ||
    endpoint === 'c1' ||
    endpoint === 'c2' ||
    endpoint === 'vertex' ||
    isFreeformCurveArrowKind(getReactionArrowKind(origArrow))
  ) {
    return { verticalX: [], horizontalY: [] };
  }
  const a = {
    ...origArrow,
    ...reactionArrowEndpointResizePatch(origArrow, endpoint, dragDx, dragDy),
  } as ReactionArrow;
  const { targetsX, targetsY } = collectAlignmentTargets(molecule, new Set());
  const mx = (a.x1 + a.x2) / 2;
  const my = (a.y1 + a.y2) / 2;
  const xs = [a.x1, a.x2, mx];
  const ys = [a.y1, a.y2, my];
  if (a.cx !== undefined && a.cy !== undefined) {
    xs.push(a.cx);
    ys.push(a.cy);
  }
  if (a.c1x !== undefined && a.c1y !== undefined && a.c2x !== undefined && a.c2y !== undefined) {
    xs.push(a.c1x, a.c2x);
    ys.push(a.c1y, a.c2y);
  }
  return {
    verticalX: guidesFromXRefs(xs, targetsX, thresholdWorld),
    horizontalY: guidesFromYRefs(ys, targetsY, thresholdWorld),
  };
};

export const alignmentGuideThresholdWorld = (effectiveZoom: number): number =>
  4 / effectiveZoom;

/** Axis magnet radius when dragging arrow endpoints (world units); angle snap uses 15° steps in snap helper. */
export const ARROW_ENDPOINT_AXIS_SNAP_WORLD = 8;

const ARROW_ENDPOINT_ANGLE_SNAP_DEG = 15;

/**
 * Magnetic snap while resizing an arrow endpoint: 15° shaft angles + axis snap
 * to fragment bounds / origin. Shift (caller) disables by passing disableSnap.
 * Curved, S-curve, and other freeform handles never snap.
 */
export const snapReactionArrowResizePointer = (
  molecule: Molecule,
  orig: ReactionArrow,
  endpoint: ReactionArrowEndpoint,
  startX: number,
  startY: number,
  pointerWx: number,
  pointerWy: number,
  axisThresholdWorld: number,
  disableSnap: boolean,
): { wx: number; wy: number } => {
  const kind = getReactionArrowKind(orig);
  // Curved / S-curve / other freeform handles: no angle, axis, or structure snap.
  if (
    endpoint === 'curve' ||
    endpoint === 'c1' ||
    endpoint === 'c2' ||
    endpoint === 'vertex' ||
    isFreeformCurveArrowKind(kind)
  ) {
    return { wx: pointerWx, wy: pointerWy };
  }

  const ox = endpoint === 'tail' ? orig.x1 : orig.x2;
  const oy = endpoint === 'tail' ? orig.y1 : orig.y2;
  let mx = ox + (pointerWx - startX);
  let my = oy + (pointerWy - startY);

  const fx = endpoint === 'tail' ? orig.x2 : orig.x1;
  const fy = endpoint === 'tail' ? orig.y2 : orig.y1;

  if (!disableSnap) {
    const vx = mx - fx;
    const vy = my - fy;
    const len = Math.hypot(vx, vy);
    if (len > 1e-6) {
      const step = (ARROW_ENDPOINT_ANGLE_SNAP_DEG * Math.PI) / 180;
      let ang = Math.atan2(vy, vx);
      ang = Math.round(ang / step) * step;
      mx = fx + Math.cos(ang) * len;
      my = fy + Math.sin(ang) * len;
    }

    const { targetsX, targetsY } = collectAlignmentTargets(molecule, new Set());
    let bestXd = axisThresholdWorld + 1;
    let nx = mx;
    for (const t of targetsX) {
      const d = Math.abs(mx - t);
      if (d <= axisThresholdWorld && d < bestXd) {
        bestXd = d;
        nx = t;
      }
    }
    if (bestXd <= axisThresholdWorld) mx = nx;

    let bestYd = axisThresholdWorld + 1;
    let ny = my;
    for (const t of targetsY) {
      const d = Math.abs(my - t);
      if (d <= axisThresholdWorld && d < bestYd) {
        bestYd = d;
        ny = t;
      }
    }
    if (bestYd <= axisThresholdWorld) my = ny;
  }

  return {
    wx: startX + (mx - ox),
    wy: startY + (my - oy),
  };
};

/** Snap whole-arrow translation so mid / ends align to fragment guides or grid. */
export const snapReactionArrowMovePointer = (
  molecule: Molecule,
  orig: ReactionArrow,
  startX: number,
  startY: number,
  pointerWx: number,
  pointerWy: number,
  thresholdWorld: number,
  opts?: { snapToGrid?: boolean; gridSize?: number; disableAlignSnap?: boolean },
): { wx: number; wy: number } => {
  let dx = pointerWx - startX;
  let dy = pointerWy - startY;
  const a = reactionArrowAfterDelta(orig, dx, dy);
  const mx = (a.x1 + a.x2) / 2;
  const my = (a.y1 + a.y2) / 2;

  if (!opts?.disableAlignSnap) {
    const { targetsX, targetsY } = collectAlignmentTargets(molecule, new Set());
    const sdx = bestAxisSnap([a.x1, a.x2, mx], targetsX, thresholdWorld);
    const sdy = bestAxisSnap([a.y1, a.y2, my], targetsY, thresholdWorld);
    if (sdx != null) dx += sdx;
    if (sdy != null) dy += sdy;
  }

  if (opts?.snapToGrid) {
    const g = opts.gridSize && opts.gridSize > 0 ? opts.gridSize : DEFAULT_GRID_SIZE;
    const midX = (orig.x1 + orig.x2) / 2 + dx;
    const midY = (orig.y1 + orig.y2) / 2 + dy;
    const snapped = snapPointToGrid(midX, midY, g);
    dx = snapped.x - (orig.x1 + orig.x2) / 2;
    dy = snapped.y - (orig.y1 + orig.y2) / 2;
  }

  return { wx: startX + dx, wy: startY + dy };
};

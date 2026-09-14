/**
 * Viewport culling helpers — which fragment AABBs (and thus atoms/bonds)
 * intersect the current camera frustum.
 */
import type { Molecule } from '@moldraw/domain';
import type { FragmentBox } from '@moldraw/core';
import type { Viewport } from './polygons';

export type WorldViewport = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

/** World-space rect currently visible on the canvas (with optional pad). */
export const worldViewportRect = (
  canvasWidth: number,
  canvasHeight: number,
  viewport: Viewport,
  displayScale: number,
  padWorld = 80,
): WorldViewport => {
  const zoom = Math.max(1e-6, viewport.zoom * displayScale);
  const halfW = canvasWidth / 2 / zoom;
  const halfH = canvasHeight / 2 / zoom;
  const cx = -viewport.x / zoom;
  const cy = -viewport.y / zoom;
  return {
    minX: cx - halfW - padWorld,
    minY: cy - halfH - padWorld,
    maxX: cx + halfW + padWorld,
    maxY: cy + halfH + padWorld,
  };
};

const boxIntersects = (box: FragmentBox, vp: WorldViewport): boolean =>
  box.maxX >= vp.minX && box.minX <= vp.maxX && box.maxY >= vp.minY && box.minY <= vp.maxY;

export type CulledSets = {
  visibleAtomIds: Set<string>;
  visibleBondIds: Set<string>;
  visibleFragmentIndices: number[];
  /** True when everything is visible (skip Set checks in hot loops). */
  allVisible: boolean;
};

export const cullFragmentsToViewport = (
  mol: Molecule,
  fragmentBoxes: FragmentBox[],
  atomToFragmentIndex: Map<string, number>,
  vp: WorldViewport,
): CulledSets => {
  if (fragmentBoxes.length === 0 || mol.atoms.length === 0) {
    return {
      visibleAtomIds: new Set(),
      visibleBondIds: new Set(),
      visibleFragmentIndices: [],
      allVisible: true,
    };
  }

  const visibleFragmentIndices: number[] = [];
  for (let i = 0; i < fragmentBoxes.length; i++) {
    if (boxIntersects(fragmentBoxes[i]!, vp)) visibleFragmentIndices.push(i);
  }

  if (visibleFragmentIndices.length === fragmentBoxes.length) {
    return {
      visibleAtomIds: new Set(),
      visibleBondIds: new Set(),
      visibleFragmentIndices,
      allVisible: true,
    };
  }

  const visibleFrag = new Set(visibleFragmentIndices);
  const visibleAtomIds = new Set<string>();
  for (const [atomId, fi] of atomToFragmentIndex) {
    if (visibleFrag.has(fi)) visibleAtomIds.add(atomId);
  }
  const visibleBondIds = new Set<string>();
  for (const b of mol.bonds) {
    if (visibleAtomIds.has(b.fromAtomId) && visibleAtomIds.has(b.toAtomId)) {
      visibleBondIds.add(b.id);
    }
  }
  return {
    visibleAtomIds,
    visibleBondIds,
    visibleFragmentIndices,
    allVisible: false,
  };
};

/**
 * @deprecated Labels always draw (LOD label-hide removed — ChemDraw keeps labels visible).
 * Kept so older imports do not break.
 */
export const LOD_LABEL_MIN_ZOOM = 0;

/**
 * Pure helpers for importing a parsed mol block onto the canvas:
 *  - strip explicit hydrogens
 *  - normalise bond length to the app target px (default 40)
 *  - position: either a fixed-size viewport/world grid, or centroid at world (0,0)
 *  - merge into an existing canvas: stay in the current view, scan to avoid overlap
 */
import type { Atom, Bond, Molecule } from '@moldraw/domain';
import { documentFragmentBoxes } from '../align/selectionArrange';

const avgBondLen = (mol: Molecule, fallbackLen: number): number => {
  if (mol.bonds.length === 0) return fallbackLen;
  let sum = 0;
  for (const b of mol.bonds) {
    const a1 = mol.atoms.find(a => a.id === b.fromAtomId);
    const a2 = mol.atoms.find(a => a.id === b.toAtomId);
    if (a1 && a2) sum += Math.hypot(a1.x - a2.x, a1.y - a2.y);
  }
  return sum / mol.bonds.length;
};

/**
 * Strip terminal explicit hydrogens so imports match ChemDraw-style drawing:
 * only functional-group H (NH, OH, …) appear as labels by default.
 *
 * Keep only chemically special H (charge, isotope, or non-terminal). Plain
 * skeletal H — including PubChem stereo-care / wedge H on carbon — are
 * dropped; heteroatom H counts still show via implicit labels. Any kept
 * carbon H is gated by the canvas H toggle.
 */
export const stripExplicitHydrogens = (raw: Molecule): Molecule => {
  const isPreservedHydrogen = (atomId: string): boolean => {
    const atom = raw.atoms.find(a => a.id === atomId);
    if (!atom || atom.element !== 'H') return false;
    if ((atom.charge ?? 0) !== 0) return true;
    if (atom.isotope && atom.isotope > 0) return true;

    const incident = raw.bonds.filter(b => b.fromAtomId === atomId || b.toAtomId === atomId);
    // Non-terminal / bridging H should stay.
    if (incident.length !== 1) return true;
    return false;
  };

  const heavyIds = new Set(
    raw.atoms
      .filter(a => a.element !== 'H' || isPreservedHydrogen(a.id))
      .map(a => a.id),
  );
  return {
    atoms: raw.atoms.filter(a => heavyIds.has(a.id)),
    bonds: raw.bonds.filter(b => heavyIds.has(b.fromAtomId) && heavyIds.has(b.toAtomId)),
  };
};

export interface PlacementSlot {
  /** 0-indexed column in the flow grid. */
  col: number;
  /** 0-indexed row. */
  row: number;
}

export type ImportPlacementMode = 'viewport_grid' | 'world_origin';

export type ViewportPanZoom = { x: number; y: number; zoom: number };

/**
 * World-space point at the canvas view centre.
 * Matches `useCanvasViewport` / `getWorldPos`: screen = size/2 + pan + world * zoom.
 */
export function viewportWorldCenter(viewport: ViewportPanZoom): { x: number; y: number } {
  const z = viewport.zoom || 1;
  return { x: -viewport.x / z, y: -viewport.y / z };
}

/** Visible world AABB for a pan/zoom viewport and CSS canvas size. */
export function viewportWorldRect(
  viewport: ViewportPanZoom,
  windowWidth: number,
  windowHeight: number,
): { minX: number; maxX: number; minY: number; maxY: number } {
  const z = viewport.zoom || 1;
  const c = viewportWorldCenter(viewport);
  const hw = windowWidth / (2 * z);
  const hh = windowHeight / (2 * z);
  return { minX: c.x - hw, maxX: c.x + hw, minY: c.y - hh, maxY: c.y + hh };
}

export type ImportViewPlacement = {
  viewport: ViewportPanZoom;
  windowWidth: number;
  windowHeight: number;
};

/** Columns used for multi-structure imports (AI chat, PubChem batch). */
export const IMPORT_GRID_COLS = 3;

export interface PlaceImportedOptions {
  parsed: Molecule;
  slot: PlacementSlot;
  /** Viewport origin in DOM pixels (canvas top-left in screen space). */
  viewport: { x: number; y: number; zoom: number };
  windowWidth: number;
  windowHeight: number;
  /** `world_origin` = centroid at (0,0); `viewport_grid` = staggered grid in view (default). */
  mode?: ImportPlacementMode;
  /** Target average bond length in canvas px (from app settings). */
  bondLengthPx?: number;
  /**
   * Stable world-space center of slot (0,0). When set, later imports keep the same
   * grid even if the viewport pans (e.g. focus after each AI importSmiles).
   */
  gridOrigin?: { x: number; y: number };
}

export interface PlaceImportedResult {
  atoms: Atom[];
  bonds: Bond[];
}

/** Fixed cell size so aspirin and caffeine land on the same lattice. */
export function importGridCellSize(bondLengthPx: number): {
  cellW: number;
  cellH: number;
  gapX: number;
  gapY: number;
} {
  return {
    cellW: bondLengthPx * 7.5,
    cellH: bondLengthPx * 6.5,
    gapX: bondLengthPx * 2.5,
    gapY: bondLengthPx * 2.8,
  };
}

/**
 * World-space center for slot (0,0) of a 3-col grid anchored on the viewport.
 */
export function defaultImportGridOrigin(opts: {
  viewport: { x: number; y: number; zoom: number };
  windowWidth: number;
  windowHeight: number;
  bondLengthPx: number;
  cols?: number;
}): { x: number; y: number } {
  const cols = opts.cols ?? IMPORT_GRID_COLS;
  const { cellW, gapX } = importGridCellSize(opts.bondLengthPx);
  const { x: vpCX, y: vpCY } = viewportWorldCenter(opts.viewport);
  return {
    x: vpCX - ((cols - 1) * (cellW + gapX)) / 2,
    y: vpCY - cellW * 0.15,
  };
}

/**
 * Scale + translate `parsed` so bonds match bondLengthPx and its centre lands on
 * a fixed-size grid cell (not sized from this molecule's bbox — that caused overlap).
 */
export const placeImportedMolecule = ({
  parsed,
  slot,
  viewport,
  windowWidth,
  windowHeight,
  mode = 'viewport_grid',
  bondLengthPx = 40,
  gridOrigin,
}: PlaceImportedOptions): PlaceImportedResult => {
  const avg = avgBondLen(parsed, bondLengthPx);
  const scaleRatio = avg === 0 ? 1 : bondLengthPx / avg;

  const scaledAtoms = parsed.atoms.map(a => ({ ...a, x: a.x * scaleRatio, y: a.y * scaleRatio }));

  const cx = scaledAtoms.reduce((s, a) => s + a.x, 0) / scaledAtoms.length;
  const cy = scaledAtoms.reduce((s, a) => s + a.y, 0) / scaledAtoms.length;

  if (mode === 'world_origin') {
    const finalAtoms = scaledAtoms.map(a => ({
      ...a,
      x: a.x - cx,
      y: a.y - cy,
    }));
    return { atoms: finalAtoms, bonds: parsed.bonds };
  }

  const { cellW, cellH, gapX, gapY } = importGridCellSize(bondLengthPx);
  const origin =
    gridOrigin ??
    defaultImportGridOrigin({
      viewport,
      windowWidth,
      windowHeight,
      bondLengthPx,
    });

  const targetX = origin.x + slot.col * (cellW + gapX);
  const targetY = origin.y + slot.row * (cellH + gapY);

  const finalAtoms = scaledAtoms.map(a => ({
    ...a,
    x: a.x + (targetX - cx),
    y: a.y + (targetY - cy),
  }));

  return { atoms: finalAtoms, bonds: parsed.bonds };
};

export type AtomBounds = {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  cx: number;
  cy: number;
};

/** Axis-aligned bounds of atom positions (null when empty). */
export const atomBounds = (
  atoms: ReadonlyArray<{ x: number; y: number }>,
): AtomBounds | null => {
  if (atoms.length === 0) return null;
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const a of atoms) {
    minX = Math.min(minX, a.x);
    maxX = Math.max(maxX, a.x);
    minY = Math.min(minY, a.y);
    maxY = Math.max(maxY, a.y);
  }
  return { minX, maxX, minY, maxY, cx: (minX + maxX) / 2, cy: (minY + maxY) / 2 };
};

/** Short edge-to-edge gap when parking an import beside existing content (~1.5 bonds). */
export const importBesideGapPx = (bondLengthPx = 40): number =>
  Math.max(40, bondLengthPx * 1.5);

/**
 * Place an unbonded neighbor ~1.5 bond lengths from `anchor` (salt pair / paste gap).
 * Prefers the left (cation beside anion), then right / up / down to avoid clashes.
 */
export function placeUnbondedNeighbor(
  existing: ReadonlyArray<{ id: string; x: number; y: number }>,
  anchor: { id: string; x: number; y: number },
  bondLengthPx = 40,
): { x: number; y: number } {
  const gap = importBesideGapPx(bondLengthPx);
  const minDist = Math.max(bondLengthPx * 0.75, 28);
  const candidates = [
    { x: anchor.x - gap, y: anchor.y },
    { x: anchor.x + gap, y: anchor.y },
    { x: anchor.x, y: anchor.y - gap },
    { x: anchor.x, y: anchor.y + gap },
  ];
  for (const p of candidates) {
    const clash = existing.some(
      a => a.id !== anchor.id && Math.hypot(a.x - p.x, a.y - p.y) < minDist,
    );
    if (!clash) return p;
  }
  return candidates[1]!;
}

const boundsOverlapWithGap = (a: AtomBounds, b: AtomBounds, gap: number): boolean =>
  a.minX < b.maxX + gap &&
  a.maxX > b.minX - gap &&
  a.minY < b.maxY + gap &&
  a.maxY > b.minY - gap;

const shiftBounds = (b: AtomBounds, dx: number, dy: number): AtomBounds => ({
  minX: b.minX + dx,
  maxX: b.maxX + dx,
  minY: b.minY + dy,
  maxY: b.maxY + dy,
  cx: b.cx + dx,
  cy: b.cy + dy,
});

type ViewAabb = { minX: number; maxX: number; minY: number; maxY: number };

const boxFullyOutside = (box: AtomBounds, view: ViewAabb): boolean =>
  box.maxX < view.minX || box.minX > view.maxX || box.maxY < view.minY || box.minY > view.maxY;

const boxFullyInside = (box: AtomBounds, view: ViewAabb, pad = 0): boolean =>
  box.minX >= view.minX + pad &&
  box.maxX <= view.maxX - pad &&
  box.minY >= view.minY + pad &&
  box.maxY <= view.maxY - pad;

const axisOrder = (span: number): number[] => {
  const out = [0];
  for (let i = 1; i <= span; i++) out.push(i);
  for (let i = 1; i <= span; i++) out.push(-i);
  return out;
};

export type OffsetImportedInViewportOptions = {
  bondLengthPx?: number;
  viewport?: ViewportPanZoom;
  windowWidth?: number;
  windowHeight?: number;
};

/**
 * Translate `incoming` so it stays in the current camera view and does not
 * overlap existing molecules (connected-component AABBs + a short gap).
 *
 * Scan order: current / view-centre, then right, then down (then left / up).
 * Prefers a fully in-view slot; if the fragment must sit slightly outside,
 * the caller should pan with `ensureWorldRectVisible` (no zoom).
 */
export const offsetImportedInViewport = <T extends { x: number; y: number }>(
  existing: Molecule,
  incomingAtoms: T[],
  opts: OffsetImportedInViewportOptions = {},
): T[] => {
  if (existing.atoms.length === 0 || incomingAtoms.length === 0) return incomingAtoms;
  const incoming = atomBounds(incomingAtoms);
  if (!incoming) return incomingAtoms;

  const bondLengthPx = opts.bondLengthPx ?? 40;
  const gap = importBesideGapPx(bondLengthPx);
  const occupied = documentFragmentBoxes(existing).map(b => ({
    minX: b.minX,
    maxX: b.maxX,
    minY: b.minY,
    maxY: b.maxY,
    cx: b.cx,
    cy: b.cy,
  }));

  const overlaps = (box: AtomBounds): boolean =>
    occupied.some(other => boundsOverlapWithGap(box, other, gap));

  const view =
    opts.viewport != null &&
    opts.windowWidth != null &&
    opts.windowHeight != null &&
    opts.windowWidth > 0 &&
    opts.windowHeight > 0
      ? viewportWorldRect(opts.viewport, opts.windowWidth, opts.windowHeight)
      : null;
  const viewCenter = opts.viewport ? viewportWorldCenter(opts.viewport) : null;

  let dx0 = 0;
  let dy0 = 0;
  if (view && viewCenter && boxFullyOutside(incoming, view)) {
    dx0 = viewCenter.x - incoming.cx;
    dy0 = viewCenter.y - incoming.cy;
  }

  const apply = (dx: number, dy: number): T[] => {
    if (Math.abs(dx) < 1e-9 && Math.abs(dy) < 1e-9) return incomingAtoms;
    return incomingAtoms.map(a => ({ ...a, x: a.x + dx, y: a.y + dy }));
  };

  const start = shiftBounds(incoming, dx0, dy0);
  if (!overlaps(start)) return apply(dx0, dy0);

  const width = Math.max(1, incoming.maxX - incoming.minX);
  const height = Math.max(1, incoming.maxY - incoming.minY);
  const stepX = width + gap;
  const stepY = height + gap;
  const viewW = view ? Math.max(stepX, view.maxX - view.minX) : stepX * 6;
  const viewH = view ? Math.max(stepY, view.maxY - view.minY) : stepY * 6;
  const colSpan = Math.max(2, Math.ceil(viewW / stepX) + 2);
  const rowSpan = Math.max(2, Math.ceil(viewH / stepY) + 2);

  let bestInView: { dx: number; dy: number } | null = null;
  let bestNear: { dx: number; dy: number } | null = null;
  let bestAny: { dx: number; dy: number } | null = null;

  for (const row of axisOrder(rowSpan)) {
    for (const col of axisOrder(colSpan)) {
      if (row === 0 && col === 0) continue;
      const dx = dx0 + col * stepX;
      const dy = dy0 + row * stepY;
      const box = shiftBounds(incoming, dx, dy);
      if (overlaps(box)) continue;
      const candidate = { dx, dy };
      if (!bestAny) bestAny = candidate;
      if (view) {
        if (!bestInView && boxFullyInside(box, view, 8)) bestInView = candidate;
        if (!bestNear && !boxFullyOutside(box, view)) bestNear = candidate;
        if (bestInView) return apply(bestInView.dx, bestInView.dy);
      } else {
        return apply(dx, dy);
      }
    }
  }

  const picked = bestInView ?? bestNear ?? bestAny;
  if (picked) return apply(picked.dx, picked.dy);

  // Nothing clear: keep the in-view (or original) slot so the new structure
  // still appears in the camera rather than jumping to a world-fit.
  return apply(dx0, dy0);
};

/**
 * If `incoming` would sit on / too near existing atoms, translate it just to the
 * right with a short gap (vertically aligned to the existing centroid).
 * No-op when the canvas is empty or bounds already clear.
 *
 * Prefer {@link offsetImportedInViewport} for search / paste / file merge so
 * placement stays in the current view and skips per-molecule AABBs.
 */
export const offsetImportedBesideExisting = <T extends { x: number; y: number }>(
  existingAtoms: ReadonlyArray<{ x: number; y: number }>,
  incomingAtoms: T[],
  bondLengthPx = 40,
  /** When true, always park to the right (legacy importSmiles). Default: only if overlapping. */
  force = false,
): T[] => {
  if (existingAtoms.length === 0 || incomingAtoms.length === 0) return incomingAtoms;
  const existing = atomBounds(existingAtoms);
  const incoming = atomBounds(incomingAtoms);
  if (!existing || !incoming) return incomingAtoms;

  const gap = importBesideGapPx(bondLengthPx);
  if (!force && !boundsOverlapWithGap(existing, incoming, gap)) {
    return incomingAtoms;
  }

  const dx = existing.maxX + gap - incoming.minX;
  const dy = existing.cy - incoming.cy;
  if (Math.abs(dx) < 1e-9 && Math.abs(dy) < 1e-9) return incomingAtoms;
  return incomingAtoms.map(a => ({ ...a, x: a.x + dx, y: a.y + dy }));
};

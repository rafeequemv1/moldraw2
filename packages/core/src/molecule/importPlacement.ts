/**
 * Pure helpers for importing a parsed mol block onto the canvas:
 *  - strip explicit hydrogens
 *  - normalise bond length to the app target px (default 40)
 *  - position: either a fixed-size viewport/world grid, or centroid at world (0,0)
 */
import type { Atom, Bond, Molecule } from '@moldraw/domain';

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
  const vpCX = (opts.windowWidth / 2 - opts.viewport.x) / opts.viewport.zoom;
  const vpCY = (opts.windowHeight / 2 - opts.viewport.y) / opts.viewport.zoom;
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

const boundsOverlapWithGap = (a: AtomBounds, b: AtomBounds, gap: number): boolean =>
  a.minX < b.maxX + gap &&
  a.maxX > b.minX - gap &&
  a.minY < b.maxY + gap &&
  a.maxY > b.minY - gap;

/**
 * If `incoming` would sit on / too near existing atoms, translate it just to the
 * right with a short gap (vertically aligned to the existing centroid).
 * No-op when the canvas is empty or bounds already clear.
 */
export const offsetImportedBesideExisting = <T extends { x: number; y: number }>(
  existingAtoms: ReadonlyArray<{ x: number; y: number }>,
  incomingAtoms: T[],
  bondLengthPx = 40,
  /** When true, always park to the right (importSmiles). Default: only if overlapping. */
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

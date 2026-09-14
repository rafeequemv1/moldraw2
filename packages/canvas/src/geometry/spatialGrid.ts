/**
 * Uniform grid spatial index for atom (and optional bond midpoint) queries.
 * Rebuild on molecule revision; query for hover / pick / marquee candidates.
 */
import type { Atom, Bond, Molecule } from '@moldraw/domain';
import type { Point } from './polygons';

export type SpatialGrid = {
  cellSize: number;
  /** cellKey → atom ids */
  atomCells: Map<string, string[]>;
  atomById: Map<string, Atom>;
  bonds: Bond[];
};

const cellKey = (cx: number, cy: number) => `${cx},${cy}`;

export const buildSpatialGrid = (
  mol: Molecule,
  atomById?: Map<string, Atom>,
  cellSize = 80,
): SpatialGrid => {
  const map = atomById ?? new Map(mol.atoms.map(a => [a.id, a]));
  const atomCells = new Map<string, string[]>();
  for (const a of mol.atoms) {
    const cx = Math.floor(a.x / cellSize);
    const cy = Math.floor(a.y / cellSize);
    const k = cellKey(cx, cy);
    const bucket = atomCells.get(k);
    if (bucket) bucket.push(a.id);
    else atomCells.set(k, [a.id]);
  }
  return { cellSize, atomCells, atomById: map, bonds: mol.bonds };
};

/** Atom ids in cells overlapping the world rectangle (inclusive pad). */
export const queryAtomIdsInRect = (
  grid: SpatialGrid,
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
): string[] => {
  const { cellSize, atomCells } = grid;
  const x0 = Math.floor(minX / cellSize);
  const y0 = Math.floor(minY / cellSize);
  const x1 = Math.floor(maxX / cellSize);
  const y1 = Math.floor(maxY / cellSize);
  const out: string[] = [];
  const seen = new Set<string>();
  for (let cx = x0; cx <= x1; cx++) {
    for (let cy = y0; cy <= y1; cy++) {
      const bucket = atomCells.get(cellKey(cx, cy));
      if (!bucket) continue;
      for (const id of bucket) {
        if (seen.has(id)) continue;
        seen.add(id);
        out.push(id);
      }
    }
  }
  return out;
};

/** Atom ids near a world point (disk approximated by cell neighborhood). */
export const queryAtomIdsNear = (
  grid: SpatialGrid,
  world: Point,
  radius: number,
): string[] => {
  return queryAtomIdsInRect(
    grid,
    world.x - radius,
    world.y - radius,
    world.x + radius,
    world.y + radius,
  );
};

let gridCached: { mol: Molecule; grid: SpatialGrid } | null = null;

export const getSpatialGridForMolecule = (
  mol: Molecule,
  atomById?: Map<string, Atom>,
): SpatialGrid => {
  if (gridCached && gridCached.mol === mol) return gridCached.grid;
  const grid = buildSpatialGrid(mol, atomById);
  gridCached = { mol, grid };
  return grid;
};

/**
 * Shared 2D layout geometry — ChemDraw-style bond angles on the canvas plane.
 */
import type { MoleculeGraph } from '../graph';

export interface Vec {
  x: number;
  y: number;
}

/** 60° turn between consecutive chain bond directions → 120° C–C–C interior angle. */
export const ZIGZAG = Math.PI / 3;

/** 120° spacing between bonds at one atom (trigonal 2D convention). */
export const TRIGONAL = (2 * Math.PI) / 3;

/** 90° spacing for quaternary (4-bond) carbons in 2D ChemDraw projection. */
export const SQUARE = Math.PI / 2;

export const ANGLE_EPS = 0.15;

export const isHeavyAtom = (element: string): boolean => element !== 'H' && element !== 'D';

export const vecAt = (from: Vec, dir: number, bondLen: number): Vec => ({
  x: from.x + bondLen * Math.cos(dir),
  y: from.y + bondLen * Math.sin(dir),
});

export const dirBetween = (from: Vec, to: Vec): number =>
  Math.atan2(to.y - from.y, to.x - from.x);

export const dist = (a: Vec, b: Vec): number => Math.hypot(a.x - b.x, a.y - b.y);

export const normalizeAngle = (a: number): number => {
  let x = a % (2 * Math.PI);
  if (x > Math.PI) x -= 2 * Math.PI;
  if (x <= -Math.PI) x += 2 * Math.PI;
  return x;
};

export const angleDiff = (a: number, b: number): number => Math.abs(normalizeAngle(a - b));

export const conflictsWith = (dir: number, occupied: number[], tol = ANGLE_EPS): boolean =>
  occupied.some(o => angleDiff(dir, o) < tol || angleDiff(dir, o + Math.PI) < tol);

export const pickFreeDirection = (preferred: number, occupied: number[]): number => {
  if (!conflictsWith(preferred, occupied)) return preferred;
  for (const delta of [ZIGZAG, -ZIGZAG, 2 * ZIGZAG, -2 * ZIGZAG, Math.PI]) {
    const d = preferred + delta;
    if (!conflictsWith(d, occupied)) return d;
  }
  return preferred;
};

export const occupiedBondDirs = (
  g: MoleculeGraph,
  pos: Map<string, Vec>,
  atomId: string,
): number[] => {
  const base = pos.get(atomId);
  if (!base) return [];
  const node = g.nodes.get(atomId);
  if (!node) return [];
  const dirs: number[] = [];
  for (const nb of node.neighbors) {
    // Explicit H/D never occupy a ChemDraw 2D slot — alkyl/aromatic H are implicit.
    if (!isHeavyAtom(g.atomById.get(nb)?.element ?? '')) continue;
    const p = pos.get(nb);
    if (p) dirs.push(dirBetween(base, p));
  }
  return dirs;
};

export const collidesWithPlaced = (
  p: Vec,
  pos: Map<string, Vec>,
  ignoreIds: Set<string>,
  minDist: number,
): boolean => {
  for (const [id, q] of pos) {
    if (ignoreIds.has(id)) continue;
    if (dist(p, q) < minDist) return true;
  }
  return false;
};

export const pickFreeDirectionSafe = (
  preferred: number,
  occupied: number[],
  from: Vec,
  bondLen: number,
  pos: Map<string, Vec>,
  ignoreIds: Set<string>,
): number => {
  const minDist = bondLen * 0.55;
  // Dense polycyclics (paclitaxel-scale): fewer candidates — full 25×|pos|
  // scans were O(V⁴) and made SMILES paste hang for seconds.
  const steps = pos.size > 40 ? 6 : 12;
  const step = Math.PI / steps;
  const candidates = [preferred];
  for (let i = 1; i <= steps; i++) {
    candidates.push(preferred + i * step, preferred - i * step);
  }
  for (const d of candidates) {
    if (conflictsWith(d, occupied)) continue;
    const p = vecAt(from, d, bondLen);
    if (!collidesWithPlaced(p, pos, ignoreIds, minDist)) return d;
  }
  return pickFreeDirection(preferred, occupied);
};

export const centroidOf = (ids: string[], pos: Map<string, Vec>): Vec => {
  let x = 0;
  let y = 0;
  let n = 0;
  for (const id of ids) {
    const p = pos.get(id);
    if (!p) continue;
    x += p.x;
    y += p.y;
    n++;
  }
  return n === 0 ? { x: 0, y: 0 } : { x: x / n, y: y / n };
};

/** Interior bond angle (degrees) at `center` between neighbors `aId` and `bId`. */
export const bondAngleDegAt = (
  pos: Map<string, Vec>,
  centerId: string,
  aId: string,
  bId: string,
): number => {
  const c = pos.get(centerId);
  const a = pos.get(aId);
  const b = pos.get(bId);
  if (!c || !a || !b) return 0;
  const da = Math.atan2(a.y - c.y, a.x - c.x);
  const db = Math.atan2(b.y - c.y, b.x - c.x);
  let diff = Math.abs(da - db);
  if (diff > Math.PI) diff = 2 * Math.PI - diff;
  return (diff * 180) / Math.PI;
};

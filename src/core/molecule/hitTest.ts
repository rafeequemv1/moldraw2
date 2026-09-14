import type { Atom, Bond, Molecule, Stroke } from '@moldraw/domain';

const STROKE_HIT_BASE = 10;

/** Distance from point (px,py) to segment (x1,y1)-(x2,y2). */
export const pointSegDist = (
  px: number, py: number,
  x1: number, y1: number,
  x2: number, y2: number,
): number => {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-12) return Math.hypot(px - x1, py - y1);
  let t = ((px - x1) * dx + (py - y1) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const qx = x1 + t * dx;
  const qy = y1 + t * dy;
  return Math.hypot(px - qx, py - qy);
};

/** Closest bond within `tol` world-pixels of (wx,wy), or null. */
export const pickBondAtPoint = (
  mol: Molecule, wx: number, wy: number, tol = 11,
): Bond | null => {
  let best: { bond: Bond; d: number } | null = null;
  for (const b of mol.bonds) {
    const a1 = mol.atoms.find(a => a.id === b.fromAtomId);
    const a2 = mol.atoms.find(a => a.id === b.toAtomId);
    if (!a1 || !a2) continue;
    const d = pointSegDist(wx, wy, a1.x, a1.y, a2.x, a2.y);
    if (d > tol) continue;
    if (!best || d < best.d) best = { bond: b, d };
  }
  return best?.bond ?? null;
};

/** Closest atom within `tol` world-pixels of (wx,wy), or null. */
export const pickAtomAtPoint = (
  mol: Molecule, wx: number, wy: number, tol = 13,
): Atom | null => {
  let best: { atom: Atom; d: number } | null = null;
  for (const a of mol.atoms) {
    const d = Math.hypot(wx - a.x, wy - a.y);
    if (d > tol) continue;
    if (!best || d < best.d) best = { atom: a, d };
  }
  return best?.atom ?? null;
};

/** Topmost stroke whose polyline is near (wx, wy), matching erase-tool tolerance. */
export const pickStrokeAtPoint = (mol: Molecule, wx: number, wy: number): Stroke | null => {
  let best: { stroke: Stroke; d: number } | null = null;
  for (const s of mol.strokes ?? []) {
    if (s.points.length < 2) continue;
    const tol = STROKE_HIT_BASE + s.thickness * 0.4;
    for (let i = 0; i < s.points.length - 1; i++) {
      const p0 = s.points[i];
      const p1 = s.points[i + 1];
      const d = pointSegDist(wx, wy, p0.x, p0.y, p1.x, p1.y);
      if (d >= tol) continue;
      if (!best || d < best.d) best = { stroke: s, d };
    }
  }
  return best?.stroke ?? null;
};

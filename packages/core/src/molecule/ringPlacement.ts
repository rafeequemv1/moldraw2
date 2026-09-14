/**
 * Pure geometry for placing rings / chains / free atoms without a pointer —
 * used by the AI façade tools (`draw.ring`, `draw.atom`, `draw.chain`).
 * Mirrors the canvas ring tool: attach via a single bond along the ray that
 * points away from the root atom's existing neighbours; fuse across a bond on
 * the side away from the existing ring mass.
 */
import type { Molecule } from '@moldraw/domain';

export interface Pt {
  x: number;
  y: number;
}

export interface RingPlacement {
  center: Pt;
  angleOffset: number;
  angleStep?: number;
  radius: number;
}

export const regularRingRadius = (numSides: number, bondLengthPx: number): number =>
  bondLengthPx / (2 * Math.sin(Math.PI / numSides));

/** Unit direction pointing away from an atom's neighbours (or `-y` / up when it has none). */
export const openDirection = (mol: Molecule, atomId: string, snapRad = Math.PI / 6): number => {
  const atom = mol.atoms.find(a => a.id === atomId);
  if (!atom) return -Math.PI / 2;
  let sx = 0;
  let sy = 0;
  let n = 0;
  for (const b of mol.bonds) {
    if (b.fromAtomId !== atomId && b.toAtomId !== atomId) continue;
    const otherId = b.fromAtomId === atomId ? b.toAtomId : b.fromAtomId;
    const other = mol.atoms.find(a => a.id === otherId);
    if (!other) continue;
    const dx = other.x - atom.x;
    const dy = other.y - atom.y;
    const l = Math.hypot(dx, dy) || 1;
    sx += dx / l;
    sy += dy / l;
    n += 1;
  }
  let angle: number;
  if (n === 0) angle = -Math.PI / 2;
  else if (Math.hypot(sx, sy) > 1e-3) angle = Math.atan2(-sy, -sx);
  else {
    // Symmetric neighbours (e.g. linear): go perpendicular to the first bond.
    const b = mol.bonds.find(x => x.fromAtomId === atomId || x.toAtomId === atomId)!;
    const otherId = b.fromAtomId === atomId ? b.toAtomId : b.fromAtomId;
    const other = mol.atoms.find(a => a.id === otherId)!;
    angle = Math.atan2(other.y - atom.y, other.x - atom.x) + Math.PI / 2;
  }
  return snapRad > 1e-9 ? Math.round(angle / snapRad) * snapRad : angle;
};

/** Ring attached to `rootAtomId` through one new single bond. */
export const ringPlacementForAttach = (
  mol: Molecule,
  rootAtomId: string,
  numSides: number,
  bondLengthPx: number,
): RingPlacement | null => {
  const root = mol.atoms.find(a => a.id === rootAtomId);
  if (!root) return null;
  const angle = openDirection(mol, rootAtomId);
  const radius = regularRingRadius(numSides, bondLengthPx);
  const endX = root.x + Math.cos(angle) * bondLengthPx;
  const endY = root.y + Math.sin(angle) * bondLengthPx;
  return {
    center: { x: endX + radius * Math.cos(angle), y: endY + radius * Math.sin(angle) },
    angleOffset: angle + Math.PI,
    radius,
  };
};

/** Ring fused across `bondId`, grown away from the existing ring/fragment mass. */
export const ringPlacementForFusion = (
  mol: Molecule,
  bondId: string,
  numSides: number,
): RingPlacement | null => {
  const bond = mol.bonds.find(b => b.id === bondId);
  if (!bond) return null;
  const a1 = mol.atoms.find(a => a.id === bond.fromAtomId);
  const a2 = mol.atoms.find(a => a.id === bond.toAtomId);
  if (!a1 || !a2) return null;
  const dx = a2.x - a1.x;
  const dy = a2.y - a1.y;
  const L = Math.hypot(dx, dy);
  if (L < 1e-6) return null;
  const mx = (a1.x + a2.x) / 2;
  const my = (a1.y + a2.y) / 2;
  let px = -dy / L;
  let py = dx / L;
  // "Toward" = away from the centroid of the atoms bonded to a1/a2 (the existing ring side).
  let cx = 0;
  let cy = 0;
  let n = 0;
  for (const b of mol.bonds) {
    if (b.id === bondId) continue;
    const touches = [b.fromAtomId, b.toAtomId].filter(id => id === a1.id || id === a2.id);
    if (!touches.length) continue;
    const otherId = b.fromAtomId === a1.id || b.fromAtomId === a2.id ? b.toAtomId : b.fromAtomId;
    const other = mol.atoms.find(a => a.id === otherId);
    if (!other) continue;
    cx += other.x;
    cy += other.y;
    n += 1;
  }
  if (n > 0) {
    cx /= n;
    cy /= n;
    if ((cx - mx) * px + (cy - my) * py > 0) {
      px = -px;
      py = -py;
    }
  }
  const apothem = L / 2 / Math.tan(Math.PI / numSides);
  const center = { x: mx + px * apothem, y: my + py * apothem };
  const radius = L / (2 * Math.sin(Math.PI / numSides));
  const angleOffset = Math.atan2(a1.y - center.y, a1.x - center.x);
  let angleStep = (Math.PI * 2) / numSides;
  const ex = center.x + radius * Math.cos(angleOffset + angleStep);
  const ey = center.y + radius * Math.sin(angleOffset + angleStep);
  if (Math.hypot(ex - a2.x, ey - a2.y) > 1) angleStep = -angleStep;
  return { center, angleOffset, angleStep, radius };
};

/** Bounding box of all atoms (and annotations' anchor points), or null when empty. */
export const contentBounds = (
  mol: Molecule,
): { minX: number; minY: number; maxX: number; maxY: number } | null => {
  const pts: Pt[] = [...mol.atoms];
  for (const t of mol.canvasTexts ?? []) pts.push(t);
  for (const a of mol.reactionArrows ?? []) pts.push({ x: a.x1, y: a.y1 }, { x: a.x2, y: a.y2 });
  if (!pts.length) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of pts) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
};

/** A free spot to the right of the current content (vertically centred), or the origin. */
export const nextFreePoint = (mol: Molecule, bondLengthPx: number, halfWidth = 0): Pt => {
  const b = contentBounds(mol);
  if (!b) return { x: 0, y: 0 };
  return { x: b.maxX + bondLengthPx * 2.5 + halfWidth, y: (b.minY + b.maxY) / 2 };
};

/** Zig-zag chain points starting at `start`, heading `angle`, with 120° alternation. */
export const zigzagChainPoints = (
  start: Pt,
  count: number,
  bondLengthPx: number,
  angle: number,
): Pt[] => {
  const pts: Pt[] = [start];
  let cur = start;
  for (let i = 0; i < count; i++) {
    const a = angle + (i % 2 === 0 ? -Math.PI / 6 : Math.PI / 6);
    cur = { x: cur.x + Math.cos(a) * bondLengthPx, y: cur.y + Math.sin(a) * bondLengthPx };
    pts.push(cur);
  }
  return pts;
};

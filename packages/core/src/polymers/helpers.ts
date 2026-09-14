/**
 * Shared geometry helpers for polymer SRU presets.
 */
import type { Atom, Bond } from '@moldraw/domain';
import { addAtom, addBond, addKekuleBenzene } from '../cofs/rings';

export { addAtom, addBond, addKekuleBenzene };

export type Pt = { x: number; y: number };

/** Place a chain of heavy atoms along +x from `start`. Returns atom ids in order. */
export function addChainAlongX(
  atoms: Atom[],
  bonds: Bond[],
  start: Pt,
  elements: readonly string[],
  spacing: number,
  extras?: Partial<Pick<Atom, 'color' | 'showElementLabel'>>,
): string[] {
  const ids: string[] = [];
  for (let i = 0; i < elements.length; i++) {
    const a = addAtom(atoms, elements[i]!, start.x + i * spacing, start.y, extras);
    ids.push(a.id);
    if (i > 0) addBond(bonds, ids[i - 1]!, ids[i]!);
  }
  return ids;
}

/** Pendant atom off `parentId` at polar offset (angle radians, length). */
export function addPendant(
  atoms: Atom[],
  bonds: Bond[],
  parent: Atom,
  element: string,
  angle: number,
  length: number,
  bondExtras?: Parameters<typeof addBond>[3],
): Atom {
  const child = addAtom(
    atoms,
    element,
    parent.x + length * Math.cos(angle),
    parent.y + length * Math.sin(angle),
  );
  addBond(bonds, parent.id, child.id, bondExtras);
  return child;
}

/** Phenyl ring fused as a pendant: bond from parent to ring C0; ring C0–C3 axis along `armAngle`. */
export function addPhenylPendant(
  atoms: Atom[],
  bonds: Bond[],
  parent: Atom,
  armAngle: number,
  radius: number,
): string[] {
  const cx = parent.x + 2 * radius * Math.cos(armAngle);
  const cy = parent.y + 2 * radius * Math.sin(armAngle);
  const ipsoAng = Math.atan2(parent.y - cy, parent.x - cx);
  const ring = addKekuleBenzene(atoms, bonds, cx, cy, radius, ipsoAng);
  addBond(bonds, parent.id, ring[0]!);
  return ring;
}

/** Thiophene (Kekulé) oriented with S at the top; returns [S, C2, C3, C4, C5]. */
export function addThiophene(
  atoms: Atom[],
  bonds: Bond[],
  cx: number,
  cy: number,
  a: number,
): string[] {
  // Approximate regular-ish pentagon: S on +y, C2/C5 on the polymer axis (±x).
  const pts = [
    { el: 'S', x: cx, y: cy - a * 0.95 }, // S
    { el: 'C', x: cx + a * 0.95, y: cy - a * 0.2 }, // C2
    { el: 'C', x: cx + a * 0.6, y: cy + a * 0.85 }, // C3
    { el: 'C', x: cx - a * 0.6, y: cy + a * 0.85 }, // C4
    { el: 'C', x: cx - a * 0.95, y: cy - a * 0.2 }, // C5
  ] as const;
  const ids = pts.map(p => addAtom(atoms, p.el, p.x, p.y).id);
  // Bonds: S–C2, C2=C3, C3–C4, C4=C5, C5–S
  addBond(bonds, ids[0]!, ids[1]!);
  addBond(bonds, ids[1]!, ids[2]!, { order: 2 });
  addBond(bonds, ids[2]!, ids[3]!);
  addBond(bonds, ids[3]!, ids[4]!, { order: 2 });
  addBond(bonds, ids[4]!, ids[0]!);
  return ids;
}

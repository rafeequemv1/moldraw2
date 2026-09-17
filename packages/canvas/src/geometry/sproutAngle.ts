/**
 * Direction for a bond / ring sprouted from an atom by a plain click (no
 * drag). Mirrors what ChemDraw / Ketcher do:
 *   - lone atom → to the right,
 *   - one neighbour → 120° off the existing bond, continuing the zig-zag,
 *   - two or more → bisector of the largest free angular gap.
 */
import type { Atom, Molecule } from '@moldraw/domain';

const TWO_PI = Math.PI * 2;
const norm = (a: number): number => ((a % TWO_PI) + TWO_PI) % TWO_PI;

const neighborDirs = (
  atom: Pick<Atom, 'id' | 'x' | 'y'>,
  molecule: Pick<Molecule, 'atoms' | 'bonds'>,
): number[] => {
  const byId = new Map(molecule.atoms.map(a => [a.id, a]));
  const dirs: number[] = [];
  for (const b of molecule.bonds) {
    const otherId =
      b.fromAtomId === atom.id ? b.toAtomId : b.toAtomId === atom.id ? b.fromAtomId : null;
    if (!otherId) continue;
    const o = byId.get(otherId);
    if (!o) continue;
    const dx = o.x - atom.x;
    const dy = o.y - atom.y;
    if (Math.hypot(dx, dy) < 1e-6) continue;
    dirs.push(norm(Math.atan2(dy, dx)));
  }
  return dirs;
};

/** Bisector of the largest angular gap between existing neighbour directions. */
const largestGapBisector = (dirs: number[]): number => {
  const sorted = dirs.slice().sort((p, q) => p - q);
  let bestGap = -1;
  let bestStart = 0;
  for (let i = 0; i < sorted.length; i++) {
    const start = sorted[i]!;
    const end = i + 1 < sorted.length ? sorted[i + 1]! : sorted[0]! + TWO_PI;
    const gap = end - start;
    if (gap > bestGap) {
      bestGap = gap;
      bestStart = start;
    }
  }
  return bestStart + bestGap / 2;
};

export const bestSproutAngle = (
  atom: Pick<Atom, 'id' | 'x' | 'y'>,
  molecule: Pick<Molecule, 'atoms' | 'bonds'>,
  snapRad = 0,
): number => {
  const dirs = neighborDirs(atom, molecule);

  let angle: number;
  if (dirs.length === 0) {
    angle = 0;
  } else if (dirs.length === 1) {
    const a = dirs[0]!;
    const away = a + Math.PI;
    const c1 = a + (2 * Math.PI) / 3;
    const c2 = a - (2 * Math.PI) / 3;
    const horiz = Math.cos(away);
    // Keep the chain marching the way it already goes; for a vertical bond
    // prefer the candidate that points up the screen.
    const score = (c: number): number =>
      Math.abs(horiz) > 0.1 ? Math.cos(c) * Math.sign(horiz) : -Math.sin(c);
    const s1 = score(c1);
    const s2 = score(c2);
    // Tie (horizontal bond): grow upward first, like ChemDraw.
    angle = Math.abs(s1 - s2) < 1e-6 ? (Math.sin(c1) <= Math.sin(c2) ? c1 : c2) : s1 > s2 ? c1 : c2;
  } else {
    angle = largestGapBisector(dirs);
  }

  if (snapRad > 1e-9) {
    const snapped = Math.round(angle / snapRad) * snapRad;
    // Only accept the snapped direction when it does not collide with an
    // existing bond (can happen for crowded atoms with odd bond angles).
    const collides = dirs.some(d => {
      const diff = Math.abs(norm(d - snapped));
      return Math.min(diff, TWO_PI - diff) < snapRad / 2;
    });
    if (!collides) angle = snapped;
  }
  return norm(angle);
};

/**
 * Grow direction (atom → new ring centre) when a ring tool click shares the
 * atom as a polygon vertex (no extra linker).
 *
 * `bestSproutAngle` is for growing a *new bond* (120° zig-zag). Using it as
 * the ring’s grow direction leaves an existing substituent off a hexagon
 * radius — a bond stabbing a tilted corner. For vertex-fuse:
 *
 *   - 0 neighbours: same default as a lone-atom sprout (to the right).
 *   - 1 neighbour: opposite that neighbour so neighbour → atom → centre is
 *     collinear. The substituent lies on a radius; the two new ring edges
 *     are symmetric about that axis (120°/120°/120° on benzene).
 *   - 2+ neighbours: bisector of the largest free angular gap (ring body in
 *     the open space, shared vertex toward the crowding).
 *
 * Not snapped: collinearity with an existing bond must stay exact.
 */
export const bestRingAttachGrowAngle = (
  atom: Pick<Atom, 'id' | 'x' | 'y'>,
  molecule: Pick<Molecule, 'atoms' | 'bonds'>,
): number => {
  const dirs = neighborDirs(atom, molecule);
  if (dirs.length === 0) return 0;
  if (dirs.length === 1) return norm(dirs[0]! + Math.PI);
  return norm(largestGapBisector(dirs));
};

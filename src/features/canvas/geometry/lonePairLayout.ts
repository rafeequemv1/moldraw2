/**
 * Lone-pair placement around the bonding atom (ChemDraw-style).
 *
 * For "OH" / "NH₂" labels: pairs sit above and below the head atom (O/N),
 * never along the H-tail. Bond-only atoms use angular-gap placement.
 */
import type { Atom, Molecule } from '@moldraw/domain';
import { shortestAngleDiff } from './angles';
import type { Point } from './polygons';

/** Distance from atom center to lone-pair midpoint (world px). */
export const LONE_PAIR_DIST_PX = 13;
/** Half-separation of the two dots in a pair. */
export const LONE_PAIR_DOT_SEP_PX = 3;
export const LONE_PAIR_DOT_R_PX = 1.8;

/** Axis-aligned keep-out around the bonding atom glyph (upright local space). */
export type LabelBoxLocal = {
  left: number;
  right: number;
  top: number;
  bottom: number;
};

export type LonePairPlacement = {
  dir: Point;
  dist: number;
};

/** Local upright → pre-transform draw direction (applyLabelUpright then yields upright). */
const localDirToWorld = (
  lx: number,
  ly: number,
  labelCounterRad: number,
): Point => {
  const c = Math.cos(labelCounterRad);
  const s = Math.sin(labelCounterRad);
  // R(+θ) * local; canvas applies R(-θ) so the on-screen offset stays upright.
  return { x: lx * c - ly * s, y: lx * s + ly * c };
};

const normalize = (p: Point): Point => {
  const len = Math.hypot(p.x, p.y) || 1;
  return { x: p.x / len, y: p.y / len };
};

const minBondClearance = (angle: number, neighborAngles: number[]): number => {
  if (neighborAngles.length === 0) return Math.PI;
  let best = Infinity;
  for (const na of neighborAngles) {
    best = Math.min(best, Math.abs(shortestAngleDiff(angle, na)));
  }
  return best;
};

const placementFromLocal = (
  local: Point,
  labelCounterRad: number,
  dist: number,
): LonePairPlacement => {
  const w = normalize(localDirToWorld(local.x, local.y, labelCounterRad));
  return { dir: w, dist };
};

/**
 * With a label tail (H in OH): put lone pairs on the perpendiculars to that
 * tail — for OH that is above and below O in upright label space.
 */
const placementsPerpendicularToTail = (
  count: number,
  tailLocal: Point,
  neighborAngles: number[],
  labelCounterRad: number,
  pairDist: number,
): LonePairPlacement[] => {
  const t = normalize(tailLocal);
  // Two sides perpendicular to the H-arm (local upright).
  const perpA = { x: -t.y, y: t.x }; // for +X tail → +Y (down in canvas y+)
  const perpB = { x: t.y, y: -t.x }; // → -Y (up)

  const scoreSide = (local: Point): number => {
    const w = normalize(localDirToWorld(local.x, local.y, labelCounterRad));
    const ang = Math.atan2(w.y, w.x);
    return minBondClearance(ang, neighborAngles);
  };

  // Prefer the perpendicular that clears bonds best first, then the opposite.
  const sides =
    scoreSide(perpA) >= scoreSide(perpB) ? [perpA, perpB] : [perpB, perpA];

  const out: LonePairPlacement[] = [];
  for (let i = 0; i < count; i++) {
    if (i < 2) {
      out.push(placementFromLocal(sides[i], labelCounterRad, pairDist));
      continue;
    }
    // Extra pairs: fan slightly around the same upright axis.
    const base = sides[i % 2];
    const spread = (Math.floor(i / 2) + 1) * 0.35 * (i % 2 === 0 ? 1 : -1);
    const c = Math.cos(spread);
    const s = Math.sin(spread);
    out.push(
      placementFromLocal(
        { x: base.x * c - base.y * s, y: base.x * s + base.y * c },
        labelCounterRad,
        pairDist,
      ),
    );
  }
  return out;
};

/**
 * No label tail: place in largest bond gaps (classic stub layout).
 */
const placementsInBondGaps = (
  count: number,
  neighborAngles: number[],
  pairDist: number,
): LonePairPlacement[] => {
  if (neighborAngles.length === 0) {
    return Array.from({ length: count }, (_, i) => {
      const a = -Math.PI / 2 + (i * 2 * Math.PI) / count;
      return { dir: { x: Math.cos(a), y: Math.sin(a) }, dist: pairDist };
    });
  }

  if (neighborAngles.length === 1) {
    const back = neighborAngles[0] + Math.PI;
    if (count === 1) {
      return [{ dir: { x: Math.cos(back), y: Math.sin(back) }, dist: pairDist }];
    }
    // Fan around the back — but keep a modest spread so pairs stay near the atom.
    const spread = Math.min(0.55, (0.7 * Math.PI) / Math.max(count, 1));
    return Array.from({ length: count }, (_, i) => {
      const a = back + (i - (count - 1) / 2) * spread;
      return { dir: { x: Math.cos(a), y: Math.sin(a) }, dist: pairDist };
    });
  }

  const A = neighborAngles
    .map(a => ((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI))
    .sort((x, y) => x - y);
  type Gap = { start: number; end: number; size: number };
  const gaps: Gap[] = [];
  for (let i = 0; i < A.length; i++) {
    const start = A[i];
    const end = i + 1 < A.length ? A[i + 1] : A[0] + 2 * Math.PI;
    gaps.push({ start, end, size: end - start });
  }
  gaps.sort((g, h) => h.size - g.size);

  const out: LonePairPlacement[] = [];
  let gapIdx = 0;
  while (out.length < count) {
    const g = gaps[gapIdx % gaps.length];
    const nInGap = Math.ceil((count - out.length) / (gaps.length - (gapIdx % gaps.length)));
    const margin = Math.min(g.size * 0.15, 0.4);
    const usable = Math.max(g.size - 2 * margin, g.size * 0.5);
    for (let i = 0; i < nInGap && out.length < count; i++) {
      const t =
        nInGap === 1
          ? g.start + margin + usable / 2
          : g.start + margin + (usable * (i + 1)) / (nInGap + 1);
      out.push({ dir: { x: Math.cos(t), y: Math.sin(t) }, dist: pairDist });
    }
    gapIdx++;
    if (gapIdx > 8) break;
  }
  return out;
};

/**
 * Place `count` lone pairs around `atom`, anchored to the atom center.
 */
export const getLonePairPlacements = (
  atom: Atom,
  mol: Molecule,
  count: number,
  opts: {
    headBox?: LabelBoxLocal | null;
    /** Unit direction of label extension in upright local space (e.g. {1,0} for OH). */
    labelTailLocal?: Point | null;
    labelCounterRad?: number;
    pairDist?: number;
  } = {},
): LonePairPlacement[] => {
  if (count <= 0) return [];

  const pairDist = opts.pairDist ?? LONE_PAIR_DIST_PX;
  const labelCounterRad = opts.labelCounterRad ?? 0;

  const neighborAngles: number[] = [];
  let heavyNeighborCount = 0;
  for (const b of mol.bonds) {
    if (b.fromAtomId !== atom.id && b.toAtomId !== atom.id) continue;
    const nid = b.fromAtomId === atom.id ? b.toAtomId : b.fromAtomId;
    const n = mol.atoms.find(a => a.id === nid);
    if (!n) continue;
    neighborAngles.push(Math.atan2(n.y - atom.y, n.x - atom.x));
    if (n.element !== 'H') heavyNeighborCount++;
  }

  // Explicit tail (OH / NH₂ / alias): above & below the head atom.
  if (opts.labelTailLocal && Math.hypot(opts.labelTailLocal.x, opts.labelTailLocal.y) > 1e-6) {
    return placementsPerpendicularToTail(
      count,
      opts.labelTailLocal,
      neighborAngles,
      labelCounterRad,
      pairDist,
    );
  }

  // Terminal heteroatom (–OH / –NH style): always upright above/below, even if
  // the label-tail hint was missing — never park pairs opposite the bond on H.
  const terminalHetero =
    heavyNeighborCount === 1 &&
    (atom.element === 'O' ||
      atom.element === 'N' ||
      atom.element === 'S' ||
      atom.element === 'F' ||
      atom.element === 'Cl' ||
      atom.element === 'Br' ||
      atom.element === 'I');
  if (terminalHetero) {
    return placementsPerpendicularToTail(
      count,
      { x: 1, y: 0 },
      neighborAngles,
      labelCounterRad,
      pairDist,
    );
  }

  return placementsInBondGaps(count, neighborAngles, pairDist);
};

export const labelBoxFromExtents = (
  left: number,
  right: number,
  height: number,
): LabelBoxLocal => ({
  left,
  right,
  top: -height / 2,
  bottom: height / 2,
});

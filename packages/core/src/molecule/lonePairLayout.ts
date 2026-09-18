/**
 * Lone-pair placement around the bonding atom (ChemDraw-style).
 * Shared by canvas drawing and electron-flow arrow anchor resolve.
 */
import type { Atom, Molecule } from '@moldraw/domain';

export type Point2 = { x: number; y: number };

/** Distance from atom center to lone-pair midpoint (world px). */
export const LONE_PAIR_DIST_PX = 13;
/** Half-separation of the two dots in a pair. */
export const LONE_PAIR_DOT_SEP_PX = 3.6;
export const LONE_PAIR_DOT_R_PX = 2.45;
/** Radial gap from glyph AABB to nearest dot (keep-out, not overlap). */
const LONE_PAIR_RADIAL_PAD_PX = LONE_PAIR_DOT_R_PX + 1;
/** Lateral keep-out: two dots sit `sep` off the radial axis. */
const LONE_PAIR_LATERAL_PAD_PX = LONE_PAIR_DOT_SEP_PX + LONE_PAIR_DOT_R_PX;
/** Free-radical single dot: farther above the atom than lone pairs. */
export const RADICAL_DIST_PX = 23;
export const RADICAL_DOT_R_PX = 2.75;

/** Axis-aligned keep-out around the bonding atom glyph (upright local space). */
export type LabelBoxLocal = {
  left: number;
  right: number;
  top: number;
  bottom: number;
};

export type LonePairPlacement = {
  dir: Point2;
  dist: number;
};

export type LonePairPreferSide = 'above' | 'below';

const shortestAngleDiff = (from: number, to: number): number => {
  let d = to - from;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return d;
};

/** Local upright → pre-transform draw direction (applyLabelUpright then yields upright). */
const localDirToWorld = (lx: number, ly: number, labelCounterRad: number): Point2 => {
  const c = Math.cos(labelCounterRad);
  const s = Math.sin(labelCounterRad);
  return { x: lx * c - ly * s, y: lx * s + ly * c };
};

const normalize = (p: Point2): Point2 => {
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
  local: Point2,
  labelCounterRad: number,
  dist: number,
): LonePairPlacement => {
  const w = normalize(localDirToWorld(local.x, local.y, labelCounterRad));
  return { dir: w, dist };
};

/**
 * Preferred formal-charge seat angle (world radians) on the free side of the atom.
 * Used to reserve one angular slot before packing lone pairs on charged heteroatoms.
 */
export const defaultChargeSeatAngle = (atom: Atom, mol: Molecule): number => {
  let nx = 0;
  let ny = 0;
  let n = 0;
  for (const b of mol.bonds) {
    if (b.fromAtomId !== atom.id && b.toAtomId !== atom.id) continue;
    const oid = b.fromAtomId === atom.id ? b.toAtomId : b.fromAtomId;
    const other = mol.atoms.find(a => a.id === oid);
    if (!other) continue;
    nx += other.x - atom.x;
    ny += other.y - atom.y;
    n++;
  }
  if (n === 0) {
    // Unbonded HO⁻ style: charge above-left of the glyph.
    return (-Math.PI * 2) / 3;
  }
  // Opposite the mean neighbor direction, with a slight upward bias.
  const back = Math.atan2(-ny, -nx);
  const upBias = -0.35;
  return back + upBias;
};

/** Unit direction for the default charge mark (matches canvas seating intent). */
export const defaultChargeSeatDirection = (atom: Atom, mol: Molecule): Point2 => {
  const a = defaultChargeSeatAngle(atom, mol);
  return { x: Math.cos(a), y: Math.sin(a) };
};

const pairHitsHeadBox = (
  dir: Point2,
  dist: number,
  headBox: LabelBoxLocal,
  labelCounterRad: number,
): boolean => {
  // Transform world dir into upright local (inverse of localDirToWorld).
  const c = Math.cos(-labelCounterRad);
  const s = Math.sin(-labelCounterRad);
  const lx = dir.x * c - dir.y * s;
  const ly = dir.x * s + dir.y * c;
  const mx = lx * dist;
  const my = ly * dist;
  // Radial vs lateral: dots are offset perpendicular to `dir`, so only the
  // radial pad must clear the letter. Using sep on both axes used to shove
  // pairs ~font-height away from the glyph.
  const padX = Math.abs(lx) * LONE_PAIR_RADIAL_PAD_PX + Math.abs(ly) * LONE_PAIR_LATERAL_PAD_PX;
  const padY = Math.abs(ly) * LONE_PAIR_RADIAL_PAD_PX + Math.abs(lx) * LONE_PAIR_LATERAL_PAD_PX;
  return (
    mx + padX >= headBox.left &&
    mx - padX <= headBox.right &&
    my + padY >= headBox.top &&
    my - padY <= headBox.bottom
  );
};

/** Push placements so lone-pair dots clear the atom glyph AABB. */
const clearHeadBox = (
  placements: LonePairPlacement[],
  headBox: LabelBoxLocal | null | undefined,
  labelCounterRad: number,
): LonePairPlacement[] => {
  if (!headBox) return placements;
  return placements.map(p => {
    let dist = p.dist;
    let ang = Math.atan2(p.dir.y, p.dir.x);
    for (let attempt = 0; attempt < 14; attempt++) {
      const dir = { x: Math.cos(ang), y: Math.sin(ang) };
      if (!pairHitsHeadBox(dir, dist, headBox, labelCounterRad)) {
        return { dir, dist };
      }
      if (attempt < 5) dist += 1.6;
      else ang += attempt % 2 === 0 ? 0.42 : -0.42;
    }
    return { dir: { x: Math.cos(ang), y: Math.sin(ang) }, dist };
  });
};

/** Drop / rotate candidates that sit too close to a reserved charge seat. */
const avoidReservedAngle = (
  placements: LonePairPlacement[],
  reserved: number | null,
  minSep = 0.55,
): LonePairPlacement[] => {
  if (reserved == null) return placements;
  return placements.map(p => {
    const ang = Math.atan2(p.dir.y, p.dir.x);
    const diff = shortestAngleDiff(ang, reserved);
    if (Math.abs(diff) >= minSep) return p;
    const flip = diff >= 0 ? reserved + minSep : reserved - minSep;
    return { dir: { x: Math.cos(flip), y: Math.sin(flip) }, dist: p.dist };
  });
};

const placementsPerpendicularToTail = (
  count: number,
  tailLocal: Point2,
  neighborAngles: number[],
  labelCounterRad: number,
  pairDist: number,
  preferSide: LonePairPreferSide = 'above',
): LonePairPlacement[] => {
  const t = normalize(tailLocal);
  const perpA = { x: -t.y, y: t.x };
  const perpB = { x: t.y, y: -t.x };

  const worldY = (local: Point2): number => {
    const w = normalize(localDirToWorld(local.x, local.y, labelCounterRad));
    return w.y;
  };
  const clearance = (local: Point2): number => {
    const w = normalize(localDirToWorld(local.x, local.y, labelCounterRad));
    return minBondClearance(Math.atan2(w.y, w.x), neighborAngles);
  };

  const aIsAbove = worldY(perpA) <= worldY(perpB);
  const aboveLocal = aIsAbove ? perpA : perpB;
  const belowLocal = aIsAbove ? perpB : perpA;
  const preferred = preferSide === 'below' ? belowLocal : aboveLocal;
  const other = preferSide === 'below' ? aboveLocal : belowLocal;
  const minClear = 0.4;
  const sides =
    clearance(preferred) >= minClear || clearance(preferred) >= clearance(other)
      ? [preferred, other]
      : [other, preferred];

  const out: LonePairPlacement[] = [];
  for (let i = 0; i < count; i++) {
    if (i < 2) {
      out.push(placementFromLocal(sides[i]!, labelCounterRad, pairDist));
      continue;
    }
    const base = sides[i % 2]!;
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

const placementsInBondGaps = (
  count: number,
  neighborAngles: number[],
  pairDist: number,
  preferSide: LonePairPreferSide = 'above',
  reservedAngle: number | null = null,
): LonePairPlacement[] => {
  if (neighborAngles.length === 0) {
    const start = preferSide === 'below' ? Math.PI / 2 : -Math.PI / 2;
    return Array.from({ length: count }, (_, i) => {
      let a = start + (i * 2 * Math.PI) / Math.max(count, 1);
      if (reservedAngle != null && Math.abs(shortestAngleDiff(a, reservedAngle)) < 0.5) {
        a += 0.7;
      }
      return { dir: { x: Math.cos(a), y: Math.sin(a) }, dist: pairDist };
    });
  }

  if (neighborAngles.length === 1) {
    const back = neighborAngles[0]! + Math.PI;
    const up = preferSide === 'below' ? Math.PI / 2 : -Math.PI / 2;
    const clearUp = minBondClearance(up, neighborAngles);
    let primary = clearUp >= 0.45 ? up : back;
    if (reservedAngle != null && Math.abs(shortestAngleDiff(primary, reservedAngle)) < 0.5) {
      primary = primary + Math.PI * 0.55;
    }
    if (count === 1) {
      return [{ dir: { x: Math.cos(primary), y: Math.sin(primary) }, dist: pairDist }];
    }
    const axis = primary;
    const spread = Math.min(0.55, (0.7 * Math.PI) / Math.max(count, 1));
    return Array.from({ length: count }, (_, i) => {
      const a = axis + (i - (count - 1) / 2) * spread;
      return { dir: { x: Math.cos(a), y: Math.sin(a) }, dist: pairDist };
    });
  }

  const A = neighborAngles
    .map(a => ((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI))
    .sort((x, y) => x - y);
  type Gap = { start: number; end: number; size: number };
  const gaps: Gap[] = [];
  for (let i = 0; i < A.length; i++) {
    const start = A[i]!;
    const end = i + 1 < A.length ? A[i + 1]! : A[0]! + 2 * Math.PI;
    gaps.push({ start, end, size: end - start });
  }
  gaps.sort((g, h) => h.size - g.size);

  const out: LonePairPlacement[] = [];
  let gapIdx = 0;
  while (out.length < count) {
    const g = gaps[gapIdx % gaps.length]!;
    const nInGap = Math.ceil((count - out.length) / (gaps.length - (gapIdx % gaps.length)));
    const margin = Math.min(g.size * 0.15, 0.4);
    const usable = Math.max(g.size - 2 * margin, g.size * 0.5);
    for (let i = 0; i < nInGap && out.length < count; i++) {
      let t =
        nInGap === 1
          ? g.start + margin + usable / 2
          : g.start + margin + (usable * (i + 1)) / (nInGap + 1);
      if (reservedAngle != null && Math.abs(shortestAngleDiff(t, reservedAngle)) < 0.45) {
        t += 0.55;
      }
      out.push({ dir: { x: Math.cos(t), y: Math.sin(t) }, dist: pairDist });
    }
    gapIdx++;
    if (gapIdx > 8) break;
  }
  return out;
};

/**
 * Place `count` lone pairs around `atom`, anchored to the atom center.
 * Honors `headBox` (glyph keep-out) and reserves a seat for formal charge when charged.
 */
export const getLonePairPlacements = (
  atom: Atom,
  mol: Molecule,
  count: number,
  opts: {
    headBox?: LabelBoxLocal | null;
    /** Unit direction of label extension in upright local space (e.g. {1,0} for OH). */
    labelTailLocal?: Point2 | null;
    labelCounterRad?: number;
    pairDist?: number;
    preferSide?: LonePairPreferSide;
    /** When false, skip reserving the formal-charge angular seat. Default true. */
    reserveChargeSeat?: boolean;
  } = {},
): LonePairPlacement[] => {
  if (count <= 0) return [];

  const pairDist = opts.pairDist ?? LONE_PAIR_DIST_PX;
  const labelCounterRad = opts.labelCounterRad ?? 0;
  const preferSide = opts.preferSide ?? atom.lonePairSide ?? 'above';
  const reserveCharge =
    opts.reserveChargeSeat !== false && (atom.charge ?? 0) !== 0;
  const reservedAngle = reserveCharge ? defaultChargeSeatAngle(atom, mol) : null;
  // Callers that don't measure the glyph (electron-flow loci, arrow anchors)
  // still need a keep-out so a third pair does not sit on Cl / O / N.
  let headBox = opts.headBox;
  if (!headBox && atom.element !== 'C') {
    const w = Math.max(10, atom.element.length * 7.2);
    headBox = labelBoxFromExtents(-w / 2, w / 2, 13);
  }

  const neighborAngles: number[] = [];
  let heavyNeighborCount = 0;
  let heavySumX = 0;
  for (const b of mol.bonds) {
    if (b.fromAtomId !== atom.id && b.toAtomId !== atom.id) continue;
    const nid = b.fromAtomId === atom.id ? b.toAtomId : b.fromAtomId;
    const n = mol.atoms.find(a => a.id === nid);
    if (!n) continue;
    neighborAngles.push(Math.atan2(n.y - atom.y, n.x - atom.x));
    if (n.element !== 'H') {
      heavyNeighborCount++;
      heavySumX += n.x - atom.x;
    }
  }

  // Alias labels (HO / OH): tail away from the parent bond, matching canvas.
  let labelTailLocal = opts.labelTailLocal;
  if (
    (labelTailLocal == null || Math.hypot(labelTailLocal.x, labelTailLocal.y) < 1e-6) &&
    atom.alias?.trim()
  ) {
    labelTailLocal = heavyNeighborCount > 0 && heavySumX > 0 ? { x: -1, y: 0 } : { x: 1, y: 0 };
  }

  let placements: LonePairPlacement[];
  if (labelTailLocal && Math.hypot(labelTailLocal.x, labelTailLocal.y) > 1e-6) {
    placements = placementsPerpendicularToTail(
      count,
      labelTailLocal,
      neighborAngles,
      labelCounterRad,
      pairDist,
      preferSide,
    );
  } else if (heavyNeighborCount === 1) {
    const nAng = neighborAngles[0]!;
    const c = Math.cos(-labelCounterRad);
    const s = Math.sin(-labelCounterRad);
    const wx = Math.cos(nAng);
    const wy = Math.sin(nAng);
    const tailLocal = { x: wx * c - wy * s, y: wx * s + wy * c };
    placements = placementsPerpendicularToTail(
      count,
      tailLocal,
      neighborAngles,
      labelCounterRad,
      pairDist,
      preferSide,
    );
  } else {
    placements = placementsInBondGaps(
      count,
      neighborAngles,
      pairDist,
      preferSide,
      reservedAngle,
    );
  }

  placements = avoidReservedAngle(placements, reservedAngle);
  placements = clearHeadBox(placements, headBox, labelCounterRad);
  return placements;
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

/** World position of lone-pair slot `slot` (0-based) for arrow anchors. */
export const resolveLonePairWorldPoint = (
  mol: Molecule,
  atomId: string,
  slot = 0,
  opts?: {
    labelTailLocal?: Point2 | null;
    labelCounterRad?: number;
  },
): Point2 | null => {
  const atom = mol.atoms.find(a => a.id === atomId);
  if (!atom) return null;
  const count = Math.max(atom.lonePairs ?? 1, slot + 1, 1);
  const placements = getLonePairPlacements(atom, mol, count, {
    preferSide: atom.lonePairSide ?? 'above',
    labelTailLocal: opts?.labelTailLocal,
    labelCounterRad: opts?.labelCounterRad ?? 0,
  });
  const p = placements[Math.min(slot, placements.length - 1)];
  if (!p) return null;
  return {
    x: atom.x + p.dir.x * p.dist,
    y: atom.y + p.dir.y * p.dist,
  };
};

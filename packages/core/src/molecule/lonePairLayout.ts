/**
 * Lone-pair placement around the bonding atom (ChemDraw-style).
 * Shared by canvas drawing and electron-flow arrow anchor resolve.
 */
import type { Atom, Molecule } from '@moldraw/domain';

export type Point2 = { x: number; y: number };

/** Fallback distance from atom center when no glyph box is measured. */
export const LONE_PAIR_DIST_PX = 13;
/** Half-separation of the two dots in a pair. */
export const LONE_PAIR_DOT_SEP_PX = 3.15;
export const LONE_PAIR_DOT_R_PX = 1.85;
/** Same visual air from the letter edge to the nearest dot, in every direction. */
const LONE_PAIR_EDGE_GAP_PX = 5.5;
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

/** ~52° — upright seat must not sit on a bond, charge, or label tail. */
const CARDINAL_MIN_SEP = 0.9;
/** Pairs stay on different sides (up / down / left / right), never stacked. */
const PAIR_MIN_SEP = 1.15;
/** Bond wedges narrower than this (~123°) are not “vacant sides”. */
const CARDINAL_WEDGE_MAX = 2.15;
/** Nearby atoms (not only bonded) occupy a ray if this close. */
const NEAR_ATOM_OCCUPY_PX = 38;
/** Lone-pair midpoint must stay this far from other atom centers. */
const NEAR_ATOM_CLEAR_PX = 16;

const CARDINAL_UP = -Math.PI / 2;
const CARDINAL_DOWN = Math.PI / 2;
const CARDINAL_LEFT = Math.PI;
const CARDINAL_RIGHT = 0;

const wrap02pi = (a: number): number => {
  let x = a % (Math.PI * 2);
  if (x < 0) x += Math.PI * 2;
  return x;
};

const minClearance = (angle: number, blocked: number[]): number => {
  if (blocked.length === 0) return Math.PI;
  let best = Infinity;
  for (const b of blocked) {
    best = Math.min(best, Math.abs(shortestAngleDiff(angle, b)));
  }
  return best;
};

const uniqAngles = (angs: number[], merge = 0.14): number[] => {
  const sorted = angs.map(wrap02pi).sort((a, b) => a - b);
  const out: number[] = [];
  for (const a of sorted) {
    const nearLast = out.length > 0 && Math.abs(shortestAngleDiff(a, out[out.length - 1]!)) <= merge;
    const nearFirst = out.length > 0 && Math.abs(shortestAngleDiff(a, out[0]!)) <= merge;
    if (nearLast || nearFirst) continue;
    out.push(a);
  }
  return out;
};

type AngularGap = { start: number; end: number; size: number; mid: number };

const gapsFromBlocked = (blocked: number[]): AngularGap[] => {
  const A = uniqAngles(blocked);
  if (A.length === 0) {
    return [{ start: 0, end: Math.PI * 2, size: Math.PI * 2, mid: -Math.PI / 2 }];
  }
  const gaps: AngularGap[] = [];
  for (let i = 0; i < A.length; i++) {
    const start = A[i]!;
    const end = i + 1 < A.length ? A[i + 1]! : A[0]! + Math.PI * 2;
    const size = end - start;
    gaps.push({ start, end, size, mid: wrap02pi(start + size / 2) });
  }
  return gaps;
};

/** Center of the largest remaining gap (ties break toward preferSide). */
const pickLargestGap = (blocked: number[], preferSide: LonePairPreferSide): number => {
  const gaps = gapsFromBlocked(blocked);
  const prefer = preferSide === 'below' ? CARDINAL_DOWN : CARDINAL_UP;
  gaps.sort((g, h) => {
    if (Math.abs(h.size - g.size) > 0.08) return h.size - g.size;
    return Math.abs(shortestAngleDiff(g.mid, prefer)) - Math.abs(shortestAngleDiff(h.mid, prefer));
  });
  return gaps[0]!.mid;
};

const cardinalOrder = (preferSide: LonePairPreferSide): number[] =>
  preferSide === 'below'
    ? [CARDINAL_DOWN, CARDINAL_UP, CARDINAL_LEFT, CARDINAL_RIGHT]
    : [CARDINAL_UP, CARDINAL_DOWN, CARDINAL_LEFT, CARDINAL_RIGHT];

const angleInGap = (angle: number, g: AngularGap): boolean => {
  const a = wrap02pi(angle);
  const start = wrap02pi(g.start);
  if (g.end > Math.PI * 2 - 1e-9) return a >= start || a <= wrap02pi(g.end);
  return a >= start && a <= g.end;
};

/** Upright side is free: clear of bonds and not the bisector of a tight wedge. */
const isCardinalVacant = (angle: number, occupied: number[]): boolean => {
  if (minClearance(angle, occupied) < CARDINAL_MIN_SEP) return false;
  if (occupied.length < 2) return true;
  for (const g of gapsFromBlocked(occupied)) {
    if (!angleInGap(angle, g)) continue;
    if (g.size < CARDINAL_WEDGE_MAX && Math.abs(shortestAngleDiff(angle, g.mid)) < 0.35) {
      return false;
    }
  }
  return true;
};

/** First vacant upright seat (exact up / down / left / right), else the largest gap. */
const pickVacantCardinalOrGap = (
  occupied: number[],
  preferSide: LonePairPreferSide,
): number => {
  for (const a of cardinalOrder(preferSide)) {
    if (isCardinalVacant(a, occupied)) return a;
  }
  return pickLargestGap(occupied, preferSide);
};

/**
 * Distance from the atom center onto a circle that clears the letter in every
 * direction. Using the AABB half-extent (not the ray-to-side hit) keeps the
 * pair above `Cl` as far out as the pairs on the wide sides.
 */
export const distBeyondLabelBox = (
  _dir: Point2,
  headBox: LabelBoxLocal | null | undefined,
  _labelCounterRad = 0,
  padBeyondEdge = LONE_PAIR_EDGE_GAP_PX + LONE_PAIR_DOT_R_PX,
  _lateralSep = 0,
): number => {
  if (!headBox) return LONE_PAIR_DIST_PX;
  const half = Math.max(
    Math.abs(headBox.left),
    Math.abs(headBox.right),
    Math.abs(headBox.top),
    Math.abs(headBox.bottom),
  );
  return half + padBeyondEdge;
};

const bondAnglesOf = (atom: Atom, mol: Molecule): number[] => {
  const out: number[] = [];
  for (const b of mol.bonds) {
    if (b.fromAtomId !== atom.id && b.toAtomId !== atom.id) continue;
    const oid = b.fromAtomId === atom.id ? b.toAtomId : b.fromAtomId;
    const other = mol.atoms.find(a => a.id === oid);
    if (!other) continue;
    out.push(Math.atan2(other.y - atom.y, other.x - atom.x));
  }
  return out;
};

/**
 * Preferred formal-charge seat: first vacant upright direction (up-left, then
 * up / down / left / right), else the largest gap. Lone pairs reserve this
 * same angle so ± and dots never share a seat.
 */
export const defaultChargeSeatAngle = (atom: Atom, mol: Molecule): number => {
  const occupied = bondAnglesOf(atom, mol);
  const upLeft = (-Math.PI * 2) / 3;
  if (isCardinalVacant(upLeft, occupied)) return upLeft;
  return pickVacantCardinalOrGap(occupied, 'above');
};

/** Unit direction for the default charge mark (matches canvas seating intent). */
export const defaultChargeSeatDirection = (atom: Atom, mol: Molecule): Point2 => {
  const a = defaultChargeSeatAngle(atom, mol);
  return { x: Math.cos(a), y: Math.sin(a) };
};

/**
 * Sequential seats: exact upright sides first (up, down, left, right).
 * A side is skipped when a bond, charge, label tail, or earlier pair is there.
 * Leftover pairs take the largest remaining gap, still clear of those rays.
 */
const placeSequentialAngles = (
  count: number,
  occupied: number[],
  preferSide: LonePairPreferSide,
): number[] => {
  if (count <= 0) return [];
  const placed: number[] = [];
  const blocked = (): number[] => [...occupied, ...placed];
  for (const card of cardinalOrder(preferSide)) {
    if (placed.length >= count) break;
    if (!isCardinalVacant(card, blocked())) continue;
    if (placed.length > 0 && minClearance(card, placed) < PAIR_MIN_SEP) continue;
    placed.push(card);
  }
  let guard = 0;
  while (placed.length < count && guard++ < count + 4) {
    const ang = pickLargestGap(blocked(), preferSide);
    if (minClearance(ang, blocked()) >= 0.7) {
      placed.push(ang);
      continue;
    }
    // Still show the pair the user added — step a quarter-turn off the last seat.
    const prev = placed[placed.length - 1] ?? (preferSide === 'below' ? CARDINAL_DOWN : CARDINAL_UP);
    placed.push(wrap02pi(prev + Math.PI / 2));
  }
  return placed;
};

const nearbyAtomAngles = (atom: Atom, mol: Molecule, skip: Set<string>): number[] => {
  const out: number[] = [];
  for (const other of mol.atoms) {
    if (other.id === atom.id || skip.has(other.id)) continue;
    const dx = other.x - atom.x;
    const dy = other.y - atom.y;
    const d = Math.hypot(dx, dy);
    if (d < 1 || d > NEAR_ATOM_OCCUPY_PX) continue;
    out.push(Math.atan2(dy, dx));
  }
  return out;
};

/** If a pair's midpoint sits on another atom, push it outward. Do not change the seat. */
const nudgeOffNearbyAtoms = (
  placements: LonePairPlacement[],
  atom: Atom,
  mol: Molecule,
): LonePairPlacement[] => {
  return placements.map(p => {
    let ang = Math.atan2(p.dir.y, p.dir.x);
    let dist = p.dist;
    for (let attempt = 0; attempt < 6; attempt++) {
      const px = atom.x + Math.cos(ang) * dist;
      const py = atom.y + Math.sin(ang) * dist;
      let nearest = Infinity;
      for (const other of mol.atoms) {
        if (other.id === atom.id) continue;
        nearest = Math.min(nearest, Math.hypot(other.x - px, other.y - py));
      }
      if (nearest >= NEAR_ATOM_CLEAR_PX) break;
      dist += 3;
    }
    return { dir: { x: Math.cos(ang), y: Math.sin(ang) }, dist };
  });
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

  const locked = atom.lonePairAngles;
  if (locked && locked.length >= count) {
    const pad = LONE_PAIR_EDGE_GAP_PX + LONE_PAIR_DOT_R_PX;
    return locked.slice(0, count).map(a => {
      const dir = { x: Math.cos(a), y: Math.sin(a) };
      const dist = headBox
        ? distBeyondLabelBox(dir, headBox, labelCounterRad, pad, LONE_PAIR_DOT_SEP_PX)
        : pairDist;
      return { dir, dist };
    });
  }

  const neighborAngles: number[] = [];
  const neighborIds = new Set<string>();
  let heavyNeighborCount = 0;
  let heavySumX = 0;
  for (const b of mol.bonds) {
    if (b.fromAtomId !== atom.id && b.toAtomId !== atom.id) continue;
    const nid = b.fromAtomId === atom.id ? b.toAtomId : b.fromAtomId;
    const n = mol.atoms.find(a => a.id === nid);
    if (!n) continue;
    neighborAngles.push(Math.atan2(n.y - atom.y, n.x - atom.x));
    neighborIds.add(n.id);
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

  const occupied = [...neighborAngles, ...nearbyAtomAngles(atom, mol, neighborIds)];
  if ((atom.charge ?? 0) !== 0) {
    const off = atom.chargeOffset;
    if (off && Math.hypot(off.x, off.y) > 2) occupied.push(Math.atan2(off.y, off.x));
    else if (reservedAngle != null) occupied.push(reservedAngle);
  } else if (reservedAngle != null) {
    occupied.push(reservedAngle);
  }
  if ((atom.deltaCharge ?? 0) !== 0 && atom.deltaChargeOffset) {
    const off = atom.deltaChargeOffset;
    if (Math.hypot(off.x, off.y) > 2) occupied.push(Math.atan2(off.y, off.x));
  }
  if (labelTailLocal && Math.hypot(labelTailLocal.x, labelTailLocal.y) > 1e-6) {
    const w = normalize(localDirToWorld(labelTailLocal.x, labelTailLocal.y, labelCounterRad));
    occupied.push(Math.atan2(w.y, w.x));
  }

  const angles = placeSequentialAngles(count, occupied, preferSide);
  const pad = LONE_PAIR_EDGE_GAP_PX + LONE_PAIR_DOT_R_PX;
  let placements: LonePairPlacement[] = angles.map(a => {
    const dir = { x: Math.cos(a), y: Math.sin(a) };
    const dist = headBox
      ? distBeyondLabelBox(dir, headBox, labelCounterRad, pad, LONE_PAIR_DOT_SEP_PX)
      : pairDist;
    return { dir, dist };
  });
  placements = nudgeOffNearbyAtoms(placements, atom, mol);
  return placements;
};

/**
 * Angles for `count` pairs. Keeps any seats already locked on the atom and
 * only fills new ones, so adding a pair does not move the ones already drawn.
 */
export const lonePairAnglesOf = (atom: Atom, mol: Molecule, count: number): number[] => {
  if (count <= 0) return [];
  const stored = atom.lonePairAngles;
  if (stored && stored.length >= count) return stored.slice(0, count);
  const keep = stored ?? [];
  const fresh = getLonePairPlacements(
    { ...atom, lonePairs: count, lonePairAngles: undefined },
    mol,
    count,
  ).map(p => Math.atan2(p.dir.y, p.dir.x));
  if (keep.length === 0) return fresh;
  const out = keep.slice();
  for (const ang of fresh) {
    if (out.length >= count) break;
    if (out.every(a => Math.abs(shortestAngleDiff(a, ang)) >= 0.45)) out.push(ang);
  }
  while (out.length < count) {
    out.push(fresh[out.length] ?? fresh[fresh.length - 1] ?? CARDINAL_UP);
  }
  return out.slice(0, count);
};

/**
 * Freeze current lone-pair seats before a coordinate rebuild. Cleanup then
 * moves atoms without choosing new up/down/left/right seats from the new bonds.
 */
export const lockLonePairAngles = (mol: Molecule): Molecule => {
  let changed = false;
  const atoms = mol.atoms.map(a => {
    const n = Math.max(0, a.lonePairs ?? 0);
    if (n === 0) {
      if (!a.lonePairAngles?.length) return a;
      changed = true;
      const { lonePairAngles: _drop, ...rest } = a;
      void _drop;
      return rest;
    }
    if (a.lonePairAngles && a.lonePairAngles.length === n) return a;
    changed = true;
    return { ...a, lonePairAngles: lonePairAnglesOf(a, mol, n) };
  });
  return changed ? { ...mol, atoms } : mol;
};

/**
 * Single free-radical dot: same vacant-seat rules as lone pairs (off bonds,
 * off the H tail, off existing pairs and the charge mark).
 */
export const getRadicalPlacement = (
  atom: Atom,
  mol: Molecule,
  opts: {
    headBox?: LabelBoxLocal | null;
    labelTailLocal?: Point2 | null;
    labelCounterRad?: number;
    preferSide?: LonePairPreferSide;
  } = {},
): LonePairPlacement => {
  const lp = Math.max(0, atom.lonePairs ?? 0);
  const pairs = getLonePairPlacements(atom, mol, lp, {
    headBox: opts.headBox,
    labelTailLocal: opts.labelTailLocal,
    labelCounterRad: opts.labelCounterRad,
    preferSide: opts.preferSide ?? atom.lonePairSide ?? 'above',
  });
  const occupied: number[] = [];
  for (const b of mol.bonds) {
    if (b.fromAtomId !== atom.id && b.toAtomId !== atom.id) continue;
    const oid = b.fromAtomId === atom.id ? b.toAtomId : b.fromAtomId;
    const other = mol.atoms.find(a => a.id === oid);
    if (!other) continue;
    occupied.push(Math.atan2(other.y - atom.y, other.x - atom.x));
  }
  for (const p of pairs) occupied.push(Math.atan2(p.dir.y, p.dir.x));
  if ((atom.charge ?? 0) !== 0) occupied.push(defaultChargeSeatAngle(atom, mol));
  const tail = opts.labelTailLocal;
  if (tail && Math.hypot(tail.x, tail.y) > 1e-6) {
    const w = normalize(localDirToWorld(tail.x, tail.y, opts.labelCounterRad ?? 0));
    occupied.push(Math.atan2(w.y, w.x));
  }
  const ang = pickVacantCardinalOrGap(occupied, opts.preferSide ?? atom.lonePairSide ?? 'above');
  const dir = { x: Math.cos(ang), y: Math.sin(ang) };
  const pad = LONE_PAIR_EDGE_GAP_PX + RADICAL_DOT_R_PX + 1.2;
  const dist = opts.headBox
    ? Math.max(RADICAL_DIST_PX * 0.72, distBeyondLabelBox(dir, opts.headBox, 0, pad))
    : RADICAL_DIST_PX;
  return { dir, dist };
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

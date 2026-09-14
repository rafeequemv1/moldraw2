/**
 * Resolve chemistry anchors on reaction arrows to world coordinates.
 * Used by canvas (draw-time) and AI recipes (MCP-ready placement).
 *
 * Coordinate pipeline (source of truth = anchors + signed curve / bulgeSide):
 *   fromAnchor / toAnchor → resolveArrowAnchor → insetEndpoints
 *   → quadraticControlAwayFromCentroid (signed curve + bulgeSide)
 *   → clearance pass vs label / lone-pair / charge AABBs
 *   → cached x1,y1,x2,y2,cx,cy for drawing
 */
import type { ArrowAnchor, Atom, Molecule, ReactionArrow } from '@moldraw/domain';
import {
  getLonePairPlacements,
  LONE_PAIR_DOT_R_PX,
  LONE_PAIR_DOT_SEP_PX,
  resolveLonePairWorldPoint,
} from './lonePairLayout';
import {
  CHARGE_MARK_R_DEFAULT_PX,
  clampChargeMarkOffset,
} from './mutations';

export type ResolvedPoint = { x: number; y: number };

const DEFAULT_ATOM_OFFSET_PX = 14;
/** Larger clearance for atoms that draw a glyph (O, N, aliases, charged, forced C). */
const LABELED_ATOM_OFFSET_PX = 22;
const DEFAULT_CURVE_AMOUNT = 0.3;
/** Pull bond-anchored endpoints off the bond line (world px). */
const BOND_PERP_OFFSET_PX = 9;
/** Small inset so tips clear atom glyph centers. */
const ATOM_ENDPOINT_INSET_PX = 4;
/** Push a lone-pair tail just outside the drawn dots. */
const LONE_PAIR_TAIL_EXTRA_PX = 7;
/** Keep short curly arrows visibly arced (absolute), and long ones from looping. */
const MIN_ELECTRON_FLOW_BULGE_PX = 20;
const MAX_ELECTRON_FLOW_BULGE_PX = 46;
const CLEARANCE_PAD_PX = 3;
const CLEARANCE_MAX_ITERS = 3;

type Aabb = { minX: number; maxX: number; minY: number; maxY: number };

/** Whether the atom renders a text label (so endpoints must clear more space). */
const atomHasLabel = (atom: {
  element: string;
  alias?: string;
  charge?: number;
  showElementLabel?: boolean;
}): boolean =>
  atom.element !== 'C' ||
  !!atom.alias?.trim() ||
  (atom.charge ?? 0) !== 0 ||
  !!atom.showElementLabel;

const clampCurveAmount = (v: number): number => {
  const mag = Math.min(0.45, Math.max(0.15, Math.abs(v)));
  return v < 0 ? -mag : mag;
};

/** Fragment / molecule centroid of atoms referenced by the anchors (fallback: all atoms). */
export const moleculeCentroid = (
  mol: Molecule,
  atomIds?: ReadonlySet<string>,
): ResolvedPoint => {
  const atoms = atomIds
    ? mol.atoms.filter(a => atomIds.has(a.id))
    : mol.atoms;
  if (atoms.length === 0) return { x: 0, y: 0 };
  let sx = 0;
  let sy = 0;
  for (const a of atoms) {
    sx += a.x;
    sy += a.y;
  }
  return { x: sx / atoms.length, y: sy / atoms.length };
};

export const resolveArrowAnchor = (
  mol: Molecule,
  anchor: ArrowAnchor,
  awayFrom?: ResolvedPoint,
  /** Extra radial push for atom / bond anchors during clearance retries. */
  clearanceBoostPx = 0,
): ResolvedPoint | null => {
  if (anchor.type === 'bond') {
    const bond = mol.bonds.find(b => b.id === anchor.bondId);
    if (!bond) return null;
    const from = mol.atoms.find(a => a.id === bond.fromAtomId);
    const to = mol.atoms.find(a => a.id === bond.toAtomId);
    if (!from || !to) return null;
    const t = anchor.t == null ? 0.5 : Math.min(1, Math.max(0, anchor.t));
    const x = from.x + (to.x - from.x) * t;
    const y = from.y + (to.y - from.y) * t;
    const bdx = to.x - from.x;
    const bdy = to.y - from.y;
    const blen = Math.hypot(bdx, bdy) || 1;
    let nx = -bdy / blen;
    let ny = bdx / blen;
    if (awayFrom) {
      const mx = (from.x + to.x) / 2;
      const my = (from.y + to.y) / 2;
      if (nx * (mx - awayFrom.x) + ny * (my - awayFrom.y) < 0) {
        nx = -nx;
        ny = -ny;
      }
    }
    const perp = BOND_PERP_OFFSET_PX + clearanceBoostPx;
    return {
      x: x + nx * perp,
      y: y + ny * perp,
    };
  }

  const atom = mol.atoms.find(a => a.id === anchor.atomId);
  if (!atom) return null;

  if (anchor.type === 'lone_pair') {
    const base = resolveLonePairWorldPoint(mol, atom.id, anchor.slot ?? 0);
    if (!base) return null;
    // Push the tail just past the drawn dots so it does not sit on them.
    const dx = base.x - atom.x;
    const dy = base.y - atom.y;
    const len = Math.hypot(dx, dy) || 1;
    const extra = LONE_PAIR_TAIL_EXTRA_PX + clearanceBoostPx;
    return {
      x: base.x + (dx / len) * extra,
      y: base.y + (dy / len) * extra,
    };
  }

  // Clear more room around labeled atoms; never come in closer than the label needs.
  const minOffset = atomHasLabel(atom) ? LABELED_ATOM_OFFSET_PX : DEFAULT_ATOM_OFFSET_PX;
  const offsetPx =
    Math.max(anchor.offsetPx ?? DEFAULT_ATOM_OFFSET_PX, minOffset) + clearanceBoostPx;
  let deg = anchor.offsetDeg;
  if (deg == null && awayFrom) {
    const dx = atom.x - awayFrom.x;
    const dy = atom.y - awayFrom.y;
    const len = Math.hypot(dx, dy);
    if (len > 1e-6) {
      deg = (Math.atan2(dy, dx) * 180) / Math.PI;
    } else {
      deg = -90;
    }
  }
  const rad = ((deg ?? -90) * Math.PI) / 180;
  return {
    x: atom.x + Math.cos(rad) * offsetPx,
    y: atom.y + Math.sin(rad) * offsetPx,
  };
};

export const quadraticControlAwayFromCentroid = (
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  centroid: ResolvedPoint,
  curveAmount?: number,
  /** Force bulge side: +1 / -1 relative to chord left-hand normal. */
  bulgeSide?: 1 | -1,
): { cx: number; cy: number; curveAmount: number; bulgeSide: 1 | -1 } => {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  let nx = -dy / len;
  let ny = dx / len;
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;

  const signedInput = curveAmount == null ? DEFAULT_CURVE_AMOUNT : curveAmount;
  const mag = Math.abs(clampCurveAmount(signedInput));

  let side: 1 | -1 = 1;
  if (bulgeSide === 1 || bulgeSide === -1) {
    side = bulgeSide;
  } else {
    // Prefer away from fragment centroid.
    const toMidX = mx - centroid.x;
    const toMidY = my - centroid.y;
    if (nx * toMidX + ny * toMidY < 0) {
      side = -1;
    }
    // Signed curveAmount flips the auto-picked side (do not abs before side pick).
    if (signedInput < 0) {
      side = side === 1 ? -1 : 1;
    }
  }

  if (side < 0) {
    nx = -nx;
    ny = -ny;
  }

  let bulgePx = mag * len;
  bulgePx = Math.min(Math.max(bulgePx, MIN_ELECTRON_FLOW_BULGE_PX), MAX_ELECTRON_FLOW_BULGE_PX);
  const outAmount = bulgePx / len;
  return {
    cx: mx + nx * bulgePx,
    cy: my + ny * bulgePx,
    // Preserve author sign when present; otherwise positive magnitude.
    curveAmount: signedInput < 0 ? -outAmount : outAmount,
    bulgeSide: side,
  };
};

const insetEndpoints = (
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  inset: number,
): { x1: number; y1: number; x2: number; y2: number } => {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  if (len < inset * 2 + 10) return { x1, y1, x2, y2 };
  const ux = dx / len;
  const uy = dy / len;
  return {
    x1: x1 + ux * inset,
    y1: y1 + uy * inset,
    x2: x2 - ux * inset,
    y2: y2 - uy * inset,
  };
};

const quadPoint = (
  t: number,
  x1: number,
  y1: number,
  cx: number,
  cy: number,
  x2: number,
  y2: number,
): ResolvedPoint => {
  const u = 1 - t;
  return {
    x: u * u * x1 + 2 * u * t * cx + t * t * x2,
    y: u * u * y1 + 2 * u * t * cy + t * t * y2,
  };
};

const pointHitsAabb = (p: ResolvedPoint, box: Aabb, pad: number): boolean =>
  p.x >= box.minX - pad &&
  p.x <= box.maxX + pad &&
  p.y >= box.minY - pad &&
  p.y <= box.maxY + pad;

/** Approximate upright AABB for a labeled atom glyph. */
const approxAtomGlyphAabb = (atom: Atom): Aabb | null => {
  if (!atomHasLabel(atom)) return null;
  const alias = atom.alias?.trim();
  const halfW = alias ? Math.max(8, alias.length * 4.2) : 7;
  const halfH = alias ? 8 : 7;
  return {
    minX: atom.x - halfW,
    maxX: atom.x + halfW,
    minY: atom.y - halfH,
    maxY: atom.y + halfH,
  };
};

const approxLonePairAabbs = (mol: Molecule, atom: Atom): Aabb[] => {
  const lp = Math.max(0, atom.lonePairs ?? 0);
  if (lp <= 0) return [];
  const placements = getLonePairPlacements(atom, mol, lp, {
    preferSide: atom.lonePairSide ?? 'above',
  });
  const out: Aabb[] = [];
  const r = LONE_PAIR_DOT_R_PX + 1.5;
  const sep = LONE_PAIR_DOT_SEP_PX;
  for (const p of placements) {
    const cx = atom.x + p.dir.x * p.dist;
    const cy = atom.y + p.dir.y * p.dist;
    const nx = -p.dir.y;
    const ny = p.dir.x;
    for (const s of [1, -1] as const) {
      const dx = cx + nx * sep * s;
      const dy = cy + ny * sep * s;
      out.push({ minX: dx - r, maxX: dx + r, minY: dy - r, maxY: dy + r });
    }
  }
  return out;
};

const approxChargeAabb = (atom: Atom): Aabb | null => {
  const charge = atom.charge ?? 0;
  if (!charge) return null;
  const stored = atom.chargeOffset;
  let ox: number;
  let oy: number;
  if (stored) {
    ({ x: ox, y: oy } = clampChargeMarkOffset(stored.x, stored.y));
  } else {
    // Match canvas defaultChargeMarkOffset free-side seat (left/up bias).
    const left = true; // conservative: use a generous box around typical seats
    const isMinus = charge < 0;
    const up = isMinus ? 0.72 : 0.38;
    const dx = left ? -1 : 1;
    const dy = -up;
    const len = Math.hypot(dx, dy) || 1;
    const r = isMinus ? CHARGE_MARK_R_DEFAULT_PX + 3 : CHARGE_MARK_R_DEFAULT_PX;
    ({ x: ox, y: oy } = clampChargeMarkOffset((dx / len) * r, (dy / len) * r));
  }
  const w = 9;
  const h = 9;
  const cx = atom.x + ox;
  const cy = atom.y + oy;
  return { minX: cx - w, maxX: cx + w, minY: cy - h, maxY: cy + h };
};

/** Obstacles near the arrow's local fragment (glyphs, LPs, charges). */
const collectClearanceObstacles = (
  mol: Molecule,
  fragIds: ReadonlySet<string> | undefined,
): Aabb[] => {
  const boxes: Aabb[] = [];
  for (const atom of mol.atoms) {
    if (fragIds && !fragIds.has(atom.id)) continue;
    const glyph = approxAtomGlyphAabb(atom);
    if (glyph) boxes.push(glyph);
    boxes.push(...approxLonePairAabbs(mol, atom));
    const charge = approxChargeAabb(atom);
    if (charge) boxes.push(charge);
  }
  return boxes;
};

const arcHitsObstacles = (
  x1: number,
  y1: number,
  cx: number,
  cy: number,
  x2: number,
  y2: number,
  boxes: Aabb[],
): boolean => {
  if (boxes.length === 0) return false;
  for (let i = 1; i <= 10; i++) {
    const t = i / 11;
    const p = quadPoint(t, x1, y1, cx, cy, x2, y2);
    for (const box of boxes) {
      if (pointHitsAabb(p, box, CLEARANCE_PAD_PX)) return true;
    }
  }
  return false;
};

/** Grow seed atom ids to their bonded connected component (local fragment). */
const expandConnectedAtomIds = (
  mol: Molecule,
  seed: ReadonlySet<string>,
): Set<string> => {
  const out = new Set(seed);
  let grew = true;
  while (grew) {
    grew = false;
    for (const b of mol.bonds) {
      const a = out.has(b.fromAtomId);
      const c = out.has(b.toAtomId);
      if (a && !c) {
        out.add(b.toAtomId);
        grew = true;
      } else if (c && !a) {
        out.add(b.fromAtomId);
        grew = true;
      }
    }
  }
  return out;
};

type CurvedResolveState = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  cx: number;
  cy: number;
  curveAmount: number;
  bulgeSide: 1 | -1;
};

/**
 * Resolve curved / electron_flow geometry from anchors with signed curve,
 * optional bulgeSide, and a short clearance pass vs label/LP/charge AABBs.
 */
const resolveCurvedArrowGeometry = (
  mol: Molecule,
  arrow: ReactionArrow,
  p0: ResolvedPoint,
  p1: ResolvedPoint,
  centroid: ResolvedPoint,
  fragIds: ReadonlySet<string> | undefined,
): CurvedResolveState => {
  const obstacles = collectClearanceObstacles(mol, fragIds);
  let curveAmount = arrow.curveAmount ?? DEFAULT_CURVE_AMOUNT;
  let bulgeSide = arrow.bulgeSide;
  let boostPx = 0;

  let best: CurvedResolveState | null = null;

  for (let iter = 0; iter < CLEARANCE_MAX_ITERS; iter++) {
    const from =
      arrow.fromAnchor != null
        ? resolveArrowAnchor(mol, arrow.fromAnchor, centroid, boostPx) ?? p0
        : p0;
    const to =
      arrow.toAnchor != null
        ? resolveArrowAnchor(mol, arrow.toAnchor, centroid, boostPx) ?? p1
        : p1;
    const inset = insetEndpoints(from.x, from.y, to.x, to.y, ATOM_ENDPOINT_INSET_PX);
    const ctrl = quadraticControlAwayFromCentroid(
      inset.x1,
      inset.y1,
      inset.x2,
      inset.y2,
      centroid,
      curveAmount,
      bulgeSide,
    );
    const state: CurvedResolveState = {
      x1: inset.x1,
      y1: inset.y1,
      x2: inset.x2,
      y2: inset.y2,
      cx: ctrl.cx,
      cy: ctrl.cy,
      curveAmount: ctrl.curveAmount,
      bulgeSide: ctrl.bulgeSide,
    };
    best = state;

    if (!arcHitsObstacles(state.x1, state.y1, state.cx, state.cy, state.x2, state.y2, obstacles)) {
      return state;
    }

    // Prefer increasing bend away from the crowded side, then flip, then push endpoints out.
    const mag = Math.abs(curveAmount);
    if (mag < 0.42) {
      curveAmount = (curveAmount < 0 ? -1 : 1) * Math.min(0.45, mag + 0.08);
    } else if (iter === 1) {
      bulgeSide = (bulgeSide ?? ctrl.bulgeSide) === 1 ? -1 : 1;
    } else {
      boostPx += 4;
    }
  }

  return best!;
};

/**
 * Resolve anchors into a drawable arrow (endpoints + optional quadratic control).
 * Falls back to stored geometry when anchors are missing or unresolved.
 */
export const resolveReactionArrowGeometry = (
  mol: Molecule,
  arrow: ReactionArrow,
): ReactionArrow => {
  const hasFrom = !!arrow.fromAnchor;
  const hasTo = !!arrow.toAnchor;
  if (!hasFrom && !hasTo) return arrow;

  const refIds = new Set<string>();
  const collect = (a?: ArrowAnchor) => {
    if (!a) return;
    if (a.type === 'atom' || a.type === 'lone_pair') refIds.add(a.atomId);
    if (a.type === 'bond') {
      const b = mol.bonds.find(bb => bb.id === a.bondId);
      if (b) {
        refIds.add(b.fromAtomId);
        refIds.add(b.toAtomId);
      }
    }
  };
  collect(arrow.fromAnchor);
  collect(arrow.toAnchor);
  // Use the local fragment centroid so bond-perp / bulge match the teaching panel
  // (not just the 2–3 atoms named in the anchors).
  const fragIds =
    refIds.size > 0 ? expandConnectedAtomIds(mol, refIds) : undefined;
  const centroid = moleculeCentroid(mol, fragIds);

  const p0 = arrow.fromAnchor
    ? resolveArrowAnchor(mol, arrow.fromAnchor, centroid)
    : { x: arrow.x1, y: arrow.y1 };
  const p1 = arrow.toAnchor
    ? resolveArrowAnchor(mol, arrow.toAnchor, centroid)
    : { x: arrow.x2, y: arrow.y2 };
  if (!p0 || !p1) return arrow;

  const kind = arrow.kind ?? 'straight';
  if (kind === 'electron_flow' || kind === 'curved') {
    const curved = resolveCurvedArrowGeometry(mol, arrow, p0, p1, centroid, fragIds);
    return {
      ...arrow,
      x1: curved.x1,
      y1: curved.y1,
      x2: curved.x2,
      y2: curved.y2,
      cx: curved.cx,
      cy: curved.cy,
      curveAmount: arrow.curveAmount ?? curved.curveAmount,
      bulgeSide: arrow.bulgeSide ?? curved.bulgeSide,
    };
  }

  return {
    ...arrow,
    x1: p0.x,
    y1: p0.y,
    x2: p1.x,
    y2: p1.y,
  };
};

export type BuildElectronFlowArrowOpts = {
  id: string;
  fromAnchor: ArrowAnchor;
  toAnchor: ArrowAnchor;
  /** Atoms of the local fragment — used for centroid / bulge side. */
  panelAtomIds?: string[];
  headStyle?: 'single' | 'pair';
  /** Signed fraction of chord length (default ~0.32). */
  curveAmount?: number;
  /**
   * Force which side of the chord the arc bulges toward (+1 / -1).
   * Omit to auto-pick away from the panel centroid (honoring curveAmount sign).
   */
  bulgeSide?: 1 | -1;
  headScale?: number;
  strokeWidth?: number;
};

/**
 * Build an electron_flow arrow with chemistry anchors and a clean quadratic arc.
 * Shared by the mechanism demo and AI place_resonance_forms.
 * Authors should emit anchors + signed curve / bulgeSide; world coords are filled here
 * and recomputed again at draw via resolveReactionArrowGeometry.
 */
export const buildElectronFlowArrow = (
  mol: Molecule,
  opts: BuildElectronFlowArrowOpts,
): ReactionArrow | null => {
  const panelIds = opts.panelAtomIds?.length
    ? new Set(opts.panelAtomIds)
    : undefined;
  const centroid = moleculeCentroid(mol, panelIds);

  const p0 = resolveArrowAnchor(mol, opts.fromAnchor, centroid);
  const p1 = resolveArrowAnchor(mol, opts.toAnchor, centroid);
  if (!p0 || !p1) return null;

  const draft: ReactionArrow = {
    id: opts.id,
    x1: p0.x,
    y1: p0.y,
    x2: p1.x,
    y2: p1.y,
    kind: 'electron_flow',
    fromAnchor: opts.fromAnchor,
    toAnchor: opts.toAnchor,
    headStyle: opts.headStyle ?? 'pair',
    curveAmount: opts.curveAmount ?? 0.32,
    bulgeSide: opts.bulgeSide,
    headScale: opts.headScale ?? 0.85,
    strokeWidth: opts.strokeWidth ?? 1.75,
  };

  const resolved = resolveReactionArrowGeometry(mol, draft);
  return {
    ...resolved,
    // Keep author intent for subsequent draw-time resolve.
    curveAmount: opts.curveAmount ?? resolved.curveAmount,
    bulgeSide: opts.bulgeSide ?? resolved.bulgeSide,
  };
};

/** Pick nearest atom or bond center within `tol` for draw-tool snap. */
export const snapArrowEndpointToStructure = (
  mol: Molecule,
  x: number,
  y: number,
  tol = 16,
): { point: ResolvedPoint; anchor: ArrowAnchor } | null => {
  let best: { d: number; point: ResolvedPoint; anchor: ArrowAnchor } | null = null;

  for (const a of mol.atoms) {
    const d = Math.hypot(a.x - x, a.y - y);
    if (d > tol) continue;
    if (!best || d < best.d) {
      best = {
        d,
        point: { x: a.x, y: a.y },
        anchor: { type: 'atom', atomId: a.id },
      };
    }
  }

  for (const b of mol.bonds) {
    const from = mol.atoms.find(a => a.id === b.fromAtomId);
    const to = mol.atoms.find(a => a.id === b.toAtomId);
    if (!from || !to) continue;
    const mx = (from.x + to.x) / 2;
    const my = (from.y + to.y) / 2;
    const d = Math.hypot(mx - x, my - y);
    if (d > tol) continue;
    if (!best || d < best.d) {
      best = {
        d,
        point: { x: mx, y: my },
        anchor: { type: 'bond', bondId: b.id, t: 0.5 },
      };
    }
  }

  return best ? { point: best.point, anchor: best.anchor } : null;
};

/** Re-snap electron-flow tail/head to structure after endpoint drag; clears anchor when away. */
export type ElectronFlowEndpointResnapPatch = {
  x1?: number;
  y1?: number;
  x2?: number;
  y2?: number;
  cx?: number;
  cy?: number;
  curveAmount?: number;
  bulgeSide?: 1 | -1;
  fromAnchor?: ReactionArrow['fromAnchor'] | null;
  toAnchor?: ReactionArrow['toAnchor'] | null;
};

export const applyElectronFlowEndpointResnap = (
  mol: Molecule,
  arrow: ReactionArrow,
  end: 'tail' | 'head',
  tol = 18,
): ElectronFlowEndpointResnapPatch => {
  if ((arrow.kind ?? 'straight') !== 'electron_flow') return {};

  const x = end === 'tail' ? arrow.x1 : arrow.x2;
  const y = end === 'tail' ? arrow.y1 : arrow.y2;
  const snap = snapArrowEndpointToStructure(mol, x, y, tol);

  const patch: ElectronFlowEndpointResnapPatch = {};

  if (end === 'tail') {
    if (snap) {
      patch.x1 = snap.point.x;
      patch.y1 = snap.point.y;
      patch.fromAnchor = snap.anchor;
    } else {
      patch.fromAnchor = null;
    }
  } else if (snap) {
    patch.x2 = snap.point.x;
    patch.y2 = snap.point.y;
    patch.toAnchor = snap.anchor;
  } else {
    patch.toAnchor = null;
  }

  const x1 = patch.x1 ?? arrow.x1;
  const y1 = patch.y1 ?? arrow.y1;
  const x2 = patch.x2 ?? arrow.x2;
  const y2 = patch.y2 ?? arrow.y2;
  const ctrl = quadraticControlAwayFromCentroid(
    x1,
    y1,
    x2,
    y2,
    moleculeCentroid(mol),
    arrow.curveAmount,
    arrow.bulgeSide,
  );
  patch.cx = ctrl.cx;
  patch.cy = ctrl.cy;
  patch.curveAmount = ctrl.curveAmount;
  patch.bulgeSide = ctrl.bulgeSide;

  return patch;
};

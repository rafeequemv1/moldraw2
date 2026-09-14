/**
 * Reaction-arrow drawing, sampling for hit-tests, and chord-based helpers.
 */
import type { Molecule, ReactionArrow, ReactionArrowKind } from '@moldraw/domain';
import { resolveReactionArrowGeometry } from '@moldraw/core';
import { pointSegDist } from './angles';

const KIND_DEFAULT: ReactionArrowKind = 'straight';

export const getReactionArrowKind = (a: { kind?: ReactionArrowKind }): ReactionArrowKind =>
  a.kind ?? KIND_DEFAULT;

/** Quadratic on-curve kinds edited with three free handles (tail / mid / head). */
export const isQuadraticCurvedArrowKind = (k: ReactionArrowKind): boolean =>
  k === 'curved' || k === 'electron_flow';

/** Freeform curve kinds — handle dots must not angle/axis/grid snap. */
export const isFreeformCurveArrowKind = (k: ReactionArrowKind): boolean =>
  isQuadraticCurvedArrowKind(k) ||
  k === 's_curve' ||
  k === 'cycle_arc' ||
  isOrthogonalPolylineArrowKind(k);

/** Orthogonal polyline kinds that store `pathPoints` (flowchart elbows / row wrap). */
export const isOrthogonalPolylineArrowKind = (k: ReactionArrowKind): boolean =>
  k === 'path' || k === 'row_wrap';

export type OrthogonalPathPrefer = 'hv' | 'vh';

/**
 * Flowchart-style orthogonal polyline (90° turns only).
 * `hv` = horizontal → vertical → horizontal; `vh` = vertical → horizontal → vertical.
 * Nearly axis-aligned chords stay a single segment.
 */
export const defaultPathPoints = (
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  prefer?: OrthogonalPathPrefer,
): Array<{ x: number; y: number }> => {
  const dx = x2 - x1;
  const dy = y2 - y1;
  if (Math.abs(dy) < 0.5) {
    return [
      { x: x1, y: y1 },
      { x: x2, y: y1 },
    ];
  }
  if (Math.abs(dx) < 0.5) {
    return [
      { x: x1, y: y1 },
      { x: x1, y: y2 },
    ];
  }
  const mode = prefer ?? (Math.abs(dx) >= Math.abs(dy) ? 'hv' : 'vh');
  if (mode === 'hv') {
    const mx = (x1 + x2) / 2;
    return [
      { x: x1, y: y1 },
      { x: mx, y: y1 },
      { x: mx, y: y2 },
      { x: x2, y: y2 },
    ];
  }
  const my = (y1 + y2) / 2;
  return [
    { x: x1, y: y1 },
    { x: x1, y: my },
    { x: x2, y: my },
    { x: x2, y: y2 },
  ];
};

/**
 * Multi-row scheme wrap: exit right → down into inter-row gutter → across →
 * down into the next molecule (extra turn vs simple right-rail U-turn).
 */
export const defaultRowWrapPathPoints = (
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): Array<{ x: number; y: number }> => {
  const stub = Math.max(40, Math.abs(x2 - x1) * 0.06 + 36);
  const goingDown = y2 >= y1;
  const gutterY = goingDown
    ? Math.min(y1 + Math.max(52, (y2 - y1) * 0.42), y2 - 28)
    : Math.max(y1 - Math.max(52, (y1 - y2) * 0.42), y2 + 28);
  const exitX = x1 + stub;
  return [
    { x: x1, y: y1 },
    { x: exitX, y: y1 },
    { x: exitX, y: gutterY },
    { x: x2, y: gutterY },
    { x: x2, y: y2 },
  ];
};

export const resolvePathPoints = (a: ReactionArrow): Array<{ x: number; y: number }> => {
  if (a.pathPoints && a.pathPoints.length >= 2) return a.pathPoints.map(p => ({ ...p }));
  const k = getReactionArrowKind(a);
  if (k === 'row_wrap') return defaultRowWrapPathPoints(a.x1, a.y1, a.x2, a.y2);
  return defaultPathPoints(a.x1, a.y1, a.x2, a.y2);
};

/** Keep chord endpoints in sync with polyline ends. */
export const syncPathChord = (
  pts: Array<{ x: number; y: number }>,
): Pick<ReactionArrow, 'x1' | 'y1' | 'x2' | 'y2' | 'pathPoints'> => {
  const first = pts[0]!;
  const last = pts[pts.length - 1]!;
  return {
    pathPoints: pts,
    x1: first.x,
    y1: first.y,
    x2: last.x,
    y2: last.y,
  };
};

const nearlyEq = (a: number, b: number, eps = 0.75) => Math.abs(a - b) <= eps;

export const inferOrthogonalPathPrefer = (
  pts: Array<{ x: number; y: number }>,
): OrthogonalPathPrefer => {
  if (pts.length < 2) return 'hv';
  const a = pts[0]!;
  const b = pts[1]!;
  return Math.abs(b.x - a.x) >= Math.abs(b.y - a.y) ? 'hv' : 'vh';
};

const isHvhOrthogonal = (pts: Array<{ x: number; y: number }>): boolean => {
  if (pts.length !== 4) return false;
  const [p0, p1, p2, p3] = pts as [
    { x: number; y: number },
    { x: number; y: number },
    { x: number; y: number },
    { x: number; y: number },
  ];
  return (
    nearlyEq(p0.y, p1.y) &&
    nearlyEq(p1.x, p2.x) &&
    nearlyEq(p2.y, p3.y)
  );
};

const isVhvOrthogonal = (pts: Array<{ x: number; y: number }>): boolean => {
  if (pts.length !== 4) return false;
  const [p0, p1, p2, p3] = pts as [
    { x: number; y: number },
    { x: number; y: number },
    { x: number; y: number },
    { x: number; y: number },
  ];
  return (
    nearlyEq(p0.x, p1.x) &&
    nearlyEq(p1.y, p2.y) &&
    nearlyEq(p2.x, p3.x)
  );
};

/** Move a path vertex while keeping 90° elbows (flowchart-style). */
export const patchOrthogonalPathVertex = (
  pts: Array<{ x: number; y: number }>,
  idx: number,
  dx: number,
  dy: number,
): Array<{ x: number; y: number }> => {
  if (idx <= 0 || idx >= pts.length - 1) return pts.map(p => ({ ...p }));
  const target = { x: pts[idx]!.x + dx, y: pts[idx]!.y + dy };
  const next = pts.map(p => ({ ...p }));

  if (isHvhOrthogonal(pts) && (idx === 1 || idx === 2)) {
    const mx = target.x;
    next[1] = { x: mx, y: next[0]!.y };
    next[2] = { x: mx, y: next[3]!.y };
    return next;
  }
  if (isVhvOrthogonal(pts) && (idx === 1 || idx === 2)) {
    const my = target.y;
    next[1] = { x: next[0]!.x, y: my };
    next[2] = { x: next[3]!.x, y: my };
    return next;
  }

  // Generic: snap corner to axis-aligned with neighbors.
  const prev = next[idx - 1]!;
  const foll = next[idx + 1]!;
  const candA = { x: prev.x, y: foll.y };
  const candB = { x: foll.x, y: prev.y };
  const dA = Math.hypot(target.x - candA.x, target.y - candA.y);
  const dB = Math.hypot(target.x - candB.x, target.y - candB.y);
  next[idx] = dA <= dB ? candA : candB;
  return next;
};

/** Bezier control from an on-curve midpoint (B(½) = M). */
export const quadControlFromOnCurveMid = (
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  mx: number,
  my: number,
): { cx: number; cy: number } => ({
  // B(½) = ¼·P0 + ½·P1 + ¼·P2  ⇒  P1 = 2·M − ½·P0 − ½·P2
  cx: 2 * mx - 0.5 * x1 - 0.5 * x2,
  cy: 2 * my - 0.5 * y1 - 0.5 * y2,
});

/** Default quadratic control: bump perpendicular from chord midpoint. */
export const defaultCurveControl = (
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): { cx: number; cy: number } => {
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const bend = len * 0.22;
  return { cx: mx + nx * bend, cy: my + ny * bend };
};

/**
 * Default cycle-arc center: circular arc bulging to the left of the directed
 * chord (matches pathway sweep when drawing tail→head).
 */
export const defaultCycleArcCenter = (
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): { cx: number; cy: number } => {
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const chord = Math.hypot(dx, dy) || 1;
  const nx = -dy / chord;
  const ny = dx / chord;
  const sagitta = Math.max(12, chord * 0.28);
  const R = (chord * chord) / (8 * sagitta) + sagitta / 2;
  return { cx: mx - nx * (R - sagitta), cy: my - ny * (R - sagitta) };
};

/** Circumcenter of three points (null if nearly collinear). */
export const circumcenter3 = (
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
): { cx: number; cy: number } | null => {
  const d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
  if (Math.abs(d) < 1e-6) return null;
  const a2 = ax * ax + ay * ay;
  const b2 = bx * bx + by * by;
  const c2 = cx * cx + cy * cy;
  return {
    cx: (a2 * (by - cy) + b2 * (cy - ay) + c2 * (ay - by)) / d,
    cy: (a2 * (cx - bx) + b2 * (ax - cx) + c2 * (bx - ax)) / d,
  };
};

export type ResolvedCycleArc = {
  cx: number;
  cy: number;
  r: number;
  θ1: number;
  θ2: number;
};

/** Resolve cycle-arc geometry; θ2 may be less than θ1 (clockwise short arcs). */
export const resolveCycleArc = (
  a: Pick<ReactionArrow, 'x1' | 'y1' | 'x2' | 'y2' | 'cx' | 'cy'>,
): ResolvedCycleArc => {
  const { x1, y1, x2, y2 } = a;
  const center =
    a.cx !== undefined && a.cy !== undefined
      ? { cx: a.cx, cy: a.cy }
      : defaultCycleArcCenter(x1, y1, x2, y2);
  const r1 = Math.hypot(x1 - center.cx, y1 - center.cy);
  const r2 = Math.hypot(x2 - center.cx, y2 - center.cy);
  const r = Math.max(1, (r1 + r2) / 2);
  const θ1 = Math.atan2(y1 - center.cy, x1 - center.cx);
  const θ2raw = Math.atan2(y2 - center.cy, x2 - center.cx);
  let d = θ2raw - θ1;
  while (d <= -Math.PI) d += Math.PI * 2;
  while (d > Math.PI) d -= Math.PI * 2;
  // Prefer the shorter arc (signed). Layout sectors are ≤ π so this matches
  // molecule order when tips were placed with increasing angles.
  return { cx: center.cx, cy: center.cy, r, θ1, θ2: θ1 + d };
};

export const sampleCycleArcPolyline = (
  a: Pick<ReactionArrow, 'x1' | 'y1' | 'x2' | 'y2' | 'cx' | 'cy'>,
  n = 36,
): Array<{ x: number; y: number }> => {
  const { cx, cy, r, θ1, θ2 } = resolveCycleArc(a);
  const pts: Array<{ x: number; y: number }> = [];
  const steps = Math.max(8, n);
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const θ = θ1 + (θ2 - θ1) * t;
    pts.push({ x: cx + Math.cos(θ) * r, y: cy + Math.sin(θ) * r });
  }
  return pts;
};

const resolveQuadControl = (
  a: Pick<ReactionArrow, 'x1' | 'y1' | 'x2' | 'y2' | 'cx' | 'cy'>,
): { cx: number; cy: number } =>
  a.cx !== undefined && a.cy !== undefined
    ? { cx: a.cx, cy: a.cy }
    : defaultCurveControl(a.x1, a.y1, a.x2, a.y2);

/** Default cubic controls for an S-shaped curve along the chord. */
export const defaultSCurveControls = (
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): { c1x: number; c1y: number; c2x: number; c2y: number } => {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const bend = len * 0.2;
  return {
    c1x: x1 + dx / 3 + nx * bend,
    c1y: y1 + dy / 3 + ny * bend,
    c2x: x1 + (2 * dx) / 3 - nx * bend,
    c2y: y1 + (2 * dy) / 3 - ny * bend,
  };
};

const quadPt = (
  x0: number,
  y0: number,
  cx: number,
  cy: number,
  x2: number,
  y2: number,
  t: number,
): { x: number; y: number } => {
  const u = 1 - t;
  return {
    x: u * u * x0 + 2 * u * t * cx + t * t * x2,
    y: u * u * y0 + 2 * u * t * cy + t * t * y2,
  };
};

const cubicPt = (
  p0: { x: number; y: number },
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  p3: { x: number; y: number },
  t: number,
): { x: number; y: number } => {
  const u = 1 - t;
  const u2 = u * u;
  const u3 = u2 * u;
  const t2 = t * t;
  const t3 = t2 * t;
  return {
    x: u3 * p0.x + 3 * u2 * t * p1.x + 3 * u * t2 * p2.x + t3 * p3.x,
    y: u3 * p0.y + 3 * u2 * t * p1.y + 3 * u * t2 * p2.y + t3 * p3.y,
  };
};

const quadTan = (
  x0: number,
  y0: number,
  cx: number,
  cy: number,
  x2: number,
  y2: number,
  t: number,
): { x: number; y: number } => {
  return {
    x: 2 * (1 - t) * (cx - x0) + 2 * t * (x2 - cx),
    y: 2 * (1 - t) * (cy - y0) + 2 * t * (y2 - cy),
  };
};

const cubicTan = (
  p0: { x: number; y: number },
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  p3: { x: number; y: number },
  t: number,
): { x: number; y: number } => {
  const u = 1 - t;
  const u2 = u * u;
  const t2 = t * t;
  return {
    x: 3 * u2 * (p1.x - p0.x) + 6 * u * t * (p2.x - p1.x) + 3 * t2 * (p3.x - p2.x),
    y: 3 * u2 * (p1.y - p0.y) + 6 * u * t * (p2.y - p1.y) + 3 * t2 * (p3.y - p2.y),
  };
};

const norm = (x: number, y: number): { x: number; y: number } => {
  const h = Math.hypot(x, y) || 1;
  return { x: x / h, y: y / h };
};

const pointToPolylineDist = (
  px: number,
  py: number,
  pts: { x: number; y: number }[],
): number => {
  let best = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const d = pointSegDist(px, py, a.x, a.y, b.x, b.y);
    if (d < best) best = d;
  }
  return best;
};

const sampleStraight = (x1: number, y1: number, x2: number, y2: number, n: number) => {
  const pts: { x: number; y: number }[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    pts.push({ x: x1 + t * (x2 - x1), y: y1 + t * (y2 - y1) });
  }
  return pts;
};

const sampleQuad = (
  x1: number,
  y1: number,
  cx: number,
  cy: number,
  x2: number,
  y2: number,
  n: number,
) => {
  const pts: { x: number; y: number }[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    pts.push(quadPt(x1, y1, cx, cy, x2, y2, t));
  }
  return pts;
};

const sampleCubic = (
  p0: { x: number; y: number },
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  p3: { x: number; y: number },
  n: number,
) => {
  const pts: { x: number; y: number }[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    pts.push(cubicPt(p0, p1, p2, p3, t));
  }
  return pts;
};

/** Polyline samples along the visible shaft (both directions for equilibrium). */
export const sampleReactionArrowPolyline = (a: ReactionArrow): { x: number; y: number }[] => {
  const k = getReactionArrowKind(a);
  const { x1, y1, x2, y2 } = a;
  if (isOrthogonalPolylineArrowKind(k)) {
    return resolvePathPoints(a);
  }
  if (k === 'straight' || k === 'retrosynthetic' || k === 'resonance') {
    return sampleStraight(x1, y1, x2, y2, 24);
  }
  if (k === 'curved' || k === 'electron_flow') {
    const { cx, cy } =
      a.cx !== undefined && a.cy !== undefined ? { cx: a.cx, cy: a.cy } : defaultCurveControl(x1, y1, x2, y2);
    return sampleQuad(x1, y1, cx, cy, x2, y2, 28);
  }
  if (k === 's_curve') {
    const c =
      a.c1x !== undefined && a.c1y !== undefined && a.c2x !== undefined && a.c2y !== undefined
        ? { p1: { x: a.c1x, y: a.c1y }, p2: { x: a.c2x, y: a.c2y } }
        : (() => {
            const d = defaultSCurveControls(x1, y1, x2, y2);
            return { p1: { x: d.c1x, y: d.c1y }, p2: { x: d.c2x, y: d.c2y } };
          })();
    return sampleCubic({ x: x1, y: y1 }, c.p1, c.p2, { x: x2, y: y2 }, 32);
  }
  if (k === 'cycle_arc') {
    return sampleCycleArcPolyline(a, 36);
  }
  if (k === 'equilibrium' || k === 'half_equilibrium') {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.hypot(dx, dy) || 1;
    const nx = (-dy / len) * 5;
    const ny = (dx / len) * 5;
    const f = sampleStraight(x1 + nx, y1 + ny, x2 + nx, y2 + ny, 16);
    const r = sampleStraight(x2 - nx, y2 - ny, x1 - nx, y1 - ny, 16);
    return [...f, ...r];
  }
  return sampleStraight(x1, y1, x2, y2, 24);
};

/**
 * Anchor for reagentAbove / reagentBelow: mid of the longest shaft segment.
 * For classic wrap-style path arrows (tall vertical rail), prefer the vertical
 * segment. For `row_wrap` snakes, prefer the long horizontal gutter segment.
 */
export const reactionArrowReagentLabelAnchor = (
  a: ReactionArrow,
): { mx: number; my: number; nx: number; ny: number; angle: number } => {
  const k = getReactionArrowKind(a);

  if (k === 'cycle_arc') {
    const arc = resolveCycleArc(a);
    const θm = (arc.θ1 + arc.θ2) / 2;
    const mx = arc.cx + Math.cos(θm) * arc.r;
    const my = arc.cy + Math.sin(θm) * arc.r;
    // Outward radial = away from cycle center (reagentAbove sits outside the ring).
    const nx = Math.cos(θm);
    const ny = Math.sin(θm);
    const dθ = arc.θ2 - arc.θ1;
    const tx = -Math.sin(θm) * Math.sign(dθ || 1);
    const ty = Math.cos(θm) * Math.sign(dθ || 1);
    return { mx, my, nx, ny, angle: Math.atan2(ty, tx) };
  }

  let x0 = a.x1;
  let y0 = a.y1;
  let x1 = a.x2;
  let y1 = a.y2;

  if (isOrthogonalPolylineArrowKind(k)) {
    const pts = resolvePathPoints(a);
    let bestI = 0;
    let bestScore = -1;
    let hasTallVertical = false;
    for (let i = 0; i < pts.length - 1; i++) {
      const p = pts[i]!;
      const q = pts[i + 1]!;
      const len = Math.hypot(q.x - p.x, q.y - p.y);
      if (Math.abs(q.x - p.x) < 1 && len > 48) hasTallVertical = true;
    }
    for (let i = 0; i < pts.length - 1; i++) {
      const p = pts[i]!;
      const q = pts[i + 1]!;
      const len = Math.hypot(q.x - p.x, q.y - p.y);
      const nearlyVert = Math.abs(q.x - p.x) < 1;
      const nearlyHoriz = Math.abs(q.y - p.y) < 1;
      // row_wrap: park reagents on the long gutter horizontal.
      const horizBonus = k === 'row_wrap' && nearlyHoriz ? len * 1.5 : 0;
      // Classic path wrap rails: park reagents on the vertical outside the grid.
      const vertBonus = k !== 'row_wrap' && hasTallVertical && nearlyVert ? len * 1.5 : 0;
      const score = len + horizBonus + vertBonus;
      if (score > bestScore) {
        bestScore = score;
        bestI = i;
      }
    }
    const p = pts[bestI]!;
    const q = pts[bestI + 1]!;
    x0 = p.x;
    y0 = p.y;
    x1 = q.x;
    y1 = q.y;
  } else if (k === 's_curve' || isQuadraticCurvedArrowKind(k)) {
    const poly = sampleReactionArrowPolyline(a);
    if (poly.length >= 2) {
      const mid = poly[Math.floor(poly.length / 2)]!;
      const prev = poly[Math.max(0, Math.floor(poly.length / 2) - 1)]!;
      const nextPt = poly[Math.min(poly.length - 1, Math.floor(poly.length / 2) + 1)]!;
      x0 = prev.x;
      y0 = prev.y;
      x1 = nextPt.x;
      y1 = nextPt.y;
      const dx = x1 - x0;
      const dy = y1 - y0;
      const len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len;
      const ny = dx / len;
      let angle = Math.atan2(dy, dx);
      if (Math.cos(angle) < 0) angle += Math.PI;
      return { mx: mid.x, my: mid.y, nx, ny, angle };
    }
  }

  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  let angle = Math.atan2(dy, dx);
  if (Math.cos(angle) < 0) angle += Math.PI;
  return { mx: (x0 + x1) / 2, my: (y0 + y1) / 2, nx, ny, angle };
};

export type ReactionArrowReagentSlot = 'above' | 'below';

/** World positions for reagent label slots (above / below the shaft). */
export const reactionArrowReagentSlotPositions = (
  a: ReactionArrow,
): Record<ReactionArrowReagentSlot, { x: number; y: number }> => {
  const { mx, my, nx, ny } = reactionArrowReagentLabelAnchor(a);
  const fs = a.reagentFontSize ?? 14;
  const baseOff = 18 + fs * 0.45;
  return {
    above: { x: mx + nx * baseOff, y: my + ny * baseOff },
    below: { x: mx - nx * baseOff, y: my - ny * baseOff },
  };
};

const REAGENT_SLOT_HIT_R = 12;

/** Hit-test reagent slot chips for the selected arrow (world coords). */
export const pickReactionArrowReagentSlot = (
  arrow: ReactionArrow | null | undefined,
  wx: number,
  wy: number,
  tol = REAGENT_SLOT_HIT_R,
): { arrowId: string; slot: ReactionArrowReagentSlot } | null => {
  if (!arrow) return null;
  const slots = reactionArrowReagentSlotPositions(arrow);
  for (const slot of ['above', 'below'] as const) {
    const p = slots[slot];
    if (Math.hypot(wx - p.x, wy - p.y) <= tol) {
      return { arrowId: arrow.id, slot };
    }
  }
  return null;
};

/** ChemDraw-style open angular arrowhead (two strokes meeting at the tip). */
const drawHeadAngular = (
  ctx: CanvasRenderingContext2D,
  tipX: number,
  tipY: number,
  ux: number,
  uy: number,
  headLen: number,
  headW: number,
) => {
  const px = -uy;
  const py = ux;
  const baseX = tipX - ux * headLen;
  const baseY = tipY - uy * headLen;
  ctx.beginPath();
  ctx.moveTo(tipX, tipY);
  ctx.lineTo(baseX + px * headW, baseY + py * headW);
  ctx.moveTo(tipX, tipY);
  ctx.lineTo(baseX - px * headW, baseY - py * headW);
  ctx.stroke();
};

const drawShaftHeadStraight = (
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  color: string,
  lineWidth: number,
  dashedGhost: boolean,
  headLen: number,
  headW: number,
) => {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  if (len < 4) return;
  const u = norm(dx, dy);
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (dashedGhost) ctx.setLineDash([7, 6]);
  else ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  drawHeadAngular(ctx, x2, y2, u.x, u.y, headLen, headW);
  ctx.setLineDash([]);
};

/** ChemDraw-style solid resonance arrow: straight shaft with heads at both ends (↔). */
const drawResonanceBidirectional = (
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  color: string,
  lineWidth: number,
  dashedGhost: boolean,
  headLen: number,
  headW: number,
) => {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  if (len < 4) return;
  const u = norm(dx, dy);
  const hl = Math.min(headLen, len * 0.35);
  const hw = headW;
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (dashedGhost) ctx.setLineDash([7, 6]);
  else ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  drawHeadAngular(ctx, x2, y2, u.x, u.y, hl, hw);
  drawHeadAngular(ctx, x1, y1, -u.x, -u.y, hl, hw);
  ctx.setLineDash([]);
};

/**
 * Single-electron / fish-hook arrowhead: one barb on the concave (inner) side of the arc,
 * matching textbook curved fish-hook notation (not a filled pair-electron head).
 * Barb side follows the chord×control sign so it does not flip while the control moves.
 *
 * The shaft must be stroked to the tip; this only draws the side barb from the tip
 * (short back along the tangent + inward), so there is no gap between shaft and hook.
 */
const drawFishHookHead = (
  ctx: CanvasRenderingContext2D,
  tailX: number,
  tailY: number,
  tipX: number,
  tipY: number,
  ux: number,
  uy: number,
  cx: number,
  cy: number,
  color: string,
  lineWidth: number,
  headLen: number,
  headW: number,
  dashedGhost: boolean,
): void => {
  // Barb roots slightly behind the tip so it reads as a hook, not a detached segment.
  const rootX = tipX - ux * headLen * 0.35;
  const rootY = tipY - uy * headLen * 0.35;
  let px = -uy;
  let py = ux;
  const bendCross = (tipX - tailX) * (cy - tailY) - (tipY - tailY) * (cx - tailX);
  if (bendCross < 0) {
    px = -px;
    py = -py;
  }
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (dashedGhost) ctx.setLineDash([6, 5]);
  else ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(tipX, tipY);
  ctx.lineTo(rootX + px * headW, rootY + py * headW);
  ctx.stroke();
  ctx.setLineDash([]);
};

const strokeQuadShaft = (
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  cx: number,
  cy: number,
  x2: number,
  y2: number,
  samples = 28,
): void => {
  ctx.beginPath();
  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    const p = quadPt(x1, y1, cx, cy, x2, y2, t);
    if (i === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  }
  ctx.stroke();
};

const strokeCubicShaft = (
  ctx: CanvasRenderingContext2D,
  p0: { x: number; y: number },
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  p3: { x: number; y: number },
  samples = 32,
): void => {
  ctx.beginPath();
  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    const p = cubicPt(p0, p1, p2, p3, t);
    if (i === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  }
  ctx.stroke();
};

const drawElectronFlow = (
  ctx: CanvasRenderingContext2D,
  a: ReactionArrow,
  color: string,
  lineWidth: number,
  dashedGhost: boolean,
): void => {
  const { x1, y1, x2, y2 } = a;
  const { cx, cy } = resolveQuadControl(a);
  const chord = Math.hypot(x2 - x1, y2 - y1) || 1;
  const pairHead = a.headStyle === 'pair';
  // Short chords (π→heteroatom) must keep a tiny head or the triangle swallows the shaft.
  const headScale = a.headScale ?? 1;
  const headLen =
    (pairHead
      ? Math.min(14, Math.max(3.5, chord * 0.2), chord * 0.38)
      : Math.min(10, Math.max(3.5, chord * 0.16), chord * 0.34)) * headScale;
  const headW =
    (pairHead ? Math.min(7, Math.max(2.5, headLen * 0.55)) : Math.min(6, Math.max(2.5, headLen * 0.6))) *
    headScale;
  const tEnd = quadTan(x1, y1, cx, cy, x2, y2, 1);
  const tanEnd = norm(tEnd.x, tEnd.y);
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.lineCap = 'round';
  if (dashedGhost) ctx.setLineDash([6, 5]);
  else ctx.setLineDash([]);
  if (pairHead) {
    strokeQuadShaft(ctx, x1, y1, cx, cy, x2, y2);
    ctx.setLineDash([]);
    drawHeadAngular(ctx, x2, y2, tanEnd.x, tanEnd.y, headLen, headW);
    return;
  }
  // Fish-hook: full curve to tip + side barb.
  const samples = 28;
  ctx.beginPath();
  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    const p = quadPt(x1, y1, cx, cy, x2, y2, t);
    if (i === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  }
  ctx.stroke();
  ctx.setLineDash([]);
  drawFishHookHead(
    ctx,
    x1,
    y1,
    x2,
    y2,
    tanEnd.x,
    tanEnd.y,
    cx,
    cy,
    color,
    lineWidth,
    headLen,
    headW,
    dashedGhost,
  );
};

const drawCurvedOrResonance = (
  ctx: CanvasRenderingContext2D,
  a: ReactionArrow,
  color: string,
  lineWidth: number,
  dashedGhost: boolean,
  resonance: boolean,
) => {
  const { x1, y1, x2, y2 } = a;
  const { cx, cy } = resolveQuadControl(a);
  const headLen = Math.min(18, Math.hypot(x2 - x1, y2 - y1) * 0.35) * (a.headScale ?? 1);
  const headW = 8 * (a.headScale ?? 1);
  const tEnd = quadTan(x1, y1, cx, cy, x2, y2, 1);
  const tanEnd = norm(tEnd.x, tEnd.y);
  const tStart = quadTan(x1, y1, cx, cy, x2, y2, 0);
  const startHeadDir = norm(-tStart.x, -tStart.y);
  const doubleHead = resonance && a.doubleHead && !dashedGhost;
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.lineCap = 'round';
  if (resonance || dashedGhost) ctx.setLineDash([6, 5]);
  else ctx.setLineDash([]);
  strokeQuadShaft(ctx, x1, y1, cx, cy, x2, y2);
  ctx.setLineDash([]);
  drawHeadAngular(ctx, x2, y2, tanEnd.x, tanEnd.y, headLen, headW);
  if (doubleHead) {
    drawHeadAngular(ctx, x1, y1, startHeadDir.x, startHeadDir.y, headLen, headW);
  }
};

const resolveSCurveControls = (
  a: ReactionArrow,
): { c1x: number; c1y: number; c2x: number; c2y: number } => {
  if (
    a.c1x !== undefined &&
    a.c1y !== undefined &&
    a.c2x !== undefined &&
    a.c2y !== undefined
  ) {
    return { c1x: a.c1x, c1y: a.c1y, c2x: a.c2x, c2y: a.c2y };
  }
  return defaultSCurveControls(a.x1, a.y1, a.x2, a.y2);
};

const drawSCurve = (
  ctx: CanvasRenderingContext2D,
  a: ReactionArrow,
  color: string,
  lineWidth: number,
  dashedGhost: boolean,
) => {
  const { x1, y1, x2, y2 } = a;
  const ctrl = resolveSCurveControls(a);
  const c = { p1: { x: ctrl.c1x, y: ctrl.c1y }, p2: { x: ctrl.c2x, y: ctrl.c2y } };
  const p0 = { x: x1, y: y1 };
  const p3 = { x: x2, y: y2 };
  const headLen = Math.min(18, Math.hypot(x2 - x1, y2 - y1) * 0.35) * (a.headScale ?? 1);
  const headW = 8 * (a.headScale ?? 1);
  const te = cubicTan(p0, c.p1, c.p2, p3, 1);
  const tanEnd = norm(te.x, te.y);
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.lineCap = 'round';
  if (dashedGhost) ctx.setLineDash([7, 6]);
  else ctx.setLineDash([]);
  strokeCubicShaft(ctx, p0, c.p1, c.p2, p3);
  ctx.setLineDash([]);
  drawHeadAngular(ctx, x2, y2, tanEnd.x, tanEnd.y, headLen, headW);
};

/** Circumferential circular-arc shaft for closed pathways (Krebs / TCA). */
const drawCycleArc = (
  ctx: CanvasRenderingContext2D,
  a: ReactionArrow,
  color: string,
  lineWidth: number,
  dashedGhost: boolean,
) => {
  const arc = resolveCycleArc(a);
  const hs = a.headScale ?? 1;
  const arcLen = Math.abs(arc.θ2 - arc.θ1) * arc.r;
  const headLen = Math.min(18, Math.max(10, arcLen * 0.35)) * hs;
  const headW = 8 * hs;
  const dθ = arc.θ2 - arc.θ1;
  const dir = Math.sign(dθ || 1);
  // Tip tangent in the direction of travel along the arc.
  const tipθ = arc.θ2;
  const ux = -Math.sin(tipθ) * dir;
  const uy = Math.cos(tipθ) * dir;
  const tipX = arc.cx + Math.cos(tipθ) * arc.r;
  const tipY = arc.cy + Math.sin(tipθ) * arc.r;

  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (dashedGhost) ctx.setLineDash([7, 6]);
  else ctx.setLineDash([]);
  ctx.beginPath();
  const steps = Math.max(12, Math.ceil(Math.abs(dθ) / (Math.PI / 36)));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const θ = arc.θ1 + dθ * t;
    const x = arc.cx + Math.cos(θ) * arc.r;
    const y = arc.cy + Math.sin(θ) * arc.r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
  ctx.setLineDash([]);
  drawHeadAngular(ctx, tipX, tipY, ux, uy, headLen, headW);
};

/** Multi-bend polyline shaft with an angular head on the last segment. */
const drawPathArrow = (
  ctx: CanvasRenderingContext2D,
  a: ReactionArrow,
  color: string,
  lineWidth: number,
  dashedGhost: boolean,
) => {
  const pts = resolvePathPoints(a);
  if (pts.length < 2) return;
  const tip = pts[pts.length - 1]!;
  const prev = pts[pts.length - 2]!;
  const dx = tip.x - prev.x;
  const dy = tip.y - prev.y;
  const segLen = Math.hypot(dx, dy) || 1;
  const u = norm(dx, dy);
  const headLen = Math.min(18, segLen * 0.45) * (a.headScale ?? 1);
  const headW = 8 * (a.headScale ?? 1);
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (dashedGhost) ctx.setLineDash([7, 6]);
  else ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(pts[0]!.x, pts[0]!.y);
  for (let i = 1; i < pts.length; i++) {
    ctx.lineTo(pts[i]!.x, pts[i]!.y);
  }
  ctx.stroke();
  ctx.setLineDash([]);
  drawHeadAngular(ctx, tip.x, tip.y, u.x, u.y, headLen, headW);
};

const drawRetrosynthetic = (
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  color: string,
  lineWidth: number,
  dashedGhost: boolean,
  headScale: number,
) => {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  if (len < 4) return;
  const u = norm(dx, dy);
  const px = -u.y;
  const py = u.x;
  const headLen = Math.min(18, len * 0.35) * headScale;
  const headW = 8 * headScale;
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.lineCap = 'round';
  ctx.setLineDash(dashedGhost ? [7, 6] : [5, 5]);
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.setLineDash([]);
  drawHeadAngular(ctx, x2, y2, u.x, u.y, headLen, headW);
  const t1 = 0.38;
  const t2 = 0.48;
  const bar = Math.min(12, len * 0.08);
  for (const t of [t1, t2]) {
    const bx = x1 + dx * t;
    const by = y1 + dy * t;
    ctx.beginPath();
    ctx.moveTo(bx - px * bar, by - py * bar);
    ctx.lineTo(bx + px * bar, by + py * bar);
    ctx.stroke();
  }
};

const drawEquilibrium = (
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  color: string,
  lineWidth: number,
  dashedGhost: boolean,
  headScale: number,
) => {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  if (len < 4) return;
  const u = norm(dx, dy);
  const nx = -u.y * 4.5;
  const ny = u.x * 4.5;
  const headLen = Math.min(16, len * 0.3) * headScale;
  const headW = 7 * headScale;
  const ax1 = x1 + nx;
  const ay1 = y1 + ny;
  const ax2 = x2 + nx;
  const ay2 = y2 + ny;
  const bx1 = x1 - nx;
  const by1 = y1 - ny;
  const bx2 = x2 - nx;
  const by2 = y2 - ny;
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.setLineDash(dashedGhost ? [7, 6] : []);
  drawShaftHeadStraight(ctx, ax1, ay1, ax2, ay2, color, lineWidth, dashedGhost, headLen, headW);
  drawShaftHeadStraight(ctx, bx2, by2, bx1, by1, color, lineWidth, dashedGhost, headLen, headW);
  ctx.setLineDash([]);
};

const drawHalfEquilibrium = (
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  color: string,
  lineWidth: number,
  dashedGhost: boolean,
  headScale: number,
) => {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  if (len < 4) return;
  const u = norm(dx, dy);
  const nx = -u.y * 4;
  const ny = u.x * 4;
  const headLen = Math.min(18, len * 0.32) * headScale;
  const headW = 8 * headScale;
  const ax1 = x1 + nx;
  const ay1 = y1 + ny;
  const ax2 = x2 + nx;
  const ay2 = y2 + ny;
  drawShaftHeadStraight(ctx, ax1, ay1, ax2, ay2, color, lineWidth + 0.35, dashedGhost, headLen, headW);
  ctx.globalAlpha = dashedGhost ? 0.45 : 0.85;
  ctx.setLineDash([5, 5]);
  drawShaftHeadStraight(ctx, x2 - nx, y2 - ny, x1 - nx, y1 - ny, color, Math.max(1, lineWidth - 0.5), dashedGhost, headLen * 0.75, headW * 0.75);
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;
};

export interface DrawReactionArrowStyle {
  color: string;
  lineWidth: number;
  dashedGhost?: boolean;
}

/**
 * Draw a full reaction arrow (all kinds). Ghost preview uses dashed strokes and
 * angular heads.
 */
export const drawReactionArrowShape = (
  ctx: CanvasRenderingContext2D,
  a: ReactionArrow,
  style: DrawReactionArrowStyle,
): void => {
  const { x1, y1, x2, y2 } = a;
  const color = a.color ?? style.color;
  const lineWidth = a.strokeWidth ?? style.lineWidth;
  const dashedGhost = style.dashedGhost ?? false;
  const hs = a.headScale ?? 1;
  const k = getReactionArrowKind(a);
  ctx.save();
  ctx.lineJoin = 'round';
  try {
    if (k === 'straight') {
      drawShaftHeadStraight(ctx, x1, y1, x2, y2, color, lineWidth, dashedGhost, 18 * hs, 8 * hs);
      return;
    }
    if (k === 'resonance') {
      drawResonanceBidirectional(ctx, x1, y1, x2, y2, color, lineWidth, dashedGhost, 16 * hs, 7 * hs);
      return;
    }
    if (k === 'retrosynthetic') {
      drawRetrosynthetic(ctx, x1, y1, x2, y2, color, lineWidth, dashedGhost, hs);
      return;
    }
    if (k === 'equilibrium') {
      drawEquilibrium(ctx, x1, y1, x2, y2, color, lineWidth, dashedGhost, hs);
      return;
    }
    if (k === 'half_equilibrium') {
      drawHalfEquilibrium(ctx, x1, y1, x2, y2, color, lineWidth, dashedGhost, hs);
      return;
    }
    if (k === 'curved') {
      drawCurvedOrResonance(ctx, a, color, lineWidth, dashedGhost, false);
      return;
    }
    if (k === 's_curve') {
      drawSCurve(ctx, a, color, lineWidth, dashedGhost);
      return;
    }
    if (k === 'cycle_arc') {
      drawCycleArc(ctx, a, color, lineWidth, dashedGhost);
      return;
    }
    if (isOrthogonalPolylineArrowKind(k)) {
      drawPathArrow(ctx, a, color, lineWidth, dashedGhost);
      return;
    }
    if (k === 'electron_flow') {
      drawElectronFlow(ctx, a, color, lineWidth, dashedGhost);
      return;
    }
  } finally {
    ctx.restore();
  }
};

/** @deprecated Use `drawReactionArrowShape` with `{ kind: 'straight' }`. */
export const drawReactionArrowCanvas = (
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  color: string,
  lineWidth = 2,
  dashedGhost = false,
): void => {
  drawReactionArrowShape(
    ctx,
    { id: '_', x1, y1, x2, y2, kind: 'straight' },
    { color, lineWidth, dashedGhost },
  );
};

/** Draw-time geometry so handle hit-tests match the visible dots. */
export const arrowsForHitTest = (mol: Molecule): ReactionArrow[] =>
  (mol.reactionArrows ?? []).map(a => resolveReactionArrowGeometry(mol, a));

/** Convert a screen-pixel handle radius into world units. */
export const arrowHandleHitTolWorld = (zoom = 1, screenPx = 22): number =>
  screenPx / Math.max(0.12, zoom);

/** Top-most arrow whose geometry is within `tol` world units of (wx, wy). */
export const pickReactionArrowAt = (
  arrows: ReactionArrow[] | undefined,
  wx: number,
  wy: number,
  tol = 14,
): ReactionArrow | null => {
  const list = arrows ?? [];
  for (let i = list.length - 1; i >= 0; i--) {
    const a = list[i];
    const d = pointToPolylineDist(wx, wy, sampleReactionArrowPolyline(a));
    if (d < tol) return a;
  }
  return null;
};

/**
 * Handle ids for arrow editing.
 * - `curve`: quadratic mid (curved / electron_flow)
 * - `c1` / `c2`: independent S-curve cubic controls
 * - `vertex`: intermediate path polyline point (`vertexIndex`)
 */
export type ReactionArrowEndpoint = 'tail' | 'head' | 'curve' | 'c1' | 'c2' | 'vertex';

export type ReactionArrowEditHandle = {
  x: number;
  y: number;
  end: ReactionArrowEndpoint;
  /** Required when `end === 'vertex'`. */
  vertexIndex?: number;
};

/** World position of the quadratic curvature handle (on-curve point t=½). */
export const getReactionArrowCurveHandleWorld = (
  a: ReactionArrow,
): { x: number; y: number } | null => {
  const k = getReactionArrowKind(a);
  if (k === 'curved' || k === 'electron_flow') {
    const { cx, cy } =
      a.cx !== undefined && a.cy !== undefined ? { cx: a.cx, cy: a.cy } : defaultCurveControl(a.x1, a.y1, a.x2, a.y2);
    return quadPt(a.x1, a.y1, cx, cy, a.x2, a.y2, 0.5);
  }
  if (k === 'cycle_arc') {
    const arc = resolveCycleArc(a);
    const θm = (arc.θ1 + arc.θ2) / 2;
    return { x: arc.cx + Math.cos(θm) * arc.r, y: arc.cy + Math.sin(θm) * arc.r };
  }
  return null;
};

/** All editable guide dots for a selected arrow (tail, head, bends). */
export const listReactionArrowEditHandles = (a: ReactionArrow): ReactionArrowEditHandle[] => {
  const handles: ReactionArrowEditHandle[] = [
    { x: a.x1, y: a.y1, end: 'tail' },
    { x: a.x2, y: a.y2, end: 'head' },
  ];
  const k = getReactionArrowKind(a);
  if (isQuadraticCurvedArrowKind(k)) {
    const mid = getReactionArrowCurveHandleWorld(a);
    if (mid) handles.push({ x: mid.x, y: mid.y, end: 'curve' });
  }
  if (k === 'cycle_arc') {
    const mid = getReactionArrowCurveHandleWorld(a);
    if (mid) handles.push({ x: mid.x, y: mid.y, end: 'curve' });
  }
  if (k === 's_curve') {
    const c = resolveSCurveControls(a);
    handles.push({ x: c.c1x, y: c.c1y, end: 'c1' });
    handles.push({ x: c.c2x, y: c.c2y, end: 'c2' });
  }
  if (isOrthogonalPolylineArrowKind(k)) {
    const pts = resolvePathPoints(a);
    for (let i = 1; i < pts.length - 1; i++) {
      const p = pts[i]!;
      handles.push({ x: p.x, y: p.y, end: 'vertex', vertexIndex: i });
    }
  }
  return handles;
};

/** Hit-test curvature / bend handles (after tail/head are ruled out by callers). */
export const pickReactionArrowCurveHandle = (
  arrows: ReactionArrow[] | undefined,
  wx: number,
  wy: number,
  tol = 16,
): { arrowId: string; end: ReactionArrowEndpoint; vertexIndex?: number } | null => {
  const list = arrows ?? [];
  for (let i = list.length - 1; i >= 0; i--) {
    const a = list[i]!;
    for (const h of listReactionArrowEditHandles(a)) {
      if (h.end === 'tail' || h.end === 'head') continue;
      if (Math.hypot(wx - h.x, wy - h.y) <= tol) {
        return { arrowId: a.id, end: h.end, vertexIndex: h.vertexIndex };
      }
    }
  }
  return null;
};

/** Top-most arrow whose tail or head handle is within `tol` of (wx, wy). */
export const pickReactionArrowEndpoint = (
  arrows: ReactionArrow[] | undefined,
  wx: number,
  wy: number,
  tol = 14,
): { arrowId: string; end: ReactionArrowEndpoint } | null => {
  const list = arrows ?? [];
  for (let i = list.length - 1; i >= 0; i--) {
    const a = list[i]!;
    if (Math.hypot(wx - a.x1, wy - a.y1) <= tol) return { arrowId: a.id, end: 'tail' };
    if (Math.hypot(wx - a.x2, wy - a.y2) <= tol) return { arrowId: a.id, end: 'head' };
  }
  return null;
};

/** Move quadratic mid control (legacy: also moves both S controls together). */
export const reactionArrowCurveHandlePatch = (
  orig: ReactionArrow,
  dx: number,
  dy: number,
): Partial<ReactionArrow> => {
  const k = getReactionArrowKind(orig);
  if (k === 'cycle_arc') {
    const mid = getReactionArrowCurveHandleWorld(orig);
    if (!mid) return {};
    const target = { x: mid.x + dx, y: mid.y + dy };
    const c = circumcenter3(orig.x1, orig.y1, target.x, target.y, orig.x2, orig.y2);
    if (!c) return {};
    return { cx: c.cx, cy: c.cy };
  }
  if (isQuadraticCurvedArrowKind(k)) {
    const x1 = orig.x1;
    const y1 = orig.y1;
    const x2 = orig.x2;
    const y2 = orig.y2;
    const base = resolveQuadControl(orig);
    const origMid = quadPt(x1, y1, base.cx, base.cy, x2, y2, 0.5);
    const targetMid = { x: origMid.x + dx, y: origMid.y + dy };
    return quadControlFromOnCurveMid(x1, y1, x2, y2, targetMid.x, targetMid.y);
  }
  if (k === 's_curve') {
    const c = resolveSCurveControls(orig);
    return {
      c1x: c.c1x + dx,
      c1y: c.c1y + dy,
      c2x: c.c2x + dx,
      c2y: c.c2y + dy,
    };
  }
  return {};
};

export type ReactionArrowResizeOpts = {
  /** Required when `end === 'vertex'`. */
  vertexIndex?: number;
};

/**
 * Patch for dragging tail, head, or bend handles.
 * Quadratic curly arrows use a three-point model: moving an endpoint keeps the
 * on-curve midpoint fixed so the head stays tangent-coupled to the curve.
 * S-curve `c1`/`c2` move independently; path vertices edit `pathPoints`.
 */
export const reactionArrowEndpointResizePatch = (
  orig: ReactionArrow,
  end: ReactionArrowEndpoint,
  dx: number,
  dy: number,
  opts?: ReactionArrowResizeOpts,
): Partial<ReactionArrow> => {
  if (end === 'curve') {
    return reactionArrowCurveHandlePatch(orig, dx, dy);
  }

  const k = getReactionArrowKind(orig);

  if (end === 'c1' || end === 'c2') {
    const c = resolveSCurveControls(orig);
    if (end === 'c1') return { c1x: c.c1x + dx, c1y: c.c1y + dy, c2x: c.c2x, c2y: c.c2y };
    return { c1x: c.c1x, c1y: c.c1y, c2x: c.c2x + dx, c2y: c.c2y + dy };
  }

  if (end === 'vertex' || isOrthogonalPolylineArrowKind(k)) {
    const pts = resolvePathPoints(orig);
    if (end === 'vertex') {
      const idx = opts?.vertexIndex;
      if (idx === undefined || idx <= 0 || idx >= pts.length - 1) return {};
      return syncPathChord(patchOrthogonalPathVertex(pts, idx, dx, dy));
    }
    if (end === 'tail') {
      const prefer = inferOrthogonalPathPrefer(pts);
      const last = pts[pts.length - 1]!;
      return syncPathChord(defaultPathPoints(orig.x1 + dx, orig.y1 + dy, last.x, last.y, prefer));
    }
    if (end === 'head') {
      const prefer = inferOrthogonalPathPrefer(pts);
      const first = pts[0]!;
      return syncPathChord(defaultPathPoints(first.x, first.y, orig.x2 + dx, orig.y2 + dy, prefer));
    }
  }

  if (isQuadraticCurvedArrowKind(k)) {
    const base = resolveQuadControl(orig);
    const mid = quadPt(orig.x1, orig.y1, base.cx, base.cy, orig.x2, orig.y2, 0.5);
    if (end === 'tail') {
      const x1 = orig.x1 + dx;
      const y1 = orig.y1 + dy;
      return {
        x1,
        y1,
        ...quadControlFromOnCurveMid(x1, y1, orig.x2, orig.y2, mid.x, mid.y),
      };
    }
    const x2 = orig.x2 + dx;
    const y2 = orig.y2 + dy;
    return {
      x2,
      y2,
      ...quadControlFromOnCurveMid(orig.x1, orig.y1, x2, y2, mid.x, mid.y),
    };
  }

  if (k === 'cycle_arc') {
    const arc = resolveCycleArc(orig);
    if (end === 'tail') {
      return { x1: orig.x1 + dx, y1: orig.y1 + dy, cx: arc.cx, cy: arc.cy };
    }
    return { x2: orig.x2 + dx, y2: orig.y2 + dy, cx: arc.cx, cy: arc.cy };
  }

  if (end === 'tail') {
    const p: Partial<ReactionArrow> = { x1: orig.x1 + dx, y1: orig.y1 + dy };
    if (orig.c1x !== undefined && orig.c1y !== undefined) {
      p.c1x = orig.c1x + dx;
      p.c1y = orig.c1y + dy;
    }
    return p;
  }
  const p: Partial<ReactionArrow> = { x2: orig.x2 + dx, y2: orig.y2 + dy };
  if (orig.c2x !== undefined && orig.c2y !== undefined) {
    p.c2x = orig.c2x + dx;
    p.c2y = orig.c2y + dy;
  }
  return p;
};

/** Translate all stored coordinates by (dx, dy). */
export const offsetReactionArrowForDrag = (
  a: ReactionArrow,
  dx: number,
  dy: number,
): Partial<ReactionArrow> => {
  const patch: Partial<ReactionArrow> = {
    x1: a.x1 + dx,
    y1: a.y1 + dy,
    x2: a.x2 + dx,
    y2: a.y2 + dy,
  };
  if (a.cx !== undefined && a.cy !== undefined) {
    patch.cx = a.cx + dx;
    patch.cy = a.cy + dy;
  }
  if (a.c1x !== undefined && a.c1y !== undefined) {
    patch.c1x = a.c1x + dx;
    patch.c1y = a.c1y + dy;
  }
  if (a.c2x !== undefined && a.c2y !== undefined) {
    patch.c2x = a.c2x + dx;
    patch.c2y = a.c2y + dy;
  }
  if (a.pathPoints && a.pathPoints.length >= 2) {
    patch.pathPoints = a.pathPoints.map(p => ({ x: p.x + dx, y: p.y + dy }));
  }
  return patch;
};

/** Full arrow after moving from drag snapshot. */
export const reactionArrowAfterDelta = (
  orig: ReactionArrow,
  dx: number,
  dy: number,
): ReactionArrow => ({ ...orig, ...offsetReactionArrowForDrag(orig, dx, dy) });

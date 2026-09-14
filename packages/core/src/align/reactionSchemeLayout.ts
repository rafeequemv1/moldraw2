/**
 * Deterministic slot layout for multi-step reaction schemes (molecules + arrows).
 * Pure geometry — no Molecule mutation.
 */

export type SchemeMoleculeSlot = {
  index: number;
  row: number;
  col: number;
  /** Target centroid of the fragment. */
  cx: number;
  cy: number;
  /** Canvas text anchor under the molecule. */
  labelX: number;
  labelY: number;
};

export type SchemeArrowSlot = {
  stepIndex: number;
  row: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  /** Optional arrow kind (cycle defaults to circumferential arc). */
  kind?: 'straight' | 'path' | 'row_wrap' | 's_curve' | 'curved' | 'cycle_arc';
  /** Polyline vertices when kind is `path` / `row_wrap` (orthogonal 90°). */
  pathPoints?: Array<{ x: number; y: number }>;
  /** Cycle center when kind is `cycle_arc`. */
  cx?: number;
  cy?: number;
};

export type ReactionSchemeLayout = {
  molecules: SchemeMoleculeSlot[];
  arrows: SchemeArrowSlot[];
  bounds: { minX: number; maxX: number; minY: number; maxY: number };
};

export type LayoutReactionSchemeOpts = {
  /** Number of structures (reactant + intermediates + product). */
  moleculeCount: number;
  /**
   * `row` — left-to-right with wrap (default).
   * `cycle` — circular pathway (Krebs-style); places n arrows closing the loop.
   * `branch` — one reactant → multiple products (multi-direction orthogonal paths).
   */
  layout?: 'row' | 'cycle' | 'branch';
  /** Max molecules per horizontal row before wrapping. Default 4. Ignored for cycle/branch. */
  maxPerRow?: number;
  originX?: number;
  originY?: number;
  /** Horizontal distance between consecutive molecule centers. Default 280. */
  slotPitch?: number;
  /** Arrow shaft length between molecules. Default 80. */
  arrowLength?: number;
  /** Vertical distance between row baselines / branch products. Default 300. */
  rowGap?: number;
  /** Label below molecule center. Default 78. */
  labelOffset?: number;
  /** Cycle radius (center → molecule). Default scales with count. */
  cycleRadius?: number;
};

/** Flowchart-style orthogonal polyline helpers removed — row/branch inline their paths. */

const boundsFromSlots = (
  molecules: SchemeMoleculeSlot[],
  arrows: SchemeArrowSlot[],
  originX: number,
  originY: number,
): ReactionSchemeLayout['bounds'] => {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const m of molecules) {
    minX = Math.min(minX, m.cx - 60, m.labelX - 40);
    maxX = Math.max(maxX, m.cx + 60, m.labelX + 40);
    minY = Math.min(minY, m.cy - 50);
    maxY = Math.max(maxY, m.labelY + 20);
  }
  for (const ar of arrows) {
    minX = Math.min(minX, ar.x1, ar.x2);
    maxX = Math.max(maxX, ar.x1, ar.x2);
    minY = Math.min(minY, ar.y1, ar.y2);
    maxY = Math.max(maxY, ar.y1, ar.y2);
    if (ar.pathPoints) {
      for (const p of ar.pathPoints) {
        minX = Math.min(minX, p.x);
        maxX = Math.max(maxX, p.x);
        minY = Math.min(minY, p.y);
        maxY = Math.max(maxY, p.y);
      }
    }
    if (ar.kind === 'cycle_arc' && ar.cx != null && ar.cy != null) {
      const r = Math.hypot(ar.x1 - ar.cx, ar.y1 - ar.cy);
      minX = Math.min(minX, ar.cx - r);
      maxX = Math.max(maxX, ar.cx + r);
      minY = Math.min(minY, ar.cy - r);
      maxY = Math.max(maxY, ar.cy + r);
    }
  }
  if (!Number.isFinite(minX)) {
    minX = originX;
    maxX = originX;
    minY = originY;
    maxY = originY;
  }
  return { minX, maxX, minY, maxY };
};

/**
 * Circumferential arc between cycle neighbors (outside the molecule ring).
 * Tips are angularly inset so shafts clear structures; `cx`/`cy` = cycle origin.
 */
const cycleArcArrow = (
  originX: number,
  originY: number,
  radius: number,
  angA: number,
  angB: number,
  stepIndex: number,
): SchemeArrowSlot => {
  let dAng = angB - angA;
  while (dAng <= 0) dAng += Math.PI * 2;
  while (dAng > Math.PI * 2) dAng -= Math.PI * 2;
  // Keep a clear gap from molecule centroids (~22–28% of the sector).
  const eps = Math.min(dAng * 0.28, Math.max(0.16, dAng * 0.22));
  const θ1 = angA + eps;
  const θ2 = angA + dAng - eps;
  // Slightly outside the molecule ring so arcs do not cut through atoms.
  const R = radius * 1.12;
  return {
    stepIndex,
    row: 0,
    x1: originX + Math.cos(θ1) * R,
    y1: originY + Math.sin(θ1) * R,
    x2: originX + Math.cos(θ2) * R,
    y2: originY + Math.sin(θ2) * R,
    kind: 'cycle_arc',
    cx: originX,
    cy: originY,
  };
};

const layoutCycle = (opts: LayoutReactionSchemeOpts): ReactionSchemeLayout => {
  const n = Math.max(0, Math.floor(opts.moleculeCount));
  const originX = opts.originX ?? 0;
  const originY = opts.originY ?? 0;
  const labelOffset = opts.labelOffset ?? 72;
  const pitch = Math.max(200, opts.slotPitch ?? 260);
  // Even spacing on the ring: chord ≈ pitch ⇒ R = pitch / (2 sin(π/n)).
  const radiusFromPitch =
    n >= 2 ? pitch / (2 * Math.sin(Math.PI / Math.max(n, 2))) : pitch;
  const radius = opts.cycleRadius ?? Math.max(160, radiusFromPitch);

  const molecules: SchemeMoleculeSlot[] = [];
  const angles: number[] = [];
  for (let i = 0; i < n; i++) {
    const ang = -Math.PI / 2 + (2 * Math.PI * i) / Math.max(n, 1);
    angles.push(ang);
    const cx = originX + Math.cos(ang) * radius;
    const cy = originY + Math.sin(ang) * radius;
    // Labels sit further outside so long metabolite names stay readable.
    const lx = originX + Math.cos(ang) * (radius + labelOffset * 0.9);
    const ly = originY + Math.sin(ang) * (radius + labelOffset * 0.9);
    molecules.push({
      index: i,
      row: 0,
      col: i,
      cx,
      cy,
      labelX: lx,
      labelY: ly,
    });
  }

  const arrows: SchemeArrowSlot[] = [];
  if (n >= 2) {
    for (let i = 0; i < n; i++) {
      const angA = angles[i]!;
      const angB = angles[(i + 1) % n]! + (i + 1 === n ? Math.PI * 2 : 0);
      arrows.push(cycleArcArrow(originX, originY, radius, angA, angB, i));
    }
  }

  return {
    molecules,
    arrows,
    bounds: boundsFromSlots(molecules, arrows, originX, originY),
  };
};

/**
 * One reactant (index 0) on the left; products fan vertically on the right.
 * Shared stem then orthogonal forks — cleaner than independent elbows from the centroid.
 */
const layoutBranch = (opts: LayoutReactionSchemeOpts): ReactionSchemeLayout => {
  const n = Math.max(0, Math.floor(opts.moleculeCount));
  const originX = opts.originX ?? 0;
  const originY = opts.originY ?? 0;
  const pitch = Math.max(200, opts.slotPitch ?? 300);
  const rowGap = Math.max(140, opts.rowGap ?? 200);
  const arrowLen = Math.max(48, opts.arrowLength ?? 80);
  const labelOffset = opts.labelOffset ?? 72;

  const productCount = Math.max(0, n - 1);
  const molecules: SchemeMoleculeSlot[] = [];

  molecules.push({
    index: 0,
    row: 0,
    col: 0,
    cx: originX,
    cy: originY,
    labelX: originX,
    labelY: originY + labelOffset,
  });

  for (let i = 0; i < productCount; i++) {
    const offset = i - (productCount - 1) / 2;
    const cy = originY + offset * rowGap;
    const cx = originX + pitch;
    molecules.push({
      index: i + 1,
      row: i,
      col: 1,
      cx,
      cy,
      labelX: cx,
      labelY: cy + labelOffset,
    });
  }

  const arrows: SchemeArrowSlot[] = [];
  const reactant = molecules[0]!;
  // Fork node between reactant and product column (shared stem).
  const stemX = reactant.cx + Math.min(pitch * 0.42, tipInsetSafe(arrowLen, pitch));
  const tipIn = Math.max(arrowLen * 0.4, 36);

  for (let i = 0; i < productCount; i++) {
    const prod = molecules[i + 1]!;
    const x1 = reactant.cx + tipIn * 0.85;
    const y1 = reactant.cy;
    const x2 = prod.cx - tipIn;
    const y2 = prod.cy;
    const pathPoints = [
      { x: x1, y: y1 },
      { x: stemX, y: y1 },
      { x: stemX, y: y2 },
      { x: x2, y: y2 },
    ];
    arrows.push({
      stepIndex: i,
      row: i,
      x1: pathPoints[0]!.x,
      y1: pathPoints[0]!.y,
      x2: pathPoints[pathPoints.length - 1]!.x,
      y2: pathPoints[pathPoints.length - 1]!.y,
      kind: 'path',
      pathPoints,
    });
  }

  return {
    molecules,
    arrows,
    bounds: boundsFromSlots(molecules, arrows, originX, originY),
  };
};

function tipInsetSafe(arrowLen: number, pitch: number): number {
  return Math.max(arrowLen * 0.55, pitch * 0.28, 72);
}

/**
 * Lay out `moleculeCount` centers and arrows between them.
 * - `row`: wrapping rows; `moleculeCount - 1` arrows (no close).
 * - `cycle`: circle; `moleculeCount` arrows closing the loop (Krebs-style).
 * - `branch`: reactant → N products with orthogonal multi-direction paths.
 */
export function layoutReactionScheme(opts: LayoutReactionSchemeOpts): ReactionSchemeLayout {
  const mode = opts.layout ?? 'row';
  if (mode === 'cycle') return layoutCycle(opts);
  if (mode === 'branch') return layoutBranch(opts);

  const n = Math.max(0, Math.floor(opts.moleculeCount));
  const maxPerRow = Math.max(2, Math.floor(opts.maxPerRow ?? 4));
  const originX = opts.originX ?? 0;
  const originY = opts.originY ?? 0;
  // Generous defaults so structures, labels, and wrap rails do not collide.
  const pitch = Math.max(220, opts.slotPitch ?? 300);
  const arrowLen = Math.max(56, Math.min(pitch * 0.32, opts.arrowLength ?? 88));
  const rowGap = Math.max(240, opts.rowGap ?? 340);
  const labelOffset = opts.labelOffset ?? 96;

  const molecules: SchemeMoleculeSlot[] = [];
  for (let i = 0; i < n; i++) {
    const row = Math.floor(i / maxPerRow);
    const col = i % maxPerRow;
    const cx = originX + col * pitch;
    const cy = originY + row * rowGap;
    molecules.push({
      index: i,
      row,
      col,
      cx,
      cy,
      labelX: cx,
      labelY: cy + labelOffset,
    });
  }

  /**
   * Keep tips clear of molecule footprints. Scale with pitch so large SMILES
   * schemes (content-aware pitch) keep a consistent visual gutter.
   */
  const tipInset = Math.max(arrowLen * 0.55, pitch * 0.28, 72);

  const arrows: SchemeArrowSlot[] = [];
  for (let i = 0; i < n - 1; i++) {
    const a = molecules[i]!;
    const b = molecules[i + 1]!;
    if (a.row === b.row) {
      // Same-row: short straight shaft centered in the clear gap between footprints.
      const midY = a.cy;
      const gap = b.cx - a.cx;
      const clearHalf = Math.max(20, gap / 2 - tipInset);
      const half = Math.min(arrowLen / 2, clearHalf);
      const cx = (a.cx + b.cx) / 2;
      const x1 = cx - half;
      const x2 = cx + half;
      arrows.push({ stepIndex: i, row: a.row, x1, y1: midY, x2, y2: midY, kind: 'straight' });
    } else {
      /**
       * Row wrap (snake): exit RIGHT of previous mol → down into inter-row
       * gutter → across under the row → down into next-row mol from ABOVE.
       * Extra turn vs a right-rail U-turn so the connector does not overlap
       * structures (ChemDraw-style multi-row schemes).
       */
      const x1 = a.cx + tipInset;
      const y1 = a.cy;
      const stub = Math.max(48, pitch * 0.18);
      const exitX = x1 + stub;
      const gutterY = a.cy + Math.max(labelOffset + 36, rowGap * 0.38);
      const x2 = b.cx;
      const y2 = b.cy - tipInset * 0.85;
      const pathPoints = [
        { x: x1, y: y1 },
        { x: exitX, y: y1 },
        { x: exitX, y: gutterY },
        { x: x2, y: gutterY },
        { x: x2, y: y2 },
      ];
      arrows.push({
        stepIndex: i,
        row: a.row,
        x1,
        y1,
        x2,
        y2,
        kind: 'row_wrap',
        pathPoints,
      });
    }
  }

  return {
    molecules,
    arrows,
    bounds: boundsFromSlots(molecules, arrows, originX, originY),
  };
}

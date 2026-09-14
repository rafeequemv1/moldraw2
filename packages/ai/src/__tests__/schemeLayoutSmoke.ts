/**
 * Smoke: row_wrap snakes + cycle_arc circular pathways.
 *   npx tsx --tsconfig tsconfig.app.json packages/ai/src/__tests__/schemeLayoutSmoke.ts
 */
import { layoutReactionScheme } from '@moldraw/core';

const layout = layoutReactionScheme({
  moleculeCount: 5,
  maxPerRow: 4,
  slotPitch: 300,
  arrowLength: 88,
  rowGap: 340,
  labelOffset: 96,
  originX: 0,
  originY: 0,
});

const wrap = layout.arrows.find(a => a.kind === 'row_wrap');
if (!wrap?.pathPoints || wrap.pathPoints.length < 5) {
  console.error('FAIL: expected row_wrap snake with ≥5 points', wrap);
  process.exit(1);
}

const pts = wrap.pathPoints;
const tip = pts[pts.length - 1]!;
const prev = pts[pts.length - 2]!;
const nextMol = layout.molecules[4]!;

console.log({ tip, prev, nextMolCx: nextMol.cx, nextMolCy: nextMol.cy, pts });

if (!(Math.abs(tip.x - nextMol.cx) < 1)) {
  console.error('FAIL: wrap tip should align with next-row molecule x');
  process.exit(1);
}
if (!(tip.y < nextMol.cy - 8)) {
  console.error('FAIL: wrap tip should approach from above the molecule');
  process.exit(1);
}
if (!(Math.abs(tip.x - prev.x) < 1) || !(tip.y > prev.y + 8)) {
  console.error('FAIL: last wrap segment should travel downward into the molecule');
  process.exit(1);
}
// Mid gutter segment should travel left (row 0 end → row 1 start).
const gutterA = pts[2]!;
const gutterB = pts[3]!;
if (!(gutterB.x < gutterA.x - 8)) {
  console.error('FAIL: gutter segment should travel left across the row');
  process.exit(1);
}

const sameRow = layout.arrows.filter(a => a.kind === 'straight');
if (sameRow.length < 3) {
  console.error('FAIL: expected same-row straight arrows');
  process.exit(1);
}
for (const a of sameRow) {
  if (!(a.x2 > a.x1)) {
    console.error('FAIL: same-row arrows must point left→right', a);
    process.exit(1);
  }
}

const cycle = layoutReactionScheme({
  moleculeCount: 8,
  layout: 'cycle',
  slotPitch: 280,
  labelOffset: 90,
  originX: 0,
  originY: 0,
});

if (cycle.molecules.length !== 8 || cycle.arrows.length !== 8) {
  console.error('FAIL: cycle should close with n arrows', {
    mols: cycle.molecules.length,
    arrows: cycle.arrows.length,
  });
  process.exit(1);
}

for (const a of cycle.arrows) {
  if (a.kind !== 'cycle_arc') {
    console.error('FAIL: cycle arrows must be cycle_arc', a);
    process.exit(1);
  }
  if (a.cx == null || a.cy == null) {
    console.error('FAIL: cycle_arc needs center', a);
    process.exit(1);
  }
  if (Math.hypot(a.cx, a.cy) > 1) {
    console.error('FAIL: expected cycle center at origin', a);
    process.exit(1);
  }
  const r1 = Math.hypot(a.x1 - a.cx, a.y1 - a.cy);
  const r2 = Math.hypot(a.x2 - a.cx, a.y2 - a.cy);
  if (Math.abs(r1 - r2) > 1) {
    console.error('FAIL: cycle_arc tips should share radius', { r1, r2, a });
    process.exit(1);
  }
}

// Molecules evenly spaced on a circle (first at top).
const m0 = cycle.molecules[0]!;
if (!(m0.cy < -50) || Math.abs(m0.cx) > 1) {
  console.error('FAIL: first cycle molecule should sit at top', m0);
  process.exit(1);
}

const radii = cycle.molecules.map(m => Math.hypot(m.cx, m.cy));
const r0 = radii[0]!;
for (const r of radii) {
  if (Math.abs(r - r0) > 1) {
    console.error('FAIL: cycle molecules should share radius', radii);
    process.exit(1);
  }
}

console.log('OK', { cycleRadius: r0, cycleArrows: cycle.arrows.length });

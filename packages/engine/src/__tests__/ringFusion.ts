/**
 * Ring fusion / atom-attach smoke — run: npx tsx src/engine/__tests__/ringFusion.ts
 */
import { addRing } from '@moldraw/core/molecule/mutations';
import { computeRingFusionGeometry, atomRootedRingGeometry } from '@moldraw/canvas/interaction/toolRing';
import { pickAtomOrBondForRingTool } from '@moldraw/canvas/interaction/hitTest';
import { bestRingAttachGrowAngle } from '@moldraw/canvas/geometry';
import type { Molecule } from '@moldraw/domain';

const B = 45;
let failed = 0;
const check = (name: string, ok: boolean, detail?: string) => {
  if (ok) console.log(`  ✓ ${name}`);
  else {
    failed++;
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
  }
};

console.log('Ring fusion / atom-attach\n');

const r = B / (2 * Math.sin(Math.PI / 6));
let mol: Molecule = { atoms: [], bonds: [] };
mol = addRing(mol, {
  center: { x: 200, y: 200 },
  numSides: 6,
  isAromatic: true,
  angleOffset: -Math.PI / 2,
  radius: r,
});
check('benzene: 6 atoms', mol.atoms.length === 6, `${mol.atoms.length}`);
check('benzene: 6 bonds', mol.bonds.length === 6, `${mol.bonds.length}`);

const bond = mol.bonds[0];
const a1 = mol.atoms.find(a => a.id === bond.fromAtomId)!;
const a2 = mol.atoms.find(a => a.id === bond.toAtomId)!;
const geom = computeRingFusionGeometry(a1, a2, { x: a1.x + 80, y: a1.y }, 6)!;
check('fusion geom computed', geom != null);

const fused = addRing(mol, {
  center: geom.center,
  numSides: 6,
  isAromatic: true,
  angleOffset: geom.angleOffset,
  fusedBondId: bond.id,
  angleStep: geom.angleStep,
  radius: geom.radius,
});
// Side-to-side fusion shares 2 atoms → 6+6-2 = 10
check('fused: 10 atoms', fused.atoms.length === 10, `${fused.atoms.length}`);
check('fused: 11 bonds', fused.bonds.length === 11, `${fused.bonds.length}`);

const root = mol.atoms[0];
const drag = -Math.PI / 2;
const end = { x: root.x + Math.cos(drag) * B, y: root.y + Math.sin(drag) * B };
const center = { x: end.x + r * Math.cos(drag), y: end.y + r * Math.sin(drag) };
const attached = addRing(mol, {
  center,
  numSides: 6,
  isAromatic: false,
  angleOffset: drag + Math.PI,
  rootAtomId: root.id,
  attachedViaBond: true,
  radius: r,
});
check('atom-attach: 12 atoms (6 existing + 6 new)', attached.atoms.length === 12, `${attached.atoms.length}`);
const link = attached.bonds.find(
  b =>
    (b.fromAtomId === root.id || b.toAtomId === root.id) &&
    b.order === 1 &&
    ![bond.fromAtomId, bond.toAtomId].includes(
      b.fromAtomId === root.id ? b.toAtomId : b.fromAtomId,
    ),
);
// Connector must link root to a newly created ring atom (not an existing ring neighbor).
const newAtomIds = new Set(attached.atoms.filter(a => !mol.atoms.some(o => o.id === a.id)).map(a => a.id));
const connector = attached.bonds.find(
  b =>
    b.order === 1 &&
    ((b.fromAtomId === root.id && newAtomIds.has(b.toAtomId)) ||
      (b.toAtomId === root.id && newAtomIds.has(b.fromAtomId))),
);
check('atom-attach: single-bond connector to new ring', !!connector);

const mid = { x: (a1.x + a2.x) / 2, y: (a1.y + a2.y) / 2 };
const nearEnd = {
  x: a1.x + (a2.x - a1.x) * 0.05,
  y: a1.y + (a2.y - a1.y) * 0.05,
};
const midHit = pickAtomOrBondForRingTool(mol, mid);
const endHit = pickAtomOrBondForRingTool(mol, nearEnd);
check('mid-shaft → bond (fusion)', !!midHit.bond && !midHit.atom);
check('near endpoint → atom (attach)', !!endHit.atom && !endHit.bond);

const angBetween = (a: number, b: number): number => {
  const d = Math.abs(a - b) % (Math.PI * 2);
  return Math.min(d, Math.PI * 2 - d);
};

console.log('\nVertex-fuse orientation (click on bond end)\n');

const ethane: Molecule = {
  atoms: [
    { id: 'c0', element: 'C', x: 0, y: 0, charge: 0 },
    { id: 'c1', element: 'C', x: B, y: 0, charge: 0 },
  ],
  bonds: [{ id: 'e0', fromAtomId: 'c0', toAtomId: 'c1', order: 1 }],
};
const growRight = bestRingAttachGrowAngle(ethane.atoms[1]!, ethane);
check(
  '1 neighbour → grow opposite (0 rad)',
  Math.abs(growRight) < 1e-9 || Math.abs(growRight - Math.PI * 2) < 1e-9,
  `${growRight}`,
);
check('0 neighbours → grow 0 (right)', bestRingAttachGrowAngle(ethane.atoms[0]!, { atoms: [ethane.atoms[0]!], bonds: [] }) === 0);

const geomPh = atomRootedRingGeometry({
  startAtom: ethane.atoms[1]!,
  growAngle: growRight,
  numSides: 6,
  bondLengthPx: B,
  attachedViaBond: false,
});
check(
  'phenyl centre on substituent axis, away from c0',
  Math.abs(geomPh.center.y) < 1e-6 && geomPh.center.x > B,
  `center=(${geomPh.center.x.toFixed(2)},${geomPh.center.y.toFixed(2)})`,
);

const toluene = addRing(ethane, {
  center: geomPh.center,
  numSides: 6,
  isAromatic: true,
  angleOffset: geomPh.angleOffset,
  rootAtomId: 'c1',
  attachedViaBond: false,
  radius: geomPh.radius,
});
check('toluene: 7 atoms', toluene.atoms.length === 7, `${toluene.atoms.length}`);
check('toluene: 7 bonds', toluene.bonds.length === 7, `${toluene.bonds.length}`);

const c1 = toluene.atoms.find(a => a.id === 'c1')!;
const c1Nbrs = toluene.bonds
  .filter(b => b.fromAtomId === 'c1' || b.toAtomId === 'c1')
  .map(b => toluene.atoms.find(a => a.id === (b.fromAtomId === 'c1' ? b.toAtomId : b.fromAtomId))!);
check('toluene: shared C has 3 neighbours', c1Nbrs.length === 3, `${c1Nbrs.length}`);
const nbrAngles = c1Nbrs.map(n => Math.atan2(n.y - c1.y, n.x - c1.x)).sort((p, q) => p - q);
const gaps120 = [0, 1, 2].map(i =>
  angBetween(nbrAngles[i]!, nbrAngles[(i + 1) % 3]!),
);
check(
  'toluene: 120°/120°/120° at shared vertex',
  gaps120.every(g => Math.abs(g - (2 * Math.PI) / 3) < 0.04),
  gaps120.map(g => ((g * 180) / Math.PI).toFixed(1)).join(', '),
);
const subToC0 = Math.atan2(0 - c1.y, 0 - c1.x);
const toCenter = Math.atan2(geomPh.center.y - c1.y, geomPh.center.x - c1.x);
check(
  'neighbour → atom → centre collinear',
  angBetween(subToC0 + Math.PI, toCenter) < 0.02,
  `sub=${subToC0.toFixed(3)} grow=${toCenter.toFixed(3)}`,
);

const geom5 = atomRootedRingGeometry({
  startAtom: ethane.atoms[1]!,
  growAngle: growRight,
  numSides: 5,
  bondLengthPx: B,
  attachedViaBond: false,
});
const cyclopentane = addRing(ethane, {
  center: geom5.center,
  numSides: 5,
  isAromatic: false,
  angleOffset: geom5.angleOffset,
  rootAtomId: 'c1',
  attachedViaBond: false,
  radius: geom5.radius,
});
const p1 = cyclopentane.atoms.find(a => a.id === 'c1')!;
const pNbrs = cyclopentane.bonds
  .filter(b => b.fromAtomId === 'c1' || b.toAtomId === 'c1')
  .map(b =>
    cyclopentane.atoms.find(a => a.id === (b.fromAtomId === 'c1' ? b.toAtomId : b.fromAtomId))!,
  );
const ringNbrs = pNbrs.filter(n => n.id !== 'c0');
const sub = Math.atan2(0 - p1.y, 0 - p1.x);
const rAng = ringNbrs.map(n => Math.atan2(n.y - p1.y, n.x - p1.x));
const interiorHalf = (((5 - 2) / 5) * Math.PI) / 2;
const want = Math.PI - interiorHalf;
check('cyclopentane: 2 new ring neighbours', ringNbrs.length === 2, `${ringNbrs.length}`);
check(
  'cyclopentane: ring bonds symmetric about substituent',
  Math.abs(angBetween(sub, rAng[0]!) - angBetween(sub, rAng[1]!)) < 0.04,
  `${((angBetween(sub, rAng[0]!) * 180) / Math.PI).toFixed(1)} vs ${((angBetween(sub, rAng[1]!) * 180) / Math.PI).toFixed(1)}`,
);
check(
  'cyclopentane: substituent–ring ≈ 126°',
  Math.abs(angBetween(sub, rAng[0]!) - want) < 0.04,
  `${((angBetween(sub, rAng[0]!) * 180) / Math.PI).toFixed(1)}`,
);

const crowded: Molecule = {
  atoms: [
    { id: 'a', element: 'C', x: 0, y: 0, charge: 0 },
    { id: 'b', element: 'C', x: B, y: 0, charge: 0 },
    { id: 'c', element: 'C', x: 0, y: B, charge: 0 },
  ],
  bonds: [
    { id: 'ab', fromAtomId: 'a', toAtomId: 'b', order: 1 },
    { id: 'ac', fromAtomId: 'a', toAtomId: 'c', order: 1 },
  ],
};
const growGap = bestRingAttachGrowAngle(crowded.atoms[0]!, crowded);
// Neighbours at 0 and π/2; largest gap is 270° from π/2 → 2π, bisector = π/2 + 1.5π/2 wait:
// sorted dirs: 0, π/2. Gaps: π/2, and 2π-π/2=3π/2. Bisector of 3π/2 gap starting at π/2: π/2 + 3π/4 = 5π/4.
check(
  '2 neighbours → largest-gap bisector (5π/4)',
  angBetween(growGap, (5 * Math.PI) / 4) < 0.02,
  `${growGap}`,
);

console.log(`\n${failed === 0 ? 'All passed' : `${failed} failed`}`);
if (failed > 0) process.exit(1);

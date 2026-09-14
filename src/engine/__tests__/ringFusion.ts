/**
 * Ring fusion / atom-attach smoke — run: npx tsx src/engine/__tests__/ringFusion.ts
 */
import { addRing } from '@moldraw/core/molecule/mutations';
import { computeRingFusionGeometry } from '@moldraw/canvas/interaction/toolRing';
import { pickAtomOrBondForRingTool } from '@moldraw/canvas/interaction/hitTest';
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

console.log(`\n${failed === 0 ? 'All passed' : `${failed} failed`}`);
if (failed > 0) process.exit(1);

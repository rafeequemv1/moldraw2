/**
 * MOL export retains perspective3D z (and x/y) coordinates.
 * Run: npx tsx packages/core/src/__tests__/molblockPerspectiveExport.ts
 */
import { addRing } from '../molecule/mutations';
import { apply3DPose } from '../molecule/perspective3D';
import { moleculeToMolblock } from '../io/molblock';
import type { Molecule } from '@moldraw/domain';

const empty: Molecule = { atoms: [], bonds: [] };

let mol = addRing(empty, {
  center: { x: 100, y: 100 },
  numSides: 6,
  isAromatic: false,
  angleOffset: -Math.PI / 2,
  radius: 40,
});

const positions: Record<string, { x: number; y: number; z: number }> = {};
mol.atoms.forEach((a, i) => {
  positions[a.id] = { x: a.x + 5, y: a.y - 3, z: (i % 2 === 0 ? 18 : -12) + i * 2 };
});
mol = apply3DPose(mol, { positions, depthShading: true, depthFade: 1 });

const mb = moleculeToMolblock(mol);
const lines = mb.split(/\r?\n/);
const counts = lines[3];
if (!counts) {
  console.error('FAIL: missing counts line');
  process.exit(1);
}
const nAtoms = parseInt(counts.slice(0, 3).trim() || '0', 10);
const atomLines = lines.slice(4, 4 + nAtoms);

const zs = atomLines.map(line => parseFloat(line.slice(20, 30).trim() || '0'));
const zSpan = Math.max(...zs) - Math.min(...zs);
if (!Number.isFinite(zSpan) || zSpan < 0.01) {
  console.error('FAIL: exported molfile has flat z coordinates', { zs, zSpan });
  process.exit(1);
}

const flatMb = moleculeToMolblock({ atoms: mol.atoms, bonds: mol.bonds });
const flatZs = flatMb
  .split(/\r?\n/)
  .slice(4, 4 + nAtoms)
  .map(line => parseFloat(line.slice(20, 30).trim() || '0'));
if (flatZs.some(z => Math.abs(z) > 1e-6)) {
  console.error('FAIL: flat export should keep z = 0', flatZs);
  process.exit(1);
}

console.log('PASS: perspective MOL export retains 3D z span', {
  atoms: nAtoms,
  zMin: Math.min(...zs).toFixed(3),
  zMax: Math.max(...zs).toFixed(3),
  zSpan: zSpan.toFixed(3),
});

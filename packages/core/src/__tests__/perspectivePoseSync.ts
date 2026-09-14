/**
 * New rings/chains join an active perspective3D pose.
 * Run: npx tsx packages/core/src/__tests__/perspectivePoseSync.ts
 */
import { addChain, addRing } from '../molecule/mutations';
import {
  apply3DPose,
  hasPerspectivePose,
  joinAtomsIntoPerspectivePose,
  projectPerspectiveForDisplay,
} from '../molecule/perspective3D';
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
  positions[a.id] = { x: a.x + 10, y: a.y - 5, z: i % 2 === 0 ? 20 : -20 };
});
mol = apply3DPose(mol, { positions, depthShading: true, depthFade: 1 });

if (!hasPerspectivePose(mol)) {
  console.error('FAIL: pose not applied');
  process.exit(1);
}

const before = Object.keys(mol.perspective3D!.positions).length;
const display = projectPerspectiveForDisplay(mol).molecule;
const center = {
  x: display.atoms.reduce((s, a) => s + a.x, 0) / display.atoms.length + 80,
  y: display.atoms.reduce((s, a) => s + a.y, 0) / display.atoms.length,
};

mol = addRing(mol, {
  center,
  numSides: 5,
  isAromatic: false,
  angleOffset: -Math.PI / 2,
  radius: 36,
});

const after = Object.keys(mol.perspective3D!.positions).length;
if (after <= before) {
  console.error('FAIL: new ring atoms not joined to pose', { before, after });
  process.exit(1);
}

const missing = mol.atoms.filter(a => !mol.perspective3D!.positions[a.id]);
if (missing.length) {
  console.error(
    'FAIL: atoms missing from pose',
    missing.map(a => a.id),
  );
  process.exit(1);
}

const root = mol.atoms[0]!;
// Use display root for chain start when pose active
const dRoot = projectPerspectiveForDisplay(mol).molecule.atoms.find(a => a.id === root.id)!;
mol = addChain(
  mol,
  [
    { x: dRoot.x, y: dRoot.y },
    { x: dRoot.x + 40, y: dRoot.y },
    { x: dRoot.x + 60, y: dRoot.y + 35 },
  ],
  'C',
  root.id,
);

const stillMissing = mol.atoms.filter(a => !mol.perspective3D!.positions[a.id]);
if (stillMissing.length) {
  console.error(
    'FAIL: chain atoms missing from pose',
    stillMissing.map(a => a.id),
  );
  process.exit(1);
}

const joined = joinAtomsIntoPerspectivePose(
  {
    ...mol,
    atoms: [
      ...mol.atoms,
      { id: 'extra1', element: 'C', x: 0, y: 0, charge: 0 },
    ],
  },
  ['extra1'],
  [root.id],
);
const zNear = mol.perspective3D!.positions[root.id]!.z;
const zNew = joined.perspective3D!.positions['extra1']!.z;
if (Math.abs(zNew - zNear) > 1e-6) {
  console.error('FAIL: z should match near atom', { zNew, zNear });
  process.exit(1);
}

console.log('PASS: rings/chains join perspective pose', {
  atoms: mol.atoms.length,
  poseAtoms: Object.keys(mol.perspective3D!.positions).length,
});

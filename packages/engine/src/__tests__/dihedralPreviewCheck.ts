/**
 * Quick check: Phase-A-only vs UFF dihedrals. Run:
 *   npx tsx src/engine/__tests__/dihedralPreviewCheck.ts
 */
import { engine } from '../index';
import { generate3DMolblock, generate3DConformerResults } from '@moldraw/engine-3d';
import { embed3D } from '@moldraw/engine-3d/embed';

type V = { x: number; y: number; z: number };
const sub = (a: V, b: V): V => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const cross = (a: V, b: V): V => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});
const dot = (a: V, b: V): number => a.x * b.x + a.y * b.y + a.z * b.z;
const dihedralCos = (a: V, b: V, c: V, d: V): number => {
  const b1 = sub(b, a);
  const b2 = sub(c, b);
  const b3 = sub(d, c);
  const n1 = cross(b1, b2);
  const n2 = cross(b2, b3);
  return dot(n1, n2) / (Math.hypot(n1.x, n1.y, n1.z) * Math.hypot(n2.x, n2.y, n2.z));
};

const cisButene = {
  atoms: [
    { id: 'C1', element: 'C', x: 0, y: 0, charge: 0 },
    { id: 'C2', element: 'C', x: 100, y: 0, charge: 0 },
    { id: 'M1', element: 'C', x: -50, y: 87, charge: 0 },
    { id: 'M2', element: 'C', x: 150, y: 87, charge: 0 },
  ],
  bonds: [
    { id: 'd', fromAtomId: 'C1', toAtomId: 'C2', order: 2 },
    { id: 's1', fromAtomId: 'C1', toAtomId: 'M1', order: 1 },
    { id: 's2', fromAtomId: 'C2', toAtomId: 'M2', order: 1 },
  ],
};

for (const ff of ['none', 'uff'] as const) {
  const conf = embed3D(cisButene, { includeHydrogens: true, forceField: ff, iterations: 150, maxIterations: 200 });
  const pos = new Map(conf.atoms.map(a => [a.id, a.pos]));
  const cos = dihedralCos(pos.get('M1')!, pos.get('C1')!, pos.get('C2')!, pos.get('M2')!);
  console.log(`${ff} cis-butene cos=${cos.toFixed(3)} (want > 0.5)`);
}

const but = engine.parseSmiles('CCCC');
for (const ff of ['none', 'uff'] as const) {
  const conf = embed3D(but, { includeHydrogens: true, forceField: ff, iterations: 150, maxIterations: 200 });
  const cs = conf.atoms.filter(a => a.element === 'C');
  const cos = dihedralCos(cs[0].pos, cs[1].pos, cs[2].pos, cs[3].pos);
  console.log(`${ff} butane cos=${cos.toFixed(3)} (anti want < -0.4)`);
}

const c1 = generate3DConformerResults(but, { count: 1, includeHydrogens: true });
const c8 = generate3DConformerResults(but, { count: 8, seed: 7, includeHydrogens: true });
const g3d = generate3DMolblock(but, { includeHydrogens: true, count: 8, seed: 7 });
console.log(`generate3DConformers count=1 energy=${c1[0]?.energy?.toFixed(2)}`);
console.log(`generate3DConformers count=8 best=${c8[0]?.energy?.toFixed(2)} n=${c8.length}`);
console.log(`generate3D (count=8) molblock len=${g3d.length}`);

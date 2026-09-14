/**
 * Multi-conformer sampling checks. Run with:
 *   npx tsx src/engine/__tests__/sanityConformers.ts
 */
import { engine } from '../index';
import { generate3DMolblock, generate3DConformerResults } from '@moldraw/engine-3d';
import { generateConformers } from '@moldraw/engine-3d/conformers';

let passed = 0;
let failed = 0;
const check = (name: string, cond: boolean, detail?: unknown): void => {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.error(`  ✗ ${name}`, detail !== undefined ? JSON.stringify(detail) : '');
  }
};

type V = { x: number; y: number; z: number };
const sub = (a: V, b: V): V => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const cross = (a: V, b: V): V => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});
const dot = (a: V, b: V): number => a.x * b.x + a.y * b.y + a.z * b.z;
const dihedral = (a: V, b: V, c: V, d: V): number => {
  const n1 = cross(sub(b, a), sub(c, b));
  const n2 = cross(sub(c, b), sub(d, c));
  return dot(n1, n2) / (Math.hypot(n1.x, n1.y, n1.z) * Math.hypot(n2.x, n2.y, n2.z));
};

console.log('Multi-conformer sampling\n');

// n-Butane: should find distinct rotamers; anti (lowest) has C–C–C–C ≈ 180°.
{
  const results = generateConformers(engine.parseSmiles('CCCC'), { count: 16, includeHydrogens: true, seed: 7 });
  check('butane: at least 2 distinct conformers', results.length >= 2, results.length);
  const energies = results.map(r => r.energy);
  const sorted = energies.every((e, i) => i === 0 || e >= energies[i - 1] - 1e-6);
  check('butane: conformers sorted by energy (low→high)', sorted, energies.map(e => +e.toFixed(2)));
  check('butane: all energies finite', energies.every(e => Number.isFinite(e)));

  const best = results[0].conformer;
  const c = best.atoms.filter(a => a.element === 'C');
  const cosDih = dihedral(c[0].pos, c[1].pos, c[2].pos, c[3].pos);
  check('butane: lowest-energy conformer is anti (dihedral ≈ 180°)', cosDih < -0.4, cosDih);
}

// Ethanol conformers via the engine surface (molblocks + energies).
{
  const confs = generate3DConformerResults(engine.parseSmiles('CCO'), { count: 8, seed: 3 });
  check('ethanol: engine returns ranked molblocks', confs.length >= 1, confs.length);
  check('ethanol: molblocks well-formed (M  END)', confs.every(c => c.molblock.includes('M  END')));
  check('ethanol: no NaN coordinates', confs.every(c => !c.molblock.includes('NaN')));
  const asc = confs.every((c, i) => i === 0 || c.energy >= confs[i - 1].energy - 1e-6);
  check('ethanol: energies ascending', asc, confs.map(c => +c.energy.toFixed(2)));
}

// Ring system still works (cyclohexane) and returns a low-energy chair.
{
  const results = generateConformers(engine.parseSmiles('C1CCCCC1'), { count: 8, includeHydrogens: false, seed: 5 });
  check('cyclohexane: conformers generated w/o NaN', results.length >= 1 && results.every(r => Number.isFinite(r.energy)));
  const zs = results[0].conformer.atoms.map(a => a.pos.z);
  check('cyclohexane: best conformer puckers (chair)', Math.max(...zs) - Math.min(...zs) > 0.3);
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);

/**
 * Region 3D refine: local edit should be faster than full recompute and keep
 * frozen atoms stable.
 *
 * Run: npx tsx src/engine/__tests__/region3dRefine.ts
 */
import { nativeEngine as engine } from '../nativeEngine';
import { generate3DMolblock, generate3DConformerResults } from '@moldraw/engine-3d';
import { dirtyAtomIdsFromEdit, refine3DRegion } from '@moldraw/engine-3d/refineRegion';
import type { Molecule } from '@moldraw/domain';

const PACLITAXEL =
  'CC1=C2[C@@]([C@]([C@H]([C@@H]3[C@]4([C@H](OC4)C[C@@H]([C@]3(C(=O)[C@@H]2OC(=O)C)C)O)OC(=O)C)OC(=O)c5ccccc5)(C[C@@H]1OC(=O)[C@H](O)[C@@H](NC(=O)c6ccccc6)c7ccccc7)O)(C)C';

const parseZ = (mb: string) => {
  const lines = mb.split(/\r?\n/);
  const n = parseInt(lines[3]!.slice(0, 3), 10);
  const coords: { e: string; x: number; y: number; z: number }[] = [];
  for (let i = 0; i < n; i++) {
    const L = lines[4 + i]!;
    coords.push({
      e: L.slice(31, 34).trim(),
      x: +L.slice(0, 10),
      y: +L.slice(10, 20),
      z: +L.slice(20, 30),
    });
  }
  return coords;
};

const rmsdHeavy = (a: string, b: string): number => {
  const A = parseZ(a).filter(p => p.e !== 'H');
  const B = parseZ(b).filter(p => p.e !== 'H');
  const n = Math.min(A.length, B.length);
  if (n === 0) return Infinity;
  let s = 0;
  for (let i = 0; i < n; i++) {
    s += (A[i]!.x - B[i]!.x) ** 2 + (A[i]!.y - B[i]!.y) ** 2 + (A[i]!.z - B[i]!.z) ** 2;
  }
  return Math.sqrt(s / n);
};

/** Change one terminal oxygen-ish atom element on a copy (local edit). */
const tweakOneAtom = (mol: Molecule): Molecule => {
  const oxy = mol.atoms.find(a => a.element === 'O');
  if (!oxy) throw new Error('no O');
  return {
    ...mol,
    atoms: mol.atoms.map(a => (a.id === oxy.id ? { ...a, element: 'S' as const } : a)),
  };
};

let failed = 0;
const assert = (cond: boolean, msg: string) => {
  if (!cond) {
    failed += 1;
    console.error('FAIL:', msg);
  } else {
    console.log('OK:  ', msg);
  }
};

const main = () => {
  console.log('=== Region 3D refine (edit neighborhood) ===\n');

  const mol = engine.generate2D(engine.parseSmiles(PACLITAXEL));
  const heavy = mol.atoms.filter(a => a.element !== 'H').length;
  console.log(`paclitaxel heavy=${heavy}`);

  let t = Date.now();
  const fullMb = generate3DMolblock(mol, {
    includeHydrogens: true,
    iterations: 60,
    count: 1,
    maxIterations: 100,
  });
  const fullMs = Date.now() - t;
  console.log(`full UFF: ${fullMs}ms`);

  const edited = tweakOneAtom(mol);
  const edit = dirtyAtomIdsFromEdit(mol, edited);
  assert(edit.dirtyAtomIds.length >= 1, `dirty atoms detected (${edit.dirtyAtomIds.length})`);
  assert(!edit.majorChange, 'O→S is not a major change');

  t = Date.now();
  const region = refine3DRegion(edited, {
    dirtyAtomIds: edit.dirtyAtomIds,
    previousMolblock3D: fullMb,
    includeHydrogens: true,
    bondBuffer: 2,
    maxIterations: 28,
  });
  const regionMs = Date.now() - t;
  console.log(
    `region refine: ${regionMs}ms movable=${region.movableCount}/${region.atomCount} source=${region.source}`,
  );

  assert(region.source === 'native-3d-region', `used region path (got ${region.source})`);
  assert(region.movableCount < region.atomCount * 0.5, 'moved less than half the atoms');
  assert(regionMs < 120 || regionMs < fullMs * 0.4, `region fast (${regionMs}ms vs full ${fullMs}ms)`);

  // Frozen atoms should stay nearly identical to previous conformer.
  const drift = rmsdHeavy(fullMb, region.molblock);
  // After O→S the local region moves; overall heavy RMSD should still be modest.
  assert(drift < 1.5, `overall heavy RMSD vs previous < 1.5 Å (got ${drift.toFixed(3)})`);

  t = Date.now();
  const fullAfterEdit = generate3DMolblock(edited, {
    includeHydrogens: true,
    iterations: 60,
    count: 1,
    maxIterations: 100,
  });
  const fullEditMs = Date.now() - t;
  const vsFull = rmsdHeavy(region.molblock, fullAfterEdit);
  console.log(`full recompute after edit: ${fullEditMs}ms; region vs full RMSD=${vsFull.toFixed(3)} Å`);
  assert(vsFull < 2.5, `region close to full recompute (RMSD ${vsFull.toFixed(3)} Å)`);
  assert(regionMs < fullEditMs, `region faster than full after edit (${regionMs} < ${fullEditMs})`);

  if (failed > 0) {
    console.error(`\n${failed} failed`);
    process.exit(1);
  }
  console.log('\nRegion refine OK — faster local 3D update.');
};

main();

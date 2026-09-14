/**
 * Progressive BFS 3D — heavy-only UFF, H placed after.
 * Run: npx tsx src/engine/__tests__/progressive3d.ts
 */
import { nativeEngine as engine } from '../nativeEngine';
import { generate3DMolblock, generate3DConformerResults } from '@moldraw/engine-3d';
import { embed3DProgressive, bfsShells, pickCenterAtomId } from '@moldraw/engine-3d/progressiveEmbed';

const PACLITAXEL =
  'CC1=C2[C@@]([C@]([C@H]([C@@H]3[C@]4([C@H](OC4)C[C@@H]([C@]3(C(=O)[C@@H]2OC(=O)C)C)O)OC(=O)C)OC(=O)c5ccccc5)(C[C@@H]1OC(=O)[C@H](O)[C@@H](NC(=O)c6ccccc6)c7ccccc7)O)(C)C';

let failed = 0;
const assert = (cond: boolean, msg: string) => {
  if (!cond) {
    failed += 1;
    console.error('FAIL:', msg);
  } else {
    console.log('OK:  ', msg);
  }
};

const atomCount = (mb: string): number =>
  parseInt(mb.split(/\r?\n/)[3]?.slice(0, 3) ?? '0', 10);

const zRange = (mb: string): number => {
  const lines = mb.split(/\r?\n/);
  const n = atomCount(mb);
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (let i = 0; i < n; i++) {
    const z = parseFloat(lines[4 + i]!.slice(20, 30));
    if (!Number.isFinite(z)) continue;
    minZ = Math.min(minZ, z);
    maxZ = Math.max(maxZ, z);
  }
  return maxZ - minZ;
};

const main = () => {
  console.log('=== Progressive BFS 3D (heavy-only UFF) ===\n');
  const mol = engine.generate2D(engine.parseSmiles(PACLITAXEL));
  const heavy = mol.atoms.filter(a => a.element !== 'H').length;
  const center = pickCenterAtomId(mol)!;
  const shells = bfsShells(mol, center);
  console.log(`heavy=${heavy} center=${center} shells=${shells.length}`);
  console.log(
    '  shell sizes:',
    shells.map((s, i) => `${i}:${s.length}`).join(' '),
  );
  assert(shells.length >= 3, `enough shells for progressive build (${shells.length})`);
  assert(shells[0]!.length === 1, 'shell 0 is the center atom');

  const progress: { shell: number; atoms: number; ms: number }[] = [];
  const t0 = Date.now();
  let lastT = t0;
  const result = embed3DProgressive(mol, {
    includeHydrogens: true,
    shellIterations: 28,
    finalIterations: 72,
    shellBuffer: 2,
    onProgress: u => {
      const now = Date.now();
      const n = atomCount(u.molblock);
      progress.push({ shell: u.shell, atoms: n, ms: now - lastT });
      lastT = now;
      console.log(
        `  shell ${u.shell}/${u.shellCount}  atoms=${n}  +${progress[progress.length - 1]!.ms}ms  frac=${u.fraction.toFixed(2)}${u.done ? ' DONE' : ''}`,
      );
    },
  });
  const total = Date.now() - t0;
  console.log(`\ntotal ${total}ms  source=${result.source} shells=${result.shellCount}`);

  assert(result.molblock.length > 100, 'final molblock non-empty');
  assert(progress.length >= shells.length, `streamed ≥${shells.length} updates (got ${progress.length})`);
  assert(progress[0]!.shell === 0 || progress[0]!.shell === 1, 'starts with early shell / flat seed');
  assert(
    progress.every(p => p.ms < 800),
    'each shell step < 800ms (small segments)',
  );
  assert(total < 4000, `total under 4s (got ${total}ms)`);

  // Display frames include H (heavy + H > heavy-only count).
  const finalAtoms = atomCount(result.molblock);
  assert(finalAtoms > heavy, `final has H attached (${finalAtoms} > ${heavy})`);
  assert(zRange(result.molblock) > 2, `non-flat 3D (zRange=${zRange(result.molblock).toFixed(2)})`);

  // Peak per-shell load should stay well under a full with-H UFF.
  const tFull = Date.now();
  generate3DMolblock(mol, { includeHydrogens: true, count: 1, maxIterations: 100, iterations: 60 });
  const fullMs = Date.now() - tFull;
  const maxShell = Math.max(...progress.map(p => p.ms));
  console.log(`full UFF(with H) ${fullMs}ms; max shell step ${maxShell}ms; progressive total ${total}ms`);
  assert(maxShell < fullMs * 0.7 || maxShell < 400, 'peak shell load lower than full UFF');
  assert(total < fullMs * 1.2 || total < 1500, 'progressive not slower than full UFF');

  if (failed > 0) {
    console.error(`\n${failed} failed`);
    process.exit(1);
  }
  console.log('\nProgressive heavy-only 3D OK.');
};

main();

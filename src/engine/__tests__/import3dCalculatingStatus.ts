/**
 * Post-import 3D calculating status.
 * Run: npx tsx src/engine/__tests__/import3dCalculatingStatus.ts
 *
 * Checks that after import the UI would show Calculating… while the worker
 * refine runs, then settles to a non-Failed status — for small and mid-size
 * molecules (including paclitaxel-scale).
 */
import { nativeEngine as engine } from '../nativeEngine';
import { generate3DMolblock, generate3DConformerResults } from '@moldraw/engine-3d';

/** Same limits as @moldraw/engine-3d choose3DUpdatePath. */
const NATIVE_3D_FULL_HEAVY_LIMIT = 400;
const NATIVE_3D_PREVIEW_HEAVY_LIMIT = 700;

type ComputeStatus = 'idle' | 'preview' | 'computing' | 'ready' | 'error' | 'large';

const STATUS_LABEL: Record<ComputeStatus, string> = {
  idle: '3D',
  preview: 'Preview',
  computing: 'Calculating…',
  ready: 'Native',
  error: 'Failed',
  large: 'Large',
};

const FIXTURES: { name: string; smiles: string }[] = [
  { name: 'ethanol', smiles: 'CCO' },
  { name: 'aspirin', smiles: 'CC(=O)Oc1ccccc1C(=O)O' },
  {
    name: 'paclitaxel',
    smiles:
      'CC1=C2[C@@]([C@]([C@H]([C@@H]3[C@]4([C@H](OC4)C[C@@H]([C@]3(C(=O)[C@@H]2OC(=O)C)C)O)OC(=O)C)OC(=O)c5ccccc5)(C[C@@H]1OC(=O)[C@H](O)[C@@H](NC(=O)c6ccccc6)c7ccccc7)O)(C)C',
  },
];

/** App.tsx: status immediately after import (before worker reply). */
const statusAfterImport = (heavyCount: number): ComputeStatus => {
  const willRefine = heavyCount <= NATIVE_3D_FULL_HEAVY_LIMIT;
  if (heavyCount > NATIVE_3D_PREVIEW_HEAVY_LIMIT) return 'large';
  if (heavyCount > 50) return willRefine ? 'computing' : 'large';
  return willRefine ? 'computing' : 'preview';
};

/** Worker GENERATE_3D tier matching moleculeEngineWorker.ts */
const workerGenerate3D = (
  molBlock: string,
  heavyCount: number,
): { molBlock3D: string; source: string; ms: number } => {
  const t0 = Date.now();
  const source = engine.parseMolblock(molBlock);
  if (source.atoms.length === 0) throw new Error('Invalid MolBlock');

  let molBlock3D = '';
  let sourceLabel = 'native-3d';

  const tryGen = (opts: Parameters<typeof generate3DMolblock>[1], label: string): boolean => {
    try {
      molBlock3D = generate3DMolblock(source, opts);
      sourceLabel = label;
      return true;
    } catch {
      return false;
    }
  };

  let ok = false;
  if (heavyCount > NATIVE_3D_PREVIEW_HEAVY_LIMIT) {
    molBlock3D = engine.toMolblock(source);
    sourceLabel = 'native-3d-large';
    ok = true;
  } else if (heavyCount > 50) {
    ok =
      tryGen(
        {
          includeHydrogens: true,
          iterations: 60,
          count: 1,
          maxIterations: 100,
        },
        'native-3d',
      ) ||
      tryGen(
        {
          includeHydrogens: true,
          iterations: 40,
          count: 1,
          maxIterations: 40,
          forceField: 'none',
        },
        'native-3d',
      );
    if (!ok) {
      molBlock3D = engine.toMolblock(source);
      sourceLabel = 'native-3d-fallback';
      ok = true;
    }
  } else {
    ok =
      tryGen({ includeHydrogens: true, count: 1, maxIterations: 150 }, 'native-3d') ||
      tryGen(
        { includeHydrogens: false, forceField: 'none', iterations: 25, count: 1 },
        'native-3d-light',
      );
    if (!ok) {
      molBlock3D = engine.toMolblock(source);
      sourceLabel = 'native-3d-fallback';
    }
  }

  return { molBlock3D, source: sourceLabel, ms: Date.now() - t0 };
};

const statusAfterWorkerSuccess = (source: string): ComputeStatus => {
  if (source === 'native-3d-light' || source === 'native-3d-large') return 'large';
  if (source === 'native-3d-fallback') return 'preview';
  return 'ready';
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
  console.log('=== Post-import 3D Calculating status ===\n');

  for (const fix of FIXTURES) {
    console.log(`--- ${fix.name} ---`);
    const mol = engine.parseSmiles(fix.smiles);
    const heavy = mol.atoms.filter(a => a.element !== 'H').length;
    console.log(`  heavy=${heavy}`);

    const afterImport = statusAfterImport(heavy);
    const willRefine = heavy <= NATIVE_3D_FULL_HEAVY_LIMIT;

    if (willRefine) {
      assert(
        afterImport === 'computing',
        `${fix.name}: after import → Calculating… (got ${STATUS_LABEL[afterImport]})`,
      );
    } else {
      assert(
        afterImport === 'large',
        `${fix.name}: after import → Large (got ${STATUS_LABEL[afterImport]})`,
      );
    }

    if (!willRefine) {
      console.log(`  (skip worker refine — above full limit)\n`);
      continue;
    }

    const molBlock = engine.toMolblock(mol);
    const result = workerGenerate3D(molBlock, heavy);
    const budgetMs = heavy > 50 ? 3000 : 15000;
    assert(
      result.ms < budgetMs,
      `${fix.name}: worker refine < ${budgetMs}ms (took ${result.ms}ms)`,
    );
    assert(result.molBlock3D.length > 50, `${fix.name}: non-empty 3D molblock`);

    const afterSuccess = statusAfterWorkerSuccess(result.source);
    assert(
      afterSuccess !== 'error',
      `${fix.name}: final status not Failed (got ${STATUS_LABEL[afterSuccess]})`,
    );

    // Geometry must not be flat z=0 (wrong blue blob in 3Dmol).
    const lines = result.molBlock3D.split(/\r?\n/);
    const nAtoms = parseInt(lines[3]?.slice(0, 3) ?? '0', 10);
    let maxAbsZ = 0;
    for (let i = 0; i < nAtoms; i++) {
      const z = parseFloat(lines[4 + i]?.slice(20, 30) ?? '0');
      maxAbsZ = Math.max(maxAbsZ, Math.abs(z));
    }
    assert(
      maxAbsZ > 0.2,
      `${fix.name}: 3D has out-of-plane coords (max|z|=${maxAbsZ.toFixed(3)})`,
    );

    console.log(
      `  timeline: ${STATUS_LABEL[afterImport]} → ${result.source} (${result.ms}ms) → ${STATUS_LABEL[afterSuccess]} max|z|=${maxAbsZ.toFixed(2)}\n`,
    );
  }

  if (failed > 0) {
    console.error(`${failed} assertion(s) failed`);
    process.exit(1);
  }
  console.log('All checks passed.');
};

main();

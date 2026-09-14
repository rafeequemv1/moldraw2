/**
 * Optional native vs Indigo layout comparison (offline native always; Indigo when WASM loads).
 * Run: npx tsx packages/engine/src/__tests__/nativeVsIndigoLayout.ts
 */
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Molecule } from '@moldraw/domain';
import { nativeEngine as engine } from '../nativeEngine';
import { certifyLayout } from '../layout/certifyLayout';
import { generate2D } from '../layout/generate2d';
import { layoutScore, measureLayoutQuality } from '../layout/layoutQuality';
import { LAYOUT_BENCHMARK_CASES } from './layoutBenchmarkCases';

const BOND = 45;

const layoutNative = (smiles: string): Molecule => {
  const mol = engine.parseSmiles(smiles);
  const seed = generate2D(mol, { bondLengthPx: BOND, skipEnergyRefine: true });
  return certifyLayout(seed, { bondLengthPx: BOND, maxRestarts: 2 }).molecule;
};

const main = async () => {
  let layoutMoleculeIndigo:
    | ((mol: Molecule, opts: { bondLengthPx: number }) => Promise<{ molecule: Molecule }>)
    | null = null;
  try {
    const e2d = await import('@moldraw/engine-2d');
    await e2d.loadIndigo();
    if (e2d.isIndigoReady()) layoutMoleculeIndigo = e2d.layoutMoleculeIndigo;
  } catch {
    /* Indigo optional */
  }

  const rows: Array<{
    name: string;
    tier: string;
    nativeScore: number;
    indigoScore: number | null;
    nativeCrossings: number;
    indigoCrossings: number | null;
  }> = [];

  for (const c of LAYOUT_BENCHMARK_CASES.slice(0, 20)) {
    const nat = layoutNative(c.smiles);
    const nq = measureLayoutQuality(nat);
    let indigoScore: number | null = null;
    let indigoCrossings: number | null = null;
    if (layoutMoleculeIndigo) {
      try {
        const mol = engine.parseSmiles(c.smiles);
        const { molecule } = await layoutMoleculeIndigo(mol, { bondLengthPx: BOND });
        const iq = measureLayoutQuality(molecule);
        indigoScore = layoutScore(molecule);
        indigoCrossings = iq.crossings;
      } catch {
        /* skip */
      }
    }
    rows.push({
      name: c.name,
      tier: c.tier,
      nativeScore: layoutScore(nat),
      indigoScore,
      nativeCrossings: nq.crossings,
      indigoCrossings,
    });
  }

  const out = resolve(import.meta.dirname, 'native-vs-indigo-sample.json');
  writeFileSync(out, JSON.stringify({ generatedAt: new Date().toISOString(), rows }, null, 2));
  console.log(`Wrote ${out} (${rows.length} molecules)`);
  console.log(
    'Native avg score:',
    (rows.reduce((s, r) => s + r.nativeScore, 0) / rows.length).toFixed(2),
  );
};

main().catch(err => {
  console.error(err);
  process.exit(1);
});

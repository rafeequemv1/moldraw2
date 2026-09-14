/**
 * Single-structure 3D scale bench (not multi-conformer).
 * Run: npx tsx --tsconfig tsconfig.node.json src/engine/__tests__/largeMolecule3dBench.ts
 */
import { nativeEngine as engine } from '../nativeEngine';
import { generate3DMolblock } from '@moldraw/engine-3d';
import { embed3DProgressive } from '@moldraw/engine-3d/progressiveEmbed';

const INSULIN_CID = 16129672;
const MAX_PROGRESSIVE_MS = 45_000;

type Row = {
  name: string;
  heavy: number;
  total: number;
  mode: string;
  ms: number;
  ok: boolean;
  zRange: number;
  note?: string;
};

const heavyOf = (mol: { atoms: { element: string }[] }) =>
  mol.atoms.filter(a => a.element !== 'H').length;

const atomCountMb = (mb: string): number =>
  parseInt(mb.split(/\r?\n/)[3]?.slice(0, 3) ?? '0', 10);

const zRangeMb = (mb: string): number => {
  const lines = mb.split(/\r?\n/);
  const n = atomCountMb(mb);
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (let i = 0; i < n; i++) {
    const z = parseFloat(lines[4 + i]!.slice(20, 30));
    if (!Number.isFinite(z)) continue;
    minZ = Math.min(minZ, z);
    maxZ = Math.max(maxZ, z);
  }
  return Number.isFinite(minZ) ? maxZ - minZ : 0;
};

const alkaneSmiles = (nHeavy: number) => 'C'.repeat(Math.max(1, nHeavy));

const runProgressive = (
  mol: ReturnType<typeof engine.parseSmiles>,
  heavy: number,
): { mb: string; ms: number; ok: boolean; mode: string } => {
  const shellIterations = heavy > 350 ? 8 : heavy > 280 ? 12 : heavy > 160 ? 20 : heavy > 50 ? 28 : 40;
  const finalIterations = heavy > 350 ? 24 : heavy > 280 ? 36 : heavy > 160 ? 56 : heavy > 50 ? 72 : 100;
  const t0 = performance.now();
  try {
    const result = embed3DProgressive(mol, {
      includeHydrogens: heavy <= 180,
      shellIterations,
      finalIterations,
      shellBuffer: 2,
      onProgress: () => {
        if (performance.now() - t0 > MAX_PROGRESSIVE_MS) {
          throw new Error(`timeout>${MAX_PROGRESSIVE_MS}ms`);
        }
      },
    });
    return {
      mb: result.molblock,
      ms: performance.now() - t0,
      ok: result.molblock.length > 50,
      mode: `progressive(shell=${shellIterations},final=${finalIterations},H=${heavy <= 180})`,
    };
  } catch (err) {
    return {
      mb: '',
      ms: performance.now() - t0,
      ok: false,
      mode: `progressive-fail: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
};

const runLight = (mol: ReturnType<typeof engine.parseSmiles>): {
  mb: string;
  ms: number;
  ok: boolean;
  mode: string;
} => {
  const t0 = performance.now();
  try {
    const mb = generate3DMolblock(mol, {
      includeHydrogens: false,
      iterations: 20,
      count: 1,
      maxIterations: 20,
      forceField: 'none',
    });
    return { mb, ms: performance.now() - t0, ok: mb.length > 50, mode: 'light(no-FF,20its)' };
  } catch (err) {
    return {
      mb: '',
      ms: performance.now() - t0,
      ok: false,
      mode: `light-fail: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
};

const benchMol = (
  name: string,
  mol2d: ReturnType<typeof engine.parseSmiles>,
  prefer: 'progressive' | 'light' | 'both',
): Row[] => {
  const mol = engine.generate2D(mol2d);
  const heavy = heavyOf(mol);
  const total = mol.atoms.length;
  const rows: Row[] = [];

  if (prefer === 'progressive' || prefer === 'both') {
    const r = runProgressive(mol, heavy);
    rows.push({
      name,
      heavy,
      total,
      mode: r.mode,
      ms: Math.round(r.ms),
      ok: r.ok && zRangeMb(r.mb) > 0.5,
      zRange: r.ok ? Number(zRangeMb(r.mb).toFixed(2)) : 0,
      note: r.ok ? undefined : 'flat or failed',
    });
  }
  if (prefer === 'light' || prefer === 'both') {
    const r = runLight(mol);
    rows.push({
      name: `${name} [light]`,
      heavy,
      total,
      mode: r.mode,
      ms: Math.round(r.ms),
      ok: r.ok && zRangeMb(r.mb) > 0.5,
      zRange: r.ok ? Number(zRangeMb(r.mb).toFixed(2)) : 0,
    });
  }
  return rows;
};

async function fetchInsulinSmiles(): Promise<string | null> {
  try {
    const url = `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/${INSULIN_CID}/property/ConnectivitySMILES,CanonicalSMILES/JSON`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const json = (await res.json()) as {
      PropertyTable?: { Properties?: Array<{ ConnectivitySMILES?: string; CanonicalSMILES?: string }> };
    };
    const p = json.PropertyTable?.Properties?.[0];
    return p?.CanonicalSMILES || p?.ConnectivitySMILES || null;
  } catch {
    return null;
  }
}

const print = (rows: Row[]) => {
  console.log(
    `${'name'.padEnd(28)} ${'heavy'.padStart(6)} ${'total'.padStart(6)} ${'ms'.padStart(8)} ${'zΔ'.padStart(8)} ${'ok'.padStart(4)}  mode`,
  );
  console.log('-'.repeat(110));
  for (const r of rows) {
    console.log(
      `${r.name.slice(0, 28).padEnd(28)} ${String(r.heavy).padStart(6)} ${String(r.total).padStart(6)} ${String(r.ms).padStart(8)} ${String(r.zRange).padStart(8)} ${(r.ok ? 'YES' : 'NO').padStart(4)}  ${r.mode}${r.note ? ` (${r.note})` : ''}`,
    );
  }
};

const main = async () => {
  console.log('=== Single-structure 3D scale bench (conformer sampling OFF) ===\n');
  const rows: Row[] = [];

  for (const n of [60, 120, 180, 250, 280, 350, 405, 500]) {
    const smiles = alkaneSmiles(n);
    const mol = engine.parseSmiles(smiles);
    const prefer = n <= 280 ? 'progressive' : 'both';
    console.log(`\n-- alkane-C${n} (${prefer}) --`);
    rows.push(...benchMol(`alkane-C${n}`, mol, prefer));
    const last = rows[rows.length - 1]!;
    console.log(`  -> heavy=${last.heavy} ms=${last.ms} ok=${last.ok} z=${last.zRange} ${last.mode}`);
  }

  console.log('\nFetching human insulin SMILES from PubChem…');
  const insulinSmiles = await fetchInsulinSmiles();
  if (insulinSmiles) {
    console.log(`  got SMILES length=${insulinSmiles.length}`);
    try {
      const mol = engine.parseSmiles(insulinSmiles);
      console.log(`  parsed heavy=${heavyOf(mol)} total=${mol.atoms.length}`);
      console.log('\n-- insulin-pubchem (both) --');
      rows.push(...benchMol('insulin-pubchem', mol, 'both'));
    } catch (err) {
      console.log(`  parse/embed failed: ${err instanceof Error ? err.message : String(err)}`);
      rows.push({
        name: 'insulin-pubchem',
        heavy: 0,
        total: 0,
        mode: 'parse-fail',
        ms: 0,
        ok: false,
        zRange: 0,
        note: err instanceof Error ? err.message : String(err),
      });
    }
  } else {
    console.log('  PubChem fetch failed — alkane-C405 is the insulin-scale proxy (~405 heavy).');
  }

  console.log('\n');
  print(rows);

  const progressiveOk = rows.filter(r => r.mode.startsWith('progressive') && !r.mode.includes('fail') && r.ok);
  const maxOkHeavy = progressiveOk.reduce((m, r) => Math.max(m, r.heavy), 0);
  console.log(`\nFarthest successful progressive single-structure: ${maxOkHeavy} heavy atoms`);
  const lightOk = rows.filter(r => r.mode.startsWith('light') && r.ok);
  const maxLight = lightOk.reduce((m, r) => Math.max(m, r.heavy), 0);
  console.log(`Farthest successful light single-structure: ${maxLight} heavy atoms`);
};

main().catch(err => {
  console.error(err);
  process.exit(1);
});

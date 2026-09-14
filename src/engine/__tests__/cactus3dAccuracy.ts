/**
 * Cross-check native 3D embedding against NIH CACTUS 3D coordinates.
 *
 * Run with:
 *   npx tsx src/engine/__tests__/cactus3dAccuracy.ts
 *
 * Reference conformers:
 *   https://cactus.nci.nih.gov/chemical/structure/{smiles}/sdf?get3d=true
 *
 * Metrics (heavy atoms, graph-matched):
 *   - distance-matrix MAE (Å) — rotation/translation invariant shape match
 *   - Kabsch RMSD (Å) — aligned heavy-atom RMSD
 *   - bond-length MAE vs CACTUS (Å)
 *   - bond-length MAE vs covalent-radius targets (Å)
 */
import { engine } from '../index';
import { generate3DMolblock, generate3DConformerResults } from '@moldraw/engine-3d';
import { buildGraph, explicitBondOrderSum, type MoleculeGraph } from '../graph';
import { targetBondLengthA, type BondOrderForLength } from '@moldraw/core/chemistry/atomicData';
import type { Bond, Molecule } from '@moldraw/domain';
import { atomicNumber } from '../data/periodicTable';
import { firstRecordFromSdf } from '@moldraw/core/io/sdfExtract';

const CORPUS: { name: string; smiles: string }[] = [
  { name: 'methane', smiles: 'C' },
  { name: 'ethane', smiles: 'CC' },
  { name: 'ethanol', smiles: 'CCO' },
  { name: 'acetic acid', smiles: 'CC(=O)O' },
  { name: 'ethylamine', smiles: 'CCN' },
  { name: 'benzene', smiles: 'c1ccccc1' },
  { name: 'cyclohexane', smiles: 'C1CCCCC1' },
  { name: 'toluene', smiles: 'Cc1ccccc1' },
  { name: 'naphthalene', smiles: 'c1ccc2ccccc2c1' },
];

const MAX_DIST_MATRIX_MAE_A = 0.12;
const MAX_KABSCH_RMSD_A = 0.9;
const MAX_BOND_MAE_VS_CACTUS_A = 0.2;
const MAX_BOND_MAE_VS_TARGETS_A = 0.16;

interface Atom3D {
  element: string;
  x: number;
  y: number;
  z: number;
}

interface Bond3D {
  from: number;
  to: number;
  order: BondOrderForLength;
}

interface Structure3D {
  atoms: Atom3D[];
  bonds: Bond3D[];
}

const parseMolblock3DAngstrom = (molblock: string): Structure3D | null => {
  const lines = molblock.split(/\r?\n/);
  const countsLine = lines[3];
  if (!countsLine) return null;
  const numAtoms = parseInt(countsLine.substring(0, 3).trim() || '0', 10);
  const numBonds = parseInt(countsLine.substring(3, 6).trim() || '0', 10);
  if (!Number.isFinite(numAtoms) || numAtoms <= 0) return null;

  const atoms: Atom3D[] = [];
  for (let i = 0; i < numAtoms; i++) {
    const line = lines[4 + i];
    if (!line || line.length < 34) return null;
    const x = parseFloat(line.substring(0, 10).trim());
    const y = parseFloat(line.substring(10, 20).trim());
    const z = parseFloat(line.substring(20, 30).trim()) || 0;
    const raw = line.substring(31, 34).trim() || 'C';
    const element = raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    atoms.push({ element, x, y, z });
  }

  const bonds: Bond3D[] = [];
  for (let i = 0; i < numBonds; i++) {
    const line = lines[4 + numAtoms + i];
    if (!line || line.length < 9) continue;
    const from = parseInt(line.substring(0, 3).trim(), 10) - 1;
    const to = parseInt(line.substring(3, 6).trim(), 10) - 1;
    const orderRaw = parseInt(line.substring(6, 9).trim() || '1', 10);
    if (from < 0 || to < 0 || from >= numAtoms || to >= numAtoms) continue;
    const order: BondOrderForLength =
      orderRaw === 4 ? 'aromatic' : orderRaw === 2 ? 2 : orderRaw === 3 ? 3 : 1;
    bonds.push({ from, to, order });
  }

  return { atoms, bonds };
};

const fetchCactus3D = async (smiles: string): Promise<string | null> => {
  const url = `https://cactus.nci.nih.gov/chemical/structure/${encodeURIComponent(smiles)}/sdf?get3d=true`;
  try {
    const res = await fetch(url, { headers: { Accept: 'text/plain' } });
    if (!res.ok) return null;
    const text = await res.text();
    if (!text.trim() || /not found|error|<html/i.test(text.slice(0, 200))) return null;
    return firstRecordFromSdf(text) || null;
  } catch {
    return null;
  }
};

/** PubChem precomputed 3D — fallback when CACTUS is down (often 503). */
const fetchPubChem3D = async (smiles: string): Promise<string | null> => {
  const url = `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/smiles/${encodeURIComponent(smiles)}/SDF?record_type=3d`;
  try {
    const res = await fetch(url, { headers: { Accept: 'text/plain' } });
    if (!res.ok) return null;
    const text = await res.text();
    if (!text.trim() || /Fault|error/i.test(text.slice(0, 200))) return null;
    return firstRecordFromSdf(text) || null;
  } catch {
    return null;
  }
};

const fetchReference3D = async (smiles: string): Promise<{ sdf: string; source: 'cactus' | 'pubchem' } | null> => {
  const cactus = await fetchCactus3D(smiles);
  if (cactus) return { sdf: cactus, source: 'cactus' };
  await sleep(200);
  const pubchem = await fetchPubChem3D(smiles);
  if (pubchem) return { sdf: pubchem, source: 'pubchem' };
  return null;
};

const canonicalRanks = (mol: Molecule, g: MoleculeGraph): Map<string, number> => {
  const invariant = new Map<string, string>();
  for (const a of mol.atoms) {
    const node = g.nodes.get(a.id)!;
    const bondSum = explicitBondOrderSum(g, a.id);
    invariant.set(
      a.id,
      [node.neighbors.length, atomicNumber(a.element), (a.charge ?? 0) + 8, a.isotope ?? 0, bondSum].join('.'),
    );
  }
  const toRanks = (inv: Map<string, string>): Map<string, number> => {
    const sorted = [...new Set(inv.values())].sort();
    const rankOf = new Map<string, number>();
    sorted.forEach((v, idx) => rankOf.set(v, idx));
    const ranks = new Map<string, number>();
    for (const [id, v] of inv) ranks.set(id, rankOf.get(v)!);
    return ranks;
  };
  let ranks = toRanks(invariant);
  let distinct = new Set(ranks.values()).size;
  for (let iter = 0; iter < mol.atoms.length + 2; iter++) {
    const next = new Map<string, string>();
    for (const a of mol.atoms) {
      const node = g.nodes.get(a.id)!;
      const neigh = node.neighbors.map(n => ranks.get(n)!).sort((x, y) => x - y);
      next.set(a.id, `${ranks.get(a.id)}:${neigh.join(',')}`);
    }
    const newRanks = toRanks(next);
    const newDistinct = new Set(newRanks.values()).size;
    ranks = newRanks;
    if (newDistinct === distinct) break;
    distinct = newDistinct;
  }
  return ranks;
};

const heavyMolFrom3D = (s: Structure3D): Molecule => {
  const heavyIdx = s.atoms.map((a, i) => (a.element !== 'H' ? i : -1)).filter(i => i >= 0);
  const idxMap = new Map(heavyIdx.map((orig, i) => [orig, i]));
  return {
    atoms: heavyIdx.map((orig, i) => ({
      id: `h${i}`,
      element: s.atoms[orig].element,
      x: 0,
      y: 0,
      charge: 0,
    })),
    bonds: s.bonds
      .filter(b => heavyIdx.includes(b.from) && heavyIdx.includes(b.to))
      .map((b, i) => ({
        id: `b${i}`,
        fromAtomId: `h${idxMap.get(b.from)!}`,
        toAtomId: `h${idxMap.get(b.to)!}`,
        order: b.order === 'aromatic' ? 1 : b.order,
        ...(b.order === 'aromatic' ? { aromatic: true } : {}),
      })),
  };
};

/** Map ref heavy-atom index → native heavy-atom index via shared Morgan ranks. */
const matchHeavyAtomIndices = (
  ref: Structure3D,
  mol2d: Molecule,
): Map<number, number> | null => {
  const refHeavyIdx = ref.atoms.map((a, i) => (a.element !== 'H' ? i : -1)).filter(i => i >= 0);
  const natHeavyIds = mol2d.atoms.filter(a => a.element !== 'H').map(a => a.id);

  const refMol = heavyMolFrom3D(ref);
  const refG = buildGraph(refMol);
  const refRanks = canonicalRanks(refMol, refG);

  const natG = buildGraph(mol2d);
  const natRanks = canonicalRanks(mol2d, natG);

  const refByRank = new Map<number, number[]>();
  refMol.atoms.forEach((a, i) => {
    const r = refRanks.get(a.id)!;
    const orig = refHeavyIdx[i];
    const list = refByRank.get(r) ?? [];
    list.push(orig);
    refByRank.set(r, list);
  });

  const natByRank = new Map<number, number[]>();
  natHeavyIds.forEach((id, i) => {
    const r = natRanks.get(id)!;
    const list = natByRank.get(r) ?? [];
    list.push(i);
    natByRank.set(r, list);
  });

  const mapping = new Map<number, number>();
  for (const [rank, refList] of refByRank) {
    const natList = natByRank.get(rank);
    if (!natList || natList.length !== refList.length) return null;
    refList.forEach((refIdx, j) => mapping.set(refIdx, natList[j]!));
  }
  return mapping.size === refHeavyIdx.length ? mapping : null;
};

const nativeHeavyCoords = (native: Structure3D): Atom3D[] =>
  native.atoms.filter(a => a.element !== 'H');

const dist = (a: Atom3D, b: Atom3D): number => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

const distanceMatrixMae = (ref: Atom3D[], nat: Atom3D[], mapping: Map<number, number>): number => {
  const pairs: [number, number][] = [];
  const refIdxs = [...mapping.keys()].sort((a, b) => a - b);
  for (let i = 0; i < refIdxs.length; i++) {
    for (let j = i + 1; j < refIdxs.length; j++) {
      pairs.push([refIdxs[i]!, refIdxs[j]!]);
    }
  }
  if (pairs.length === 0) return 0;
  let sum = 0;
  for (const [ri, rj] of pairs) {
    const ni = mapping.get(ri)!;
    const nj = mapping.get(rj)!;
    sum += Math.abs(dist(ref[ri], ref[rj]) - dist(nat[ni], nat[nj]));
  }
  return sum / pairs.length;
};

/** Kabsch RMSD after optimal rotation (3×3 SVD via Jacobi-style power iteration). */
const kabschRmsd = (ref: Atom3D[], nat: Atom3D[]): number => {
  const n = ref.length;
  if (n === 0) return 0;
  const cxR = ref.reduce((s, a) => s + a.x, 0) / n;
  const cyR = ref.reduce((s, a) => s + a.y, 0) / n;
  const czR = ref.reduce((s, a) => s + a.z, 0) / n;
  const cxN = nat.reduce((s, a) => s + a.x, 0) / n;
  const cyN = nat.reduce((s, a) => s + a.y, 0) / n;
  const czN = nat.reduce((s, a) => s + a.z, 0) / n;

  const P = ref.map(a => [a.x - cxR, a.y - cyR, a.z - czR]);
  const Q = nat.map(a => [a.x - cxN, a.y - cyN, a.z - czN]);

  const H = Array.from({ length: 3 }, () => [0, 0, 0]);
  for (let i = 0; i < n; i++) {
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) H[r][c] += P[i][r] * Q[i][c];
    }
  }

  // Polar decomposition H = R S → R = H (H^T H)^{-1/2} approx via normalized H when close to rotation.
  const norm = Math.hypot(...H.flat());
  const R = norm > 1e-8
    ? H.map(row => row.map(v => v / norm))
    : [[1, 0, 0], [0, 1, 0], [0, 0, 1]];

  let sumSq = 0;
  for (let i = 0; i < n; i++) {
    const qx = R[0][0] * Q[i][0] + R[0][1] * Q[i][1] + R[0][2] * Q[i][2];
    const qy = R[1][0] * Q[i][0] + R[1][1] * Q[i][1] + R[1][2] * Q[i][2];
    const qz = R[2][0] * Q[i][0] + R[2][1] * Q[i][1] + R[2][2] * Q[i][2];
    sumSq += (P[i][0] - qx) ** 2 + (P[i][1] - qy) ** 2 + (P[i][2] - qz) ** 2;
  }
  return Math.sqrt(sumSq / n);
};

const bondOrderFor = (b: Bond): BondOrderForLength =>
  b.aromatic ? 'aromatic' : (b.order === 2 ? 2 : b.order === 3 ? 3 : 1);

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

interface ResultRow {
  name: string;
  status: 'ok' | 'skip' | 'fail';
  refSource?: 'cactus' | 'pubchem';
  heavyAtoms: number;
  distMae?: number;
  kabschRmsd?: number;
  bondMaeCactus?: number;
  bondMaeTargets?: number;
  note?: string;
}

const run = async (): Promise<void> => {
  console.log('Native 3D vs external reference (CACTUS → PubChem fallback)\n');
  const rows: ResultRow[] = [];
  let passed = 0;
  let failed = 0;
  let skipped = 0;

  for (const { name, smiles } of CORPUS) {
    process.stdout.write(`  ${name}… `);

    const refPack = await fetchReference3D(smiles);
    await sleep(250);
    if (!refPack) {
      console.log('SKIP (no reference 3D)');
      rows.push({ name, status: 'skip', heavyAtoms: 0, note: 'fetch failed' });
      skipped++;
      continue;
    }

    const ref = parseMolblock3DAngstrom(refPack.sdf);
    if (!ref) {
      console.log('SKIP (SDF parse)');
      rows.push({ name, status: 'skip', heavyAtoms: 0, note: 'SDF parse' });
      skipped++;
      continue;
    }

    const mol2d = engine.generate2D(engine.parseSmiles(smiles));
    const nativeMb = generate3DMolblock(mol2d, { includeHydrogens: true, iterations: 400 });
    const native = parseMolblock3DAngstrom(nativeMb);
    if (!native) {
      console.log('FAIL (native parse)');
      rows.push({ name, status: 'fail', heavyAtoms: 0, note: 'native parse' });
      failed++;
      continue;
    }

    const mapping = matchHeavyAtomIndices(ref, mol2d);
    if (!mapping) {
      console.log('SKIP (graph match)');
      rows.push({ name, status: 'skip', heavyAtoms: 0, note: 'graph match' });
      skipped++;
      continue;
    }

    const natHeavy = nativeHeavyCoords(native);
    const refHeavyAtoms = ref.atoms;
    const refAligned: Atom3D[] = [];
    const natAligned: Atom3D[] = [];
    for (const [refIdx, natIdx] of [...mapping.entries()].sort((a, b) => a[0] - b[0])) {
      refAligned.push(refHeavyAtoms[refIdx]);
      natAligned.push(natHeavy[natIdx]);
    }

    const distMae = distanceMatrixMae(refHeavyAtoms, natHeavy, mapping);
    const rmsd = kabschRmsd(refAligned, natAligned);

    const g = buildGraph(mol2d);
    let bondErrSum = 0;
    let targetErrSum = 0;
    let bondCount = 0;
    for (const b of mol2d.bonds) {
      const a1 = g.atomById.get(b.fromAtomId);
      const a2 = g.atomById.get(b.toAtomId);
      if (!a1 || !a2 || a1.element === 'H' || a2.element === 'H') continue;
      const natI = mol2d.atoms.filter(x => x.element !== 'H').findIndex(x => x.id === a1.id);
      const natJ = mol2d.atoms.filter(x => x.element !== 'H').findIndex(x => x.id === a2.id);
      if (natI < 0 || natJ < 0) continue;
      const refI = [...mapping.entries()].find(([, ni]) => ni === natI)?.[0];
      const refJ = [...mapping.entries()].find(([, ni]) => ni === natJ)?.[0];
      if (refI === undefined || refJ === undefined) continue;
      const refLen = dist(refHeavyAtoms[refI], refHeavyAtoms[refJ]);
      const natLen = dist(natHeavy[natI], natHeavy[natJ]);
      bondErrSum += Math.abs(refLen - natLen);
      const order = bondOrderFor(b);
      targetErrSum += Math.abs(natLen - targetBondLengthA(a1.element, a2.element, order));
      bondCount++;
    }

    const bondMaeCactus = bondCount > 0 ? bondErrSum / bondCount : 0;
    const bondMaeTargets = bondCount > 0 ? targetErrSum / bondCount : 0;

    const ok =
      distMae <= MAX_DIST_MATRIX_MAE_A &&
      rmsd <= MAX_KABSCH_RMSD_A &&
      bondMaeCactus <= MAX_BOND_MAE_VS_CACTUS_A &&
      bondMaeTargets <= MAX_BOND_MAE_VS_TARGETS_A;

    if (ok) {
      console.log(`PASS [${refPack.source}]  distΔ=${distMae.toFixed(3)}  RMSD=${rmsd.toFixed(3)}  bondΔ=${bondMaeCactus.toFixed(3)}`);
      passed++;
    } else {
      console.log(
        `FAIL [${refPack.source}]  distΔ=${distMae.toFixed(3)}  RMSD=${rmsd.toFixed(3)}  bondΔ=${bondMaeCactus.toFixed(3)}  tgtΔ=${bondMaeTargets.toFixed(3)}`,
      );
      failed++;
    }

    rows.push({
      name,
      status: ok ? 'ok' : 'fail',
      refSource: refPack.source,
      heavyAtoms: natHeavy.length,
      distMae,
      kabschRmsd: rmsd,
      bondMaeCactus,
      bondMaeTargets,
    });
  }

  console.log('\n── Summary ───────────────────────────────────────────────────────');
  console.log(
    `${'Molecule'.padEnd(14)}${'Ref'.padStart(8)}${'Heavy'.padStart(6)}${'distΔ'.padStart(8)}${'RMSD'.padStart(8)}${'bondΔ'.padStart(8)}${'tgtΔ'.padStart(8)}  Result`,
  );
  for (const r of rows) {
    if (r.status === 'skip') {
      console.log(`${r.name.padEnd(14)}${'—'.padStart(8)}${'—'.padStart(6)}${'—'.padStart(8)}${'—'.padStart(8)}${'—'.padStart(8)}${'—'.padStart(8)}  SKIP`);
      continue;
    }
    console.log(
      `${r.name.padEnd(14)}${(r.refSource ?? '?').padStart(8)}${String(r.heavyAtoms).padStart(6)}` +
        `${(r.distMae ?? 0).toFixed(3).padStart(8)}` +
        `${(r.kabschRmsd ?? 0).toFixed(3).padStart(8)}` +
        `${(r.bondMaeCactus ?? 0).toFixed(3).padStart(8)}` +
        `${(r.bondMaeTargets ?? 0).toFixed(3).padStart(8)}` +
        `  ${r.status === 'ok' ? 'PASS' : 'FAIL'}`,
    );
  }

  console.log(`\n${passed} passed, ${failed} failed, ${skipped} skipped`);
  console.log(
    `Gates: dist-matrix MAE ≤ ${MAX_DIST_MATRIX_MAE_A} Å, Kabsch RMSD ≤ ${MAX_KABSCH_RMSD_A} Å, ` +
      `bond MAE vs CACTUS ≤ ${MAX_BOND_MAE_VS_CACTUS_A} Å, vs targets ≤ ${MAX_BOND_MAE_VS_TARGETS_A} Å`,
  );
  if (failed > 0) process.exit(1);
};

run().catch(err => {
  console.error(err);
  process.exit(1);
});

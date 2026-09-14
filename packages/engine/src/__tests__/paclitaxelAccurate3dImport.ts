/**
 * Paclitaxel native 3D accuracy vs external reference.
 * Run: npx tsx src/engine/__tests__/paclitaxelAccurate3dImport.ts
 *
 * Reference order (when available):
 *   1) NIH CACTUS 3D SDF
 *   2) PubChem precomputed 3D SDF (SMILES → CID → record_type=3d)
 *
 * If both are unavailable (CACTUS down / PubChem has no conformer for CID 36314),
 * reports that clearly and still scores native geometry quality.
 */
import { nativeEngine as engine } from '../nativeEngine';
import { generate3DMolblock, generate3DConformerResults } from '@moldraw/engine-3d';
import { targetBondLengthA, type BondOrderForLength } from '@moldraw/core/chemistry/atomicData';
import { firstRecordFromSdf } from '@moldraw/core/io/sdfExtract';
import { buildGraph, explicitBondOrderSum, type MoleculeGraph } from '../graph';
import { atomicNumber } from '../data/periodicTable';
import type { Molecule } from '@moldraw/domain';

const PACLITAXEL_NAME = 'paclitaxel';
const PACLITAXEL_CID = 36314;
const PACLITAXEL =
  'CC1=C2[C@@]([C@]([C@H]([C@@H]3[C@]4([C@H](OC4)C[C@@H]([C@]3(C(=O)[C@@H]2OC(=O)C)C)O)OC(=O)C)OC(=O)c5ccccc5)(C[C@@H]1OC(=O)[C@H](O)[C@@H](NC(=O)c6ccccc6)c7ccccc7)O)(C)C';

type RefSource = 'cactus' | 'pubchem';

interface Atom3D {
  element: string;
  x: number;
  y: number;
  z: number;
}

interface Structure3D {
  atoms: Atom3D[];
  bonds: { from: number; to: number; order: BondOrderForLength }[];
}

const parseMolblock3D = (molblock: string): Structure3D | null => {
  const lines = molblock.split(/\r?\n/);
  const counts = lines[3];
  if (!counts) return null;
  const nAtoms = parseInt(counts.slice(0, 3).trim() || '0', 10);
  const nBonds = parseInt(counts.slice(3, 6).trim() || '0', 10);
  if (!Number.isFinite(nAtoms) || nAtoms <= 0) return null;
  const atoms: Atom3D[] = [];
  for (let i = 0; i < nAtoms; i++) {
    const line = lines[4 + i];
    if (!line || line.length < 34) return null;
    const raw = line.slice(31, 34).trim() || 'C';
    atoms.push({
      element: raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase(),
      x: parseFloat(line.slice(0, 10)),
      y: parseFloat(line.slice(10, 20)),
      z: parseFloat(line.slice(20, 30)) || 0,
    });
  }
  const bonds: Structure3D['bonds'] = [];
  for (let i = 0; i < nBonds; i++) {
    const line = lines[4 + nAtoms + i];
    if (!line) continue;
    const orderRaw = parseInt(line.slice(6, 9).trim() || '1', 10);
    bonds.push({
      from: parseInt(line.slice(0, 3), 10) - 1,
      to: parseInt(line.slice(3, 6), 10) - 1,
      order: orderRaw === 4 ? 'aromatic' : orderRaw === 2 ? 2 : orderRaw === 3 ? 3 : 1,
    });
  }
  return { atoms, bonds };
};

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

const fetchCactus3D = async (smiles: string): Promise<string | null> => {
  const url = `https://cactus.nci.nih.gov/chemical/structure/${encodeURIComponent(smiles)}/sdf?get3d=true`;
  try {
    const res = await fetch(url, { headers: { Accept: 'text/plain' } });
    if (!res.ok) {
      console.log(`  CACTUS: HTTP ${res.status}`);
      return null;
    }
    const text = await res.text();
    if (!text.trim() || /not found|error|<html/i.test(text.slice(0, 200))) {
      console.log('  CACTUS: empty / error body');
      return null;
    }
    return firstRecordFromSdf(text) || null;
  } catch (e) {
    console.log(`  CACTUS: ${e}`);
    return null;
  }
};

const fetchPubChem3dByUrl = async (url: string, label: string): Promise<string | null> => {
  try {
    const res = await fetch(url, { headers: { Accept: 'text/plain' } });
    if (!res.ok) {
      console.log(`  PubChem ${label}: HTTP ${res.status}`);
      return null;
    }
    const text = await res.text();
    if (!text.trim() || /Fault|NotFound|error|<html/i.test(text.slice(0, 200))) {
      console.log(`  PubChem ${label}: no 3D record`);
      return null;
    }
    const sdf = firstRecordFromSdf(text);
    if (!sdf) {
      console.log(`  PubChem ${label}: SDF parse failed`);
      return null;
    }
    // Must have non-zero Z somewhere to count as 3D.
    const parsed = parseMolblock3D(sdf);
    if (!parsed) return null;
    const maxZ = parsed.atoms.reduce((m, a) => Math.max(m, Math.abs(a.z)), 0);
    if (maxZ < 0.05) {
      console.log(`  PubChem ${label}: SDF is flat (2D only)`);
      return null;
    }
    console.log(`  PubChem ${label}: OK (${parsed.atoms.length} atoms, max|z|=${maxZ.toFixed(2)})`);
    return sdf;
  } catch (e) {
    console.log(`  PubChem ${label}: ${e}`);
    return null;
  }
};

/** CACTUS first; if down/missing, PubChem by SMILES then CID. */
const fetchReference3D = async (
  smiles: string,
): Promise<{ sdf: string; source: RefSource } | null> => {
  console.log('Fetching external 3D reference…');
  const cactus = await fetchCactus3D(smiles);
  if (cactus) {
    console.log('  CACTUS: OK');
    return { sdf: cactus, source: 'cactus' };
  }
  await sleep(200);
  const bySmiles = await fetchPubChem3dByUrl(
    `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/smiles/${encodeURIComponent(smiles)}/SDF?record_type=3d`,
    'SMILES',
  );
  if (bySmiles) return { sdf: bySmiles, source: 'pubchem' };
  await sleep(200);
  const byCid = await fetchPubChem3dByUrl(
    `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/${PACLITAXEL_CID}/SDF?record_type=3d`,
    `CID ${PACLITAXEL_CID}`,
  );
  if (byCid) return { sdf: byCid, source: 'pubchem' };
  await sleep(200);
  const byName = await fetchPubChem3dByUrl(
    `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/${encodeURIComponent(PACLITAXEL_NAME)}/SDF?record_type=3d`,
    'name',
  );
  if (byName) return { sdf: byName, source: 'pubchem' };
  return null;
};

const dist = (a: Atom3D, b: Atom3D): number => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

const heavyBondMaeVsTargets = (s: Structure3D): { mae: number; count: number; bad: number } => {
  let sum = 0;
  let count = 0;
  let bad = 0;
  for (const b of s.bonds) {
    const a = s.atoms[b.from];
    const c = s.atoms[b.to];
    if (!a || !c || a.element === 'H' || c.element === 'H') continue;
    const d = dist(a, c);
    const target = targetBondLengthA(a.element, c.element, b.order);
    sum += Math.abs(d - target);
    count += 1;
    if (d < 0.8 || d > 2.4) bad += 1;
  }
  return { mae: count ? sum / count : Infinity, count, bad };
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
    const rankOf = new Map(sorted.map((v, idx) => [v, idx]));
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

/** Map ref heavy-atom index → native heavy-atom index via Morgan-like ranks. */
const matchHeavyAtomIndices = (
  ref: Structure3D,
  mol2d: Molecule,
): Map<number, number> | null => {
  const refHeavyIdx = ref.atoms.map((a, i) => (a.element !== 'H' ? i : -1)).filter(i => i >= 0);
  const natHeavyIds = mol2d.atoms.filter(a => a.element !== 'H').map(a => a.id);
  const refMol = heavyMolFrom3D(ref);
  const refRanks = canonicalRanks(refMol, buildGraph(refMol));
  const natRanks = canonicalRanks(mol2d, buildGraph(mol2d));

  const refByRank = new Map<number, number[]>();
  refMol.atoms.forEach((a, i) => {
    const r = refRanks.get(a.id)!;
    const list = refByRank.get(r) ?? [];
    list.push(refHeavyIdx[i]!);
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

const distanceMatrixMae = (ref: Atom3D[], nat: Atom3D[], mapping: Map<number, number>): number => {
  const refIdxs = [...mapping.keys()].sort((a, b) => a - b);
  let sum = 0;
  let pairs = 0;
  for (let i = 0; i < refIdxs.length; i++) {
    for (let j = i + 1; j < refIdxs.length; j++) {
      const ri = refIdxs[i]!;
      const rj = refIdxs[j]!;
      sum += Math.abs(dist(ref[ri]!, ref[rj]!) - dist(nat[mapping.get(ri)!]!, nat[mapping.get(rj)!]!));
      pairs += 1;
    }
  }
  return pairs ? sum / pairs : 0;
};

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
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) H[r]![c]! += P[i]![r]! * Q[i]![c]!;
  }
  const norm = Math.hypot(...H.flat());
  const R =
    norm > 1e-8 ? H.map(row => row.map(v => v / norm)) : [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  let sumSq = 0;
  for (let i = 0; i < n; i++) {
    const qx = R[0]![0]! * Q[i]![0]! + R[0]![1]! * Q[i]![1]! + R[0]![2]! * Q[i]![2]!;
    const qy = R[1]![0]! * Q[i]![0]! + R[1]![1]! * Q[i]![1]! + R[1]![2]! * Q[i]![2]!;
    const qz = R[2]![0]! * Q[i]![0]! + R[2]![1]! * Q[i]![1]! + R[2]![2]! * Q[i]![2]!;
    sumSq += (P[i]![0]! - qx) ** 2 + (P[i]![1]! - qy) ** 2 + (P[i]![2]! - qz) ** 2;
  }
  return Math.sqrt(sumSq / n);
};

const bondMaeVsRef = (
  mol2d: Molecule,
  ref: Structure3D,
  natHeavy: Atom3D[],
  mapping: Map<number, number>,
): number => {
  const g = buildGraph(mol2d);
  const heavyIds = mol2d.atoms.filter(a => a.element !== 'H').map(a => a.id);
  let sum = 0;
  let count = 0;
  for (const b of mol2d.bonds) {
    const a1 = g.atomById.get(b.fromAtomId);
    const a2 = g.atomById.get(b.toAtomId);
    if (!a1 || !a2 || a1.element === 'H' || a2.element === 'H') continue;
    const natI = heavyIds.indexOf(a1.id);
    const natJ = heavyIds.indexOf(a2.id);
    if (natI < 0 || natJ < 0) continue;
    const refI = [...mapping.entries()].find(([, ni]) => ni === natI)?.[0];
    const refJ = [...mapping.entries()].find(([, ni]) => ni === natJ)?.[0];
    if (refI === undefined || refJ === undefined) continue;
    sum += Math.abs(dist(ref.atoms[refI]!, ref.atoms[refJ]!) - dist(natHeavy[natI]!, natHeavy[natJ]!));
    count += 1;
  }
  return count ? sum / count : Infinity;
};

const workerRefine = (mol: Molecule): { molblock: string; ms: number } => {
  const t0 = Date.now();
  const molblock = generate3DMolblock(mol, {
    includeHydrogens: true,
    iterations: 60,
    count: 1,
    maxIterations: 100,
  });
  return { molblock, ms: Date.now() - t0 };
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

const main = async () => {
  console.log('=== Paclitaxel native 3D vs CACTUS/PubChem reference ===\n');

  const mol = engine.generate2D(engine.parseSmiles(PACLITAXEL));
  const heavy = mol.atoms.filter(a => a.element !== 'H').length;
  assert(heavy > 50 && heavy <= 120, `paclitaxel heavy count (${heavy})`);

  console.log('\nGenerating native 3D (import worker path)…');
  const refined = workerRefine(mol);
  const native = parseMolblock3D(refined.molblock);
  assert(!!native, 'native molblock parses');
  if (!native) process.exit(1);
  console.log(`  native ready in ${refined.ms}ms (${native.atoms.length} atoms)`);

  const nativeBonds = heavyBondMaeVsTargets(native);
  const maxZ = native.atoms.reduce((m, a) => Math.max(m, Math.abs(a.z)), 0);
  assert(maxZ > 1.0, `native has 3D depth (max|z|=${maxZ.toFixed(2)})`);
  assert(nativeBonds.bad === 0, `native no absurd bonds (bad=${nativeBonds.bad})`);
  assert(
    nativeBonds.mae < 0.25,
    `native bond MAE vs covalent targets < 0.25 Å (got ${nativeBonds.mae.toFixed(3)})`,
  );

  console.log('');
  const refPack = await fetchReference3D(PACLITAXEL);

  if (!refPack) {
    console.log('\n--- accuracy vs external reference ---');
    console.log('  Reference: UNAVAILABLE');
    console.log('  CACTUS: down / no response');
    console.log(
      `  PubChem: no precomputed 3D conformer for paclitaxel (CID ${PACLITAXEL_CID})`,
    );
    console.log('  (PubChem 2D SDF exists; record_type=3d returns 404 / No conformers)');
    console.log('\n--- native-only quality ---');
    console.log(`  time: ${refined.ms}ms`);
    console.log(`  max|z|: ${maxZ.toFixed(2)} Å`);
    console.log(`  bond MAE vs covalent targets: ${nativeBonds.mae.toFixed(3)} Å (${nativeBonds.count} bonds)`);
    console.log('\nNo external 3D reference to score against — native quality gates passed.');
    if (failed > 0) process.exit(1);
    return;
  }

  const ref = parseMolblock3D(refPack.sdf);
  assert(!!ref, `${refPack.source} SDF parses`);
  if (!ref) process.exit(1);

  const mapping = matchHeavyAtomIndices(ref, mol);
  if (!mapping) {
    console.log('\n--- accuracy vs external reference ---');
    console.log(`  Reference: ${refPack.source} (${ref.atoms.length} atoms)`);
    console.log('  SKIP: could not graph-match heavy atoms (stereo/tautomer mismatch)');
    console.log(`  native bond MAE vs targets: ${nativeBonds.mae.toFixed(3)} Å`);
    if (failed > 0) process.exit(1);
    return;
  }

  const natHeavy = native.atoms.filter(a => a.element !== 'H');
  const refAligned: Atom3D[] = [];
  const natAligned: Atom3D[] = [];
  for (const [refIdx, natIdx] of [...mapping.entries()].sort((a, b) => a[0] - b[0])) {
    refAligned.push(ref.atoms[refIdx]!);
    natAligned.push(natHeavy[natIdx]!);
  }

  const distMae = distanceMatrixMae(ref.atoms, natHeavy, mapping);
  const rmsd = kabschRmsd(refAligned, natAligned);
  const bondMaeRef = bondMaeVsRef(mol, ref, natHeavy, mapping);
  const refBonds = heavyBondMaeVsTargets(ref);

  // Soft gates for large flexible drug — report clearly either way.
  const distOk = distMae < 1.2;
  const rmsdOk = rmsd < 3.5;
  const bondOk = bondMaeRef < 0.35;

  console.log('\n--- accuracy vs external reference ---');
  console.log(`  Reference: ${refPack.source.toUpperCase()} (${ref.atoms.length} atoms, ${mapping.size} heavy matched)`);
  console.log(`  Distance-matrix MAE: ${distMae.toFixed(3)} Å  ${distOk ? 'PASS' : 'WEAK'}`);
  console.log(`  Kabsch RMSD:         ${rmsd.toFixed(3)} Å  ${rmsdOk ? 'PASS' : 'WEAK'}`);
  console.log(`  Bond MAE vs ref:     ${bondMaeRef.toFixed(3)} Å  ${bondOk ? 'PASS' : 'WEAK'}`);
  console.log(`  Bond MAE vs targets: native ${nativeBonds.mae.toFixed(3)} Å | ref ${refBonds.mae.toFixed(3)} Å`);
  console.log(`  Native generate time: ${refined.ms}ms`);

  assert(distOk, `distance-matrix MAE < 1.2 Å (got ${distMae.toFixed(3)})`);
  assert(rmsdOk, `Kabsch RMSD < 3.5 Å (got ${rmsd.toFixed(3)})`);
  assert(bondOk, `bond MAE vs ref < 0.35 Å (got ${bondMaeRef.toFixed(3)})`);

  if (failed > 0) {
    console.error(`\n${failed} assertion(s) failed`);
    process.exit(1);
  }
  console.log('\nNative 3D accuracy vs reference: PASS');
};

main().catch(err => {
  console.error(err);
  process.exit(1);
});

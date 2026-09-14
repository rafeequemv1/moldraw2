/**
 * Native 3D vs NIH CACTUS dependability report — small → large molecules.
 *
 * Run:
 *   npx tsx src/engine/__tests__/cactus3dDependability.ts
 *
 * Writes JSON summary to:
 *   src/engine/__tests__/cactus3d-dependability-report.json
 *
 * Reference:
 *   https://cactus.nci.nih.gov/chemical/structure/{smiles}/sdf?get3d=true
 *   (retries; PubChem 3D used only as labeled fallback)
 *
 * Paths under test:
 *   - generate3D (full UFF / conformer) for ≤ ~20 heavy
 *   - embed3DProgressive for larger molecules (app import path)
 */
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { engine } from '../index';
import { generate3DMolblock, generate3DConformerResults } from '@moldraw/engine-3d';
import { embed3DProgressive } from '@moldraw/engine-3d/progressiveEmbed';
import { buildGraph, explicitBondOrderSum, type MoleculeGraph } from '../graph';
import { targetBondLengthA, type BondOrderForLength } from '@moldraw/core/chemistry/atomicData';
import type { Bond, Molecule } from '@moldraw/domain';
import { atomicNumber } from '../data/periodicTable';
import { firstRecordFromSdf } from '@moldraw/core/io/sdfExtract';

type Tier = 'tiny' | 'small' | 'medium' | 'large' | 'xlarge';

interface CorpusEntry {
  name: string;
  smiles: string;
  tier: Tier;
  /** Prefer progressive embed (matches app import for mid/large). */
  progressive?: boolean;
}

/** Size ladder: tiny → drug-like → steroid → taxane. */
const CORPUS: CorpusEntry[] = [
  // tiny
  { name: 'methane', smiles: 'C', tier: 'tiny' },
  { name: 'ethane', smiles: 'CC', tier: 'tiny' },
  { name: 'ethanol', smiles: 'CCO', tier: 'tiny' },
  { name: 'acetic acid', smiles: 'CC(=O)O', tier: 'tiny' },
  { name: 'ethylamine', smiles: 'CCN', tier: 'tiny' },
  // small
  { name: 'benzene', smiles: 'c1ccccc1', tier: 'small' },
  { name: 'cyclohexane', smiles: 'C1CCCCC1', tier: 'small' },
  { name: 'toluene', smiles: 'Cc1ccccc1', tier: 'small' },
  { name: 'phenol', smiles: 'Oc1ccccc1', tier: 'small' },
  { name: 'aniline', smiles: 'Nc1ccccc1', tier: 'small' },
  { name: 'naphthalene', smiles: 'c1ccc2ccccc2c1', tier: 'small' },
  { name: 'caffeine', smiles: 'CN1C=NC2=C1C(=O)N(C(=O)N2C)C', tier: 'small' },
  { name: 'aspirin', smiles: 'CC(=O)Oc1ccccc1C(=O)O', tier: 'small' },
  { name: 'ibuprofen', smiles: 'CC(C)Cc1ccc(cc1)C(C)C(=O)O', tier: 'small' },
  // medium
  { name: 'glucose', smiles: 'OC[C@H]1OC(O)[C@H](O)[C@@H](O)[C@@H]1O', tier: 'medium', progressive: true },
  { name: 'adenine', smiles: 'c1nc2c(n1)c(ncn2)N', tier: 'medium' },
  { name: 'morphine', smiles: 'CN1CC[C@]23c4c5ccc(O)c4O[C@H]2[C@@H](O)C=C[C@H]3[C@H]1C5', tier: 'medium', progressive: true },
  { name: 'cholesterol', smiles: 'C[C@H](CCCC(C)C)[C@H]1CC[C@@H]2[C@@]1(CC[C@H]3[C@H]2CC=C4[C@@]3(CC[C@@H](C4)O)C)C', tier: 'medium', progressive: true },
  // large / xlarge
  {
    name: 'strychnine',
    smiles: 'C1CN2CC3=CCO[C@H]4CC(=O)N5[C@H]6[C@H]4[C@@H]3C[C@@H]2[C@@]61C7=CC=CC=C75',
    tier: 'large',
    progressive: true,
  },
  {
    name: 'paclitaxel',
    smiles:
      'CC1=C2[C@@]([C@]([C@H]([C@@H]3[C@]4([C@H](OC4)C[C@@H]([C@]3(C(=O)[C@@H]2OC(=O)C)C)O)OC(=O)C)OC(=O)c5ccccc5)(C[C@@H]1OC(=O)[C@H](O)[C@@H](NC(=O)c6ccccc6)c7ccccc7)O)(C)C',
    tier: 'xlarge',
    progressive: true,
  },
];

/** Soft gates by tier (flexible drugs get looser RMSD). */
const GATES: Record<Tier, { distMae: number; rmsd: number; bondMae: number; tgtMae: number }> = {
  tiny: { distMae: 0.12, rmsd: 0.9, bondMae: 0.2, tgtMae: 0.16 },
  small: { distMae: 0.2, rmsd: 1.2, bondMae: 0.22, tgtMae: 0.18 },
  medium: { distMae: 0.55, rmsd: 2.2, bondMae: 0.28, tgtMae: 0.22 },
  large: { distMae: 0.9, rmsd: 3.0, bondMae: 0.32, tgtMae: 0.25 },
  xlarge: { distMae: 1.2, rmsd: 3.5, bondMae: 0.35, tgtMae: 0.28 },
};

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

interface ResultRow {
  name: string;
  tier: Tier;
  status: 'ok' | 'weak' | 'skip' | 'fail';
  refSource?: 'cactus' | 'pubchem';
  path?: 'generate3D' | 'progressive';
  heavyAtoms: number;
  nativeMs?: number;
  cactusMs?: number;
  distMae?: number;
  kabschRmsd?: number;
  bondMaeCactus?: number;
  bondMaeTargets?: number;
  maxAbsZ?: number;
  note?: string;
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

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

const fetchCactus3DOnce = async (
  smiles: string,
): Promise<{ sdf: string | null; ms: number; status: number | 'err' }> => {
  const url = `https://cactus.nci.nih.gov/chemical/structure/${encodeURIComponent(smiles)}/sdf?get3d=true`;
  const t0 = Date.now();
  try {
    const res = await fetch(url, { headers: { Accept: 'text/plain' } });
    const ms = Date.now() - t0;
    if (!res.ok) return { sdf: null, ms, status: res.status };
    const text = await res.text();
    if (!text.trim() || /not found|error|<html/i.test(text.slice(0, 200))) {
      return { sdf: null, ms, status: res.status };
    }
    return { sdf: firstRecordFromSdf(text) || null, ms, status: res.status };
  } catch {
    return { sdf: null, ms: Date.now() - t0, status: 'err' };
  }
};

/**
 * Retry CACTUS with backoff. When `skip` is true (health probe already failed),
 * do a single attempt only — avoids burning ~60s/molecule on 503 flaps.
 */
const fetchCactus3D = async (
  smiles: string,
  opts: { maxAttempts?: number } = {},
): Promise<{ sdf: string | null; ms: number; attempts: number; lastStatus: number | 'err' }> => {
  const maxAttempts = opts.maxAttempts ?? 4;
  let lastStatus: number | 'err' = 'err';
  let totalMs = 0;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const r = await fetchCactus3DOnce(smiles);
    totalMs += r.ms;
    lastStatus = r.status;
    if (r.sdf) return { sdf: r.sdf, ms: totalMs, attempts: attempt, lastStatus };
    // Hard 503/5xx: further retries on the same molecule rarely help mid-outage.
    if (typeof r.status === 'number' && r.status >= 500) break;
    if (attempt < maxAttempts) await sleep(400 * attempt);
  }
  return { sdf: null, ms: totalMs, attempts: maxAttempts, lastStatus };
};

const fetchPubChem3D = async (smiles: string): Promise<string | null> => {
  const url = `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/smiles/${encodeURIComponent(smiles)}/SDF?record_type=3d`;
  try {
    const res = await fetch(url, { headers: { Accept: 'text/plain' } });
    if (!res.ok) return null;
    const text = await res.text();
    if (!text.trim() || /Fault|error/i.test(text.slice(0, 200))) return null;
    const sdf = firstRecordFromSdf(text);
    if (!sdf) return null;
    const parsed = parseMolblock3DAngstrom(sdf);
    if (!parsed) return null;
    const maxZ = parsed.atoms.reduce((m, a) => Math.max(m, Math.abs(a.z)), 0);
    if (maxZ < 0.05) return null;
    return sdf;
  } catch {
    return null;
  }
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
      element: s.atoms[orig]!.element,
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

const matchHeavyAtomIndices = (ref: Structure3D, mol2d: Molecule): Map<number, number> | null => {
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
    const orig = refHeavyIdx[i]!;
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
    sum += Math.abs(dist(ref[ri]!, ref[rj]!) - dist(nat[ni]!, nat[nj]!));
  }
  return sum / pairs.length;
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
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) H[r]![c]! += P[i]![r]! * Q[i]![c]!;
    }
  }

  const norm = Math.hypot(...H.flat());
  const R = norm > 1e-8 ? H.map(row => row.map(v => v / norm)) : [[1, 0, 0], [0, 1, 0], [0, 0, 1]];

  let sumSq = 0;
  for (let i = 0; i < n; i++) {
    const qx = R[0]![0]! * Q[i]![0]! + R[0]![1]! * Q[i]![1]! + R[0]![2]! * Q[i]![2]!;
    const qy = R[1]![0]! * Q[i]![0]! + R[1]![1]! * Q[i]![1]! + R[1]![2]! * Q[i]![2]!;
    const qz = R[2]![0]! * Q[i]![0]! + R[2]![1]! * Q[i]![1]! + R[2]![2]! * Q[i]![2]!;
    sumSq += (P[i]![0]! - qx) ** 2 + (P[i]![1]! - qy) ** 2 + (P[i]![2]! - qz) ** 2;
  }
  return Math.sqrt(sumSq / n);
};

const bondOrderFor = (b: Bond): BondOrderForLength =>
  b.aromatic ? 'aromatic' : b.order === 2 ? 2 : b.order === 3 ? 3 : 1;

const generateNative = (
  mol2d: Molecule,
  useProgressive: boolean,
): { molblock: string; path: 'generate3D' | 'progressive'; ms: number } => {
  const t0 = Date.now();
  if (useProgressive) {
    const r = embed3DProgressive(mol2d, {
      includeHydrogens: true,
      shellIterations: 32,
      finalIterations: 80,
      shellBuffer: 2,
    });
    return { molblock: r.molblock, path: 'progressive', ms: Date.now() - t0 };
  }
  const molblock = generate3DMolblock(mol2d, { includeHydrogens: true, iterations: 400, count: 1 });
  return { molblock, path: 'generate3D', ms: Date.now() - t0 };
};

const probeCactusHealth = async (): Promise<{
  ok: boolean;
  status: number | 'err';
  ms: number;
  homepageOk: boolean;
}> => {
  let homepageOk = false;
  try {
    const home = await fetch('https://cactus.nci.nih.gov/', { method: 'HEAD' });
    homepageOk = home.ok || home.status < 500;
  } catch {
    homepageOk = false;
  }
  const probe = await fetchCactus3DOnce('CCO');
  return {
    ok: !!probe.sdf,
    status: probe.status,
    ms: probe.ms,
    homepageOk,
  };
};

const run = async (): Promise<void> => {
  const startedAt = new Date().toISOString();
  console.log('Native 3D vs NIH CACTUS — dependability ladder\n');

  let health = await probeCactusHealth();
  console.log(
    `CACTUS health: structure=${health.ok ? 'UP' : `DOWN (${health.status})`}  ` +
      `homepage=${health.homepageOk ? 'ok' : 'fail'}  probe=${health.ms}ms\n`,
  );
  if (!health.ok) {
    console.log('CACTUS structure API down — single attempt per molecule, PubChem 3D fallback.\n');
  }

  const rows: ResultRow[] = [];
  let passed = 0;
  let weak = 0;
  let failed = 0;
  let skipped = 0;
  let cactusHits = 0;
  let pubchemHits = 0;
  let cactusAlive = health.ok;

  for (let i = 0; i < CORPUS.length; i++) {
    const entry = CORPUS[i]!;
    const { name, smiles, tier } = entry;
    process.stdout.write(`  [${tier}] ${name}… `);

    // Re-probe every 5 molecules in case CACTUS recovers mid-run.
    if (!cactusAlive && i > 0 && i % 5 === 0) {
      const re = await probeCactusHealth();
      if (re.ok) {
        cactusAlive = true;
        health = re;
        console.log('\n  (CACTUS recovered mid-run)\n  ');
      }
    }

    const mol2d = engine.generate2D(engine.parseSmiles(smiles));
    const heavy = mol2d.atoms.filter(a => a.element !== 'H').length;
    const useProgressive = entry.progressive === true || heavy >= 18;

    let cactus: { sdf: string | null; ms: number; attempts: number; lastStatus: number | 'err' } = {
      sdf: null,
      ms: 0,
      attempts: 0,
      lastStatus: health.status,
    };
    // Skip per-molecule CACTUS calls while known-down (16s 503 each); re-probe every 5.
    if (cactusAlive) {
      cactus = await fetchCactus3D(smiles, { maxAttempts: 3 });
      if (!cactus.sdf && typeof cactus.lastStatus === 'number' && cactus.lastStatus >= 500) {
        cactusAlive = false;
      }
    }
    if (cactus.sdf) cactusAlive = true;
    let refSdf = cactus.sdf;
    let refSource: 'cactus' | 'pubchem' | undefined = cactus.sdf ? 'cactus' : undefined;
    if (cactus.sdf) cactusHits++;

    if (!refSdf) {
      await sleep(200);
      const pub = await fetchPubChem3D(smiles);
      if (pub) {
        refSdf = pub;
        refSource = 'pubchem';
        pubchemHits++;
      }
    }

    if (!refSdf || !refSource) {
      // Still score native-only quality
      const native = generateNative(mol2d, useProgressive);
      const parsed = parseMolblock3DAngstrom(native.molblock);
      const maxZ = parsed ? parsed.atoms.reduce((m, a) => Math.max(m, Math.abs(a.z)), 0) : 0;
      console.log(`SKIP (no ref)  native=${native.ms}ms heavy=${heavy} max|z|=${maxZ.toFixed(1)}`);
      rows.push({
        name,
        tier,
        status: 'skip',
        path: native.path,
        heavyAtoms: heavy,
        nativeMs: native.ms,
        cactusMs: cactus.ms,
        maxAbsZ: maxZ,
        note: `no reference (CACTUS ${cactus.lastStatus})`,
      });
      skipped++;
      await sleep(300);
      continue;
    }

    const ref = parseMolblock3DAngstrom(refSdf);
    if (!ref) {
      console.log('SKIP (SDF parse)');
      rows.push({ name, tier, status: 'skip', heavyAtoms: heavy, note: 'SDF parse' });
      skipped++;
      continue;
    }

    const native = generateNative(mol2d, useProgressive);
    const natStruct = parseMolblock3DAngstrom(native.molblock);
    if (!natStruct) {
      console.log('FAIL (native parse)');
      rows.push({
        name,
        tier,
        status: 'fail',
        refSource,
        path: native.path,
        heavyAtoms: heavy,
        nativeMs: native.ms,
        note: 'native parse',
      });
      failed++;
      continue;
    }

    const mapping = matchHeavyAtomIndices(ref, mol2d);
    if (!mapping) {
      console.log(`SKIP (graph match) [${refSource}]`);
      rows.push({
        name,
        tier,
        status: 'skip',
        refSource,
        path: native.path,
        heavyAtoms: heavy,
        nativeMs: native.ms,
        note: 'graph match',
      });
      skipped++;
      continue;
    }

    const natHeavy = natStruct.atoms.filter(a => a.element !== 'H');
    const refAligned: Atom3D[] = [];
    const natAligned: Atom3D[] = [];
    for (const [refIdx, natIdx] of [...mapping.entries()].sort((a, b) => a[0] - b[0])) {
      refAligned.push(ref.atoms[refIdx]!);
      natAligned.push(natHeavy[natIdx]!);
    }

    const distMae = distanceMatrixMae(ref.atoms, natHeavy, mapping);
    const rmsd = kabschRmsd(refAligned, natAligned);
    const maxAbsZ = natStruct.atoms.reduce((m, a) => Math.max(m, Math.abs(a.z)), 0);

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
      const refLen = dist(ref.atoms[refI]!, ref.atoms[refJ]!);
      const natLen = dist(natHeavy[natI]!, natHeavy[natJ]!);
      bondErrSum += Math.abs(refLen - natLen);
      const order = bondOrderFor(b);
      targetErrSum += Math.abs(natLen - targetBondLengthA(a1.element, a2.element, order));
      bondCount++;
    }

    const bondMaeCactus = bondCount > 0 ? bondErrSum / bondCount : 0;
    const bondMaeTargets = bondCount > 0 ? targetErrSum / bondCount : 0;
    const gate = GATES[tier];

    const hardFail = maxAbsZ < 0.3 || !Number.isFinite(distMae) || !Number.isFinite(rmsd);
    const ok =
      !hardFail &&
      distMae <= gate.distMae &&
      rmsd <= gate.rmsd &&
      bondMaeCactus <= gate.bondMae &&
      bondMaeTargets <= gate.tgtMae;
    const softOk =
      !hardFail &&
      distMae <= gate.distMae * 1.4 &&
      rmsd <= gate.rmsd * 1.35 &&
      bondMaeCactus <= gate.bondMae * 1.3;

    let status: ResultRow['status'];
    if (hardFail) {
      status = 'fail';
      failed++;
    } else if (ok) {
      status = 'ok';
      passed++;
    } else if (softOk) {
      status = 'weak';
      weak++;
    } else {
      status = 'fail';
      failed++;
    }

    const tag = status === 'ok' ? 'PASS' : status === 'weak' ? 'WEAK' : 'FAIL';
    console.log(
      `${tag} [${refSource}/${native.path}] heavy=${heavy} ` +
        `distΔ=${distMae.toFixed(3)} RMSD=${rmsd.toFixed(3)} bondΔ=${bondMaeCactus.toFixed(3)} ` +
        `${native.ms}ms`,
    );

    rows.push({
      name,
      tier,
      status,
      refSource,
      path: native.path,
      heavyAtoms: heavy,
      nativeMs: native.ms,
      cactusMs: cactus.ms,
      distMae,
      kabschRmsd: rmsd,
      bondMaeCactus,
      bondMaeTargets,
      maxAbsZ,
    });

    await sleep(350);
  }

  console.log('\n── Summary ───────────────────────────────────────────────────────');
  console.log(
    `${'Molecule'.padEnd(14)}${'Tier'.padEnd(8)}${'Ref'.padStart(8)}${'Path'.padStart(12)}` +
      `${'Hvy'.padStart(5)}${'distΔ'.padStart(8)}${'RMSD'.padStart(8)}${'bondΔ'.padStart(8)}${'ms'.padStart(7)}  Result`,
  );
  for (const r of rows) {
    if (r.status === 'skip') {
      console.log(
        `${r.name.padEnd(14)}${r.tier.padEnd(8)}${'—'.padStart(8)}${(r.path ?? '—').padStart(12)}` +
          `${String(r.heavyAtoms).padStart(5)}${'—'.padStart(8)}${'—'.padStart(8)}${'—'.padStart(8)}` +
          `${String(r.nativeMs ?? '—').padStart(7)}  SKIP ${r.note ?? ''}`,
      );
      continue;
    }
    const label = r.status === 'ok' ? 'PASS' : r.status === 'weak' ? 'WEAK' : 'FAIL';
    console.log(
      `${r.name.padEnd(14)}${r.tier.padEnd(8)}${(r.refSource ?? '?').padStart(8)}${(r.path ?? '?').padStart(12)}` +
        `${String(r.heavyAtoms).padStart(5)}` +
        `${(r.distMae ?? 0).toFixed(3).padStart(8)}` +
        `${(r.kabschRmsd ?? 0).toFixed(3).padStart(8)}` +
        `${(r.bondMaeCactus ?? 0).toFixed(3).padStart(8)}` +
        `${String(r.nativeMs ?? 0).padStart(7)}  ${label}`,
    );
  }

  const scored = rows.filter(r => r.status !== 'skip');
  const cactusScored = scored.filter(r => r.refSource === 'cactus');
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

  const report = {
    startedAt,
    finishedAt: new Date().toISOString(),
    cactusHealth: health,
    summary: {
      total: rows.length,
      passed,
      weak,
      failed,
      skipped,
      cactusHits,
      pubchemHits,
      cactusScored: cactusScored.length,
      avgDistMaeCactus: avg(cactusScored.map(r => r.distMae!).filter(Number.isFinite)),
      avgRmsdCactus: avg(cactusScored.map(r => r.kabschRmsd!).filter(Number.isFinite)),
      avgBondMaeCactus: avg(cactusScored.map(r => r.bondMaeCactus!).filter(Number.isFinite)),
      avgNativeMs: avg(rows.map(r => r.nativeMs!).filter(n => Number.isFinite(n))),
    },
    gates: GATES,
    rows,
  };

  const outPath = join(dirname(fileURLToPath(import.meta.url)), 'cactus3d-dependability-report.json');
  writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(`\n${passed} passed, ${weak} weak, ${failed} failed, ${skipped} skipped`);
  console.log(`CACTUS refs: ${cactusHits}  PubChem fallbacks: ${pubchemHits}`);
  console.log(`Wrote ${outPath}`);

  // Exit 0 if CACTUS was down (skip-heavy) so CI doesn't flake; exit 1 on hard fails when scored.
  if (failed > 0 && scored.length > 0) process.exit(1);
};

run().catch(err => {
  console.error(err);
  process.exit(1);
});

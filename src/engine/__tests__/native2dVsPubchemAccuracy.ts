/**
 * Generic native 2D vs PubChem 2D accuracy check.
 *
 * Reference = PubChem precomputed 2D SDF (public depiction gold standard;
 * same coords used by PubChem import / GitHub-mirrored PubChem dumps).
 *
 * For every molecule (not paclitaxel-specific):
 *   1) Fetch PubChem 2D SDF
 *   2) Native: parse SMILES → generate2D seed → certifyLayout (B–D)
 *   3) Compare depiction quality (overlaps, crossings, bond ratio, CCC)
 *   4) When heavy-atom graphs match: Kabsch 2D RMSD after scale+align
 *
 * Run: npx tsx src/engine/__tests__/native2dVsPubchemAccuracy.ts
 * Requires network.
 */
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseMolblock } from '@moldraw/core/io/molblock';
import { pubchemMolblockFromSmiles } from '@moldraw/core/io/pubchemSmiles';
import { withPubChemThrottle } from '@moldraw/core/io/pubchemRateLimit';
import { firstRecordFromSdf } from '@moldraw/core/io/sdfExtract';
import type { Molecule } from '@moldraw/domain';
import { nativeEngine as engine } from '../nativeEngine';
import { certifyLayout } from '../layout/certifyLayout';
import { stripTerminalHydrogensForLayout } from '../layout/generate2d';
import {
  layoutScore,
  measureLayoutQuality,
  passesHardGate,
  passesSoftGate,
  type LayoutQuality,
} from '../layout/layoutQuality';
import { buildGraph, type MoleculeGraph } from '../graph';

const BOND = 45;
const PUBCHEM = 'https://pubchem.ncbi.nlm.nih.gov/rest/pug';

interface Case {
  name: string;
  smiles: string;
  /** Optional PubChem CID for a known compound (e.g. true paclitaxel). */
  cid?: number;
  /** Soft gate for hard polycyclics; hard gate for Tier A. */
  tier: 'A' | 'poly';
}

/** Generic suite — same approach for every molecule. */
const CASES: Case[] = [
  { name: 'ethanol', smiles: 'CCO', tier: 'A' },
  { name: 'benzene', smiles: 'c1ccccc1', tier: 'A' },
  { name: 'aspirin', smiles: 'CC(=O)Oc1ccccc1C(=O)O', tier: 'A' },
  { name: 'caffeine', smiles: 'CN1C=NC2=C1C(=O)N(C(=O)N2C)C', tier: 'A' },
  { name: 'naphthalene', smiles: 'c1ccc2ccccc2c1', tier: 'A' },
  { name: 'ibuprofen', smiles: 'CC(C)Cc1ccc(cc1)C(C)C(=O)O', tier: 'A' },
  { name: 'cholesterol', smiles: 'CC(C)CCCC(C)C1CCC2C3CC=C4CC(O)CCC4(C)C3CCC12C', tier: 'A' },
  {
    name: 'penicillinG',
    smiles: 'CC1(C)SC2C(NC(=O)Cc3ccccc3)C(=O)N2C1C(=O)O',
    tier: 'A',
  },
  {
    name: 'paclitaxel-like',
    smiles:
      'CC(=O)OC1C(=O)C2(C)C(O)CC3OCC3(OC(C)=O)C2C(OC(=O)c2ccccc2)C2(O)CC(OC(=O)C(O)C(NC(=O)c3ccccc3)c3ccccc3)C(C)=C1C2(C)C',
    tier: 'poly',
  },
  {
    name: 'paclitaxel-CID36314',
    // Canonical PubChem paclitaxel SMILES (CID 36314)
    smiles:
      'CC1=C2[C@H](C(=O)[C@]3([C@H](C[C@@H]4[C@]([C@H]3[C@@H]([C@@](C2(C)C)(C[C@@H]1OC(=O)[C@@H]([C@H](C5=CC=CC=C5)NC(=O)C6=CC=CC=C6)O)O)OC(=O)C7=CC=CC=C7)(CO4)OC(=O)C)O)C)OC(=O)C',
    cid: 36314,
    tier: 'poly',
  },
];

interface Vec {
  x: number;
  y: number;
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

const fetchPubChemByCid = async (cid: number): Promise<string | null> =>
  withPubChemThrottle(async () => {
    try {
      const res = await fetch(`${PUBCHEM}/compound/cid/${cid}/SDF`);
      if (!res.ok) return null;
      const txt = await res.text();
      return firstRecordFromSdf(txt) ?? (txt.includes('V2000') ? txt.split('$$$$')[0]!.trim() : null);
    } catch {
      return null;
    }
  });

const scaleToBond = (mol: Molecule, bondLen: number): Molecule => {
  const q = measureLayoutQuality(mol);
  if (q.avgBond < 1e-6) return mol;
  const s = bondLen / q.avgBond;
  return {
    ...mol,
    atoms: mol.atoms.map(a => ({ ...a, x: a.x * s, y: a.y * s })),
  };
};

/** Simple Morgan-like ranks for heavy atoms (generic graph matching). */
const heavyRanks = (mol: Molecule, g: MoleculeGraph): Map<string, number> => {
  const heavy = new Set(mol.atoms.filter(a => a.element !== 'H').map(a => a.id));
  const byId = new Map(mol.atoms.map(a => [a.id, a]));
  let labels = new Map<string, string>();
  for (const id of heavy) {
    const a = byId.get(id)!;
    const deg = (g.nodes.get(id)?.neighbors ?? []).filter(n => heavy.has(n)).length;
    labels.set(id, `${a.element}:${deg}`);
  }
  for (let round = 0; round < 4; round++) {
    const next = new Map<string, string>();
    for (const id of heavy) {
      const nbs = (g.nodes.get(id)?.neighbors ?? [])
        .filter(n => heavy.has(n))
        .map(n => labels.get(n)!)
        .sort();
      next.set(id, `${labels.get(id)}>${nbs.join(',')}`);
    }
    labels = next;
  }
  const uniq = [...new Set(labels.values())].sort();
  const rankOf = new Map(uniq.map((s, i) => [s, i]));
  const out = new Map<string, number>();
  for (const [id, lab] of labels) out.set(id, rankOf.get(lab)!);
  return out;
};

/** Map PubChem heavy atoms → native heavy atoms by rank (1:1 when unique). */
const mapByRank = (ref: Molecule, nat: Molecule): Map<string, string> | null => {
  const refG = buildGraph(ref);
  const natG = buildGraph(nat);
  const refR = heavyRanks(ref, refG);
  const natR = heavyRanks(nat, natG);
  const refHeavy = ref.atoms.filter(a => a.element !== 'H');
  const natHeavy = nat.atoms.filter(a => a.element !== 'H');
  if (refHeavy.length !== natHeavy.length) return null;

  const refBy = new Map<number, string[]>();
  for (const a of refHeavy) {
    const r = refR.get(a.id)!;
    const list = refBy.get(r) ?? [];
    list.push(a.id);
    refBy.set(r, list);
  }
  const natBy = new Map<number, string[]>();
  for (const a of natHeavy) {
    const r = natR.get(a.id)!;
    const list = natBy.get(r) ?? [];
    list.push(a.id);
    natBy.set(r, list);
  }

  const map = new Map<string, string>();
  for (const [rank, refIds] of refBy) {
    const natIds = natBy.get(rank);
    if (!natIds || natIds.length !== refIds.length) return null;
    // Ambiguous ranks: pair in stable id order (best-effort).
    const rs = [...refIds].sort();
    const ns = [...natIds].sort();
    for (let i = 0; i < rs.length; i++) map.set(rs[i]!, ns[i]!);
  }
  return map.size === refHeavy.length ? map : null;
};

/** 2D Kabsch RMSD (px) after centering + optimal rotation. */
const kabschRmsd2D = (ref: Vec[], nat: Vec[]): number => {
  const n = ref.length;
  if (n === 0) return 0;
  const cxR = ref.reduce((s, p) => s + p.x, 0) / n;
  const cyR = ref.reduce((s, p) => s + p.y, 0) / n;
  const cxN = nat.reduce((s, p) => s + p.x, 0) / n;
  const cyN = nat.reduce((s, p) => s + p.y, 0) / n;
  const P = ref.map(p => ({ x: p.x - cxR, y: p.y - cyR }));
  const Q = nat.map(p => ({ x: p.x - cxN, y: p.y - cyN }));

  let h00 = 0;
  let h01 = 0;
  let h10 = 0;
  let h11 = 0;
  for (let i = 0; i < n; i++) {
    h00 += P[i]!.x * Q[i]!.x;
    h01 += P[i]!.x * Q[i]!.y;
    h10 += P[i]!.y * Q[i]!.x;
    h11 += P[i]!.y * Q[i]!.y;
  }
  // Optimal 2D rotation from SVD of H: angle = atan2(h10-h01, h00+h11)
  const theta = Math.atan2(h10 - h01, h00 + h11);
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const rx = Q[i]!.x * cos - Q[i]!.y * sin;
    const ry = Q[i]!.x * sin + Q[i]!.y * cos;
    const dx = P[i]!.x - rx;
    const dy = P[i]!.y - ry;
    sum += dx * dx + dy * dy;
  }
  return Math.sqrt(sum / n);
};

const rmsdVsRef = (ref: Molecule, nat: Molecule): number | null => {
  const map = mapByRank(ref, nat);
  if (!map) return null;
  const byRef = new Map(ref.atoms.map(a => [a.id, a]));
  const byNat = new Map(nat.atoms.map(a => [a.id, a]));
  const R: Vec[] = [];
  const N: Vec[] = [];
  for (const [rid, nid] of map) {
    const a = byRef.get(rid)!;
    const b = byNat.get(nid)!;
    R.push({ x: a.x, y: a.y });
    N.push({ x: b.x, y: b.y });
  }
  return kabschRmsd2D(R, N);
};

const fmtQ = (q: LayoutQuality) =>
  `ov=${q.overlaps} x=${q.crossings} ratio=${q.bondRatio.toFixed(2)} cccBad=${(q.badCccFraction * 100).toFixed(0)}%`;

interface Row {
  name: string;
  tier: 'A' | 'poly';
  status: 'PASS' | 'WARN' | 'FAIL' | 'SKIP';
  pc: LayoutQuality | null;
  nat: LayoutQuality | null;
  rmsdPx: number | null;
  natMs: number;
  statusNote: string;
  layoutStatus: string;
}

async function runCase(c: Case): Promise<Row> {
  console.log(`\n=== ${c.name} (${c.tier}) ===`);

  let pcMb: string | null = null;
  if (c.cid != null) {
    pcMb = await fetchPubChemByCid(c.cid);
    console.log(`  PubChem CID ${c.cid}: ${pcMb ? 'OK' : 'MISS'}`);
  }
  if (!pcMb) {
    pcMb = await pubchemMolblockFromSmiles(c.smiles);
    console.log(`  PubChem SMILES: ${pcMb ? 'OK' : 'MISS'}`);
  }
  if (!pcMb) {
    return {
      name: c.name,
      tier: c.tier,
      status: 'SKIP',
      pc: null,
      nat: null,
      rmsdPx: null,
      natMs: 0,
      statusNote: 'no PubChem 2D',
      layoutStatus: '-',
    };
  }

  let pcMol = stripTerminalHydrogensForLayout(parseMolblock(pcMb));
  pcMol = scaleToBond(pcMol, BOND);
  const pcQ = measureLayoutQuality(pcMol);
  console.log(`  PubChem 2D:  ${fmtQ(pcQ)} score=${layoutScore(pcMol).toFixed(1)}`);

  const t0 = Date.now();
  let native: Molecule;
  try {
    const seed = engine.generate2D(engine.parseSmiles(c.smiles), { bondLengthPx: BOND });
    const certified = certifyLayout(seed, {
      bondLengthPx: BOND,
      maxRestarts: c.tier === 'poly' ? 4 : 2,
      repairRounds: c.tier === 'poly' ? 5 : 3,
    });
    native = certified.molecule;
    const natMs = Date.now() - t0;
    const natQ = measureLayoutQuality(native);
    const rmsd = rmsdVsRef(pcMol, native);
    console.log(
      `  Native cert: ${fmtQ(natQ)} score=${layoutScore(native).toFixed(1)} status=${certified.status} ${natMs}ms`,
    );
    if (rmsd != null) {
      console.log(`  Kabsch 2D RMSD vs PubChem: ${rmsd.toFixed(2)} px (${(rmsd / BOND).toFixed(2)} bonds)`);
    } else {
      console.log('  Kabsch 2D RMSD: n/a (atom-rank map failed — stereo/H or tautomer mismatch)');
    }

    // Generic verdict — same rules for all molecules.
    const notes: string[] = [];
    const gateOk =
      c.tier === 'A' ? passesHardGate(native) : passesSoftGate(native);
    if (!gateOk) {
      notes.push(c.tier === 'A' ? 'hard-gate fail' : 'soft-gate fail');
    }
    // Native should not be dramatically worse than PubChem on depiction metrics.
    if (natQ.overlaps > pcQ.overlaps + (c.tier === 'A' ? 0 : 2)) {
      notes.push(`overlaps worse (${natQ.overlaps} vs PC ${pcQ.overlaps})`);
    }
    if (natQ.crossings > pcQ.crossings + (c.tier === 'A' ? 1 : 3)) {
      notes.push(`crossings worse (${natQ.crossings} vs PC ${pcQ.crossings})`);
    }
    // Tier A: RMSD should be small when mappable (same depiction family).
    if (c.tier === 'A' && rmsd != null && rmsd > BOND * 2.5) {
      notes.push(`RMSD high (${rmsd.toFixed(1)}px)`);
    }
    // Poly: RMSD is informative but not a hard fail (different valid depictions).
    if (c.tier === 'poly' && rmsd != null && rmsd > BOND * 8) {
      notes.push(`RMSD very high (${rmsd.toFixed(1)}px)`);
    }

    const status: Row['status'] =
      notes.length === 0 ? 'PASS' : gateOk ? 'WARN' : 'FAIL';
    console.log(`  → ${status}${notes.length ? ' | ' + notes.join('; ') : ''}`);

    return {
      name: c.name,
      tier: c.tier,
      status,
      pc: pcQ,
      nat: natQ,
      rmsdPx: rmsd,
      natMs,
      statusNote: notes.join('; ') || 'ok',
      layoutStatus: certified.status,
    };
  } catch (err) {
    console.log(`  Native FAILED: ${err}`);
    return {
      name: c.name,
      tier: c.tier,
      status: 'FAIL',
      pc: pcQ,
      nat: null,
      rmsdPx: null,
      natMs: Date.now() - t0,
      statusNote: String(err),
      layoutStatus: 'error',
    };
  }
}

async function main() {
  console.log('Native 2D (certify) vs PubChem 2D — Generic Accuracy');
  console.log('Bond target:', BOND, 'px');
  console.log('Approach: same pipeline for all molecules (minimize → repair → multi-start)\n');

  const rows: Row[] = [];
  for (const c of CASES) {
    rows.push(await runCase(c));
    await sleep(350);
  }

  const done = rows.filter(r => r.status !== 'SKIP');
  const pass = done.filter(r => r.status === 'PASS').length;
  const warn = done.filter(r => r.status === 'WARN').length;
  const fail = done.filter(r => r.status === 'FAIL').length;

  console.log('\n========== SUMMARY ==========');
  console.log(
    'name'.padEnd(22),
    'tier'.padStart(4),
    'natOv'.padStart(5),
    'pcOv'.padStart(5),
    'natX'.padStart(5),
    'pcX'.padStart(5),
    'RMSDpx'.padStart(8),
    'status'.padStart(6),
    'layout',
  );
  for (const r of rows) {
    console.log(
      r.name.padEnd(22),
      r.tier.padStart(4),
      String(r.nat?.overlaps ?? '-').padStart(5),
      String(r.pc?.overlaps ?? '-').padStart(5),
      String(r.nat?.crossings ?? '-').padStart(5),
      String(r.pc?.crossings ?? '-').padStart(5),
      (r.rmsdPx != null ? r.rmsdPx.toFixed(1) : '-').padStart(8),
      r.status.padStart(6),
      r.layoutStatus,
    );
  }
  console.log(`\nDone: ${done.length}  PASS ${pass}  WARN ${warn}  FAIL ${fail}`);

  const paclitaxel = rows.filter(r => r.name.startsWith('paclitaxel'));
  console.log('\n--- Paclitaxel focus ---');
  for (const r of paclitaxel) {
    console.log(
      `${r.name}: native ov=${r.nat?.overlaps} x=${r.nat?.crossings} | PubChem ov=${r.pc?.overlaps} x=${r.pc?.crossings} | RMSD=${r.rmsdPx?.toFixed(1) ?? 'n/a'}px | ${r.status} (${r.layoutStatus})`,
    );
  }

  const outPath = resolve('src/engine/__tests__/native2d-vs-pubchem-report.json');
  writeFileSync(
    outPath,
    JSON.stringify(
      {
        bondLengthPx: BOND,
        method:
          'PubChem 2D SDF reference vs native certifyLayout (minimize2D + repairCrossings + multi-start)',
        generatedAt: new Date().toISOString(),
        summary: { done: done.length, pass, warn, fail },
        rows,
      },
      null,
      2,
    ),
  );
  console.log(`\nWrote ${outPath}`);

  if (fail > 0) process.exitCode = 1;
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

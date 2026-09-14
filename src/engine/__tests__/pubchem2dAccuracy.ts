/**
 * PubChem 2D vs native engine layout accuracy report.
 *
 * Fetches PubChem precomputed 2D SDF (ground truth depiction), then compares:
 *   A) native generate2D from SMILES
 *   B) cleanupStructure on native layout
 *   C) cleanupStructure on PubChem coords (must not destroy a good depiction)
 *
 * Run: npx tsx src/engine/__tests__/pubchem2dAccuracy.ts
 *
 * Requires network. Throttled to ~3 req/s.
 */
import { parseMolblock } from '@moldraw/core/io/molblock';
import { pubchemMolblockFromSmiles } from '@moldraw/core/io/pubchemSmiles';
import { nativeEngine as engine } from '../nativeEngine';
import { cleanupStructure } from '../layout/cleanupStructure';
import { stripTerminalHydrogensForLayout } from '../layout/generate2d';
import { perceiveRings } from '../chem/rings';
import { buildGraph } from '../graph';
import type { Molecule } from '@moldraw/domain';

const BOND = 45;

interface Case {
  name: string;
  smiles: string;
}

const CASES: Case[] = [
  { name: 'ethanol', smiles: 'CCO' },
  { name: 'benzene', smiles: 'c1ccccc1' },
  { name: 'aspirin', smiles: 'CC(=O)Oc1ccccc1C(=O)O' },
  { name: 'caffeine', smiles: 'CN1C=NC2=C1C(=O)N(C(=O)N2C)C' },
  { name: 'naphthalene', smiles: 'c1ccc2ccccc2c1' },
  { name: 'cholesterol', smiles: 'CC(C)CCCC(C)C1CCC2C3CC=C4CC(O)CCC4(C)C3CCC12C' },
  { name: 'ibuprofen', smiles: 'CC(C)Cc1ccc(cc1)C(C)C(=O)O' },
  { name: 'glucose', smiles: 'OC[C@H]1OC(O)[C@H](O)[C@@H](O)[C@@H]1O' },
  { name: 'penicillinG', smiles: 'CC1(C)SC2C(NC(=O)Cc3ccccc3)C(=O)N2C1C(=O)O' },
  {
    name: 'paclitaxel-like',
    smiles:
      'CC(=O)OC1C(=O)C2(C)C(O)CC3OCC3(OC(C)=O)C2C(OC(=O)c2ccccc2)C2(O)CC(OC(=O)C(O)C(NC(=O)c3ccccc3)c3ccccc3)C(C)=C1C2(C)C',
  },
];

interface LayoutMetrics {
  heavyAtoms: number;
  bonds: number;
  avgBond: number;
  minBond: number;
  maxBond: number;
  bondRatio: number;
  overlaps: number;
  crossings: number;
  badCccAngles: number;
  totalCccAngles: number;
  ringBondOk: number;
  ringBondTotal: number;
  ms: number;
}

const heavy = (mol: Molecule) => mol.atoms.filter(a => a.element !== 'H');

const bondStats = (mol: Molecule) => {
  const byId = new Map(mol.atoms.map(a => [a.id, a]));
  let sum = 0;
  let n = 0;
  let min = Infinity;
  let max = 0;
  for (const b of mol.bonds) {
    const a1 = byId.get(b.fromAtomId);
    const a2 = byId.get(b.toAtomId);
    if (!a1 || !a2 || a1.element === 'H' || a2.element === 'H') continue;
    const d = Math.hypot(a1.x - a2.x, a1.y - a2.y);
    sum += d;
    n += 1;
    min = Math.min(min, d);
    max = Math.max(max, d);
  }
  const avg = n ? sum / n : 0;
  return { avg, min: n ? min : 0, max, n, ratio: n ? max / Math.max(min, 1e-6) : 1 };
};

const countOverlaps = (mol: Molecule, avgBond: number): number => {
  const atoms = heavy(mol);
  const bonded = new Set(
    mol.bonds.map(b =>
      b.fromAtomId < b.toAtomId ? `${b.fromAtomId}|${b.toAtomId}` : `${b.toAtomId}|${b.fromAtomId}`,
    ),
  );
  let overlaps = 0;
  const thresh = avgBond * 0.35;
  for (let i = 0; i < atoms.length; i++) {
    for (let j = i + 1; j < atoms.length; j++) {
      const a = atoms[i]!;
      const b = atoms[j]!;
      const key = a.id < b.id ? `${a.id}|${b.id}` : `${b.id}|${a.id}`;
      if (bonded.has(key)) continue;
      if (Math.hypot(a.x - b.x, a.y - b.y) < thresh) overlaps += 1;
    }
  }
  return overlaps;
};

const segmentsCross = (
  a: { x: number; y: number },
  b: { x: number; y: number },
  c: { x: number; y: number },
  d: { x: number; y: number },
): boolean => {
  const cross = (p: typeof a, q: typeof a, r: typeof a) =>
    (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  const d1 = cross(a, b, c);
  const d2 = cross(a, b, d);
  const d3 = cross(c, d, a);
  const d4 = cross(c, d, b);
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
    return true;
  }
  return false;
};

const countCrossings = (mol: Molecule): number => {
  const byId = new Map(mol.atoms.map(a => [a.id, a]));
  const segs = mol.bonds
    .map(b => {
      const a1 = byId.get(b.fromAtomId);
      const a2 = byId.get(b.toAtomId);
      if (!a1 || !a2 || a1.element === 'H' || a2.element === 'H') return null;
      return { a: a1, b: a2, id: b.id };
    })
    .filter(Boolean) as { a: { id: string; x: number; y: number }; b: { id: string; x: number; y: number }; id: string }[];
  let crossings = 0;
  for (let i = 0; i < segs.length; i++) {
    for (let j = i + 1; j < segs.length; j++) {
      const s = segs[i]!;
      const t = segs[j]!;
      const ids = new Set([s.a.id, s.b.id, t.a.id, t.b.id]);
      if (ids.size < 4) continue; // share a vertex
      if (segmentsCross(s.a, s.b, t.a, t.b)) crossings += 1;
    }
  }
  return crossings;
};

const cccAngles = (mol: Molecule): { bad: number; total: number } => {
  const g = buildGraph(mol);
  const rings = perceiveRings(mol);
  const ringSet = new Set(rings.flatMap(r => r.atomIds));
  const byId = new Map(mol.atoms.map(a => [a.id, a]));
  let bad = 0;
  let total = 0;
  for (const a of mol.atoms) {
    if (a.element !== 'C') continue;
    const nbs = (g.nodes.get(a.id)?.neighbors ?? []).filter(nb => byId.get(nb)?.element === 'C');
    if (nbs.length < 2) continue;
    for (let i = 0; i < nbs.length; i++) {
      for (let j = i + 1; j < nbs.length; j++) {
        if (ringSet.has(a.id) && ringSet.has(nbs[i]!) && ringSet.has(nbs[j]!)) continue;
        const p = byId.get(a.id)!;
        const q = byId.get(nbs[i]!)!;
        const r = byId.get(nbs[j]!)!;
        const da = Math.atan2(q.y - p.y, q.x - p.x);
        const db = Math.atan2(r.y - p.y, r.x - p.x);
        let diff = Math.abs(da - db);
        if (diff > Math.PI) diff = 2 * Math.PI - diff;
        const deg = (diff * 180) / Math.PI;
        total += 1;
        if (Math.abs(deg - 120) > 25 && Math.abs(deg - 180) > 25) bad += 1;
      }
    }
  }
  return { bad, total };
};

const ringBondQuality = (mol: Molecule, target: number): { ok: number; total: number } => {
  const byId = new Map(mol.atoms.map(a => [a.id, a]));
  const rings = perceiveRings(mol);
  let ok = 0;
  let total = 0;
  for (const ring of rings) {
    const ids = ring.atomIds;
    for (let i = 0; i < ids.length; i++) {
      const a = byId.get(ids[i]!);
      const b = byId.get(ids[(i + 1) % ids.length]!);
      if (!a || !b) continue;
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      total += 1;
      if (Math.abs(d - target) < target * 0.2) ok += 1;
    }
  }
  return { ok, total };
};

const measure = (mol: Molecule, ms: number): LayoutMetrics => {
  const stripped = stripTerminalHydrogensForLayout(mol);
  const bs = bondStats(stripped);
  const ccc = cccAngles(stripped);
  const rb = ringBondQuality(stripped, bs.avg || BOND);
  return {
    heavyAtoms: heavy(stripped).length,
    bonds: bs.n,
    avgBond: bs.avg,
    minBond: bs.min,
    maxBond: bs.max,
    bondRatio: bs.ratio,
    overlaps: countOverlaps(stripped, bs.avg || BOND),
    crossings: countCrossings(stripped),
    badCccAngles: ccc.bad,
    totalCccAngles: ccc.total,
    ringBondOk: rb.ok,
    ringBondTotal: rb.total,
    ms,
  };
};

const scaleToBond = (mol: Molecule, bondLen: number): Molecule => {
  const bs = bondStats(mol);
  if (bs.avg < 1e-6) return mol;
  const s = bondLen / bs.avg;
  return {
    ...mol,
    atoms: mol.atoms.map(a => ({ ...a, x: a.x * s, y: a.y * s })),
  };
};

const passFail = (m: LayoutMetrics, label: string): { ok: boolean; reasons: string[] } => {
  const reasons: string[] = [];
  if (m.bondRatio > 2.5) reasons.push(`bondRatio ${m.bondRatio.toFixed(2)} > 2.5`);
  if (m.overlaps > 5) reasons.push(`overlaps ${m.overlaps} > 5`);
  if (m.crossings > 3) reasons.push(`crossings ${m.crossings} > 3`);
  if (m.totalCccAngles > 0 && m.badCccAngles / m.totalCccAngles > 0.4) {
    reasons.push(`badCCC ${(100 * m.badCccAngles) / m.totalCccAngles}%`);
  }
  if (m.ringBondTotal > 0 && m.ringBondOk / m.ringBondTotal < 0.7) {
    reasons.push(`ringBonds ${m.ringBondOk}/${m.ringBondTotal}`);
  }
  return { ok: reasons.length === 0, reasons: reasons.map(r => `${label}: ${r}`) };
};

const fmt = (m: LayoutMetrics) =>
  `avg=${m.avgBond.toFixed(1)} ratio=${m.bondRatio.toFixed(2)} ov=${m.overlaps} x=${m.crossings} ` +
  `cccBad=${m.badCccAngles}/${m.totalCccAngles} ring=${m.ringBondOk}/${m.ringBondTotal} ${m.ms}ms`;

async function runCase(c: Case) {
  console.log(`\n=== ${c.name} ===`);
  console.log(`SMILES: ${c.smiles.slice(0, 80)}${c.smiles.length > 80 ? '…' : ''}`);

  const tPc = Date.now();
  const pcMb = await pubchemMolblockFromSmiles(c.smiles);
  const pcFetchMs = Date.now() - tPc;
  if (!pcMb) {
    console.log(`  PubChem: NOT FOUND (${pcFetchMs}ms)`);
    return { name: c.name, skipped: true as const };
  }
  let pcMol = stripTerminalHydrogensForLayout(parseMolblock(pcMb));
  pcMol = scaleToBond(pcMol, BOND);
  const pc = measure(pcMol, pcFetchMs);
  console.log(`  PubChem SDF:  ${fmt(pc)}`);

  const tNat = Date.now();
  let native: Molecule;
  try {
    native = engine.generate2D(engine.parseSmiles(c.smiles), { bondLengthPx: BOND });
  } catch (err) {
    console.log(`  Native generate2D FAILED: ${err}`);
    return { name: c.name, skipped: true as const };
  }
  const nat = measure(native, Date.now() - tNat);
  console.log(`  Native 2D:    ${fmt(nat)}`);

  const tCleanNat = Date.now();
  const cleanedNat = cleanupStructure(native, { bondLengthPx: BOND, preserveOrientation: true });
  const cleanNat = measure(cleanedNat, Date.now() - tCleanNat);
  console.log(`  Cleanup←nat:  ${fmt(cleanNat)}`);

  const tCleanPc = Date.now();
  const cleanedPc = cleanupStructure(pcMol, { bondLengthPx: BOND, preserveOrientation: true });
  const cleanPc = measure(cleanedPc, Date.now() - tCleanPc);
  console.log(`  Cleanup←PC:   ${fmt(cleanPc)}`);

  // Cleanup on PubChem must not make overlaps/crossings worse than PubChem.
  const pcOk = passFail(pc, 'pubchem');
  const natOk = passFail(nat, 'native');
  const cleanNatOk = passFail(cleanNat, 'cleanup←nat');
  const cleanPcOk = passFail(cleanPc, 'cleanup←PC');
  const cleanupDestroyedPc =
    cleanPc.overlaps > pc.overlaps + 2 ||
    cleanPc.crossings > pc.crossings + 2 ||
    cleanPc.bondRatio > Math.max(pc.bondRatio * 1.5, 2.0);

  const verdicts = [
    ...pcOk.reasons,
    ...natOk.reasons,
    ...cleanNatOk.reasons,
    ...cleanPcOk.reasons,
  ];
  if (cleanupDestroyedPc) {
    verdicts.push('cleanup←PC: DESTROYED good PubChem layout');
  }

  const status =
    natOk.ok && cleanNatOk.ok && !cleanupDestroyedPc
      ? 'PASS'
      : natOk.ok && !cleanupDestroyedPc
        ? 'WARN'
        : 'FAIL';

  console.log(`  → ${status}${verdicts.length ? ' | ' + verdicts.join('; ') : ''}`);

  return {
    name: c.name,
    skipped: false as const,
    status,
    pc,
    nat,
    cleanNat,
    cleanPc,
    cleanupDestroyedPc,
    verdicts,
  };
}

async function main() {
  console.log('PubChem 2D vs Native Engine — Accuracy Report');
  console.log('Bond target:', BOND, 'px\n');

  const rows = [];
  for (const c of CASES) {
    rows.push(await runCase(c));
  }

  const done = rows.filter(r => !r.skipped) as Extract<(typeof rows)[number], { skipped: false }>[];
  const pass = done.filter(r => r.status === 'PASS').length;
  const warn = done.filter(r => r.status === 'WARN').length;
  const fail = done.filter(r => r.status === 'FAIL').length;
  const destroyed = done.filter(r => r.cleanupDestroyedPc).length;

  console.log('\n========== SUMMARY ==========');
  console.log(`Cases: ${done.length}  PASS ${pass}  WARN ${warn}  FAIL ${fail}`);
  console.log(`Cleanup destroyed PubChem layout: ${destroyed}/${done.length}`);

  console.log('\nNative vs PubChem (lower overlaps/crossings/ratio is better):');
  console.log(
    'name'.padEnd(16),
    'natOv'.padStart(5),
    'pcOv'.padStart(5),
    'natX'.padStart(5),
    'pcX'.padStart(5),
    'natR'.padStart(6),
    'pcR'.padStart(6),
    'status',
  );
  for (const r of done) {
    console.log(
      r.name.padEnd(16),
      String(r.nat.overlaps).padStart(5),
      String(r.pc.overlaps).padStart(5),
      String(r.nat.crossings).padStart(5),
      String(r.pc.crossings).padStart(5),
      r.nat.bondRatio.toFixed(2).padStart(6),
      r.pc.bondRatio.toFixed(2).padStart(6),
      r.status,
    );
  }

  // Exit non-zero if native is clearly worse on > half of cases.
  const nativeWorse = done.filter(
    r =>
      r.nat.overlaps > r.pc.overlaps + 3 ||
      r.nat.crossings > r.pc.crossings + 2 ||
      r.nat.bondRatio > r.pc.bondRatio * 1.8 + 0.5,
  ).length;
  console.log(`\nNative clearly worse than PubChem: ${nativeWorse}/${done.length}`);
  if (fail > 0 || destroyed > 0) process.exitCode = 1;
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

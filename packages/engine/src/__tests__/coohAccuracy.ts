/**
 * COOH / carbonyl cleanup accuracy — scramble → cleanup → score O geometry.
 * Run: npx tsx src/engine/__tests__/coohAccuracy.ts
 *
 * ChemDraw rules:
 *   • Carbonyl C is trigonal: all X–C–Y angles ≈ 120°
 *   • C=O (order 2) and C–OH / C–OR (order 1) occupy distinct slots
 *   • Ester / ether C–O–C ≈ 120°
 *   • Bond lengths = bondLengthPx
 *   • Topology preserved
 */
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cleanupStructure } from '../layout/cleanupStructure';
import { parseSmilesToMolecule } from '../smiles/parse';
import { bondBetween, buildGraph } from '../graph';
import type { Molecule } from '@moldraw/domain';

const BOND = 45;
const ANGLE_TOL = 12;

interface CaseResult {
  name: string;
  smiles: string;
  atoms: number;
  topologyOk: boolean;
  carbonylCount: number;
  carbonylOk: boolean;
  carbonylAngles: number[];
  esterOk: boolean;
  esterAngles: number[];
  bondLenOk: boolean;
  avgBondLen: number;
  score: number;
  pass: boolean;
}

const CASES: { name: string; smiles: string }[] = [
  { name: 'formic acid', smiles: 'O=CO' },
  { name: 'acetic acid', smiles: 'CC(=O)O' },
  { name: 'propionic acid', smiles: 'CCC(=O)O' },
  { name: 'benzoic acid', smiles: 'c1ccccc1C(=O)O' },
  { name: 'aspirin', smiles: 'CC(=O)Oc1ccccc1C(=O)O' },
  { name: 'salicylic acid', smiles: 'O=C(O)c1ccccc1O' },
  { name: 'phthalic acid', smiles: 'O=C(O)c1ccccc1C(=O)O' },
  { name: 'methyl acetate', smiles: 'CC(=O)OC' },
  { name: 'ethyl acetate', smiles: 'CC(=O)OCC' },
  { name: 'acetone', smiles: 'CC(=O)C' },
  { name: 'acetaldehyde', smiles: 'CC=O' },
  { name: 'benzaldehyde', smiles: 'O=Cc1ccccc1' },
  { name: 'acetic anhydride', smiles: 'CC(=O)OC(=O)C' },
  { name: 'ibuprofen', smiles: 'CC(C)Cc1ccc(cc1)C(C)C(=O)O' },
  { name: 'lactic acid', smiles: 'CC(O)C(=O)O' },
  { name: 'glycine zwitterion-ish', smiles: 'NCC(=O)O' },
];

function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function scramble(mol: Molecule, seed: number): Molecule {
  const rnd = mulberry32(seed);
  return {
    ...mol,
    atoms: mol.atoms.map(a => ({
      ...a,
      x: rnd() * 280 + rnd() * 40,
      y: rnd() * 280 + rnd() * 40,
    })),
  };
}

function bondAngleDeg(mol: Molecule, cId: string, aId: string, bId: string): number {
  const c = mol.atoms.find(a => a.id === cId)!;
  const a = mol.atoms.find(x => x.id === aId)!;
  const b = mol.atoms.find(x => x.id === bId)!;
  const da = Math.atan2(a.y - c.y, a.x - c.x);
  const db = Math.atan2(b.y - c.y, b.x - c.x);
  let d = Math.abs(da - db);
  if (d > Math.PI) d = 2 * Math.PI - d;
  return (d * 180) / Math.PI;
}

function measureCarbonyls(mol: Molecule): { angles: number[]; ok: boolean; count: number } {
  const g = buildGraph(mol);
  const angles: number[] = [];
  let count = 0;
  for (const a of mol.atoms) {
    if (a.element !== 'C') continue;
    const nbs = g.nodes.get(a.id)?.neighbors ?? [];
    const hasDoubleO = nbs.some(nb => {
      const b = bondBetween(g, a.id, nb);
      return b != null && b.order >= 2 && g.atomById.get(nb)?.element === 'O';
    });
    if (!hasDoubleO) continue;
    count++;
    for (let i = 0; i < nbs.length; i++) {
      for (let j = i + 1; j < nbs.length; j++) {
        angles.push(bondAngleDeg(mol, a.id, nbs[i], nbs[j]));
      }
    }
  }
  const ok = angles.length === 0 || angles.every(a => Math.abs(a - 120) < ANGLE_TOL);
  return { angles, ok, count };
}

function measureEsters(mol: Molecule): { angles: number[]; ok: boolean } {
  const g = buildGraph(mol);
  const angles: number[] = [];
  for (const a of mol.atoms) {
    if (a.element !== 'O') continue;
    const nbs = g.nodes.get(a.id)?.neighbors ?? [];
    if (nbs.length !== 2) continue;
    // Both neighbors should be C (ester/ether).
    if (!nbs.every(nb => g.atomById.get(nb)?.element === 'C')) continue;
    angles.push(bondAngleDeg(mol, a.id, nbs[0], nbs[1]));
  }
  const ok = angles.length === 0 || angles.every(a => Math.abs(a - 120) < 18);
  return { angles, ok };
}

function bondLenOk(mol: Molecule): { ok: boolean; avg: number } {
  if (mol.bonds.length === 0) return { ok: true, avg: 0 };
  const lens = mol.bonds.map(b => {
    const a1 = mol.atoms.find(a => a.id === b.fromAtomId)!;
    const a2 = mol.atoms.find(a => a.id === b.toAtomId)!;
    return Math.hypot(a1.x - a2.x, a1.y - a2.y);
  });
  const avg = lens.reduce((s, l) => s + l, 0) / lens.length;
  const spread = Math.max(...lens.map(l => Math.abs(l - avg)));
  return { ok: Math.abs(avg - BOND) < 1.5 && spread < 1.5, avg };
}

function evaluate(name: string, smiles: string, seed: number): CaseResult {
  const parsed = parseSmilesToMolecule(smiles);
  const messy = scramble(parsed, seed);
  const beforeAtoms = messy.atoms.length;
  const beforeBonds = messy.bonds.length;
  const clean = cleanupStructure(messy, { bondLengthPx: BOND });

  const carbonyl = measureCarbonyls(clean);
  const ester = measureEsters(clean);
  const lens = bondLenOk(clean);
  const topologyOk =
    clean.atoms.length === beforeAtoms && clean.bonds.length === beforeBonds;

  let pts = 0;
  let max = 0;
  const add = (ok: boolean, w: number) => {
    max += w;
    if (ok) pts += w;
  };
  add(topologyOk, 25);
  add(carbonyl.ok, 40);
  add(ester.ok, 20);
  add(lens.ok, 15);
  const score = max === 0 ? 0 : Math.round((100 * pts) / max);
  const pass = score >= 95 && topologyOk && carbonyl.ok;

  return {
    name,
    smiles,
    atoms: clean.atoms.length,
    topologyOk,
    carbonylCount: carbonyl.count,
    carbonylOk: carbonyl.ok,
    carbonylAngles: carbonyl.angles.map(a => Math.round(a * 10) / 10),
    esterOk: ester.ok,
    esterAngles: ester.angles.map(a => Math.round(a * 10) / 10),
    bondLenOk: lens.ok,
    avgBondLen: Math.round(lens.avg * 10) / 10,
    score,
    pass,
  };
}

const results = CASES.map((c, i) => evaluate(c.name, c.smiles, 2000 + i * 31));
const passed = results.filter(r => r.pass).length;
const failed = results.filter(r => !r.pass).length;
const avgScore = Math.round(results.reduce((s, r) => s + r.score, 0) / results.length);

const report = {
  generatedAt: new Date().toISOString(),
  bondLengthPx: BOND,
  angleTargetDeg: 120,
  method: 'Scramble → cleanupStructure → score carbonyl/COOH O geometry',
  summary: {
    total: results.length,
    passed,
    failed,
    avgScore,
    passRatePct: Math.round((100 * passed) / results.length),
  },
  cases: results,
};

const outPath = resolve('src/engine/__tests__/cooh-accuracy-report.json');
writeFileSync(outPath, JSON.stringify(report, null, 2));

console.log('COOH / carbonyl cleanup accuracy\n');
console.log(
  `Cases: ${report.summary.total}  Pass: ${passed}  Fail: ${failed}  Avg: ${avgScore}%  Rate: ${report.summary.passRatePct}%\n`,
);
for (const r of results) {
  const mark = r.pass ? '✓' : '✗';
  console.log(
    `  ${mark} ${r.name.padEnd(22)} score=${String(r.score).padStart(3)}  ` +
      `carbonyls=${r.carbonylCount} ok=${r.carbonylOk}  ` +
      `angles=[${r.carbonylAngles.map(a => a.toFixed(0)).join(',')}]  ` +
      `ester=${r.esterOk}`,
  );
}
console.log(`\nWrote ${outPath}`);
if (failed > 0) process.exitCode = 1;

/**
 * Cleanup accuracy report — randomize coords, run cleanup, score ChemDraw metrics.
 * Run: npx tsx src/engine/__tests__/cleanupAccuracyReport.ts
 *
 * Writes JSON to stdout (and optionally a file) for the canvas report.
 */
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cleanupStructure } from '../layout/cleanupStructure';
import { parseSmilesToMolecule } from '../smiles/parse';
import { buildGraph } from '../graph';
import { perceiveRings } from '../chem/rings';
import type { Molecule } from '@moldraw/domain';

const BOND = 45;
const ANGLE_TOL = 12; // degrees from 120°
const LEN_TOL = 1.5; // px from target bond length

interface CaseResult {
  name: string;
  smiles: string;
  atoms: number;
  bonds: number;
  rings: number;
  topologyOk: boolean;
  atomIdsOk: boolean;
  bondIdsOk: boolean;
  ringCountOk: boolean;
  avgBondLen: number;
  bondLenSpread: number;
  bondLenOk: boolean;
  cccAngles: number[];
  cccMean: number;
  cccMaxErr: number;
  cccOk: boolean;
  ringAngleMaxErr: number;
  ringOk: boolean;
  crossings: number;
  crossingsOk: boolean;
  minAtomSep: number;
  noOverlap: boolean;
  score: number; // 0–100
  pass: boolean;
}

const CASES: { name: string; smiles: string }[] = [
  // Small
  { name: 'methane', smiles: 'C' },
  { name: 'ethane', smiles: 'CC' },
  { name: 'propane', smiles: 'CCC' },
  { name: 'ethanol', smiles: 'CCO' },
  { name: 'acetone', smiles: 'CC(=O)C' },
  { name: 'isobutane branch', smiles: 'CC(C)C' },
  { name: 'neopentane', smiles: 'CC(C)(C)C' },
  { name: 'benzene', smiles: 'c1ccccc1' },
  { name: 'phenol', smiles: 'Oc1ccccc1' },
  { name: 'cyclopentane', smiles: 'C1CCCC1' },
  { name: 'cyclohexane', smiles: 'C1CCCCC1' },
  // Medium
  { name: 'n-octane', smiles: 'CCCCCCCC' },
  { name: '2-methylpentane', smiles: 'CCCC(C)C' },
  { name: 'propylbenzene', smiles: 'CCCc1ccccc1' },
  { name: '1,3-dimethylbenzene', smiles: 'Cc1cccc(C)c1' },
  { name: 'tert-butylbenzene', smiles: 'CC(C)(C)c1ccccc1' },
  { name: 'naphthalene', smiles: 'c1ccc2ccccc2c1' },
  { name: 'biphenyl', smiles: 'c1ccc(-c2ccccc2)cc1' },
  { name: 'aspirin', smiles: 'CC(=O)Oc1ccccc1C(=O)O' },
  { name: 'acetic acid', smiles: 'CC(=O)O' },
  { name: 'benzoic acid', smiles: 'c1ccccc1C(=O)O' },
  { name: 'salicylic acid', smiles: 'O=C(O)c1ccccc1O' },
  { name: 'methyl acetate', smiles: 'CC(=O)OC' },
  { name: 'hexylcyclohexane', smiles: 'CCCCCCC1CCCCC1' },
  // Larger
  { name: 'n-dodecane', smiles: 'CCCCCCCCCCCC' },
  { name: 'octylbenzene', smiles: 'CCCCCCCCc1ccccc1' },
  { name: 'anthracene', smiles: 'c1ccc2cc3ccccc3cc2c1' },
  { name: 'phenanthrene', smiles: 'c1ccc2c(c1)ccc1ccccc12' },
  { name: 'n-hexadecane', smiles: 'CCCCCCCCCCCCCCCC' },
  { name: 'n-eicosane', smiles: 'CCCCCCCCCCCCCCCCCCCC' },
  { name: 'dodecylbenzene', smiles: 'CCCCCCCCCCCCc1ccccc1' },
  { name: 'cholesterol-ish', smiles: 'CC(C)CCCC(C)C1CCC2C3CCC4=CCCCC4C3CCC12C' },
  { name: 'caffeine', smiles: 'CN1C=NC2=C1C(=O)N(C(=O)N2C)C' },
  { name: 'ibuprofen', smiles: 'CC(C)Cc1ccc(cc1)C(C)C(=O)O' },
  { name: 'pyrene', smiles: 'c1cc2ccc3cccc4ccc(c1)c2c34' },
  { name: 'stilbene', smiles: 'c1ccc(cc1)/C=C/c2ccccc2' },
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

function bondLengths(mol: Molecule): number[] {
  return mol.bonds.map(b => {
    const a1 = mol.atoms.find(a => a.id === b.fromAtomId)!;
    const a2 = mol.atoms.find(a => a.id === b.toAtomId)!;
    return Math.hypot(a1.x - a2.x, a1.y - a2.y);
  });
}

function countCrossings(mol: Molecule): number {
  let crossings = 0;
  const pos = (id: string) => mol.atoms.find(a => a.id === id)!;
  for (let i = 0; i < mol.bonds.length; i++) {
    for (let j = i + 1; j < mol.bonds.length; j++) {
      const b1 = mol.bonds[i];
      const b2 = mol.bonds[j];
      if (new Set([b1.fromAtomId, b1.toAtomId, b2.fromAtomId, b2.toAtomId]).size < 4) continue;
      const a = pos(b1.fromAtomId);
      const b = pos(b1.toAtomId);
      const c = pos(b2.fromAtomId);
      const d = pos(b2.toAtomId);
      const z = (p: { x: number; y: number }, q: { x: number; y: number }, r: { x: number; y: number }) =>
        (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
      const segCross = (
        o: { x: number; y: number },
        p: { x: number; y: number },
        q: { x: number; y: number },
        r: { x: number; y: number },
      ) => z(o, p, q) * z(o, p, r) < 0 && z(q, r, o) * z(q, r, p) < 0;
      if (segCross(a, b, c, d)) crossings++;
    }
  }
  return crossings;
}

function minAtomSep(mol: Molecule): number {
  let min = Infinity;
  for (let i = 0; i < mol.atoms.length; i++) {
    for (let j = i + 1; j < mol.atoms.length; j++) {
      min = Math.min(
        min,
        Math.hypot(mol.atoms[i].x - mol.atoms[j].x, mol.atoms[i].y - mol.atoms[j].y),
      );
    }
  }
  return min;
}

/** Exocyclic / acyclic C–C–C angles (skip ring-internal triples).
 * Quaternary carbons (4 C neighbors) use 90° square projection in 2D
 * (adjacent = 90°, opposite = 180°). Others target 120° ChemDraw trigonal.
 * Fused bridgeheads (ring C with ≥3 ring-C neighbors) are skipped — exo angles
 * there are constrained by fusion geometry, not free trigonal fans. */
function measureCccAngles(mol: Molecule): { angles: number[]; ok: boolean[] } {
  const g = buildGraph(mol);
  const ringIds = new Set(perceiveRings(mol).flatMap(r => r.atomIds));
  const angles: number[] = [];
  const ok: boolean[] = [];
  for (const a of mol.atoms) {
    if (a.element !== 'C') continue;
    const nbs = (g.nodes.get(a.id)?.neighbors ?? []).filter(
      nb => g.atomById.get(nb)?.element === 'C',
    );
    if (nbs.length < 2) continue;
    const ringCNbs = nbs.filter(nb => ringIds.has(nb));
    // Bridgehead / heavily fused ring carbon — skip free-angle scoring.
    if (ringIds.has(a.id) && ringCNbs.length >= 3) continue;

    const quaternary = nbs.length >= 4 && !ringIds.has(a.id);
    for (let i = 0; i < nbs.length; i++) {
      for (let j = i + 1; j < nbs.length; j++) {
        // Skip fully ring-internal angles (ring has its own interior rule).
        if (ringIds.has(a.id) && ringIds.has(nbs[i]) && ringIds.has(nbs[j])) continue;
        const ang = bondAngleDeg(mol, a.id, nbs[i], nbs[j]);
        angles.push(ang);
        if (quaternary) {
          // Square projection: adjacent ~90°, opposite ~180°.
          ok.push(
            Math.abs(ang - 90) < ANGLE_TOL || Math.abs(ang - 180) < ANGLE_TOL,
          );
        } else {
          ok.push(Math.abs(ang - 120) < ANGLE_TOL);
        }
      }
    }
  }
  return { angles, ok };
}

function measureRingAngleErr(mol: Molecule): number {
  const rings = perceiveRings(mol);
  let maxErr = 0;
  for (const ring of rings) {
    const n = ring.atomIds.length;
    if (n < 3) continue;
    const ideal = ((n - 2) * 180) / n;
    for (let i = 0; i < n; i++) {
      const c = ring.atomIds[i];
      const a = ring.atomIds[(i - 1 + n) % n];
      const b = ring.atomIds[(i + 1) % n];
      const ang = bondAngleDeg(mol, c, a, b);
      maxErr = Math.max(maxErr, Math.abs(ang - ideal));
    }
  }
  return maxErr;
}

function scoreCase(r: Omit<CaseResult, 'score' | 'pass'>): { score: number; pass: boolean } {
  let pts = 0;
  let max = 0;
  const add = (ok: boolean, w: number) => {
    max += w;
    if (ok) pts += w;
  };
  add(r.topologyOk, 25);
  add(r.atomIdsOk, 10);
  add(r.bondIdsOk, 5);
  add(r.ringCountOk, 5);
  add(r.bondLenOk, 15);
  add(r.cccOk || r.cccAngles.length === 0, 20);
  add(r.ringOk || r.rings === 0, 10);
  add(r.crossingsOk, 5);
  add(r.noOverlap, 5);
  const score = max === 0 ? 0 : Math.round((100 * pts) / max);
  return { score, pass: score >= 85 && r.topologyOk };
}

function evaluate(name: string, smiles: string, seed: number): CaseResult {
  const parsed = parseSmilesToMolecule(smiles);
  const messy = scramble(parsed, seed);
  const beforeAtoms = messy.atoms.length;
  const beforeBonds = messy.bonds.length;
  const beforeRings = perceiveRings(messy).length;
  const beforeAtomIds = messy.atoms.map(a => a.id).join('|');
  const beforeBondIds = messy.bonds.map(b => b.id).join('|');

  const clean = cleanupStructure(messy, { bondLengthPx: BOND });

  const lens = bondLengths(clean);
  const avg = lens.length ? lens.reduce((a, b) => a + b, 0) / lens.length : 0;
  const spread = lens.length ? Math.max(...lens.map(l => Math.abs(l - avg))) : 0;
  const { angles: ccc, ok: cccFlags } = measureCccAngles(clean);
  const cccMean = ccc.length ? ccc.reduce((a, b) => a + b, 0) / ccc.length : 120;
  const cccMaxErr = ccc.length
    ? Math.max(
        ...ccc.map((a, i) => {
          if (cccFlags[i]) return 0;
          // Distance to nearest accepted target for reporting.
          return Math.min(Math.abs(a - 120), Math.abs(a - 90), Math.abs(a - 180));
        }),
      )
    : 0;
  const ringErr = measureRingAngleErr(clean);
  const crossings = countCrossings(clean);
  const minSep = minAtomSep(clean);

  const base: Omit<CaseResult, 'score' | 'pass'> = {
    name,
    smiles,
    atoms: clean.atoms.length,
    bonds: clean.bonds.length,
    rings: perceiveRings(clean).length,
    topologyOk: clean.atoms.length === beforeAtoms && clean.bonds.length === beforeBonds,
    atomIdsOk: clean.atoms.map(a => a.id).join('|') === beforeAtomIds,
    bondIdsOk: clean.bonds.map(b => b.id).join('|') === beforeBondIds,
    ringCountOk: perceiveRings(clean).length === beforeRings,
    avgBondLen: avg,
    bondLenSpread: spread,
    bondLenOk: lens.length === 0 || (Math.abs(avg - BOND) < LEN_TOL && spread < LEN_TOL),
    cccAngles: ccc.map(a => Math.round(a * 10) / 10),
    cccMean: Math.round(cccMean * 10) / 10,
    cccMaxErr: Math.round(cccMaxErr * 10) / 10,
    cccOk: ccc.length === 0 || cccFlags.every(Boolean),
    ringAngleMaxErr: Math.round(ringErr * 10) / 10,
    ringOk: beforeRings === 0 || ringErr < 18,
    crossings,
    crossingsOk: crossings === 0,
    minAtomSep: Math.round(minSep * 10) / 10,
    noOverlap: minSep > BOND * 0.35,
  };
  const { score, pass } = scoreCase(base);
  return { ...base, score, pass };
}

const results: CaseResult[] = CASES.map((c, i) => evaluate(c.name, c.smiles, 1000 + i * 17));

const passed = results.filter(r => r.pass).length;
const failed = results.filter(r => !r.pass).length;
const avgScore = Math.round(results.reduce((s, r) => s + r.score, 0) / results.length);
const topologyFails = results.filter(r => !r.topologyOk).length;
const angleFails = results.filter(r => !r.cccOk && r.cccAngles.length > 0).length;
const lenFails = results.filter(r => !r.bondLenOk).length;

const report = {
  generatedAt: new Date().toISOString(),
  bondLengthPx: BOND,
  angleTargetDeg: 120,
  angleToleranceDeg: ANGLE_TOL,
  method: 'Scramble atom coords with seeded RNG → cleanupStructure → score ChemDraw metrics',
  summary: {
    total: results.length,
    passed,
    failed,
    avgScore,
    topologyFails,
    angleFails,
    lenFails,
    passRatePct: Math.round((100 * passed) / results.length),
  },
  cases: results,
};

const outPath = resolve('src/engine/__tests__/cleanup-accuracy-report.json');
writeFileSync(outPath, JSON.stringify(report, null, 2));

console.log('Cleanup accuracy report\n');
console.log(`Cases: ${report.summary.total}  Pass: ${passed}  Fail: ${failed}  Avg score: ${avgScore}%  Pass rate: ${report.summary.passRatePct}%`);
console.log(`Topology fails: ${topologyFails}  Angle fails: ${angleFails}  Bond-len fails: ${lenFails}\n`);
for (const r of results) {
  const mark = r.pass ? '✓' : '✗';
  console.log(
    `  ${mark} ${r.name.padEnd(22)} score=${String(r.score).padStart(3)}  ` +
      `CCC=${r.cccMean.toFixed(0)}°±${r.cccMaxErr.toFixed(0)}  ` +
      `len=${r.avgBondLen.toFixed(1)}±${r.bondLenSpread.toFixed(1)}  ` +
      `x=${r.crossings}`,
  );
}
console.log(`\nWrote ${outPath}`);
if (failed > 0) process.exitCode = 1;

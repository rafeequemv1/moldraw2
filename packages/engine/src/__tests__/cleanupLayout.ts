/**
 * Layout quality smoke tests — run: npx tsx src/engine/__tests__/cleanupLayout.ts
 */
import { generate2D } from '../layout/generate2d';
import { cleanupStructure } from '../layout/cleanupStructure';
import { perceiveRings } from '../chem/rings';
import { buildGraph, bondBetween } from '../graph';
import { parseSmilesToMolecule } from '../smiles/parse';
import type { Molecule } from '@moldraw/domain';

const BOND = 45;

function makeChain(n: number, bondLen = BOND): Molecule {
  const atoms = [];
  const bonds = [];
  for (let i = 0; i < n; i++) {
    atoms.push({
      id: `a${i}`,
      element: i >= n - 2 ? 'O' : 'C',
      x: i * bondLen * 0.86,
      y: (i % 2) * bondLen * 0.5,
      charge: 0,
    });
  }
  for (let i = 0; i < n - 1; i++) {
    bonds.push({ id: `b${i}`, fromAtomId: `a${i}`, toAtomId: `a${i + 1}`, order: 1 });
  }
  return { atoms, bonds };
}

function makeRing(n: number): Molecule {
  const atoms = [];
  const bonds = [];
  for (let i = 0; i < n; i++) {
    const ang = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    atoms.push({ id: `a${i}`, element: 'C', x: 200 + 100 * Math.cos(ang), y: 200 + 100 * Math.sin(ang), charge: 0 });
  }
  for (let i = 0; i < n; i++) {
    bonds.push({ id: `b${i}`, fromAtomId: `a${i}`, toAtomId: `a${(i + 1) % n}`, order: 1 });
  }
  atoms.push({ id: 'o1', element: 'O', x: atoms[0].x + 30, y: atoms[0].y - 30, charge: 0 });
  atoms.push({ id: 'o2', element: 'O', x: atoms[1].x + 30, y: atoms[1].y, charge: 0 });
  bonds.push({ id: 'bo1', fromAtomId: 'a0', toAtomId: 'o1', order: 1 });
  bonds.push({ id: 'bo2', fromAtomId: 'a1', toAtomId: 'o2', order: 1 });
  return { atoms, bonds };
}

function makeBenzene(): Molecule {
  const atoms = [];
  const bonds = [];
  for (let i = 0; i < 6; i++) {
    atoms.push({ id: `a${i}`, element: 'C', x: i * 20, y: i * 15, charge: 0 });
  }
  for (let i = 0; i < 6; i++) {
    bonds.push({ id: `b${i}`, fromAtomId: `a${i}`, toAtomId: `a${(i + 1) % 6}`, order: 1, aromatic: true });
  }
  return { atoms, bonds };
}

/** Cyclopentane with 3 OH groups — coords deliberately tangled (like user drawing). */
function makeMessyCyclopentaneTriol(): Molecule {
  const atoms = [
    { id: 'c0', element: 'C', x: 100, y: 100, charge: 0 },
    { id: 'c1', element: 'C', x: 130, y: 95, charge: 0 },
    { id: 'c2', element: 'C', x: 140, y: 120, charge: 0 },
    { id: 'c3', element: 'C', x: 115, y: 135, charge: 0 },
    { id: 'c4', element: 'C', x: 95, y: 118, charge: 0 },
    { id: 'o0', element: 'O', x: 128, y: 88, charge: 0 },
    { id: 'o1', element: 'O', x: 155, y: 118, charge: 0 },
    { id: 'o2', element: 'O', x: 108, y: 148, charge: 0 },
    { id: 'h0', element: 'H', x: 135, y: 82, charge: 0 },
    { id: 'h1', element: 'H', x: 162, y: 115, charge: 0 },
    { id: 'h2', element: 'H', x: 102, y: 155, charge: 0 },
  ];
  const bonds = [
    { id: 'b0', fromAtomId: 'c0', toAtomId: 'c1', order: 1 },
    { id: 'b1', fromAtomId: 'c1', toAtomId: 'c2', order: 1 },
    { id: 'b2', fromAtomId: 'c2', toAtomId: 'c3', order: 1 },
    { id: 'b3', fromAtomId: 'c3', toAtomId: 'c4', order: 1 },
    { id: 'b4', fromAtomId: 'c4', toAtomId: 'c0', order: 1 },
    { id: 'bo0', fromAtomId: 'c1', toAtomId: 'o0', order: 1 },
    { id: 'bo1', fromAtomId: 'c2', toAtomId: 'o1', order: 1 },
    { id: 'bo2', fromAtomId: 'c3', toAtomId: 'o2', order: 1 },
    { id: 'bh0', fromAtomId: 'o0', toAtomId: 'h0', order: 1 },
    { id: 'bh1', fromAtomId: 'o1', toAtomId: 'h1', order: 1 },
    { id: 'bh2', fromAtomId: 'o2', toAtomId: 'h2', order: 1 },
  ];
  return { atoms, bonds };
}

/** Two fused 5-membered rings with an exocyclic O-O-O chain. */
function makeFusedPentagons(): Molecule {
  const atoms = [
    { id: 'c0', element: 'C', x: 80, y: 100, charge: 0 },
    { id: 'c1', element: 'C', x: 110, y: 90, charge: 0 },
    { id: 'c2', element: 'C', x: 130, y: 110, charge: 0 },
    { id: 'c3', element: 'C', x: 120, y: 140, charge: 0 },
    { id: 'c4', element: 'C', x: 90, y: 135, charge: 0 },
    { id: 'c5', element: 'C', x: 145, y: 95, charge: 0 },
    { id: 'c6', element: 'C', x: 160, y: 115, charge: 0 },
    { id: 'c7', element: 'C', x: 150, y: 140, charge: 0 },
    { id: 'o0', element: 'O', x: 60, y: 95, charge: 0 },
    { id: 'o1', element: 'O', x: 45, y: 90, charge: 0 },
    { id: 'o2', element: 'O', x: 30, y: 85, charge: 0 },
    { id: 'oh', element: 'O', x: 165, y: 145, charge: 0 },
    { id: 'h', element: 'H', x: 20, y: 80, charge: 0 },
  ];
  const bonds = [
    { id: 'r0', fromAtomId: 'c0', toAtomId: 'c1', order: 1 },
    { id: 'r1', fromAtomId: 'c1', toAtomId: 'c2', order: 1 },
    { id: 'r2', fromAtomId: 'c2', toAtomId: 'c3', order: 1 },
    { id: 'r3', fromAtomId: 'c3', toAtomId: 'c4', order: 1 },
    { id: 'r4', fromAtomId: 'c4', toAtomId: 'c0', order: 1 },
    { id: 'f0', fromAtomId: 'c2', toAtomId: 'c5', order: 1 },
    { id: 'f1', fromAtomId: 'c5', toAtomId: 'c6', order: 1 },
    { id: 'f2', fromAtomId: 'c6', toAtomId: 'c7', order: 1 },
    { id: 'f3', fromAtomId: 'c7', toAtomId: 'c3', order: 1 },
    { id: 'x0', fromAtomId: 'c0', toAtomId: 'o0', order: 1 },
    { id: 'x1', fromAtomId: 'o0', toAtomId: 'o1', order: 1 },
    { id: 'x2', fromAtomId: 'o1', toAtomId: 'o2', order: 1 },
    { id: 'x3', fromAtomId: 'o2', toAtomId: 'h', order: 1 },
    { id: 'x4', fromAtomId: 'c7', toAtomId: 'oh', order: 1 },
  ];
  return { atoms, bonds };
}

function minAtomSeparation(mol: Molecule): number {
  let min = Infinity;
  for (let i = 0; i < mol.atoms.length; i++) {
    for (let j = i + 1; j < mol.atoms.length; j++) {
      const a = mol.atoms[i];
      const b = mol.atoms[j];
      min = Math.min(min, Math.hypot(a.x - b.x, a.y - b.y));
    }
  }
  return min;
}

function bondAngleDeg(mol: Molecule, centerId: string, aId: string, bId: string): number {
  const c = mol.atoms.find(a => a.id === centerId)!;
  const a = mol.atoms.find(x => x.id === aId)!;
  const b = mol.atoms.find(x => x.id === bId)!;
  const da = Math.atan2(a.y - c.y, a.x - c.x);
  const db = Math.atan2(b.y - c.y, b.x - c.x);
  let diff = Math.abs(da - db);
  if (diff > Math.PI) diff = 2 * Math.PI - diff;
  return (diff * 180) / Math.PI;
}

function bondLength(mol: Molecule, b: { fromAtomId: string; toAtomId: string }): number {
  const a1 = mol.atoms.find(a => a.id === b.fromAtomId)!;
  const a2 = mol.atoms.find(a => a.id === b.toAtomId)!;
  return Math.hypot(a1.x - a2.x, a1.y - a2.y);
}

function spineBondAngles(mol: Molecule, ids: string[]): number[] {
  const angles: number[] = [];
  for (let i = 1; i < ids.length - 1; i++) {
    angles.push(bondAngleDeg(mol, ids[i], ids[i - 1], ids[i + 1]));
  }
  return angles;
}

function makeMessyAlkylOnRing(chainLen = 6): Molecule {
  const atoms = [{ id: 'r0', element: 'C', x: 200, y: 200, charge: 0 }];
  const bonds: { id: string; fromAtomId: string; toAtomId: string; order: number }[] = [];
  for (let i = 0; i < chainLen; i++) {
    atoms.push({
      id: `c${i}`,
      element: 'C',
      x: 200 + (i + 1) * 38 + (i % 3) * 12,
      y: 200 + (i % 2) * 28 - (i % 4) * 9,
      charge: 0,
    });
    const from = i === 0 ? 'r0' : `c${i - 1}`;
    bonds.push({ id: `b${i}`, fromAtomId: from, toAtomId: `c${i}`, order: 1 });
  }
  return { atoms, bonds };
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

function avgBondLen(mol: Molecule): number {
  if (mol.bonds.length === 0) return 0;
  return mol.bonds.reduce((s, b) => s + bondLength(mol, b), 0) / mol.bonds.length;
}

function bondLenSpread(mol: Molecule): number {
  const lens = mol.bonds.map(b => bondLength(mol, b));
  const avg = lens.reduce((a, b) => a + b, 0) / lens.length;
  return Math.max(...lens.map(l => Math.abs(l - avg)));
}

let failed = 0;
const check = (name: string, ok: boolean, detail?: string) => {
  if (ok) console.log(`  ✓ ${name}`);
  else {
    failed++;
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
  }
};

console.log('Native 2D cleanup layout\n');

const chain = makeChain(14);
const chainClean = generate2D(chain, { bondLengthPx: BOND, preserveOrientation: true });
check('chain: zero bond crossings', countCrossings(chainClean) === 0, `got ${countCrossings(chainClean)}`);
check('chain: uniform bond lengths', bondLenSpread(chainClean) < 1, `spread ${bondLenSpread(chainClean).toFixed(2)}`);
check('chain: avg bond ~45px', Math.abs(avgBondLen(chainClean) - BOND) < 1, `${avgBondLen(chainClean).toFixed(1)}`);
const chainIds = chain.atoms.map(a => a.id);
const chainAngles = spineBondAngles(chainClean, chainIds);
check(
  'chain: spine ~120° angles',
  chainAngles.every(a => Math.abs(a - 120) < 12),
  chainAngles.slice(0, 5).map(a => a.toFixed(1)).join(', '),
);

const ring = makeRing(12);
const ringClean = generate2D(ring, { bondLengthPx: BOND, preserveOrientation: true });
check('ring+OH: zero crossings', countCrossings(ringClean) === 0, `got ${countCrossings(ringClean)}`);
check('ring+OH: uniform bonds', bondLenSpread(ringClean) < 1.5, `spread ${bondLenSpread(ringClean).toFixed(2)}`);
check('ring+OH: 12-member ring perceived', perceiveRings(ring).some(r => r.size === 12));

const benz = makeBenzene();
const benzClean = generate2D(benz, { bondLengthPx: BOND, preserveOrientation: true });
check('benzene: zero crossings', countCrossings(benzClean) === 0);
check('benzene: 6 equal sides', bondLenSpread(benzClean) < 1, `spread ${bondLenSpread(benzClean).toFixed(2)}`);

const cpTriol = makeMessyCyclopentaneTriol();
const cpClean = generate2D(cpTriol, { bondLengthPx: BOND, preserveOrientation: true });
check('cyclopentane-triol: zero crossings', countCrossings(cpClean) === 0, `got ${countCrossings(cpClean)}`);
check('cyclopentane-triol: no atom overlap', minAtomSeparation(cpClean) > BOND * 0.35, `${minAtomSeparation(cpClean).toFixed(1)}`);
check('cyclopentane-triol: uniform bonds', bondLenSpread(cpClean) < 1.5, `spread ${bondLenSpread(cpClean).toFixed(2)}`);

const fused = makeFusedPentagons();
const fusedClean = generate2D(fused, { bondLengthPx: BOND, preserveOrientation: true });
check('fused pentagons: zero crossings', countCrossings(fusedClean) === 0, `got ${countCrossings(fusedClean)}`);
check('fused pentagons: no atom overlap', minAtomSeparation(fusedClean) > BOND * 0.35, `${minAtomSeparation(fusedClean).toFixed(1)}`);
check('fused pentagons: 2 rings perceived', perceiveRings(fused).length >= 2);

// Aspirin — ester C–O–C, carbonyl trigonal, carboxylic acid
const aspirinMessy = parseSmilesToMolecule('CC(=O)Oc1ccccc1C(=O)O');
const aspirinClean = generate2D(aspirinMessy, { bondLengthPx: BOND, preserveOrientation: true });
check('aspirin: zero crossings', countCrossings(aspirinClean) === 0, `got ${countCrossings(aspirinClean)}`);
check('aspirin: uniform bonds', bondLenSpread(aspirinClean) < 2, `spread ${bondLenSpread(aspirinClean).toFixed(2)}`);

const gAsp = buildGraph(aspirinClean);
const esterO = aspirinClean.atoms.find(
  a => a.element === 'O' && gAsp.nodes.get(a.id)?.neighbors.length === 2,
)!;
const esterNbs = gAsp.nodes.get(esterO.id)!.neighbors;
const esterAngle = bondAngleDeg(aspirinClean, esterO.id, esterNbs[0], esterNbs[1]);
check('aspirin: ester C–O–C ~120°', Math.abs(esterAngle - 120) < 18, `${esterAngle.toFixed(1)}°`);

const acylC = aspirinClean.atoms.find(a => {
  if (a.element !== 'C') return false;
  const nbs = gAsp.nodes.get(a.id)?.neighbors ?? [];
  return nbs.some(nb => bondBetween(gAsp, a.id, nb)?.order === 2) && nbs.length === 3;
})!;
const acylNbs = gAsp.nodes.get(acylC.id)!.neighbors;
const acylAngles = [
  bondAngleDeg(aspirinClean, acylC.id, acylNbs[0], acylNbs[1]),
  bondAngleDeg(aspirinClean, acylC.id, acylNbs[0], acylNbs[2]),
  bondAngleDeg(aspirinClean, acylC.id, acylNbs[1], acylNbs[2]),
];
const acylOk = acylAngles.every(a => Math.abs(a - 120) < 18);
check('aspirin: carbonyl C trigonal ~120°', acylOk, acylAngles.map(a => a.toFixed(1)).join(', '));

// Imported aspirin — cleanup corrects substituents but keeps a good benzene core
const goodImport = generate2D(aspirinMessy, { bondLengthPx: BOND, preserveOrientation: true });
const importClean = cleanupStructure(goodImport, { bondLengthPx: BOND });
const gImp = buildGraph(importClean);
const esterO2 = importClean.atoms.find(
  a => a.element === 'O' && gImp.nodes.get(a.id)?.neighbors.length === 2,
)!;
const esterNbs2 = gImp.nodes.get(esterO2.id)!.neighbors;
const esterAngleAfter = bondAngleDeg(importClean, esterO2.id, esterNbs2[0], esterNbs2[1]);
check('aspirin import: ester C–O–C ~120° after cleanup', Math.abs(esterAngleAfter - 120) < 18, `${esterAngleAfter.toFixed(1)}°`);
check('aspirin import: uniform bond length', bondLenSpread(importClean) < 1.5);

// Ortho proximity: cleanup must not stack acetoxy C=O onto COOH C=O
const oxyAtoms = importClean.atoms.filter(a => a.element === 'O');
let closestOO = Infinity;
for (let i = 0; i < oxyAtoms.length; i++) {
  for (let j = i + 1; j < oxyAtoms.length; j++) {
    closestOO = Math.min(
      closestOO,
      Math.hypot(oxyAtoms[i].x - oxyAtoms[j].x, oxyAtoms[i].y - oxyAtoms[j].y),
    );
  }
}
check(
  'aspirin import: ortho O atoms stay apart (no twist clash)',
  closestOO > BOND * 0.7,
  `closest O–O=${closestOO.toFixed(1)}px`,
);
check(
  'aspirin import: no atom overlap after cleanup',
  minAtomSeparation(importClean) > BOND * 0.35,
  `minSep=${minAtomSeparation(importClean).toFixed(1)}`,
);

// Messy alkyl chain on a ring carbon — cleanup must zig-zag to ~120°
const messyAlkyl = makeMessyAlkylOnRing(6);
const alkylIds = ['r0', 'c0', 'c1', 'c2', 'c3', 'c4', 'c5'];
const alkylClean = cleanupStructure(messyAlkyl, { bondLengthPx: BOND });
const spineAngles = spineBondAngles(alkylClean, alkylIds);
const alkylOk = spineAngles.every(a => Math.abs(a - 120) < 12);
check('alkyl chain: spine ~120° angles', alkylOk, spineAngles.map(a => a.toFixed(1)).join(', '));
check('alkyl chain: uniform bonds', bondLenSpread(alkylClean) < 1.5);

// Stretched bonds must normalize to canvas bondLengthPx (not leave long connectors)
const stretched = makeMessyAlkylOnRing(5);
const r0 = stretched.atoms.find(a => a.id === 'r0')!;
const c0 = stretched.atoms.find(a => a.id === 'c0')!;
c0.x = r0.x + BOND * 3.5;
c0.y = r0.y;
const stretchedClean = cleanupStructure(stretched, { bondLengthPx: BOND });
check(
  'stretched chain: all bonds ~bondLengthPx',
  bondLenSpread(stretchedClean) < 1.5 && Math.abs(avgBondLen(stretchedClean) - BOND) < 1,
  `avg=${avgBondLen(stretchedClean).toFixed(1)} spread=${bondLenSpread(stretchedClean).toFixed(1)}`,
);

// Octyl on benzene — long exocyclic alkane must zig-zag at 120°
const octylBen = parseSmilesToMolecule('CCCCCCCCc1ccccc1');
for (const a of octylBen.atoms) {
  a.x += (Math.random() - 0.5) * 22;
  a.y += (Math.random() - 0.5) * 22;
}
const octylClean = cleanupStructure(octylBen, { bondLengthPx: BOND });
const gOct = buildGraph(octylClean);
const ringIds = new Set(perceiveRings(octylClean).flatMap(r => r.atomIds));
const chainStart = octylClean.atoms.find(
  a => gOct.nodes.get(a.id)!.neighbors.length === 1 && !ringIds.has(a.id),
)?.id;
if (chainStart) {
  const path: string[] = [chainStart];
  let prev: string | null = null;
  let cur = chainStart;
  while (true) {
    const nbs = gOct.nodes.get(cur)!.neighbors.filter(n => n !== prev);
    const next = nbs.find(n => !ringIds.has(n)) ?? nbs[0];
    if (!next || ringIds.has(next)) break;
    path.push(next);
    prev = cur;
    cur = next;
  }
  const octylAngles = spineBondAngles(octylClean, path);
  check(
    'octyl on benzene: spine ~120°',
    octylAngles.length >= 2 && octylAngles.every(a => Math.abs(a - 120) < 12),
    octylAngles.map(a => a.toFixed(1)).join(', '),
  );
}

console.log(`\n${failed === 0 ? 'All passed' : `${failed} failed`}`);
if (failed > 0) process.exit(1);

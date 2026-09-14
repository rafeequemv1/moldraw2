/**
 * Alkyl zig-zag must ignore explicit H — ChemDraw 2D is heavy-atom only.
 * Run: npx tsx src/engine/__tests__/alkylZigzagNoH.ts
 */
import { parseSmilesToMolecule } from '../smiles/parse';
import { cleanupStructure } from '../layout/cleanupStructure';
import { generate2D } from '../layout/generate2d';
import { buildGraph } from '../graph';
import type { Molecule } from '@moldraw/domain';

const BOND = 45;
let failed = 0;
const assert = (cond: boolean, msg: string) => {
  if (!cond) {
    failed += 1;
    console.error('FAIL:', msg);
  } else {
    console.log('OK:  ', msg);
  }
};

const bondAngleDeg = (mol: Molecule, cId: string, aId: string, bId: string): number => {
  const c = mol.atoms.find(a => a.id === cId)!;
  const a = mol.atoms.find(x => x.id === aId)!;
  const b = mol.atoms.find(x => x.id === bId)!;
  const da = Math.atan2(a.y - c.y, a.x - c.x);
  const db = Math.atan2(b.y - c.y, b.x - c.x);
  let d = Math.abs(da - db);
  if (d > Math.PI) d = 2 * Math.PI - d;
  return (d * 180) / Math.PI;
};

/** Attach explicit H to every carbon (simulates drawn / imported alkyl H). */
const addExplicitAlkylH = (mol: Molecule): Molecule => {
  const g = buildGraph(mol);
  const atoms = [...mol.atoms];
  const bonds = [...mol.bonds];
  let hi = 0;
  for (const a of mol.atoms) {
    if (a.element !== 'C') continue;
    const deg = g.nodes.get(a.id)?.neighbors.length ?? 0;
    const need = Math.max(0, 4 - deg);
    for (let i = 0; i < need; i++) {
      const hid = `H_exp_${hi++}`;
      atoms.push({
        id: hid,
        element: 'H',
        x: a.x + 10 + i * 3,
        y: a.y + 10 + i * 3,
        charge: 0,
      });
      bonds.push({ id: `b_${hid}`, fromAtomId: a.id, toAtomId: hid, order: 1 });
    }
  }
  return { ...mol, atoms, bonds };
};

const carbonSpineAngles = (mol: Molecule): number[] => {
  const g = buildGraph(mol);
  const carbons = mol.atoms.filter(a => a.element === 'C');
  const tip = carbons.find(a => {
    const nbs = (g.nodes.get(a.id)?.neighbors ?? []).filter(
      n => mol.atoms.find(x => x.id === n)?.element === 'C',
    );
    return nbs.length === 1;
  });
  if (!tip) return [];
  const path = [tip.id];
  let prev: string | null = null;
  let cur = tip.id;
  while (true) {
    const nbs = (g.nodes.get(cur)?.neighbors ?? []).filter(
      n => n !== prev && mol.atoms.find(x => x.id === n)?.element === 'C',
    );
    if (nbs.length !== 1) break;
    path.push(nbs[0]!);
    prev = cur;
    cur = nbs[0]!;
  }
  const angles: number[] = [];
  for (let i = 1; i < path.length - 1; i++) {
    angles.push(bondAngleDeg(mol, path[i]!, path[i - 1]!, path[i + 1]!));
  }
  return angles;
};

console.log('=== Alkyl zig-zag ignores explicit H ===\n');

// Pure octane with explicit H, scrambled, then cleanup.
const octane = addExplicitAlkylH(parseSmilesToMolecule('CCCCCCCC'));
assert(octane.atoms.some(a => a.element === 'H'), 'fixture has explicit H');
for (const a of octane.atoms) {
  a.x = Math.random() * 200;
  a.y = Math.random() * 200;
}
const cleaned = cleanupStructure(octane, { bondLengthPx: BOND });
assert(
  cleaned.atoms.filter(a => a.element === 'H').length ===
    octane.atoms.filter(a => a.element === 'H').length,
  'cleanup preserves explicit H count (coords only on heavy atoms)',
);
const angles = carbonSpineAngles(cleaned);
console.log('octane angles:', angles.map(a => a.toFixed(1)).join(', '));
assert(angles.length >= 4, `enough interior angles (got ${angles.length})`);
assert(
  angles.every(a => Math.abs(a - 120) < 12),
  `all C–C–C ≈ 120° (got ${angles.map(a => a.toFixed(1)).join(', ')})`,
);

// Hexylbenzene with explicit H.
const hexyl = addExplicitAlkylH(parseSmilesToMolecule('CCCCCCc1ccccc1'));
for (const a of hexyl.atoms) {
  a.x = Math.random() * 200;
  a.y = Math.random() * 200;
}
const hexClean = cleanupStructure(hexyl, { bondLengthPx: BOND });
const hexAngles = carbonSpineAngles(hexClean);
console.log('hexylbenzene chain angles:', hexAngles.map(a => a.toFixed(1)).join(', '));
assert(
  hexAngles.length >= 2 && hexAngles.every(a => Math.abs(a - 120) < 12),
  `hexyl chain zig-zag 120° (got ${hexAngles.map(a => a.toFixed(1)).join(', ')})`,
);

// generate2D with explicit H in SMILES-like graph.
const withH = addExplicitAlkylH(parseSmilesToMolecule('CCCC'));
const laid = generate2D(withH, { bondLengthPx: BOND });
const laidAngles = carbonSpineAngles(laid);
console.log('butane generate2D angles:', laidAngles.map(a => a.toFixed(1)).join(', '));
assert(
  laidAngles.every(a => Math.abs(a - 120) < 12),
  `butane generate2D zig-zag (got ${laidAngles.map(a => a.toFixed(1)).join(', ')})`,
);

if (failed > 0) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
console.log('\nAlkyl zig-zag (no H) OK.');

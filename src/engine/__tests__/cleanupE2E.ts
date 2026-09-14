/**
 * End-to-end cleanup invariants — run: npx tsx src/engine/__tests__/cleanupE2E.ts
 *
 * ChemDraw 2D: interior C–C–C = 120° (NOT 80°, NOT 109.5°).
 * Cleanup must never add/remove atoms or bonds.
 */
import { cleanupStructure } from '../layout/cleanupStructure';
import { parseSmilesToMolecule } from '../smiles/parse';
import { buildGraph } from '../graph';
import { perceiveRings } from '../chem/rings';
import { mergeGlobalCleanup } from '@moldraw/core/io/localCleanup';
import { moleculeToMolblock, parseMolblock } from '@moldraw/core/io/molblock';
import { engine } from '../index';
import type { Molecule } from '@moldraw/domain';

const BOND = 45;
let failed = 0;
const check = (name: string, ok: boolean, detail?: string) => {
  if (ok) console.log(`  ✓ ${name}`);
  else {
    failed++;
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
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

const avgBondLen = (mol: Molecule): number => {
  if (mol.bonds.length === 0) return 0;
  let s = 0;
  for (const b of mol.bonds) {
    const a1 = mol.atoms.find(a => a.id === b.fromAtomId)!;
    const a2 = mol.atoms.find(a => a.id === b.toAtomId)!;
    s += Math.hypot(a1.x - a2.x, a1.y - a2.y);
  }
  return s / mol.bonds.length;
};

const spineAnglesFromTip = (mol: Molecule, tipId: string, stopAtRing: Set<string>): number[] => {
  const g = buildGraph(mol);
  const path = [tipId];
  let prev: string | null = null;
  let cur = tipId;
  while (true) {
    const nbs = g.nodes.get(cur)!.neighbors.filter(n => n !== prev);
    const next = nbs.find(n => !stopAtRing.has(n)) ?? null;
    if (!next) break;
    path.push(next);
    prev = cur;
    cur = next;
    if (stopAtRing.has(cur)) break;
  }
  const angles: number[] = [];
  for (let i = 1; i < path.length - 1; i++) {
    if (stopAtRing.has(path[i])) continue;
    angles.push(bondAngleDeg(mol, path[i], path[i - 1], path[i + 1]));
  }
  return angles;
};

console.log('Cleanup E2E invariants\n');

// ── Topology preserved (no new rings / atoms) ──────────────────────────────
const messy = parseSmilesToMolecule('CCCCCCc1ccccc1');
for (const a of messy.atoms) {
  a.x = Math.random() * 200;
  a.y = Math.random() * 200;
}
const beforeIds = messy.atoms.map(a => a.id).join(',');
const beforeBondIds = messy.bonds.map(b => b.id).join(',');
const cleaned = cleanupStructure(messy, { bondLengthPx: BOND });
check('atom count unchanged', cleaned.atoms.length === messy.atoms.length, `${messy.atoms.length}→${cleaned.atoms.length}`);
check('bond count unchanged', cleaned.bonds.length === messy.bonds.length, `${messy.bonds.length}→${cleaned.bonds.length}`);
check('atom ids unchanged', cleaned.atoms.map(a => a.id).join(',') === beforeIds);
check('bond ids unchanged', cleaned.bonds.map(b => b.id).join(',') === beforeBondIds);
check('ring count unchanged', perceiveRings(cleaned).length === perceiveRings(messy).length);

// ── 120° C–C–C on alkyl spine (NOT 80°) ────────────────────────────────────
const rings = perceiveRings(cleaned);
const ringIds = new Set(rings.flatMap(r => r.atomIds));
const g = buildGraph(cleaned);
const tip = cleaned.atoms.find(
  a => g.nodes.get(a.id)!.neighbors.length === 1 && !ringIds.has(a.id),
)!;
const angles = spineAnglesFromTip(cleaned, tip.id, ringIds);
check(
  'alkyl spine C–C–C ≈ 120° (not 80°)',
  angles.length >= 2 && angles.every(a => Math.abs(a - 120) < 12),
  angles.map(a => a.toFixed(1)).join(', '),
);
check('uniform bond length', Math.abs(avgBondLen(cleaned) - BOND) < 1.5, `${avgBondLen(cleaned).toFixed(1)}`);

// ── Molblock worker merge must not replace molecule ────────────────────────
const mb = moleculeToMolblock(cleaned);
const engineClean = engine.parseMolblock(mb);
const laid = cleanupStructure(engineClean, { bondLengthPx: BOND });
const outMb = engine.toMolblock(laid);
const live = { ...messy, atoms: messy.atoms.map(a => ({ ...a })) };
const merged = mergeGlobalCleanup(live, outMb);
check(
  'mergeGlobalCleanup: atom count stable',
  merged.atoms.length === live.atoms.length,
  `${live.atoms.length}→${merged.atoms.length}`,
);
check(
  'mergeGlobalCleanup: keeps original atom ids',
  merged.atoms.every((a, i) => a.id === live.atoms[i].id),
);

// Mismatch must refuse (simulates the "new ring appeared" bug)
const fakeExtra = parseMolblock(outMb);
fakeExtra.atoms.push({ id: 'EXTRA', element: 'C', x: 0, y: 0, charge: 0 });
const refused = mergeGlobalCleanup(live, moleculeToMolblock(fakeExtra));
check(
  'merge refuses atom-count mismatch (no new ring)',
  refused.atoms.length === live.atoms.length && refused === live,
);

// ── Pure chain: all interior angles 120° ───────────────────────────────────
const chain = parseSmilesToMolecule('CCCCCCCC');
for (const a of chain.atoms) {
  a.x += Math.random() * 40;
  a.y += Math.random() * 40;
}
const chainClean = cleanupStructure(chain, { bondLengthPx: BOND });
const cg = buildGraph(chainClean);
const cTip = chainClean.atoms.find(a => cg.nodes.get(a.id)!.neighbors.length === 1)!;
const cAngles = spineAnglesFromTip(chainClean, cTip.id, new Set());
check(
  'pure alkane: all C–C–C ≈ 120°',
  cAngles.every(a => Math.abs(a - 120) < 12),
  cAngles.map(a => a.toFixed(1)).join(', '),
);

console.log(`\n${failed === 0 ? 'All passed' : `${failed} failed`}`);
if (failed > 0) process.exit(1);

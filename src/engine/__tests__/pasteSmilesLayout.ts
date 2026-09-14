/**
 * Diagnose SMILES→2D for paclitaxel-like paste. Times out if layout hangs.
 * Run: npx tsx src/engine/__tests__/pasteSmilesLayout.ts
 */
import { nativeEngine as engine } from '../nativeEngine';
import { cleanupStructure } from '../layout/cleanupStructure';

const PACLITAXEL_LIKE =
  '[H]C2(C7(C(C1(COC1([H])C2)OC(=O)C)([H])C(OC(=O)C3=CC=CC=C3)(C6(C(C)(C)C(=C(C(OC(=O)C(O)([H])C([H])(NC(C4=CC=CC=C4)=O)C5=CC=CC=C5)(C6)[H])C)C(C7=O)([H])OC(=O)C)O)[H])C)O';

let failed = 0;
const assert = (cond: boolean, msg: string) => {
  if (!cond) {
    failed += 1;
    console.error('FAIL:', msg);
  } else {
    console.log('OK:  ', msg);
  }
};

console.log('=== Paste SMILES layout ===\n');

const tParse = Date.now();
const mol = engine.parseSmiles(PACLITAXEL_LIKE);
console.log(`parse ${Date.now() - tParse}ms atoms=${mol.atoms.length} heavy=${mol.atoms.filter(a => a.element !== 'H').length}`);
assert(mol.atoms.length > 40, 'parsed enough atoms');

const t2d = Date.now();
let laid = mol;
try {
  laid = engine.generate2D(mol, 45);
} catch (err) {
  console.error('generate2D threw', err);
  process.exit(1);
}
const ms2d = Date.now() - t2d;
console.log(`generate2D ${ms2d}ms`);
assert(ms2d < 8000, `generate2D finishes under 8s (got ${ms2d}ms)`);

const byId = new Map(laid.atoms.map(a => [a.id, a]));
let sum = 0;
let n = 0;
let min = Infinity;
let max = 0;
for (const b of laid.bonds) {
  const a1 = byId.get(b.fromAtomId);
  const a2 = byId.get(b.toAtomId);
  if (!a1 || !a2) continue;
  if (a1.element === 'H' || a2.element === 'H') continue;
  const d = Math.hypot(a1.x - a2.x, a1.y - a2.y);
  sum += d;
  n += 1;
  min = Math.min(min, d);
  max = Math.max(max, d);
}
const avg = sum / Math.max(n, 1);
console.log(`heavy bonds avg=${avg.toFixed(1)} min=${min.toFixed(1)} max=${max.toFixed(1)}`);
assert(avg > 20 && avg < 80, `bond length ~45px (got ${avg.toFixed(1)})`);
assert(max / Math.max(min, 1) < 4, `bond lengths not wildly uneven (ratio ${(max / Math.max(min, 1)).toFixed(1)})`);

// Overlap check: non-bonded heavy atoms closer than 0.35× bond
let overlaps = 0;
const heavy = laid.atoms.filter(a => a.element !== 'H');
const bonded = new Set(
  laid.bonds.map(b =>
    b.fromAtomId < b.toAtomId ? `${b.fromAtomId}|${b.toAtomId}` : `${b.toAtomId}|${b.fromAtomId}`,
  ),
);
for (let i = 0; i < heavy.length; i++) {
  for (let j = i + 1; j < heavy.length; j++) {
    const a = heavy[i]!;
    const b = heavy[j]!;
    const key = a.id < b.id ? `${a.id}|${b.id}` : `${b.id}|${a.id}`;
    if (bonded.has(key)) continue;
    const d = Math.hypot(a.x - b.x, a.y - b.y);
    if (d < avg * 0.35) overlaps += 1;
  }
}
console.log(`2D overlaps ${overlaps}`);
assert(overlaps <= 20, `few 2D overlaps for polycyclic (got ${overlaps})`);

const tClean = Date.now();
const cleaned = cleanupStructure(laid, { bondLengthPx: 45, preserveOrientation: true });
console.log(`cleanup ${Date.now() - tClean}ms`);
assert(cleaned.atoms.length === laid.atoms.length, 'cleanup preserves heavy-atom topology');
assert(cleaned.atoms.every(a => a.element !== 'H' || (cleaned.bonds.filter(b => b.fromAtomId === a.id || b.toAtomId === a.id).length > 1)), 'no terminal H after cleanup');

if (failed > 0) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
console.log('\nPaste SMILES layout OK.');

/**
 * Chair cyclohexane must survive cleanupStructure (not flatten to regular hex).
 * Run: npx tsx packages/engine/src/__tests__/chairCleanupPreserve.ts
 */
import { cleanupStructure } from '../layout/cleanupStructure';
import { addChairRing } from '../../../core/src/molecule/mutations';
import { ringSignature } from '@moldraw/domain';

const BOND = 45;
const empty = { atoms: [], bonds: [] };
const chair = addChairRing(empty, { x: 200, y: 200 }, BOND);
const ids = chair.atoms.map(a => a.id);
const sig = ringSignature(ids);

if (chair.ringConformations?.[sig] !== 'chair') {
  console.error('FAIL: addChairRing did not tag ringConformations');
  process.exit(1);
}

const cleaned = cleanupStructure(chair, { bondLengthPx: BOND, preserveOrientation: true });
if (cleaned.ringConformations?.[sig] !== 'chair') {
  console.error('FAIL: cleanup dropped ringConformations tag');
  process.exit(1);
}

const pairwise = (mol: typeof chair) => {
  const a = mol.atoms;
  const out: number[] = [];
  for (let i = 0; i < a.length; i++) {
    for (let j = i + 1; j < a.length; j++) {
      out.push(Math.hypot(a[i]!.x - a[j]!.x, a[i]!.y - a[j]!.y));
    }
  }
  return out.sort((x, y) => x - y);
};

const d0 = pairwise(chair);
const d1 = pairwise(cleaned);
let maxRel = 0;
for (let i = 0; i < d0.length; i++) {
  maxRel = Math.max(maxRel, Math.abs(d0[i]! - d1[i]!) / Math.max(d0[i]!, 1e-6));
}

// 1–3 distances vary strongly in a chair; a regular hex has them nearly equal.
const d13: number[] = [];
for (let i = 0; i < 6; i++) {
  const a = cleaned.atoms[i]!;
  const b = cleaned.atoms[(i + 2) % 6]!;
  d13.push(Math.hypot(a.x - b.x, a.y - b.y));
}
const m13 = d13.reduce((s, x) => s + x, 0) / 6;
const var13 = d13.reduce((s, x) => s + (x - m13) ** 2, 0) / 6;

console.log('maxRel pairwise', maxRel.toFixed(4), '1-3 variance', var13.toFixed(2));

if (maxRel > 0.08) {
  console.error('FAIL: chair pairwise geometry changed too much');
  process.exit(1);
}
if (var13 < 20) {
  console.error('FAIL: looks like a flat hexagon (low 1-3 variance)');
  process.exit(1);
}
console.log('PASS: chair survives cleanup');

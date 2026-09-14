/**
 * Chair locks must survive molblock CLEANUP payload remapping.
 * Run: npx tsx packages/engine/src/__tests__/chairCleanupWorkerRoundtrip.ts
 */
import { cleanupStructure } from '../layout/cleanupStructure';
import { addChairRing } from '../../../core/src/molecule/mutations';
import {
  ringSignature,
  ringConformationsByAtomIndex,
  withRingConformationsByAtomIndex,
} from '../../../domain/src/rings';
import { moleculeToMolblock, parseMolblock } from '../../../core/src/io/molblock';

const BOND = 45;
const empty = { atoms: [], bonds: [] };
const chair = addChairRing(empty, { x: 200, y: 200 }, BOND);
const ids = chair.atoms.map(a => a.id);
const sig = ringSignature(ids);

if (chair.ringConformations?.[sig] !== 'chair') {
  console.error('FAIL: addChairRing did not tag ringConformations');
  process.exit(1);
}

const byIndex = ringConformationsByAtomIndex(chair);
if (byIndex.length !== 1 || byIndex[0]!.kind !== 'chair') {
  console.error('FAIL: ringConformationsByAtomIndex', byIndex);
  process.exit(1);
}

const mb = moleculeToMolblock(chair);
const parsed = parseMolblock(mb);
const remapped = withRingConformationsByAtomIndex(parsed, byIndex);
const remappedSig = ringSignature(remapped.atoms.map(a => a.id));
if (remapped.ringConformations?.[remappedSig] !== 'chair') {
  console.error('FAIL: remapped tags missing', remapped.ringConformations);
  process.exit(1);
}

const cleaned = cleanupStructure(remapped, { bondLengthPx: BOND, preserveOrientation: true });
if (cleaned.ringConformations?.[remappedSig] !== 'chair') {
  console.error('FAIL: cleanup dropped tags after rematch');
  process.exit(1);
}

const d13: number[] = [];
for (let i = 0; i < 6; i++) {
  const a = cleaned.atoms[i]!;
  const b = cleaned.atoms[(i + 2) % 6]!;
  d13.push(Math.hypot(a.x - b.x, a.y - b.y));
}
const m13 = d13.reduce((s, x) => s + x, 0) / 6;
const var13 = d13.reduce((s, x) => s + (x - m13) ** 2, 0) / 6;
if (var13 < 20) {
  console.error('FAIL: looks like a flat hexagon (low 1-3 variance)', var13);
  process.exit(1);
}

console.log('PASS: chair survives molblock remap + cleanup', '1-3 variance', var13.toFixed(2));

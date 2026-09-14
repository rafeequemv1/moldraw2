/**
 * Verifies the native engine is wired into the command registry:
 *   - molecule.cleanup relays out atoms natively (no RDKit)
 *   - molecule.importSmiles parses + places a structure natively
 *
 * Run with: npx tsx src/engine/__tests__/wiring.ts
 */
import { getCommand, CMD } from '@moldraw/core/commands';
import type { Molecule } from '@moldraw/domain';

let passed = 0;
let failed = 0;
const check = (name: string, cond: boolean, detail?: unknown): void => {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.error(`  ✗ ${name}`, detail !== undefined ? JSON.stringify(detail) : '');
  }
};

console.log('Command-registry native wiring\n');

// molecule.cleanup — collapse all atoms onto one point, expect it to spread out.
{
  const cmd = getCommand(CMD.Cleanup)!;
  const collapsed: Molecule = {
    atoms: [
      { id: 'a1', element: 'C', x: 0, y: 0, charge: 0 },
      { id: 'a2', element: 'C', x: 0, y: 0, charge: 0 },
      { id: 'a3', element: 'O', x: 0, y: 0, charge: 0 },
    ],
    bonds: [
      { id: 'b1', fromAtomId: 'a1', toAtomId: 'a2', order: 1 },
      { id: 'b2', fromAtomId: 'a2', toAtomId: 'a3', order: 1 },
    ],
  };
  const { next } = cmd.apply(collapsed, {}) as { next: Molecule };
  const d12 = Math.hypot(next.atoms[0].x - next.atoms[1].x, next.atoms[0].y - next.atoms[1].y);
  check('cleanup: atoms are spread apart (~bond length)', d12 > 20, d12);
  check('cleanup: atom/bond counts preserved', next.atoms.length === 3 && next.bonds.length === 2);
}

// molecule.importSmiles — merge benzene into an existing single-atom doc.
{
  const cmd = getCommand(CMD.ImportSmiles)!;
  const prev: Molecule = {
    atoms: [{ id: 'seed', element: 'C', x: 0, y: 0, charge: 0 }],
    bonds: [],
  };
  const r = cmd.apply(prev, { smiles: 'c1ccccc1', mode: 'merge' }) as {
    next: Molecule;
    extra: { newAtomIds: string[] };
  };
  const added = r.next.atoms.length - 1;
  check('importSmiles(merge): 6 carbons added', added === 6, added);
  check('importSmiles(merge): seed preserved', r.next.atoms.some(a => a.id === 'seed'));
  check('importSmiles(merge): returns newAtomIds', r.extra.newAtomIds.length === 6);

  const rr = cmd.apply(prev, { smiles: 'CCO', mode: 'replace' }) as { next: Molecule };
  check('importSmiles(replace): document replaced with 3 heavy atoms', rr.next.atoms.length === 3);
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);

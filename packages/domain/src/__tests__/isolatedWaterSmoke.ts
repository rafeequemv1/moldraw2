/**
 * Isolated water must not collapse to HOH / H–OH; alcohols stay OH.
 * Run: npx tsx --tsconfig tsconfig.app.json packages/domain/src/__tests__/isolatedWaterSmoke.ts
 */
import type { Atom, Molecule } from '../types';
import { condensedGroupLabelForAtom, isIsolatedWaterOxygen } from '../condensedGroupLabel';

const fail = (msg: string): never => {
  throw new Error(msg);
};
const eq = (got: unknown, want: unknown, msg: string): void => {
  if (got !== want) fail(`${msg}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
};

const o: Atom = { id: 'o', element: 'O', x: 0, y: 0, charge: 0 };
const loneO: Molecule = { atoms: [o], bonds: [] };
eq(isIsolatedWaterOxygen(o, loneO, 0), true, 'bare oxygen is water-like (2 implicit H)');
eq(condensedGroupLabelForAtom(o, loneO, 0), null, 'bare water has no condensed HOH label');

const h1: Atom = { id: 'h1', element: 'H', x: -20, y: 12, charge: 0 };
const oneH: Molecule = {
  atoms: [o, h1],
  bonds: [{ id: 'b1', fromAtomId: 'o', toAtomId: 'h1', order: 1 }],
};
eq(isIsolatedWaterOxygen(o, oneH, 1), true, 'H–O with one implicit H is still water');
eq(condensedGroupLabelForAtom(o, oneH, 1), null, 'H–O does not collapse to H–OH / OH');

const h2: Atom = { id: 'h2', element: 'H', x: 20, y: 12, charge: 0 };
const bent: Molecule = {
  atoms: [o, h1, h2],
  bonds: [
    { id: 'b1', fromAtomId: 'o', toAtomId: 'h1', order: 1 },
    { id: 'b2', fromAtomId: 'o', toAtomId: 'h2', order: 1 },
  ],
};
eq(isIsolatedWaterOxygen(o, bent, 2), true, 'explicit H–O–H is isolated water');
eq(condensedGroupLabelForAtom(o, bent, 2), null, 'explicit water has no condensed label');

const c: Atom = { id: 'c', element: 'C', x: -40, y: 0, charge: 0 };
const alcoholO: Atom = { id: 'oh', element: 'O', x: 0, y: 0, charge: 0 };
const alcohol: Molecule = {
  atoms: [c, alcoholO],
  bonds: [{ id: 'bco', fromAtomId: 'c', toAtomId: 'oh', order: 1 }],
};
eq(isIsolatedWaterOxygen(alcoholO, alcohol, 1), false, 'C–OH is not isolated water');
eq(condensedGroupLabelForAtom(alcoholO, alcohol, 1), 'OH', 'alcohol still condenses to OH');

const methyl: Atom = { id: 'me', element: 'C', x: 0, y: 0, charge: 0 };
const chain: Atom = { id: 'c2', element: 'C', x: 40, y: 0, charge: 0 };
const methylMol: Molecule = {
  atoms: [methyl, chain],
  bonds: [{ id: 'bcc', fromAtomId: 'me', toAtomId: 'c2', order: 1 }],
};
eq(condensedGroupLabelForAtom(methyl, methylMol, 1), 'CH3', 'terminal methyl still CH3');

console.log('isolatedWaterSmoke OK');

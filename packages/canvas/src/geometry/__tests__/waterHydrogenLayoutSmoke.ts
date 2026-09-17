/**
 * Isolated water H stubs are bent (~120°), not linear H–O–H.
 * Run: npx tsx --tsconfig tsconfig.app.json packages/canvas/src/geometry/__tests__/waterHydrogenLayoutSmoke.ts
 */
import type { Atom, Molecule } from '@moldraw/domain';
import { getHydrogenStubDirections } from '../hydrogenLayout';

const fail = (msg: string): never => {
  throw new Error(msg);
};

const o: Atom = { id: 'o', element: 'O', x: 0, y: 0, charge: 0 };
const lone: Molecule = { atoms: [o], bonds: [] };
const dirs = getHydrogenStubDirections(o, lone, 2);
if (dirs.length !== 2) fail(`expected 2 stubs, got ${dirs.length}`);

const angle = (a: { x: number; y: number }, b: { x: number; y: number }) => {
  const d = Math.acos(Math.max(-1, Math.min(1, a.x * b.x + a.y * b.y)));
  return (d * 180) / Math.PI;
};
const included = angle(dirs[0]!, dirs[1]!);
if (Math.abs(included - 120) > 2) {
  fail(`isolated water stubs must be ~120°, got ${included.toFixed(1)}`);
}
if (dirs[0]!.y <= 0 || dirs[1]!.y <= 0) {
  fail('water V should open downward (canvas y increases down)');
}

const h: Atom = { id: 'h', element: 'H', x: -20, y: 12, charge: 0 };
const oneH: Molecule = {
  atoms: [o, h],
  bonds: [{ id: 'b', fromAtomId: 'o', toAtomId: 'h', order: 1 }],
};
const rest = getHydrogenStubDirections(o, oneH, 1);
if (rest.length !== 1) fail(`expected 1 remaining stub, got ${rest.length}`);
const n = { x: h.x - o.x, y: h.y - o.y };
const nLen = Math.hypot(n.x, n.y) || 1;
n.x /= nLen;
n.y /= nLen;
const restIncluded = angle(n, rest[0]!);
if (Math.abs(restIncluded - 120) > 2) {
  fail(`remaining water H must sit ~120° from explicit H, got ${restIncluded.toFixed(1)}`);
}

console.log('waterHydrogenLayoutSmoke OK');

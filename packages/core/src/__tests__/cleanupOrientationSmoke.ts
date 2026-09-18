/**
 * Cleanup rematch must undo a 90° engine heading so lone-pair seats stay put.
 * Run: .\node_modules\.bin\tsx.cmd --tsconfig tsconfig.app.json packages/core/src/__tests__/cleanupOrientationSmoke.ts
 */
import type { Atom, Bond, Molecule, Point } from '@moldraw/domain';
import { alignCleanedPoints, alignCleanupCoordsPerComponent } from '../io/localCleanup';
import { cleanupMolecule } from '@moldraw/engine';

const fail = (msg: string): never => {
  throw new Error(msg);
};

const wrapPi = (a: number): number => {
  let x = a;
  while (x > Math.PI) x -= 2 * Math.PI;
  while (x < -Math.PI) x += 2 * Math.PI;
  return x;
};

const principalAngle = (pts: ReadonlyArray<Point>): number => {
  const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
  const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
  let xx = 0;
  let xy = 0;
  let yy = 0;
  for (const p of pts) {
    const x = p.x - cx;
    const y = p.y - cy;
    xx += x * x;
    xy += x * y;
    yy += y * y;
  }
  return 0.5 * Math.atan2(2 * xy, xx - yy);
};

const headingErrDeg = (a: ReadonlyArray<Point>, b: ReadonlyArray<Point>): number =>
  (Math.abs(wrapPi(principalAngle(a) - principalAngle(b))) * 180) / Math.PI;

const rotate = (pts: ReadonlyArray<Point>, theta: number): Point[] => {
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  const cx = pts.reduce((acc, p) => acc + p.x, 0) / pts.length;
  const cy = pts.reduce((acc, p) => acc + p.y, 0) / pts.length;
  return pts.map(p => ({
    x: cx + c * (p.x - cx) - s * (p.y - cy),
    y: cy + s * (p.x - cx) + c * (p.y - cy),
  }));
};

const atom = (id: string, element: string, x: number, y: number, extra: Partial<Atom> = {}): Atom => ({
  id,
  element,
  x,
  y,
  charge: 0,
  ...extra,
});

const bond = (id: string, fromAtomId: string, toAtomId: string): Bond => ({
  id,
  fromAtomId,
  toAtomId,
  order: 1,
});

/** Horizontal fused-ish hex + exo chain (elongated so PCA is stable). */
const makeHorizontal = (): Molecule => {
  const atoms: Atom[] = [
    atom('c1', 'C', 0, 20),
    atom('c2', 'C', 35, 0),
    atom('c3', 'C', 70, 20),
    atom('c4', 'C', 70, 60),
    atom('c5', 'C', 35, 80),
    atom('c6', 'C', 0, 60),
    atom('c7', 'C', 105, 20),
    atom('c8', 'C', 140, 0),
    atom('c9', 'C', 175, 20),
    atom('c10', 'C', 175, 60),
    atom('c11', 'C', 140, 80),
    atom('c12', 'C', 105, 60),
    atom('n1', 'N', 210, 20, { alias: 'NH2', lonePairs: 1 }),
    atom('cl1', 'Cl', 210, 60, { lonePairs: 3 }),
    atom('o1', 'O', -35, 40, { charge: -1, chargeOffset: { x: -16, y: 0 } }),
  ];
  const bonds: Bond[] = [
    bond('b1', 'c1', 'c2'),
    bond('b2', 'c2', 'c3'),
    bond('b3', 'c3', 'c4'),
    bond('b4', 'c4', 'c5'),
    bond('b5', 'c5', 'c6'),
    bond('b6', 'c6', 'c1'),
    bond('b7', 'c3', 'c7'),
    bond('b8', 'c7', 'c8'),
    bond('b9', 'c8', 'c9'),
    bond('b10', 'c9', 'c10'),
    bond('b11', 'c10', 'c11'),
    bond('b12', 'c11', 'c12'),
    bond('b13', 'c12', 'c7'),
    bond('b14', 'c4', 'c12'),
    bond('b15', 'c9', 'n1'),
    bond('b16', 'c10', 'cl1'),
    bond('b17', 'c1', 'o1'),
  ];
  return { atoms, bonds };
};

const ptsOf = (mol: Molecule): Point[] => mol.atoms.map(a => ({ x: a.x, y: a.y }));

{
  const orig = [
    { x: 0, y: 0 },
    { x: 80, y: 8 },
    { x: 160, y: -6 },
    { x: 240, y: 10 },
    { x: 40, y: 50 },
    { x: 200, y: 55 },
  ];
  const spun = rotate(orig, Math.PI / 2);
  const aligned = alignCleanedPoints(spun, orig, { allowReflection: false });
  if (!aligned) fail('alignCleanedPoints returned null');
  const err = headingErrDeg(aligned, orig);
  if (err > 8) fail(`90° spin should rematch heading, got ${err.toFixed(1)}°`);
  console.log('ok  alignCleanedPoints undoes 90° spin', err.toFixed(2), 'deg');
}

{
  const orig = makeHorizontal();
  const spunPts = rotate(ptsOf(orig), Math.PI / 2);
  const cleanedById = new Map(orig.atoms.map((a, i) => [a.id, spunPts[i]!]));
  const next = alignCleanupCoordsPerComponent(orig, cleanedById);
  const err = headingErrDeg(ptsOf(next), ptsOf(orig));
  if (err > 8) fail(`component rematch heading ${err.toFixed(1)}°`);
  const o = next.atoms.find(a => a.id === 'o1');
  if (!o || o.chargeOffset?.x !== -16 || o.chargeOffset?.y !== 0) {
    fail('charge offset must survive rematch');
  }
  console.log('ok  alignCleanupCoordsPerComponent keeps heading + charge seat');
}

{
  const orig = makeHorizontal();
  const laid = cleanupMolecule(orig, { bondLengthPx: 40, preserveOrientation: true, forceFullRebuild: true });
  const rematched = alignCleanupCoordsPerComponent(
    orig,
    new Map(laid.molecule.atoms.map(a => [a.id, { x: a.x, y: a.y }])),
  );
  const err = headingErrDeg(ptsOf(rematched), ptsOf(orig));
  if (err > 25) {
    fail(`full cleanup rematch heading drifted ${err.toFixed(1)}° (want < 25°)`);
  }
  const n = rematched.atoms.find(a => a.id === 'n1');
  const cl = rematched.atoms.find(a => a.id === 'cl1');
  if (!n || !cl) fail('missing heteroatoms');
  // NH2 / Cl stay on the right of the fused system (original heading).
  const cx = rematched.atoms.reduce((s, a) => s + a.x, 0) / rematched.atoms.length;
  if (n.x < cx - 10) fail('NH2 crossed to the left after cleanup rematch');
  if (cl.x < cx - 10) fail('Cl crossed to the left after cleanup rematch');
  console.log('ok  full cleanup rematch keeps elongated heading', err.toFixed(2), 'deg');
}

console.log('cleanupOrientationSmoke: all ok');

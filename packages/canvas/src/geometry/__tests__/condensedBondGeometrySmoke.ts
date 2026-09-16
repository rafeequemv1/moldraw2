/**
 * Condensed labels inset bond tips at the label box; atom coords stay put.
 * Run: npx tsx --tsconfig tsconfig.app.json packages/canvas/src/geometry/__tests__/condensedBondGeometrySmoke.ts
 */
import type { ResolvedCanvasPreferences } from '@moldraw/core/canvasPreferences';
import type { Atom, Molecule } from '@moldraw/domain';
import { bondEndPoints, type BondTrimContext } from '../bondGeometry';
import { hGoesLeft } from '../hydrogenLayout';

const fail = (msg: string): never => {
  throw new Error(msg);
};
const eq = (got: unknown, want: unknown, msg: string): void => {
  if (got !== want) fail(`${msg}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
};

const prefs: ResolvedCanvasPreferences = {
  bondLengthPx: 40,
  bondSpacingFraction: 0.18,
  bondThicknessPx: 1.5,
  stereoWedgeWidthPx: 6,
  hashSpacingPx: 2,
  bondAngleSnapRad: Math.PI / 6,
  snapToGrid: false,
  showGrid: false,
  gridSizePx: 50,
  labelFontFamily: 'Arial',
  elementFontCss: '14px Arial',
  subFontCss: '12px Arial',
  chargeFontCss: '10px Arial',
  implicitHFontCss: '14px Arial',
  isoFontCss: '10px Arial',
  reactionComponentMarginPx: 8,
  imageExportScale: 1,
};

const mockCtx = {
  save() {},
  restore() {},
  font: '',
  measureText(text: string) {
    return {
      width: String(text).length * 8,
      actualBoundingBoxAscent: 10,
      actualBoundingBoxDescent: 3,
    };
  },
} as unknown as CanvasRenderingContext2D;

/** Ethanol-like: C(methyl)–C(methylene)–O */
const c1: Atom = { id: 'c1', element: 'C', x: 0, y: 0, charge: 0 };
const c2: Atom = { id: 'c2', element: 'C', x: 40, y: 0, charge: 0 };
const o1: Atom = { id: 'o1', element: 'O', x: 80, y: 0, charge: 0 };
const mol: Molecule = {
  atoms: [c1, c2, o1],
  bonds: [
    { id: 'b1', fromAtomId: 'c1', toAtomId: 'c2', order: 1 },
    { id: 'b2', fromAtomId: 'c2', toAtomId: 'o1', order: 1 },
  ],
};
const valencyMap = new Map<string, number>([
  ['c1', 1],
  ['c2', 2],
  ['o1', 1],
]);

const trim = (condensedGroupLabels: boolean): BondTrimContext => ({
  ctx: mockCtx,
  displayPrefs: prefs,
  labelRadForAtom: () => 0,
  condensedGroupLabels,
  molecule: mol,
  valencyMap,
});

const snap = (p: { ax: number; ay: number; bx: number; by: number }) =>
  `${p.ax.toFixed(3)},${p.ay.toFixed(3)}→${p.bx.toFixed(3)},${p.by.toFixed(3)}`;

const ccOff = bondEndPoints(c1, c2, trim(false));
const ccOn = bondEndPoints(c1, c2, trim(true));
eq(snap(ccOff), '0.000,0.000→40.000,0.000', 'C–C is flush when condensed labels are off');
if (!(ccOn.ax > ccOff.ax + 2)) {
  fail(`condensed CH3 must inset the bond before C, got ${snap(ccOn)}`);
}
eq(ccOn.ay, 0, 'CH3 trim stays on the bond axis');
eq(ccOn.bx.toFixed(3), '40.000', 'methylene end stays at the carbon (no condensed label)');

const coOff = bondEndPoints(c2, o1, trim(false));
const coOn = bondEndPoints(c2, o1, trim(true));
if (!(coOn.bx < o1.x - 2)) {
  fail(`condensed OH must stop before O, got ${snap(coOn)}`);
}
eq(coOff.ax.toFixed(3), coOn.ax.toFixed(3), 'C–O carbon end unchanged (methylene has no condensed label)');

eq(c1.x, 0, 'methyl carbon x unchanged');
eq(c1.y, 0, 'methyl carbon y unchanged');
eq(c2.x, 40, 'methylene x unchanged');
eq(o1.x, 80, 'oxygen x unchanged');
eq(o1.y, 0, 'oxygen y unchanged');

eq(hGoesLeft(c1, mol), true, 'left-side methyl: neighbor to the right → H3C');
eq(hGoesLeft(o1, mol), false, 'right-side OH: neighbor to the left → OH');

const hLeft: Atom = { id: 'hL', element: 'H', x: -20, y: 0, charge: 0 };
const molWithH: Molecule = {
  atoms: [...mol.atoms, hLeft],
  bonds: [...mol.bonds, { id: 'bh', fromAtomId: 'c1', toAtomId: 'hL', order: 1 }],
};
eq(
  hGoesLeft(c1, molWithH),
  true,
  'explicit H to the left must not flip methyl orientation',
);

console.log('condensedBondGeometrySmoke OK');

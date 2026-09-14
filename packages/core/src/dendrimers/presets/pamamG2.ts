/**
 * PAMAM G2 (EDA core) — poly(amidoamine) with 16 terminal amines.
 * One repeat is CH2CH2CONHCH2CH2N; G1 nitrogens each grow two G2 arms.
 * Coordinates are native-2D cleaned so the library preview and insert match.
 */
import type { Atom, Bond } from '@moldraw/domain';
import { cleanupMolecule } from '@moldraw/engine';
import { addAtom, addBond } from '../../cofs/rings';
import type { DendrimerBuildOptions, DendrimerBuildResult } from '../types';

/**
 * Cleaned layout in bond-length units, centred on the origin, in construction
 * order. The full native rebuild of this acyclic 100-atom tree costs seconds;
 * the topology is fixed, so it is laid out once per session and every later
 * build (library preview, each insert) only scales + translates.
 */
let unitLayoutCache: ReadonlyArray<{ x: number; y: number }> | null = null;

/**
 * Baked result of that rebuild (bond length 1, centroid at origin, construction
 * order). Every bond measures exactly 1.000. If the topology below changes and
 * the count no longer matches, the layout falls back to a one-off rebuild.
 */
const PAMAM_G2_UNIT_LAYOUT: ReadonlyArray<readonly [number, number]> = [
  [2.7246, 1.8298], [2.2258, 0.963], [1.2259, 0.9526], [1.0105, -0.0239], [2.1281, 2.6324],
  [1.1281, 2.6423], [0.9851, 3.632], [1.8161, 4.1883], [0.1033, 4.1037], [-0.6425, 3.4375],
  [-0.4268, 2.4611], [-1.364, 2.1121], [-1.8054, 1.2148], [-2.7531, 1.5341], [-3.2244, 0.6522],
  [-2.554, -0.0898], [-4.1593, 0.297], [-5.1489, 0.1534], [-6.143, 0.0451], [-6.9552, 0.6285],
  [-2.0366, 2.8521], [-3.0366, 2.8479], [-3.8767, 2.3055], [-4.6637, 2.9225], [-4.1382, 1.3403],
  [-5.0915, 1.6425], [-5.9844, 1.1923], [-6.77, 1.8111], [3.7231, 1.8834], [4.289, 2.7078],
  [5.2852, 2.6209], [5.6908, 1.7068], [5.9294, 3.3857], [6.9282, 3.4355], [7.3108, 4.3594],
  [8.1934, 4.8295], [9.0925, 4.3918], [10.0695, 4.6052], [10.4081, 3.6643], [9.5868, 3.0938],
  [11.1918, 3.0431], [10.7839, 2.1301], [9.8667, 1.7318], [8.9166, 2.0439], [8.3898, 5.81],
  [9.3896, 5.833], [10.0926, 6.5441], [9.7957, 7.499], [11.0608, 6.2939], [11.716, 7.0493],
  [12.7112, 6.9515], [13.1513, 6.0536], [1.8187, -0.6128], [2.8134, -0.7158], [2.7458, -1.7136],
  [1.7828, -1.9833], [3.2534, -2.5751], [2.8689, -3.4983], [1.924, -3.8258], [1.1347, -4.4397],
  [0.8552, -5.3999], [-0.1213, -5.6154], [-1.0765, -5.9114], [-1.7319, -5.1562], [-1.765, -6.6367],
  [-2.69, -6.2567], [-3.6602, -6.4992], [-4.4598, -5.8986], [0.273, -3.9322], [-0.6563, -3.563],
  [-1.6388, -3.7491], [-1.8978, -2.7832], [-2.6387, -3.7623], [-3.2019, -4.5886], [-4.1991, -4.5133],
  [-4.4552, -3.5467], [0.0764, -0.381], [-0.4639, -1.2225], [-1.4252, -0.9472], [-1.366, 0.051],
  [-2.3176, -1.3986], [-3.2903, -1.1665], [-4.0122, -1.8586], [-5.0083, -1.9462], [-5.6267, -1.1603],
  [-6.6217, -1.2603], [-7.5093, -0.7999], [-7.8732, 0.1316], [-8.3172, -1.3893], [-8.2998, -2.3892],
  [-9.1856, -2.8532], [-10.0216, -2.3044], [-5.5234, -2.8033], [-6.4865, -3.0725], [-6.8528, -4.003],
  [-6.2491, -4.8002], [-7.8244, -4.2396], [-8.2168, -5.1594], [-9.2067, -5.3008], [-9.802, -4.4973],
];

const unitLayoutFor = (atoms: Atom[], bonds: Bond[], a: number): ReadonlyArray<{ x: number; y: number }> => {
  if (unitLayoutCache && unitLayoutCache.length === atoms.length) return unitLayoutCache;
  if (PAMAM_G2_UNIT_LAYOUT.length === atoms.length) {
    unitLayoutCache = PAMAM_G2_UNIT_LAYOUT.map(([x, y]) => ({ x, y }));
    return unitLayoutCache;
  }
  const cleaned = cleanupMolecule(
    { atoms, bonds },
    { bondLengthPx: a, forceFullRebuild: true, preserveOrientation: false },
  ).molecule;
  const byId = new Map(cleaned.atoms.map(x => [x.id, x]));
  let sx = 0;
  let sy = 0;
  for (const at of atoms) {
    const c = byId.get(at.id) ?? at;
    sx += c.x;
    sy += c.y;
  }
  const mx = sx / Math.max(1, atoms.length);
  const my = sy / Math.max(1, atoms.length);
  unitLayoutCache = atoms.map(at => {
    const c = byId.get(at.id) ?? at;
    return { x: (c.x - mx) / a, y: (c.y - my) / a };
  });
  return unitLayoutCache;
};

const addPamamRepeat = (
  atoms: Atom[],
  bonds: Bond[],
  fromId: string,
  fromX: number,
  fromY: number,
  angle: number,
  a: number,
  cx: number,
  cy: number,
): { nId: string; x: number; y: number } => {
  const ux = Math.cos(angle);
  const uy = Math.sin(angle);
  let px = -uy;
  let py = ux;

  const c1 = addAtom(atoms, 'C', fromX + a * ux, fromY + a * uy);
  addBond(bonds, fromId, c1.id);
  const c2 = addAtom(atoms, 'C', c1.x + a * ux, c1.y + a * uy);
  addBond(bonds, c1.id, c2.id);
  const cO = addAtom(atoms, 'C', c2.x + a * ux, c2.y + a * uy);
  addBond(bonds, c2.id, cO.id);
  if (px * (cO.x - cx) + py * (cO.y - cy) < 0) {
    px = -px;
    py = -py;
  }
  const o = addAtom(atoms, 'O', cO.x + 0.95 * a * px, cO.y + 0.95 * a * py);
  addBond(bonds, cO.id, o.id, { order: 2 });
  const nH = addAtom(atoms, 'N', cO.x + a * ux, cO.y + a * uy);
  addBond(bonds, cO.id, nH.id);
  const c3 = addAtom(atoms, 'C', nH.x + a * ux, nH.y + a * uy);
  addBond(bonds, nH.id, c3.id);
  const c4 = addAtom(atoms, 'C', c3.x + a * ux, c3.y + a * uy);
  addBond(bonds, c3.id, c4.id);
  const nT = addAtom(atoms, 'N', c4.x + a * ux, c4.y + a * uy);
  addBond(bonds, c4.id, nT.id);
  return { nId: nT.id, x: nT.x, y: nT.y };
};

export function buildPamamG2(options: DendrimerBuildOptions): DendrimerBuildResult {
  const a = Math.max(16, options.bondLength);
  const { cx, cy } = options;
  const atoms: Atom[] = [];
  const bonds: Bond[] = [];

  const n1 = addAtom(atoms, 'N', cx - 1.5 * a, cy);
  const e1 = addAtom(atoms, 'C', cx - 0.5 * a, cy);
  const e2 = addAtom(atoms, 'C', cx + 0.5 * a, cy);
  const n2 = addAtom(atoms, 'N', cx + 1.5 * a, cy);
  addBond(bonds, n1.id, e1.id);
  addBond(bonds, e1.id, e2.id);
  addBond(bonds, e2.id, n2.id);

  const fork = 0.5;
  const arms: Array<{ from: Atom; ang: number }> = [
    { from: n1, ang: (155 * Math.PI) / 180 },
    { from: n1, ang: (205 * Math.PI) / 180 },
    { from: n2, ang: (25 * Math.PI) / 180 },
    { from: n2, ang: (-25 * Math.PI) / 180 },
  ];

  for (const arm of arms) {
    const g1 = addPamamRepeat(atoms, bonds, arm.from.id, arm.from.x, arm.from.y, arm.ang, a, cx, cy);
    addPamamRepeat(atoms, bonds, g1.nId, g1.x, g1.y, arm.ang + fork, a, cx, cy);
    addPamamRepeat(atoms, bonds, g1.nId, g1.x, g1.y, arm.ang - fork, a, cx, cy);
  }

  const unit = unitLayoutFor(atoms, bonds, a);
  const laidOut = atoms.map((at, i) => ({
    ...at,
    x: cx + unit[i]!.x * a,
    y: cy + unit[i]!.y * a,
  }));
  return { atoms: laidOut, bonds, atomIds: laidOut.map(x => x.id) };
}

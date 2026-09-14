/**
 * Carbosilane–ferrocene G3 via the dendrimer setup (core + one wedge × 3).
 *
 * Positions are computed first: 27 ring centers on an equal-angle arc (tiles
 * to 81 equally spaced rings after the array). Each Si sits on a generation
 * ring at the mean angle of its leaves. Linkers are then stroked from parent
 * to that exact endpoint so rings land on the arc and bonds in a linker match.
 *
 * Repeat: Si–(CH2)3–SiMe2–O–C6H4–CH2–Si
 * Termini: Si–(CH2)3–SiMe2–O–C6H4–O–Fc (wavy)
 */
import type { Atom, Bond } from '@moldraw/domain';
import { addAtom, addBond, addKekuleBenzene } from '../../cofs/rings';
import type { DendrimerBuildOptions, DendrimerBuildResult } from '../types';

const GENERATIONS = 3;
const BRANCHES = 3;
const WEDGE_CONE = (Math.PI * 2) / BRANCHES;
/** Si–C–C–C–Si bonds (120° zigzag, ±30° from the chain axis). */
const ALKYL_BONDS = 4;
const ZIG_TILT = Math.PI / 6;
const ZIG_COS = Math.sqrt(3) / 2;
/** After SiMe2: O + ring (center at 2) + para + CH2 + child Si. */
const INTERNAL_TAIL = 6;
/** After SiMe2: O + ring center at 2. */
const TERMINAL_TAIL = 3;
const LEAVES = BRANCHES ** GENERATIONS;
const FULL_LEAVES = LEAVES * BRANCHES;
/** Minimum center-to-center of adjacent outer rings, in units of bond length. */
const RING_CLEARANCE = 2.4;

type Pt = { x: number; y: number };

const polar = (cx: number, cy: number, r: number, ang: number): Pt => ({
  x: cx + r * Math.cos(ang),
  y: cy + r * Math.sin(ang),
});

const leafAngle = (attachAng: number, index: number): number =>
  attachAng + ((index + 0.5) / LEAVES - 0.5) * WEDGE_CONE;

const meanAngle = (attachAng: number, lo: number, hi: number): number =>
  0.5 * (leafAngle(attachAng, lo) + leafAngle(attachAng, hi - 1));

const axisOf = (from: Pt, to: Pt): { u: Pt; d: number } => {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const d = Math.hypot(dx, dy);
  if (d < 1e-6) return { u: { x: 1, y: 0 }, d: 0 };
  return { u: { x: dx / d, y: dy / d }, d };
};

const at = (origin: Pt, u: Pt, dist: number): Pt => ({
  x: origin.x + u.x * dist,
  y: origin.y + u.y * dist,
});

const addAt = (
  atoms: Atom[],
  bonds: Bond[],
  fromId: string,
  p: Pt,
  element: string,
): Atom => {
  const atom = addAtom(atoms, element, p.x, p.y);
  addBond(bonds, fromId, atom.id);
  return atom;
};

/** ChemDraw-style all-trans alkyl: 120° bond angles, uniform length `a`. */
const addZigzagAlkyl = (
  atoms: Atom[],
  bonds: Bond[],
  fromId: string,
  from: Pt,
  axisAng: number,
  a: number,
  elements: readonly string[],
  sign: 1 | -1,
): { id: string; pos: Pt } => {
  let prev = fromId;
  let p = from;
  let tilt: 1 | -1 = sign;
  let last = from;
  let lastId = fromId;
  for (const el of elements) {
    const ang = axisAng + tilt * ZIG_TILT;
    p = { x: p.x + a * Math.cos(ang), y: p.y + a * Math.sin(ang) };
    const atom = addAt(atoms, bonds, prev, p, el);
    if (el === 'Si') atom.alias = 'Si';
    prev = atom.id;
    last = p;
    lastId = atom.id;
    tilt = tilt === 1 ? -1 : 1;
  }
  return { id: lastId, pos: last };
};

const addMethyls = (atoms: Atom[], bonds: Bond[], si: Atom, u: Pt, bond: number): void => {
  const px = -u.y;
  const py = u.x;
  const me1 = addAtom(atoms, 'C', si.x + bond * px, si.y + bond * py);
  const me2 = addAtom(atoms, 'C', si.x - bond * px, si.y - bond * py);
  addBond(bonds, si.id, me1.id);
  addBond(bonds, si.id, me2.id);
};

const addHexOnAxis = (
  atoms: Atom[],
  bonds: Bond[],
  oxygenId: string,
  oxygen: Pt,
  center: Pt,
  bond: number,
): { paraId: string; para: Pt } => {
  const ipsoAng = Math.atan2(oxygen.y - center.y, oxygen.x - center.x);
  const ids = addKekuleBenzene(atoms, bonds, center.x, center.y, bond, ipsoAng);
  addBond(bonds, oxygenId, ids[0]!);
  const para = atoms.find(atom => atom.id === ids[3]!);
  return { paraId: ids[3]!, para: para ?? center };
};

/** Si–(CH2)3–Si zigzag (120°), then O–Ph–CH2–Si to the exact child. */
const strokeInternal = (
  atoms: Atom[],
  bonds: Bond[],
  fromId: string,
  from: Pt,
  end: Pt,
  a: number,
  withMethyls: boolean,
  zigSign: 1 | -1,
): { id: string; pos: Pt } => {
  const axisAng = Math.atan2(end.y - from.y, end.x - from.x);
  const z = addZigzagAlkyl(atoms, bonds, fromId, from, axisAng, a, ['C', 'C', 'C', 'Si'], zigSign);
  const siMe = atoms.find(atom => atom.id === z.id);
  if (siMe && withMethyls) {
    addMethyls(atoms, bonds, siMe, { x: Math.cos(axisAng), y: Math.sin(axisAng) }, a);
  }
  const { u, d } = axisOf(z.pos, end);
  const b = d / INTERNAL_TAIL;
  const o = addAt(atoms, bonds, z.id, at(z.pos, u, b), 'O');
  const center = at(z.pos, u, 3 * b);
  const { paraId } = addHexOnAxis(atoms, bonds, o.id, o, center, b);
  const ch2 = addAt(atoms, bonds, paraId, at(z.pos, u, 5 * b), 'C');
  const si = addAt(atoms, bonds, ch2.id, end, 'Si');
  si.alias = 'Si';
  return { id: si.id, pos: end };
};

/** Si–(CH2)3–Si zigzag (120°), then O–Ph–O–Fc with the ring center at `end`. */
const strokeTerminal = (
  atoms: Atom[],
  bonds: Bond[],
  fromId: string,
  from: Pt,
  end: Pt,
  a: number,
  withMethyls: boolean,
  zigSign: 1 | -1,
): void => {
  const axisAng = Math.atan2(end.y - from.y, end.x - from.x);
  const z = addZigzagAlkyl(atoms, bonds, fromId, from, axisAng, a, ['C', 'C', 'C', 'Si'], zigSign);
  const siMe = atoms.find(atom => atom.id === z.id);
  if (siMe && withMethyls) {
    addMethyls(atoms, bonds, siMe, { x: Math.cos(axisAng), y: Math.sin(axisAng) }, a);
  }
  const { u, d } = axisOf(z.pos, end);
  const b = d / TERMINAL_TAIL;
  const o = addAt(atoms, bonds, z.id, at(z.pos, u, b), 'O');
  const { paraId, para } = addHexOnAxis(atoms, bonds, o.id, o, end, b);
  const o2 = addAt(atoms, bonds, paraId, at(para, u, b), 'O');
  const fc = addAt(atoms, bonds, o2.id, at(o2, u, b), 'Fe');
  fc.alias = 'Fc';
  const link = bonds[bonds.length - 1];
  if (link) link.stereo = 'wavy';
};

const placeSubtree = (
  atoms: Atom[],
  bonds: Bond[],
  parentId: string,
  parent: Pt,
  attachAng: number,
  leafLo: number,
  leafHi: number,
  gen: number,
  a: number,
  radii: { g2: number; g3: number; term: number },
  cx: number,
  cy: number,
): void => {
  const childSpan = (leafHi - leafLo) / BRANCHES;
  const withMethyls = gen === 1;
  for (let i = 0; i < BRANCHES; i++) {
    const lo = leafLo + i * childSpan;
    const hi = lo + childSpan;
    const zigSign: 1 | -1 = i === 0 ? -1 : 1;
    if (gen >= GENERATIONS) {
      const ring = polar(cx, cy, radii.term, leafAngle(attachAng, lo));
      strokeTerminal(atoms, bonds, parentId, parent, ring, a, withMethyls, zigSign);
      continue;
    }
    const childGen = gen + 1;
    const r = childGen === 2 ? radii.g2 : radii.g3;
    const childAt = polar(cx, cy, r, meanAngle(attachAng, lo, hi));
    const child = strokeInternal(atoms, bonds, parentId, parent, childAt, a, withMethyls, zigSign);
    placeSubtree(atoms, bonds, child.id, child.pos, attachAng, lo, hi, childGen, a, radii, cx, cy);
  }
};

export function buildCarbosilaneFcG3(options: DendrimerBuildOptions): DendrimerBuildResult {
  const a = Math.max(16, options.bondLength);
  const { cx, cy } = options;
  const atoms: Atom[] = [];
  const bonds: Bond[] = [];

  const coreIds = addKekuleBenzene(atoms, bonds, cx, cy, a, 0);
  const attach = [coreIds[0]!, coreIds[2]!, coreIds[4]!];
  const ipso = atoms.find(at => at.id === attach[0]);
  if (!ipso) {
    return { atoms, bonds, atomIds: atoms.map(x => x.id) };
  }

  const attachAng = Math.atan2(ipso.y - cy, ipso.x - cx);
  const ch2 = addAt(
    atoms,
    bonds,
    ipso.id,
    { x: ipso.x + a * Math.cos(attachAng), y: ipso.y + a * Math.sin(attachAng) },
    'C',
  );
  const g1 = addAt(
    atoms,
    bonds,
    ch2.id,
    { x: ch2.x + a * Math.cos(attachAng), y: ch2.y + a * Math.sin(attachAng) },
    'Si',
  );
  g1.alias = 'Si';
  const r0 = Math.hypot(g1.x - cx, g1.y - cy);

  const alkylSpan = ALKYL_BONDS * a * ZIG_COS;
  const internalSpan = alkylSpan + INTERNAL_TAIL * a;
  const terminalSpan = alkylSpan + TERMINAL_TAIL * a;
  const designedTerm = r0 + internalSpan * 2 + terminalSpan;
  const minTerm = (RING_CLEARANCE * a) / (2 * Math.sin(Math.PI / FULL_LEAVES));
  const scale = Math.max(1, minTerm / designedTerm);
  const radii = {
    g2: r0 + internalSpan * scale,
    g3: r0 + internalSpan * 2 * scale,
    term: r0 + (internalSpan * 2 + terminalSpan) * scale,
  };

  placeSubtree(atoms, bonds, g1.id, g1, attachAng, 0, LEAVES, 1, a, radii, cx, cy);

  return {
    atoms,
    bonds,
    atomIds: atoms.map(x => x.id),
    array: {
      foldCount: BRANCHES,
      coreAtomIds: coreIds,
      attachmentAtomIds: attach,
    },
  };
}

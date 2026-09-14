/**
 * Must-have polymer SRU builders — one ChemDraw-style repeating unit each.
 * Connections continue through the SRU brackets (not expanded to n monomers).
 */
import type { Atom, Bond } from '@moldraw/domain';
import {
  addAtom,
  addBond,
  addChainAlongX,
  addKekuleBenzene,
  addPendant,
  addPhenylPendant,
  addThiophene,
} from '../helpers';
import type { PolymerBuilder } from '../types';

const DOWN = Math.PI / 2;
const UP = -Math.PI / 2;

const result = (atoms: Atom[], bonds: Bond[]) => ({
  atoms,
  bonds,
  atomIds: atoms.map(a => a.id),
  subscript: 'n',
});

/** PEG / PEO: -[O-CH₂-CH₂]-ₙ */
export const buildPeg: PolymerBuilder = ({ bondLength, cx, cy }) => {
  const a = Math.max(16, bondLength);
  const atoms: Atom[] = [];
  const bonds: Bond[] = [];
  addChainAlongX(atoms, bonds, { x: cx - a, y: cy }, ['O', 'C', 'C'], a);
  return result(atoms, bonds);
};

/** PE: -[CH₂-CH₂]-ₙ */
export const buildPe: PolymerBuilder = ({ bondLength, cx, cy }) => {
  const a = Math.max(16, bondLength);
  const atoms: Atom[] = [];
  const bonds: Bond[] = [];
  addChainAlongX(atoms, bonds, { x: cx - a / 2, y: cy }, ['C', 'C'], a);
  return result(atoms, bonds);
};

/** PP: -[CH₂-CH(CH₃)]-ₙ */
export const buildPp: PolymerBuilder = ({ bondLength, cx, cy }) => {
  const a = Math.max(16, bondLength);
  const atoms: Atom[] = [];
  const bonds: Bond[] = [];
  const ids = addChainAlongX(atoms, bonds, { x: cx - a / 2, y: cy }, ['C', 'C'], a);
  const c2 = atoms.find(x => x.id === ids[1]!)!;
  addPendant(atoms, bonds, c2, 'C', DOWN, a);
  return result(atoms, bonds);
};

/** PS: -[CH₂-CH(Ph)]-ₙ */
export const buildPs: PolymerBuilder = ({ bondLength, cx, cy }) => {
  const a = Math.max(16, bondLength);
  const atoms: Atom[] = [];
  const bonds: Bond[] = [];
  const ids = addChainAlongX(atoms, bonds, { x: cx - a / 2, y: cy }, ['C', 'C'], a);
  const c2 = atoms.find(x => x.id === ids[1]!)!;
  addPhenylPendant(atoms, bonds, c2, DOWN, a);
  return result(atoms, bonds);
};

/** PVC: -[CH₂-CHCl]-ₙ */
export const buildPvc: PolymerBuilder = ({ bondLength, cx, cy }) => {
  const a = Math.max(16, bondLength);
  const atoms: Atom[] = [];
  const bonds: Bond[] = [];
  const ids = addChainAlongX(atoms, bonds, { x: cx - a / 2, y: cy }, ['C', 'C'], a);
  const c2 = atoms.find(x => x.id === ids[1]!)!;
  addPendant(atoms, bonds, c2, 'Cl', DOWN, a);
  return result(atoms, bonds);
};

/** PTFE: -[CF₂-CF₂]-ₙ */
export const buildPtfe: PolymerBuilder = ({ bondLength, cx, cy }) => {
  const a = Math.max(16, bondLength);
  const atoms: Atom[] = [];
  const bonds: Bond[] = [];
  const ids = addChainAlongX(atoms, bonds, { x: cx - a / 2, y: cy }, ['C', 'C'], a);
  for (const id of ids) {
    const c = atoms.find(x => x.id === id)!;
    addPendant(atoms, bonds, c, 'F', UP, a * 0.9);
    addPendant(atoms, bonds, c, 'F', DOWN, a * 0.9);
  }
  return result(atoms, bonds);
};

/** PMMA: -[CH₂-C(CH₃)(CO₂Me)]-ₙ */
export const buildPmma: PolymerBuilder = ({ bondLength, cx, cy }) => {
  const a = Math.max(16, bondLength);
  const atoms: Atom[] = [];
  const bonds: Bond[] = [];
  const ids = addChainAlongX(atoms, bonds, { x: cx - a / 2, y: cy }, ['C', 'C'], a);
  const c2 = atoms.find(x => x.id === ids[1]!)!;
  addPendant(atoms, bonds, c2, 'C', UP, a); // α-Me
  const carbonyl = addPendant(atoms, bonds, c2, 'C', DOWN, a);
  addPendant(atoms, bonds, carbonyl, 'O', DOWN + 0.5, a * 0.85, { order: 2 });
  const oMe = addPendant(atoms, bonds, carbonyl, 'O', DOWN - 0.5, a * 0.85);
  addPendant(atoms, bonds, oMe, 'C', DOWN, a * 0.85);
  return result(atoms, bonds);
};

/**
 * PET: -[O-CH₂-CH₂-O-C(=O)-C₆H₄-C(=O)]-ₙ
 * (ethylene glycol + terephthalate ester SRU)
 */
export const buildPet: PolymerBuilder = ({ bondLength, cx, cy }) => {
  const a = Math.max(16, bondLength);
  const atoms: Atom[] = [];
  const bonds: Bond[] = [];
  // Left: O–CH2–CH2–O–C(=O)
  const left = addChainAlongX(
    atoms,
    bonds,
    { x: cx - 3.5 * a, y: cy },
    ['O', 'C', 'C', 'O', 'C'],
    a,
  );
  const carbonylL = atoms.find(x => x.id === left[4]!)!;
  addPendant(atoms, bonds, carbonylL, 'O', UP, a * 0.85, { order: 2 });
  // Phenylene
  const ringCx = carbonylL.x + 2 * a;
  const ring = addKekuleBenzene(atoms, bonds, ringCx, cy, a, 0);
  addBond(bonds, carbonylL.id, ring[0]!);
  // Right carbonyl
  const carbonylR = addAtom(atoms, 'C', ringCx + 2 * a, cy);
  addBond(bonds, ring[3]!, carbonylR.id);
  addPendant(atoms, bonds, carbonylR, 'O', UP, a * 0.85, { order: 2 });
  return result(atoms, bonds);
};

/**
 * Nylon-6,6: -[NH-(CH₂)₆-NH-C(=O)-(CH₂)₄-C(=O)]-ₙ
 */
export const buildNylon66: PolymerBuilder = ({ bondLength, cx, cy }) => {
  const a = Math.max(16, bondLength);
  const atoms: Atom[] = [];
  const bonds: Bond[] = [];
  // Compact zig: show NH–(CH2)6–NH–C(=O)–(CH2)4–C(=O) along x with =O up
  const els = ['N', 'C', 'C', 'C', 'C', 'C', 'C', 'N', 'C', 'C', 'C', 'C', 'C', 'C'];
  const ids = addChainAlongX(atoms, bonds, { x: cx - 6.5 * a, y: cy }, els, a);
  // Carbonyls at indices 8 and 13
  const cA = atoms.find(x => x.id === ids[8]!)!;
  const cB = atoms.find(x => x.id === ids[13]!)!;
  addPendant(atoms, bonds, cA, 'O', UP, a * 0.85, { order: 2 });
  addPendant(atoms, bonds, cB, 'O', UP, a * 0.85, { order: 2 });
  return result(atoms, bonds);
};

/** PLA: -[O-CH(CH₃)-C(=O)]-ₙ */
export const buildPla: PolymerBuilder = ({ bondLength, cx, cy }) => {
  const a = Math.max(16, bondLength);
  const atoms: Atom[] = [];
  const bonds: Bond[] = [];
  const ids = addChainAlongX(atoms, bonds, { x: cx - a, y: cy }, ['O', 'C', 'C'], a);
  const ch = atoms.find(x => x.id === ids[1]!)!;
  const co = atoms.find(x => x.id === ids[2]!)!;
  addPendant(atoms, bonds, ch, 'C', DOWN, a);
  addPendant(atoms, bonds, co, 'O', UP, a * 0.85, { order: 2 });
  return result(atoms, bonds);
};

/** PDMS: -[Si(CH₃)₂-O]-ₙ */
export const buildPdms: PolymerBuilder = ({ bondLength, cx, cy }) => {
  const a = Math.max(16, bondLength);
  const atoms: Atom[] = [];
  const bonds: Bond[] = [];
  const ids = addChainAlongX(atoms, bonds, { x: cx - a / 2, y: cy }, ['Si', 'O'], a);
  const si = atoms.find(x => x.id === ids[0]!)!;
  addPendant(atoms, bonds, si, 'C', UP, a);
  addPendant(atoms, bonds, si, 'C', DOWN, a);
  return result(atoms, bonds);
};

/** P3HT: poly(3-hexylthiophene) — one 3-hexylthiophene SRU (links at 2,5). */
export const buildP3ht: PolymerBuilder = ({ bondLength, cx, cy }) => {
  const a = Math.max(16, bondLength);
  const atoms: Atom[] = [];
  const bonds: Bond[] = [];
  const ring = addThiophene(atoms, bonds, cx, cy, a);
  const c3 = atoms.find(x => x.id === ring[2]!)!;
  let prev = c3;
  for (let i = 0; i < 6; i++) {
    const next = addAtom(atoms, 'C', c3.x, c3.y + a * (i + 1));
    addBond(bonds, prev.id, next.id);
    prev = next;
  }
  return result(atoms, bonds);
};

/**
 * PEDOT: poly(3,4-ethylenedioxythiophene).
 * Thiophene with ethylenedioxy bridge on C3–C4.
 */
export const buildPedot: PolymerBuilder = ({ bondLength, cx, cy }) => {
  const a = Math.max(16, bondLength);
  const atoms: Atom[] = [];
  const bonds: Bond[] = [];
  const ring = addThiophene(atoms, bonds, cx, cy, a);
  const c3 = atoms.find(x => x.id === ring[2]!)!;
  const c4 = atoms.find(x => x.id === ring[3]!)!;
  const o3 = addPendant(atoms, bonds, c3, 'O', DOWN + 0.35, a * 0.75);
  const o4 = addPendant(atoms, bonds, c4, 'O', DOWN - 0.35, a * 0.75);
  const e1 = addAtom(atoms, 'C', o3.x, o3.y + a * 0.85);
  const e2 = addAtom(atoms, 'C', o4.x, o4.y + a * 0.85);
  addBond(bonds, o3.id, e1.id);
  addBond(bonds, o4.id, e2.id);
  addBond(bonds, e1.id, e2.id);
  return result(atoms, bonds);
};

/** PANI (emeraldine base SRU): -[C₆H₄-NH]-ₙ */
export const buildPani: PolymerBuilder = ({ bondLength, cx, cy }) => {
  const a = Math.max(16, bondLength);
  const atoms: Atom[] = [];
  const bonds: Bond[] = [];
  const ring = addKekuleBenzene(atoms, bonds, cx - a, cy, a, 0);
  const nh = addAtom(atoms, 'N', cx - a + 2 * a, cy);
  addBond(bonds, ring[0]!, nh.id);
  return result(atoms, bonds);
};

/** PNIPAM: -[CH₂-CH(C(=O)NH-iPr)]-ₙ */
export const buildPnipam: PolymerBuilder = ({ bondLength, cx, cy }) => {
  const a = Math.max(16, bondLength);
  const atoms: Atom[] = [];
  const bonds: Bond[] = [];
  const ids = addChainAlongX(atoms, bonds, { x: cx - a / 2, y: cy }, ['C', 'C'], a);
  const c2 = atoms.find(x => x.id === ids[1]!)!;
  const carbonyl = addPendant(atoms, bonds, c2, 'C', DOWN, a);
  addPendant(atoms, bonds, carbonyl, 'O', DOWN + 0.55, a * 0.85, { order: 2 });
  const nh = addPendant(atoms, bonds, carbonyl, 'N', DOWN - 0.55, a * 0.85);
  const iPr = addPendant(atoms, bonds, nh, 'C', DOWN, a * 0.9);
  addPendant(atoms, bonds, iPr, 'C', DOWN + 0.7, a * 0.85);
  addPendant(atoms, bonds, iPr, 'C', DOWN - 0.7, a * 0.85);
  return result(atoms, bonds);
};

/** PVDF: -[CH₂-CF₂]-ₙ */
export const buildPvdf: PolymerBuilder = ({ bondLength, cx, cy }) => {
  const a = Math.max(16, bondLength);
  const atoms: Atom[] = [];
  const bonds: Bond[] = [];
  const ids = addChainAlongX(atoms, bonds, { x: cx - a / 2, y: cy }, ['C', 'C'], a);
  const cf2 = atoms.find(x => x.id === ids[1]!)!;
  addPendant(atoms, bonds, cf2, 'F', UP, a * 0.9);
  addPendant(atoms, bonds, cf2, 'F', DOWN, a * 0.9);
  return result(atoms, bonds);
};

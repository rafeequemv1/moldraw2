/**
 * SMILES parser → `Molecule` (graph only; coordinates are left at 0,0 and are
 * assigned later by `generate2D`).
 *
 * Supports: organic subset (B,C,N,O,P,S,F,Cl,Br,I) + aromatic lowercase,
 * bracket atoms `[...]` with isotope / charge / explicit H count / tetrahedral
 * chirality (`@`/`@@`), bond symbols `- = # : / \`, branches `( )`, ring-closure
 * digits and `%nn`, and disconnection `.`.
 *
 * Stereochemistry is captured into layout-independent model fields consumed by
 * the 3D engine:
 *   - `atom.chiralParity`  — from `@`/`@@`, encoded against id-sorted neighbors.
 *   - `bond.cisTransRef`   — from `/`,`\` directional bonds around a double bond.
 *
 * Aromatic atoms/bonds are flagged from lowercase SMILES (`c1ccccc1`) and left
 * aromatic for depiction. Kekulé SMILES (`C1=CC=CC=C1`) stay explicit doubles.
 * Callers that need Kekulé form (valence, 3D, canonical SMILES) call `kekulize`.
 */
import type { Atom, Bond, Molecule } from '@moldraw/domain';
import { makeIdFactory } from '../ids';
import { ORGANIC_SUBSET, normalizeElementSymbol } from '../data/periodicTable';

interface ParsedAtom extends Atom {
  aromatic: boolean;
  explicitH: number;
}

const AROMATIC_ORGANIC = new Set(['b', 'c', 'n', 'o', 'p', 's']);

const bondOrderForSymbol = (s: string): { order: number; aromatic: boolean } => {
  switch (s) {
    case '=':
      return { order: 2, aromatic: false };
    case '#':
      return { order: 3, aromatic: false };
    case ':':
      return { order: 1, aromatic: true };
    default:
      return { order: 1, aromatic: false };
  }
};

/** Ideal tetrahedron; index 0 = viewer apex, 1..3 arranged CCW seen from apex. */
const TETRA: [number, number, number][] = [
  [0, 0, 1],
  [0.942809, 0, -0.333333],
  [-0.471405, 0.816497, -0.333333],
  [-0.471405, -0.816497, -0.333333],
];
const triple = (
  a: [number, number, number],
  b: [number, number, number],
  c: [number, number, number],
): number =>
  a[0] * (b[1] * c[2] - b[2] * c[1]) +
  a[1] * (b[2] * c[0] - b[0] * c[2]) +
  a[2] * (b[0] * c[1] - b[1] * c[0]);

type OrderEntry = string | { ring: number };

export const parseSmilesToMolecule = (smiles: string): Molecule => {
  const src = (smiles || '').trim();
  const ids = makeIdFactory();
  const atoms: ParsedAtom[] = [];
  const bonds: Bond[] = [];

  let atomCount = 0;
  let bondCount = 0;

  // Parser state
  let i = 0;
  const branchStack: number[] = []; // atom indices to return to on ')'
  let prevAtomIdx = -1;
  let pendingBond: string | null = null; // bond symbol awaiting next atom
  const ringClosures = new Map<number, { atomIdx: number; bondSymbol: string | null }>();

  // Stereo bookkeeping.
  const chiralTag = new Map<string, '@' | '@@'>(); // atom id → tag
  const neighborOrder = new Map<string, OrderEntry[]>(); // atom id → textual neighbor order
  const precededAtoms = new Set<string>(); // atoms bonded to a preceding atom
  const dirBonds: { fromId: string; toId: string; dir: '/' | '\\' }[] = [];

  const pushOrder = (atomId: string, entry: OrderEntry): void => {
    const arr = neighborOrder.get(atomId);
    if (arr) arr.push(entry);
  };

  const addAtom = (element: string, aromatic: boolean, charge = 0, isotope?: number, explicitH = 0): number => {
    atomCount += 1;
    const atom: ParsedAtom = {
      id: ids.atom(atomCount),
      element: normalizeElementSymbol(element),
      x: 0,
      y: 0,
      charge,
      aromatic,
      explicitH,
      ...(isotope ? { isotope } : {}),
    };
    atoms.push(atom);
    neighborOrder.set(atom.id, []);
    return atoms.length - 1;
  };

  const connect = (fromIdx: number, toIdx: number, bondSymbol: string | null): void => {
    if (fromIdx < 0 || toIdx < 0) return;
    let order = 1;
    let aromatic = false;
    if (bondSymbol && bondSymbol !== '/' && bondSymbol !== '\\') {
      const r = bondOrderForSymbol(bondSymbol);
      order = r.order;
      aromatic = r.aromatic;
    } else if (!bondSymbol && atoms[fromIdx].aromatic && atoms[toIdx].aromatic) {
      aromatic = true;
    }
    bondCount += 1;
    bonds.push({
      id: ids.bond(bondCount),
      fromAtomId: atoms[fromIdx].id,
      toAtomId: atoms[toIdx].id,
      order,
      ...(aromatic ? { aromatic: true } : {}),
    });
    if (bondSymbol === '/' || bondSymbol === '\\') {
      dirBonds.push({ fromId: atoms[fromIdx].id, toId: atoms[toIdx].id, dir: bondSymbol });
    }
  };

  const finishAtom = (idx: number): void => {
    if (prevAtomIdx >= 0) {
      connect(prevAtomIdx, idx, pendingBond);
      pushOrder(atoms[prevAtomIdx].id, atoms[idx].id);
      pushOrder(atoms[idx].id, atoms[prevAtomIdx].id);
      precededAtoms.add(atoms[idx].id);
    }
    pendingBond = null;
    prevAtomIdx = idx;
  };

  const parseBracketAtom = (): number => {
    i++; // skip [
    let isotope = 0;
    while (i < src.length && /[0-9]/.test(src[i])) {
      isotope = isotope * 10 + Number(src[i]);
      i++;
    }
    let element = '';
    let aromatic = false;
    if (i < src.length && src[i] === '*') {
      element = 'C';
      i++;
    } else if (i < src.length && /[a-z]/.test(src[i])) {
      const two = src.substr(i, 2);
      if (two === 'se' || two === 'as') {
        element = two;
        i += 2;
      } else {
        element = src[i];
        i++;
      }
      aromatic = true;
    } else if (i < src.length && /[A-Z]/.test(src[i])) {
      element = src[i];
      i++;
      if (i < src.length && /[a-z]/.test(src[i])) {
        const candidate = element + src[i];
        if (normalizeElementSymbol(candidate) === candidate) {
          element = candidate;
          i++;
        }
      }
    }
    // Tetrahedral chirality (@ = anticlockwise, @@ = clockwise).
    let atCount = 0;
    while (i < src.length && src[i] === '@') {
      atCount++;
      i++;
    }
    if (i < src.length && (src.substr(i, 2) === 'TH' || src.substr(i, 2) === 'AL')) i += 2;
    // explicit H count
    let explicitH = 0;
    if (i < src.length && src[i] === 'H') {
      i++;
      let n = 0;
      let hasDigit = false;
      while (i < src.length && /[0-9]/.test(src[i])) {
        n = n * 10 + Number(src[i]);
        i++;
        hasDigit = true;
      }
      explicitH = hasDigit ? n : 1;
    }
    let charge = 0;
    while (i < src.length && (src[i] === '+' || src[i] === '-')) {
      const sign = src[i] === '+' ? 1 : -1;
      i++;
      let n = 0;
      let hasDigit = false;
      while (i < src.length && /[0-9]/.test(src[i])) {
        n = n * 10 + Number(src[i]);
        i++;
        hasDigit = true;
      }
      charge += sign * (hasDigit ? n : 1);
    }
    if (i < src.length && src[i] === ':') {
      i++;
      while (i < src.length && /[0-9]/.test(src[i])) i++;
    }
    if (i < src.length && src[i] === ']') i++;

    const idx = addAtom(element || 'C', aromatic, charge, isotope || undefined, explicitH);
    if (atCount >= 1) chiralTag.set(atoms[idx].id, atCount === 1 ? '@' : '@@');
    return idx;
  };

  const handleRingClosure = (digit: number): void => {
    const existing = ringClosures.get(digit);
    if (existing) {
      const sym = pendingBond ?? existing.bondSymbol;
      connect(existing.atomIdx, prevAtomIdx, sym);
      // Fill the reserved slot on the opening atom; append on the closing atom.
      const openId = atoms[existing.atomIdx].id;
      const closeId = atoms[prevAtomIdx].id;
      const slots = neighborOrder.get(openId);
      if (slots) {
        const s = slots.findIndex(e => typeof e !== 'string' && e.ring === digit);
        if (s >= 0) slots[s] = closeId;
        else slots.push(closeId);
      }
      pushOrder(closeId, openId);
      ringClosures.delete(digit);
    } else {
      ringClosures.set(digit, { atomIdx: prevAtomIdx, bondSymbol: pendingBond });
      pushOrder(atoms[prevAtomIdx].id, { ring: digit });
    }
    pendingBond = null;
  };

  while (i < src.length) {
    const c = src[i];
    if (c === ' ') break;
    if (c === '(') {
      branchStack.push(prevAtomIdx);
      i++;
      continue;
    }
    if (c === ')') {
      prevAtomIdx = branchStack.pop() ?? prevAtomIdx;
      i++;
      continue;
    }
    if (c === '.') {
      prevAtomIdx = -1;
      pendingBond = null;
      i++;
      continue;
    }
    if (c === '-' || c === '=' || c === '#' || c === ':' || c === '/' || c === '\\') {
      pendingBond = c;
      i++;
      continue;
    }
    if (c === '%') {
      const num = parseInt(src.substr(i + 1, 2), 10);
      i += 3;
      if (Number.isFinite(num)) handleRingClosure(num);
      continue;
    }
    if (/[0-9]/.test(c)) {
      handleRingClosure(Number(c));
      i++;
      continue;
    }
    if (c === '[') {
      const idx = parseBracketAtom();
      finishAtom(idx);
      continue;
    }
    if (/[A-Z]/.test(c)) {
      let element = c;
      const two = src.substr(i, 2);
      if ((two === 'Cl' || two === 'Br') && ORGANIC_SUBSET.has(two)) {
        element = two;
        i += 2;
      } else {
        i++;
      }
      const idx = addAtom(element, false);
      finishAtom(idx);
      continue;
    }
    if (AROMATIC_ORGANIC.has(c)) {
      i++;
      const idx = addAtom(c.toUpperCase(), true);
      finishAtom(idx);
      continue;
    }
    i++; // unknown — skip
  }

  // Materialize explicit H atoms (from bracket H counts) as real H nodes.
  const outAtoms: Atom[] = atoms.map(pa => {
    const atom = { ...pa } as Partial<ParsedAtom>;
    delete atom.aromatic;
    delete atom.explicitH;
    return atom as Atom;
  });
  const outById = new Map(outAtoms.map(a => [a.id, a]));
  const chiralHId = new Map<string, string>(); // center id → materialized H id
  for (const pa of atoms) {
    for (let h = 0; h < pa.explicitH; h++) {
      atomCount += 1;
      const hId = ids.atom(atomCount);
      outAtoms.push({ id: hId, element: 'H', x: 0, y: 0, charge: 0 });
      outById.set(hId, outAtoms[outAtoms.length - 1]);
      bondCount += 1;
      bonds.push({ id: ids.bond(bondCount), fromAtomId: pa.id, toAtomId: hId, order: 1 });
      if (h === 0 && !chiralHId.has(pa.id)) chiralHId.set(pa.id, hId);
    }
  }

  // Resolve tetrahedral chirality into id-sorted parity signs.
  for (const [centerId, tag] of chiralTag) {
    const raw = neighborOrder.get(centerId) ?? [];
    const order: string[] = raw.filter((e): e is string => typeof e === 'string');
    // Insert the bracket H at its textual slot (after the preceding atom).
    const hId = chiralHId.get(centerId);
    if (hId) order.splice(precededAtoms.has(centerId) ? 1 : 0, 0, hId);
    if (order.length !== 4) continue; // need a full tetrahedron

    // Assign ideal tetrahedron vectors realizing the drawn handedness.
    const vec = new Map<string, [number, number, number]>();
    vec.set(order[0], TETRA[0]);
    if (tag === '@') {
      vec.set(order[1], TETRA[1]);
      vec.set(order[2], TETRA[2]);
      vec.set(order[3], TETRA[3]);
    } else {
      vec.set(order[1], TETRA[1]);
      vec.set(order[2], TETRA[3]);
      vec.set(order[3], TETRA[2]);
    }
    const sorted = [...order].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    const s = Math.sign(triple(vec.get(sorted[0])!, vec.get(sorted[1])!, vec.get(sorted[2])!));
    const center = outById.get(centerId);
    if (center && s !== 0) center.chiralParity = s;
  }

  // Resolve /,\ directional bonds into double-bond cis/trans references.
  if (dirBonds.length > 0) {
    const dirByAtom = new Map<string, { other: string; dir: '/' | '\\'; from: string }[]>();
    for (const d of dirBonds) {
      if (!dirByAtom.has(d.fromId)) dirByAtom.set(d.fromId, []);
      if (!dirByAtom.has(d.toId)) dirByAtom.set(d.toId, []);
      dirByAtom.get(d.fromId)!.push({ other: d.toId, dir: d.dir, from: d.fromId });
      dirByAtom.get(d.toId)!.push({ other: d.fromId, dir: d.dir, from: d.fromId });
    }
    // sign of (height(sub) - height(anchor)) from the directional bond.
    const subSign = (anchor: string, rec: { other: string; dir: '/' | '\\'; from: string }): number =>
      (rec.dir === '/' ? 1 : -1) * (anchor === rec.from ? 1 : -1);

    for (const b of bonds) {
      if (b.order !== 2 || b.aromatic) continue;
      const aRecs = (dirByAtom.get(b.fromAtomId) ?? []).filter(r => r.other !== b.toAtomId);
      const bRecs = (dirByAtom.get(b.toAtomId) ?? []).filter(r => r.other !== b.fromAtomId);
      if (aRecs.length === 0 || bRecs.length === 0) continue;
      const ra = aRecs[0];
      const rb = bRecs[0];
      const signA = subSign(b.fromAtomId, ra);
      const signB = subSign(b.toAtomId, rb);
      b.cisTransRef = { ref1: ra.other, ref2: rb.other, sameSide: signA === signB };
    }
  }

  return { atoms: outAtoms, bonds };
};

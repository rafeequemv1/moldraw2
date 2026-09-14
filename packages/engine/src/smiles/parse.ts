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
 * Aromatic atoms/bonds are flagged; the engine kekulizes afterwards so the rest
 * of the pipeline works on explicit Kekulé structures.
 */
import type { Atom, Bond, Molecule } from '@moldraw/domain';
import { makeIdFactory } from '../ids';
import { isHydrogenElement, parityFromSmilesOrder } from '../chem/stereoDepiction';
import { ELEMENTS, ORGANIC_SUBSET, normalizeElementSymbol } from '../data/periodicTable';

/** One SMILES syntax problem, with a 0-based character position into the input. */
export interface SmilesDiagnostic {
  position: number;
  message: string;
  /** Short stable code for programmatic handling. */
  code:
    | 'unexpected_char'
    | 'unknown_element'
    | 'unclosed_bracket'
    | 'unmatched_paren'
    | 'unclosed_paren'
    | 'unclosed_ring'
    | 'ring_no_atom'
    | 'ring_self'
    | 'dangling_bond'
    | 'empty';
}

export class SmilesSyntaxError extends Error {
  readonly diagnostics: SmilesDiagnostic[];
  readonly smiles: string;
  constructor(smiles: string, diagnostics: SmilesDiagnostic[]) {
    super(formatSmilesDiagnostics(smiles, diagnostics));
    this.name = 'SmilesSyntaxError';
    this.smiles = smiles;
    this.diagnostics = diagnostics;
  }
}

/** e.g. `Invalid SMILES "C1CC(C" — position 4: unclosed branch "("; position 1: ring bond 1 is never closed`. */
export function formatSmilesDiagnostics(smiles: string, diagnostics: SmilesDiagnostic[]): string {
  const parts = diagnostics
    .slice(0, 4)
    .map(d => `position ${d.position}: ${d.message}`)
    .join('; ');
  const more = diagnostics.length > 4 ? `; … (+${diagnostics.length - 4} more)` : '';
  return `Invalid SMILES "${smiles}" — ${parts}${more}`;
}

export interface ParseSmilesOptions {
  /** Throw `SmilesSyntaxError` when any diagnostic is collected instead of returning a best-effort graph. */
  strict?: boolean;
}

/** Best-effort parse plus every syntax diagnostic found (never throws). */
export const parseSmilesWithDiagnostics = (
  smiles: string,
): { molecule: Molecule; diagnostics: SmilesDiagnostic[] } => {
  const diagnostics: SmilesDiagnostic[] = [];
  const molecule = parseSmilesInternal(smiles, diagnostics);
  return { molecule, diagnostics };
};

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

type OrderEntry = string | { ring: number };

export const parseSmilesToMolecule = (smiles: string, opts: ParseSmilesOptions = {}): Molecule => {
  if (!opts.strict) return parseSmilesInternal(smiles, null);
  const { molecule, diagnostics } = parseSmilesWithDiagnostics(smiles);
  if (diagnostics.length) throw new SmilesSyntaxError((smiles || '').trim(), diagnostics);
  return molecule;
};

const parseSmilesInternal = (smiles: string, diagnostics: SmilesDiagnostic[] | null): Molecule => {
  const src = (smiles || '').trim();
  const report = (code: SmilesDiagnostic['code'], position: number, message: string): void => {
    diagnostics?.push({ code, position, message });
  };
  if (!src) report('empty', 0, 'SMILES string is empty');
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
  const ringClosures = new Map<
    number,
    { atomIdx: number; bondSymbol: string | null; position: number }
  >();

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
    const bracketStart = i;
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
      if (!ELEMENTS[element] && element !== 'R') {
        report('unknown_element', bracketStart + 1, `unknown element symbol "${element}" in bracket atom`);
      }
    } else {
      report('unknown_element', i, `expected an element symbol after "[" (got "${src[i] ?? 'end of input'}")`);
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
    if (i < src.length && src[i] === ']') {
      i++;
    } else {
      report(
        'unclosed_bracket',
        bracketStart,
        i < src.length
          ? `unexpected "${src[i]}" inside bracket atom (expected "]")`
          : 'bracket atom "[" is never closed',
      );
      // Skip to the closing bracket (or end) so later diagnostics stay meaningful.
      while (i < src.length && src[i] !== ']') i++;
      if (i < src.length) i++;
    }

    const idx = addAtom(element || 'C', aromatic, charge, isotope || undefined, explicitH);
    if (atCount >= 1) chiralTag.set(atoms[idx].id, atCount === 1 ? '@' : '@@');
    return idx;
  };

  const handleRingClosure = (digit: number, position: number): void => {
    if (prevAtomIdx < 0) {
      report('ring_no_atom', position, `ring-closure digit ${digit} appears before any atom`);
      pendingBond = null;
      return;
    }
    const existing = ringClosures.get(digit);
    if (existing) {
      if (existing.atomIdx === prevAtomIdx) {
        report('ring_self', position, `ring-closure ${digit} opens and closes on the same atom`);
        ringClosures.delete(digit);
        pendingBond = null;
        return;
      }
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
      ringClosures.set(digit, { atomIdx: prevAtomIdx, bondSymbol: pendingBond, position });
      pushOrder(atoms[prevAtomIdx].id, { ring: digit });
    }
    pendingBond = null;
  };

  const branchOpenPositions: number[] = [];
  let pendingBondPos = -1;

  while (i < src.length) {
    const c = src[i];
    if (c === ' ' || c === '\t') break; // SMILES title / trailing fields
    if (c === '(') {
      if (prevAtomIdx < 0) report('unmatched_paren', i, 'branch "(" before any atom');
      branchStack.push(prevAtomIdx);
      branchOpenPositions.push(i);
      i++;
      continue;
    }
    if (c === ')') {
      if (branchStack.length === 0) {
        report('unmatched_paren', i, 'unmatched ")" with no open branch');
        i++;
        continue;
      }
      if (pendingBond) report('dangling_bond', pendingBondPos, `bond symbol "${pendingBond}" is not followed by an atom`);
      pendingBond = null;
      prevAtomIdx = branchStack.pop() ?? prevAtomIdx;
      branchOpenPositions.pop();
      i++;
      continue;
    }
    if (c === '.') {
      if (pendingBond) report('dangling_bond', pendingBondPos, `bond symbol "${pendingBond}" is not followed by an atom`);
      prevAtomIdx = -1;
      pendingBond = null;
      i++;
      continue;
    }
    if (c === '-' || c === '=' || c === '#' || c === ':' || c === '/' || c === '\\') {
      if (prevAtomIdx < 0) report('dangling_bond', i, `bond symbol "${c}" before any atom`);
      else if (pendingBond) report('dangling_bond', i, `two bond symbols in a row ("${pendingBond}${c}")`);
      pendingBond = c;
      pendingBondPos = i;
      i++;
      continue;
    }
    if (c === '%') {
      const num = parseInt(src.substr(i + 1, 2), 10);
      if (Number.isFinite(num) && /^\d\d$/.test(src.substr(i + 1, 2))) {
        handleRingClosure(num, i);
      } else {
        report('unexpected_char', i, '"%" must be followed by a two-digit ring number');
      }
      i += 3;
      continue;
    }
    if (/[0-9]/.test(c)) {
      handleRingClosure(Number(c), i);
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
      if (!ORGANIC_SUBSET.has(element)) {
        report(
          'unknown_element',
          i - element.length,
          ORGANIC_SUBSET.has(normalizeElementSymbol(two)) || ELEMENTS[normalizeElementSymbol(two)]
            ? `"${element}" is not an organic-subset atom; write it in brackets, e.g. [${normalizeElementSymbol(two)}]`
            : `"${element}" is not an organic-subset atom (B, C, N, O, P, S, F, Cl, Br, I); other elements need brackets, e.g. [Na]`,
        );
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
    if (c === '*') {
      i++;
      const idx = addAtom('C', false);
      finishAtom(idx);
      continue;
    }
    report('unexpected_char', i, `unexpected character "${c}"`);
    i++; // unknown — skip
  }

  if (pendingBond) report('dangling_bond', pendingBondPos, `bond symbol "${pendingBond}" at end of input`);
  for (const pos of branchOpenPositions) report('unclosed_paren', pos, 'branch "(" is never closed');
  for (const [digit, open] of ringClosures) {
    report('unclosed_ring', open.position, `ring bond ${digit} is opened but never closed`);
  }
  if (src && atoms.length === 0) report('empty', 0, 'no atoms found');

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
    // Three neighbours + implicit lone pair (e.g. sulfoxide `[S@](=O)(C)C`): the
    // lone pair takes the implicit-H slot.
    if (order.length === 3) order.splice(precededAtoms.has(centerId) ? 1 : 0, 0, `${centerId}:lp`);
    if (order.length !== 4) continue; // need a full tetrahedron

    // Parity is defined over the three lowest-id heavy neighbours (H-independent).
    const heavy = order
      .filter(id => {
        const a = outById.get(id);
        return a !== undefined && !isHydrogenElement(a.element);
      })
      .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
      .slice(0, 3);
    if (heavy.length < 3) continue;
    const s = parityFromSmilesOrder(order, tag, heavy);
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

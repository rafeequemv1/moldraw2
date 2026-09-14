/**
 * Substructure search — SMARTS-lite.
 *
 * Supported query syntax (a practical subset of Daylight SMARTS):
 *  - atoms: organic subset `B C N O P S F Cl Br I`, aromatic `b c n o p s`,
 *    `*` any, `A` aliphatic, `a` aromatic;
 *  - bracket atoms `[…]` with primitives `#n` (atomic number), element symbol
 *    (lower-case = aromatic), `a` / `A` / `*`, `R` / `Rn` (ring membership,
 *    `R0` = acyclic), `r` / `rn` (in a ring / ring of size n), `Hn` (total H),
 *    `hn` (implicit H), `Dn` (heavy-atom degree), `Xn` (total connections),
 *    `vn` (valence), `+` `-` `+n` `-n` `++` (charge), `!` not, `&` and (high),
 *    `,` or, `;` and (low); `@` / `@@` and `:n` maps are accepted and ignored;
 *  - bonds: `-` single (non-aromatic), `=` double, `#` triple, `:` aromatic,
 *    `~` any, `@` ring bond, `!` not, `/` `\` treated as single; the implicit
 *    bond means "single or aromatic";
 *  - branches `( … )`, ring closures `1`–`9` and `%nn`.
 * Not supported: disconnected queries (`.`), recursive SMARTS `$( … )`,
 * component-level grouping, stereo constraints.
 *
 * Aromaticity is perceived on the target molecule (Hückel over SSSR) so that
 * Kekulé-drawn benzene matches `c1ccccc1` and `[a]`.
 */
import type { Molecule } from '@moldraw/domain';
import { ELEMENTS, atomicNumber, normalizeElementSymbol } from '../data/periodicTable';
import { buildGraph, explicitBondOrderSum, type MoleculeGraph } from '../graph';
import { kekulize, perceiveAromaticity } from './aromaticity';
import { perceiveRings } from './rings';
import { implicitHForAtom } from './valence';

// ─── target-side atom / bond facts ─────────────────────────────────────────

interface TargetAtom {
  id: string;
  element: string;
  atomicNumber: number;
  aromatic: boolean;
  charge: number;
  /** Heavy + explicit-H neighbours (graph degree). */
  degree: number;
  implicitH: number;
  /** Implicit + explicit H atoms bonded. */
  totalH: number;
  ringCount: number;
  ringSizes: number[];
  valence: number;
}

interface TargetBond {
  id: string;
  order: number;
  aromatic: boolean;
  inRing: boolean;
}

interface Target {
  atoms: Map<string, TargetAtom>;
  bonds: Map<string, TargetBond>;
  g: MoleculeGraph;
  order: string[];
}

const isH = (el: string): boolean => el === 'H' || el === 'D' || el === 'T';

function buildTarget(molIn: Molecule): Target {
  // Kekulé first (SMILES-derived documents may still carry aromatic flags with
  // order 1), then perceive aromaticity so both bond orders and aromatic flags
  // are consistent for H counting and `a` / `:` tests.
  const kekRaw = molIn.bonds.some(b => b.aromatic) ? kekulize(molIn) : molIn;
  // `explicitBondOrderSum` treats aromatic-flagged bonds as order 1, so keep a
  // flag-free Kekulé copy for valence / implicit-H arithmetic.
  const kek: Molecule = { ...kekRaw, bonds: kekRaw.bonds.map(b => (b.aromatic ? { ...b, aromatic: false } : b)) };
  const mol = perceiveAromaticity(kek);
  const g = buildGraph(kek);
  const rings = perceiveRings(mol);
  const ringCount = new Map<string, number>();
  const ringSizes = new Map<string, number[]>();
  const ringBonds = new Set<string>();
  for (const r of rings) {
    for (const aid of r.atomIds) {
      ringCount.set(aid, (ringCount.get(aid) ?? 0) + 1);
      ringSizes.set(aid, [...(ringSizes.get(aid) ?? []), r.size]);
    }
    for (const bid of r.bondIds) ringBonds.add(bid);
  }
  const aromaticAtoms = new Set<string>();
  for (const b of mol.bonds) {
    if (b.aromatic) {
      aromaticAtoms.add(b.fromAtomId);
      aromaticAtoms.add(b.toAtomId);
    }
  }
  const atoms = new Map<string, TargetAtom>();
  for (const a of mol.atoms) {
    const node = g.nodes.get(a.id);
    const explicitH = (node?.neighbors ?? []).filter(n => isH(g.atomById.get(n)?.element ?? '')).length;
    const bondSum = explicitBondOrderSum(g, a.id);
    const implicitH = implicitHForAtom(a.element, a.charge ?? 0, bondSum);
    atoms.set(a.id, {
      id: a.id,
      element: a.element,
      atomicNumber: atomicNumber(a.element),
      aromatic: aromaticAtoms.has(a.id),
      charge: a.charge ?? 0,
      degree: node?.neighbors.length ?? 0,
      implicitH,
      totalH: implicitH + explicitH,
      ringCount: ringCount.get(a.id) ?? 0,
      ringSizes: ringSizes.get(a.id) ?? [],
      valence: bondSum + implicitH,
    });
  }
  const bonds = new Map<string, TargetBond>();
  for (const b of mol.bonds) {
    bonds.set(b.id, { id: b.id, order: b.order, aromatic: !!b.aromatic, inRing: ringBonds.has(b.id) });
  }
  return { atoms, bonds, g, order: mol.atoms.map(a => a.id) };
}

// ─── query model ───────────────────────────────────────────────────────────

type AtomTest = (a: TargetAtom) => boolean;
type BondTest = (b: TargetBond) => boolean;

interface QueryAtom {
  index: number;
  test: AtomTest;
  source: string;
}

interface QueryBond {
  a: number;
  b: number;
  test: BondTest;
}

export interface SubstructureQuery {
  atoms: QueryAtom[];
  bonds: QueryBond[];
  smarts: string;
}

export class SmartsSyntaxError extends Error {
  readonly position: number;
  constructor(message: string, position: number) {
    super(`${message} (at position ${position})`);
    this.name = 'SmartsSyntaxError';
    this.position = position;
  }
}

const AROMATIC_ORGANIC: Record<string, string> = { b: 'B', c: 'C', n: 'N', o: 'O', p: 'P', s: 'S' };

const any: AtomTest = () => true;
const elementTest = (symbol: string, aromatic: boolean | null): AtomTest => {
  const num = atomicNumber(symbol);
  return a => a.atomicNumber === num && (aromatic === null || a.aromatic === aromatic);
};

const defaultBond: BondTest = b => (b.order === 1 && !b.aromatic) || b.aromatic;
const BOND_TESTS: Record<string, BondTest> = {
  '-': b => b.order === 1 && !b.aromatic,
  '=': b => b.order === 2 && !b.aromatic,
  '#': b => b.order === 3,
  ':': b => b.aromatic,
  '~': () => true,
  '@': b => b.inRing,
  '/': b => b.order === 1 && !b.aromatic,
  '\\': b => b.order === 1 && !b.aromatic,
};

class Parser {
  private pos = 0;
  private readonly s: string;
  readonly atoms: QueryAtom[] = [];
  readonly bonds: QueryBond[] = [];

  constructor(s: string) {
    this.s = s;
  }

  private peek(off = 0): string {
    return this.s[this.pos + off] ?? '';
  }

  private fail(message: string): never {
    throw new SmartsSyntaxError(message, this.pos);
  }

  parse(): SubstructureQuery {
    const trimmed = this.s.trim();
    if (!trimmed) this.fail('Empty SMARTS');
    this.parseChain();
    if (this.pos < this.s.length) this.fail(`Unexpected "${this.peek()}"`);
    if (this.atoms.length === 0) this.fail('No atoms in query');
    return { atoms: this.atoms, bonds: this.bonds, smarts: this.s };
  }

  private parseChain(): void {
    const ringOpen = new Map<string, { atom: number; bond: BondTest | null }>();
    const stack: number[] = [];
    let prev: number | null = null;
    let pendingBond: BondTest | null = null;
    let pendingBondNegated = false;

    const takeBond = (): BondTest => {
      let t = pendingBond ?? defaultBond;
      if (pendingBondNegated) {
        const inner = t;
        t = b => !inner(b);
      }
      pendingBond = null;
      pendingBondNegated = false;
      return t;
    };

    while (this.pos < this.s.length) {
      const ch = this.peek();
      if (ch === ' ') {
        this.pos++;
        continue;
      }
      if (ch === '(') {
        if (prev === null) this.fail('Branch before any atom');
        stack.push(prev);
        this.pos++;
        continue;
      }
      if (ch === ')') {
        if (!stack.length) this.fail('Unmatched ")"');
        prev = stack.pop()!;
        this.pos++;
        continue;
      }
      if (ch === '.') this.fail('Disconnected queries (".") are not supported');
      if (ch === '!' && this.isBondChar(this.peek(1))) {
        pendingBondNegated = true;
        this.pos++;
        continue;
      }
      if (this.isBondChar(ch)) {
        pendingBond = BOND_TESTS[ch];
        this.pos++;
        continue;
      }
      if (/[0-9%]/.test(ch)) {
        if (prev === null) this.fail('Ring closure before any atom');
        let label: string;
        if (ch === '%') {
          label = this.s.slice(this.pos + 1, this.pos + 3);
          if (!/^\d\d$/.test(label)) this.fail('"%" needs two digits');
          this.pos += 3;
        } else {
          label = ch;
          this.pos++;
        }
        const open = ringOpen.get(label);
        if (open) {
          if (open.atom === prev) this.fail('Ring closure to the same atom');
          const t = pendingBond ?? open.bond ?? null;
          const test = t ? (pendingBondNegated ? (b: TargetBond) => !t(b) : t) : defaultBond;
          pendingBond = null;
          pendingBondNegated = false;
          this.bonds.push({ a: open.atom, b: prev, test });
          ringOpen.delete(label);
        } else {
          ringOpen.set(label, { atom: prev, bond: pendingBond });
          pendingBond = null;
          pendingBondNegated = false;
        }
        continue;
      }
      // atom
      const atom = this.parseAtom();
      if (prev !== null) this.bonds.push({ a: prev, b: atom.index, test: takeBond() });
      else if (pendingBond) this.fail('Bond symbol before the first atom');
      prev = atom.index;
    }
    if (stack.length) this.fail('Unclosed "("');
    if (ringOpen.size) this.fail(`Unclosed ring bond ${[...ringOpen.keys()].join(', ')}`);
  }

  private isBondChar(ch: string): boolean {
    return ch !== '' && Object.prototype.hasOwnProperty.call(BOND_TESTS, ch);
  }

  private addAtom(test: AtomTest, source: string): QueryAtom {
    const q: QueryAtom = { index: this.atoms.length, test, source };
    this.atoms.push(q);
    return q;
  }

  private parseAtom(): QueryAtom {
    const start = this.pos;
    const ch = this.peek();
    if (ch === '[') {
      const end = this.s.indexOf(']', this.pos);
      if (end < 0) this.fail('Unclosed "["');
      const body = this.s.slice(this.pos + 1, end);
      this.pos = end + 1;
      return this.addAtom(this.parseBracket(body, start + 1), `[${body}]`);
    }
    if (ch === '*') {
      this.pos++;
      return this.addAtom(any, '*');
    }
    if (ch === 'A') {
      this.pos++;
      return this.addAtom(a => !a.aromatic, 'A');
    }
    if (ch === 'a') {
      this.pos++;
      return this.addAtom(a => a.aromatic, 'a');
    }
    const two = this.s.slice(this.pos, this.pos + 2);
    if (two === 'Cl' || two === 'Br') {
      this.pos += 2;
      return this.addAtom(elementTest(two, false), two);
    }
    if ('BCNOPSFI'.includes(ch)) {
      this.pos++;
      return this.addAtom(elementTest(ch, false), ch);
    }
    if (AROMATIC_ORGANIC[ch]) {
      this.pos++;
      return this.addAtom(elementTest(AROMATIC_ORGANIC[ch], true), ch);
    }
    this.fail(`Unexpected "${ch}"`);
  }

  /** Bracket grammar: low-AND (`;`) of OR (`,`) of high-AND (`&` / implicit) of primitives. */
  private parseBracket(body: string, offset: number): AtomTest {
    let i = 0;
    const fail = (msg: string): never => {
      throw new SmartsSyntaxError(msg, offset + i);
    };
    const readNum = (): number | null => {
      const m = /^\d+/.exec(body.slice(i));
      if (!m) return null;
      i += m[0].length;
      return Number(m[0]);
    };

    const primitive = (): AtomTest => {
      if (body[i] === '!') {
        i++;
        const inner = primitive();
        return a => !inner(a);
      }
      const c = body[i];
      if (c === undefined) fail('Missing atom primitive');
      if (c === '*') {
        i++;
        return any;
      }
      if (c === '#') {
        i++;
        const n = readNum();
        if (n === null) fail('"#" needs an atomic number');
        return a => a.atomicNumber === n;
      }
      if (c === 'a') {
        i++;
        return a => a.aromatic;
      }
      if (c === 'A') {
        i++;
        return a => !a.aromatic;
      }
      if (c === 'R') {
        i++;
        const n = readNum();
        return n === null ? a => a.ringCount > 0 : a => a.ringCount === n;
      }
      if (c === 'r') {
        i++;
        const n = readNum();
        return n === null ? a => a.ringCount > 0 : a => a.ringSizes.includes(n);
      }
      if (c === 'H') {
        // Element H vs total-H count: `[H]` alone is the hydrogen atom; `H2`, `CH3`… is a count.
        const prevIsPrimitive = i > 0 && /[A-Za-z\]\d*]/.test(body[i - 1]);
        i++;
        const n = readNum();
        if (n === null && !prevIsPrimitive) return a => a.element === 'H';
        const count = n ?? 1;
        return a => a.totalH === count;
      }
      if (c === 'h') {
        i++;
        const n = readNum() ?? 1;
        return a => a.implicitH === n;
      }
      if (c === 'D') {
        i++;
        const n = readNum() ?? 1;
        return a => a.degree === n;
      }
      if (c === 'X') {
        i++;
        const n = readNum() ?? 1;
        return a => a.degree + a.implicitH === n;
      }
      if (c === 'v') {
        i++;
        const n = readNum() ?? 1;
        return a => a.valence === n;
      }
      if (c === '+' || c === '-') {
        const sign = c === '+' ? 1 : -1;
        i++;
        let n = readNum();
        if (n === null) {
          n = 1;
          while (body[i] === c) {
            n++;
            i++;
          }
        }
        const charge = sign * n;
        return a => a.charge === charge;
      }
      if (c === '@') {
        i++;
        if (body[i] === '@') i++;
        return any;
      }
      if (c === ':') {
        i++;
        readNum();
        return any;
      }
      if (/[0-9]/.test(c)) {
        // isotope prefix — accepted and ignored
        readNum();
        return primitive();
      }
      if (/[A-Za-z]/.test(c)) {
        const two = body.slice(i, i + 2);
        let sym = '';
        if (/^[A-Z][a-z]$/.test(two) && ELEMENTS[two]) sym = two;
        else if (/^[a-z][a-z]$/.test(two) && ['se', 'as', 'te'].includes(two)) sym = two;
        else if (/^[A-Z][a-z]$/.test(two) && !ELEMENTS[c]) fail(`Unknown element "${two}"`);
        else sym = c;
        i += sym.length;
        const lower = sym === sym.toLowerCase();
        const normalized = normalizeElementSymbol(sym);
        if (!ELEMENTS[normalized]) fail(`Unknown element "${sym}"`);
        return elementTest(normalized, lower ? true : sym.length === 1 && 'BCNOPS'.includes(sym) ? false : null);
      }
      return fail(`Unexpected "${c}" in bracket atom`);
    };

    const highAnd = (): AtomTest => {
      const parts: AtomTest[] = [primitive()];
      while (i < body.length && body[i] !== ',' && body[i] !== ';') {
        if (body[i] === '&') i++;
        parts.push(primitive());
      }
      return parts.length === 1 ? parts[0] : a => parts.every(p => p(a));
    };
    const or = (): AtomTest => {
      const parts: AtomTest[] = [highAnd()];
      while (body[i] === ',') {
        i++;
        parts.push(highAnd());
      }
      return parts.length === 1 ? parts[0] : a => parts.some(p => p(a));
    };
    const lowAnd = (): AtomTest => {
      const parts: AtomTest[] = [or()];
      while (body[i] === ';') {
        i++;
        parts.push(or());
      }
      return parts.length === 1 ? parts[0] : a => parts.every(p => p(a));
    };
    const test = lowAnd();
    if (i < body.length) fail(`Unexpected "${body[i]}" in bracket atom`);
    return test;
  }
}

export const parseSmarts = (smarts: string): SubstructureQuery => new Parser(smarts).parse();

// ─── matching ──────────────────────────────────────────────────────────────

export interface SubstructureMatch {
  /** Target atom id per query atom index. */
  atomIds: string[];
  /** Target bond ids for every query bond (same order as the query). */
  bondIds: string[];
}

export interface FindSubstructureOptions {
  /** Stop after this many matches (default 200). */
  maxMatches?: number;
  /** Collapse matches that cover the same atom set (default true). */
  uniqueAtomSets?: boolean;
}

export const findSubstructure = (
  mol: Molecule,
  query: SubstructureQuery | string,
  opts: FindSubstructureOptions = {},
): SubstructureMatch[] => {
  const q = typeof query === 'string' ? parseSmarts(query) : query;
  const maxMatches = opts.maxMatches ?? 200;
  const unique = opts.uniqueAtomSets !== false;
  const target = buildTarget(mol);

  // Query adjacency
  const qAdj: Array<Array<{ to: number; bond: QueryBond }>> = q.atoms.map(() => []);
  for (const b of q.bonds) {
    qAdj[b.a].push({ to: b.b, bond: b });
    qAdj[b.b].push({ to: b.a, bond: b });
  }

  // Visit order: BFS from atom 0 so each new query atom (after the first) is
  // adjacent to an already-mapped atom → candidates come from neighbours only.
  const order: number[] = [];
  const seen = new Set<number>();
  for (let root = 0; root < q.atoms.length; root++) {
    if (seen.has(root)) continue;
    const queue = [root];
    seen.add(root);
    while (queue.length) {
      const u = queue.shift()!;
      order.push(u);
      for (const { to } of qAdj[u]) {
        if (!seen.has(to)) {
          seen.add(to);
          queue.push(to);
        }
      }
    }
  }

  const mapping = new Array<string | null>(q.atoms.length).fill(null);
  const used = new Set<string>();
  const matches: SubstructureMatch[] = [];
  const seenSets = new Set<string>();

  const bondsConsistent = (qi: number, tid: string): boolean => {
    for (const { to, bond } of qAdj[qi]) {
      const mapped = mapping[to];
      if (mapped === null) continue;
      const tb = target.g.bondByPair.get(tid < mapped ? `${tid}|${mapped}` : `${mapped}|${tid}`);
      if (!tb) return false;
      const tbond = target.bonds.get(tb);
      if (!tbond || !bond.test(tbond)) return false;
    }
    return true;
  };

  const record = (): void => {
    const atomIds = mapping.map(m => m as string);
    if (unique) {
      const key = [...atomIds].sort().join('|');
      if (seenSets.has(key)) return;
      seenSets.add(key);
    }
    const bondIds = q.bonds.map(b => {
      const x = atomIds[b.a];
      const y = atomIds[b.b];
      return target.g.bondByPair.get(x < y ? `${x}|${y}` : `${y}|${x}`) as string;
    });
    matches.push({ atomIds, bondIds });
  };

  const step = (k: number): boolean => {
    if (matches.length >= maxMatches) return true;
    if (k === order.length) {
      record();
      return matches.length >= maxMatches;
    }
    const qi = order[k];
    const qa = q.atoms[qi];
    // Candidate set: neighbours of a mapped adjacent query atom, or every atom.
    let candidates: Iterable<string> = target.order;
    for (const { to } of qAdj[qi]) {
      const mapped = mapping[to];
      if (mapped !== null) {
        candidates = target.g.nodes.get(mapped)?.neighbors ?? [];
        break;
      }
    }
    for (const tid of candidates) {
      if (used.has(tid)) continue;
      const ta = target.atoms.get(tid);
      if (!ta || !qa.test(ta)) continue;
      if (!bondsConsistent(qi, tid)) continue;
      mapping[qi] = tid;
      used.add(tid);
      const done = step(k + 1);
      used.delete(tid);
      mapping[qi] = null;
      if (done) return true;
    }
    return false;
  };

  step(0);
  return matches;
};

// ─── named groups (semantic selectors) ─────────────────────────────────────

/** Common functional groups as SMARTS-lite, for `molecule.find_substructure { group }`. */
export const NAMED_SUBSTRUCTURES: Readonly<Record<string, { smarts: string; label: string }>> = Object.freeze({
  carbonyl: { smarts: '[CX3]=[OX1]', label: 'Carbonyl C=O' },
  aldehyde: { smarts: '[CX3H1](=O)[#6,#1]', label: 'Aldehyde' },
  ketone: { smarts: '[#6][CX3](=O)[#6]', label: 'Ketone' },
  carboxylic_acid: { smarts: '[CX3](=O)[OX2H1]', label: 'Carboxylic acid' },
  carboxylate: { smarts: '[CX3](=O)[O-]', label: 'Carboxylate' },
  ester: { smarts: '[#6][CX3](=O)[OX2][#6]', label: 'Ester' },
  amide: { smarts: '[CX3](=O)[NX3]', label: 'Amide' },
  amine: { smarts: '[NX3;+0][CX4]', label: 'Amine-type N bonded to sp3 carbon (includes amide N-alkyl)' },
  primary_amine: { smarts: '[NX3H2][#6]', label: 'Primary amine' },
  secondary_amine: { smarts: '[NX3H1]([#6])[#6]', label: 'Secondary amine' },
  tertiary_amine: { smarts: '[NX3H0]([#6])([#6])[#6]', label: 'Tertiary amine' },
  alcohol: { smarts: '[CX4][OX2H1]', label: 'Alcohol' },
  phenol: { smarts: 'c[OX2H1]', label: 'Phenol' },
  ether: { smarts: '[#6][OX2][#6]', label: 'Ether' },
  thiol: { smarts: '[#6][SX2H1]', label: 'Thiol' },
  nitrile: { smarts: '[CX2]#[NX1]', label: 'Nitrile' },
  nitro: { smarts: '[NX3](=O)[O-,O]', label: 'Nitro' },
  halogen: { smarts: '[F,Cl,Br,I]', label: 'Halogen' },
  alkene: { smarts: '[CX3]=[CX3]', label: 'C=C double bond' },
  alkyne: { smarts: '[CX2]#[CX2]', label: 'C≡C triple bond' },
  aromatic_ring: { smarts: 'a1aaaaa1', label: 'Six-membered aromatic ring' },
  phenyl: { smarts: 'c1ccccc1', label: 'Benzene / phenyl ring' },
  pyridine: { smarts: 'n1ccccc1', label: 'Pyridine ring' },
  sulfonamide: { smarts: '[SX4](=O)(=O)[NX3]', label: 'Sulfonamide' },
  sulfone: { smarts: '[#6][SX4](=O)(=O)[#6]', label: 'Sulfone' },
  phosphate: { smarts: '[PX4](=O)([O])([O])[O]', label: 'Phosphate' },
  heteroatom: { smarts: '[!#6;!#1]', label: 'Heteroatom' },
  charged_atom: { smarts: '[!+0]', label: 'Charged atom' },
});

export const NAMED_SUBSTRUCTURE_IDS: readonly string[] = Object.keys(NAMED_SUBSTRUCTURES);

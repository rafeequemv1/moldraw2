import type { Atom, Molecule } from './types';
import { getEffectiveValencyForImplicitHydrogen, getMaxValencyForElement } from './valency';

/** IUPAC symbols (Z ≤ 118); longest token wins when matching a prefix. */
const PERIODIC_SYMBOLS: readonly string[] = [
  'H', 'He', 'Li', 'Be', 'B', 'C', 'N', 'O', 'F', 'Ne', 'Na', 'Mg', 'Al', 'Si', 'P', 'S', 'Cl', 'Ar',
  'K', 'Ca', 'Sc', 'Ti', 'V', 'Cr', 'Mn', 'Fe', 'Co', 'Ni', 'Cu', 'Zn', 'Ga', 'Ge', 'As', 'Se', 'Br', 'Kr',
  'Rb', 'Sr', 'Y', 'Zr', 'Nb', 'Mo', 'Tc', 'Ru', 'Rh', 'Pd', 'Ag', 'Cd', 'In', 'Sn', 'Sb', 'Te', 'I', 'Xe',
  'Cs', 'Ba', 'La', 'Ce', 'Pr', 'Nd', 'Pm', 'Sm', 'Eu', 'Gd', 'Tb', 'Dy', 'Ho', 'Er', 'Tm', 'Yb', 'Lu',
  'Hf', 'Ta', 'W', 'Re', 'Os', 'Ir', 'Pt', 'Au', 'Hg', 'Tl', 'Pb', 'Bi', 'Po', 'At', 'Rn', 'Fr', 'Ra',
  'Ac', 'Th', 'Pa', 'U', 'Np', 'Pu', 'Am', 'Cm', 'Bk', 'Cf', 'Es', 'Fm', 'Md', 'No', 'Lr',
  'Rf', 'Db', 'Sg', 'Bh', 'Hs', 'Mt', 'Ds', 'Rg', 'Cn', 'Nh', 'Fl', 'Mc', 'Lv', 'Ts', 'Og',
] as const;

const SYMBOL_SET = new Set<string>(PERIODIC_SYMBOLS.map(s => s.toUpperCase()));
const COMMON_GROUP_ABBREVIATIONS = new Set<string>([
  'ME', 'ET', 'NPR', 'IPR', 'NBU', 'TBU',
  'PH', 'BN', 'AC', 'CHO', 'CF3',
  'OH', 'OME', 'OET', 'NH2', 'NME2', 'NO2', 'CN',
  'COOH', 'CO2ME', 'CO2ET', 'SO3H', 'SO2ME',
  'BOC', 'CBZ', 'FMOC', 'TS', 'MS',
]);

const ELEMENT_LONGEST_FIRST: string[] = [...PERIODIC_SYMBOLS].sort(
  (a, b) => b.length - a.length || a.localeCompare(b),
);

export type AliasDisplayRun = { kind: 'base' | 'sub'; text: string };

/** ChemDraw-style display: digit runs immediately after a letter use subscript glyphs. */
export function buildAliasDisplayRuns(raw: string): AliasDisplayRun[] {
  const s = raw.trim();
  if (!s.length) return [];
  const runs: AliasDisplayRun[] = [];
  let base = '';
  const flushBase = () => {
    if (base.length) {
      runs.push({ kind: 'base', text: base });
      base = '';
    }
  };
  const isLetter = (c: string) => /[A-Za-z]/.test(c);
  const isDigit = (c: string) => /\d/.test(c);
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (isDigit(c) && base.length > 0 && isLetter(base[base.length - 1])) {
      flushBase();
      let ds = '';
      while (i < s.length && isDigit(s[i])) {
        ds += s[i];
        i++;
      }
      runs.push({
        kind: 'sub',
        // Keep ASCII digits so canvas subFont size controls visible size
        // (Unicode ₀-₉ glyphs stay tiny even at large font sizes).
        text: ds,
      });
      continue;
    }
    base += c;
    i++;
  }
  flushBase();
  return runs;
}

/** "CO…" / "CON…" is almost always carbon, not cobalt (Co). */
function isOrganicCarbonLead(s: string): boolean {
  const t = s.trim();
  if (/^CONH|^CONMe|^CONR|^COO/i.test(t)) return true;
  if (/^CO$/i.test(t)) return true;
  if (t.length >= 3 && /^CO/i.test(t)) {
    const third = t[2];
    if (third && third === third.toUpperCase() && third !== third.toLowerCase()) return true;
    if (/^\d/.test(t.slice(2))) return true;
    if (third === '(') return true;
  }
  return false;
}

/** All-caps NO₂ / NO₃ / NO– style labels are nitrogen, not nobelium (No). */
function isNitrogenOxoLead(s: string): boolean {
  const t = s.trim();
  return /^NO[23]\b/i.test(t) || /^NOO/i.test(t) || /^NO\b$/i.test(t) || /^NO[+-]/i.test(t);
}

function canonicalSymbol(matchedSlice: string): string {
  const u = matchedSlice.toUpperCase();
  const found = PERIODIC_SYMBOLS.find(p => p.toUpperCase() === u);
  return found ?? matchedSlice;
}

/** Longest periodic symbol at the start of `s` (case-insensitive), then Co/No fixes. */
export function matchLeadingElement(s: string): { element: string; length: number } | null {
  const t = s.trim();
  if (!t.length) return null;
  let sym: string | null = null;
  let len = 0;
  for (const p of ELEMENT_LONGEST_FIRST) {
    if (t.length < p.length) continue;
    if (t.slice(0, p.length).toUpperCase() === p.toUpperCase()) {
      sym = canonicalSymbol(t.slice(0, p.length).toUpperCase());
      len = p.length;
      break;
    }
  }
  if (!sym) return null;
  if (sym === 'Co' && len === 2 && isOrganicCarbonLead(t)) {
    return { element: 'C', length: 1 };
  }
  if (sym === 'No' && len === 2 && isNitrogenOxoLead(t)) {
    return { element: 'N', length: 1 };
  }
  return { element: sym, length: len };
}

type ClassifyResult =
  | { kind: 'strict'; element: string; labelHCount: number | null }
  | { kind: 'loose'; leadingElement: string }
  | { kind: 'error'; reason: string };

function classifyAlias(input: string): ClassifyResult {
  const s = input.trim();
  if (!s) return { kind: 'error', reason: 'Empty label' };
  const head = matchLeadingElement(s);
  if (!head) return { kind: 'error', reason: 'Unknown element symbol at start of label' };
  const rest = s.slice(head.length);
  if (rest === '') return { kind: 'strict', element: head.element, labelHCount: null };
  const hm = rest.match(/^H(\d*)$/i);
  if (hm) {
    const digits = hm[1] ?? '';
    if (digits === '') return { kind: 'strict', element: head.element, labelHCount: 1 };
    const n = parseInt(digits, 10);
    if (!Number.isFinite(n) || n < 1) return { kind: 'error', reason: 'Invalid hydrogen count' };
    return { kind: 'strict', element: head.element, labelHCount: n };
  }
  if (!/^[A-Za-z0-9+.-]+$/.test(rest)) {
    return { kind: 'error', reason: 'Unsupported characters in label (letters, digits, + - . only)' };
  }
  return { kind: 'loose', leadingElement: head.element };
}

export type StrictAliasParse =
  | { ok: true; element: string; labelHCount: number | null }
  | { ok: false; reason: string };

/** @deprecated Use {@link classifyAlias} via validate; kept for callers that only need H-suffix parse. */
export function parseStrictAtomAlias(input: string): StrictAliasParse {
  const c = classifyAlias(input);
  if (c.kind === 'error') return { ok: false, reason: c.reason };
  if (c.kind === 'loose') return { ok: false, reason: 'Use one symbol plus optional H or Hn (e.g. CH3), or a group like COOH' };
  return { ok: true, element: c.element, labelHCount: c.labelHCount };
}

function bondOrderSum(mol: Molecule, atomId: string): number {
  let sum = 0;
  for (const b of mol.bonds) {
    if (b.fromAtomId === atomId || b.toAtomId === atomId) sum += b.order;
  }
  return sum;
}

export type ValidateAliasResult =
  | { ok: true; element: string; labelHCount: number | null }
  | { ok: false; reason: string };

/**
 * Strict: `E`, `EH`, `EHn` — implicit H from geometry must match (element from label sets valency).
 * Loose: multi-letter groups (COOH, NH2, SO3H, …) — leading symbol must match atom element; bond order ≤ max valency.
 */
export function validateAtomAliasForMolecule(
  mol: Molecule,
  atomId: string,
  rawAlias: string,
): ValidateAliasResult {
  const trimmed = rawAlias.trim();
  const atom = mol.atoms.find(a => a.id === atomId);
  if (!atom) return { ok: false, reason: 'Atom not found' };
  if (trimmed === '') return { ok: true, element: atom.element, labelHCount: null };

  const c = classifyAlias(trimmed);
  if (c.kind === 'error') return { ok: false, reason: c.reason };

  const bondSum = bondOrderSum(mol, atomId);
  const q = atom.charge ?? 0;
  const upper = trimmed.toUpperCase();

  // ChemDraw-style group aliases (Me, Et, tBu, Ph, Boc, Ts, ...):
  // treat as display groups attached to the current atom symbol.
  if (COMMON_GROUP_ABBREVIATIONS.has(upper)) {
    const maxV = getMaxValencyForElement(atom.element, q);
    if (bondSum > maxV) {
      return { ok: false, reason: 'Bond order exceeds valency for this element' };
    }
    return { ok: true, element: atom.element, labelHCount: null };
  }

  if (c.kind === 'strict') {
    const maxImplicit = getEffectiveValencyForImplicitHydrogen(c.element, q);
    if (bondSum > maxImplicit) {
      return { ok: false, reason: 'Bond order exceeds valency for this element' };
    }
    const implicitH = Math.max(0, maxImplicit - bondSum);
    if (c.labelHCount !== null && c.labelHCount !== implicitH) {
      return {
        ok: false,
        reason: `Label implies ${c.labelHCount} H but geometry has ${implicitH} implicit H`,
      };
    }
    return { ok: true, element: c.element, labelHCount: c.labelHCount };
  }

  // loose
  if (c.leadingElement.toUpperCase() !== atom.element.toUpperCase()) {
    return {
      ok: false,
      reason: `Label starts with ${c.leadingElement} but atom is ${atom.element}`,
    };
  }
  const maxV = getMaxValencyForElement(atom.element, q);
  if (bondSum > maxV) {
    return { ok: false, reason: 'Bond order exceeds valency for this element' };
  }
  return { ok: true, element: atom.element, labelHCount: null };
}

export function atomUsesHeteroStyleTrim(a: Atom): boolean {
  return a.element !== 'C' || Boolean(a.alias?.trim()) || (a.charge ?? 0) !== 0;
}

/** Expose for tests / tooling. */
export function isKnownElementSymbol(sym: string): boolean {
  return SYMBOL_SET.has(sym.trim().toUpperCase());
}

// ─── Abbreviation templates ──────────────────────────────────────────────────

export type AbbrevCategory = 'alkyl' | 'aryl' | 'protecting_group' | 'functional';

export type AbbrevPreview = {
  atoms: Array<{ x: number; y: number; el: string; attach?: boolean }>;
  bonds: Array<[number, number, number]>;
};

export type AbbrevTemplate = {
  key: string;
  display: string;
  category?: AbbrevCategory;
  preferredOrientation: 'outward' | 'planar';
  attachmentNode: number;
  fragmentGraph: { atoms: string[]; bonds: Array<[number, number, number]> };
  collapseSignature: { anchor: string; neighbors: Array<{ element: string; order: number; minCount: number }> };
  preview: AbbrevPreview;
};

/** Default ordered list of group-alias chips shown in the alias suggester. */
export const ABBREVIATION_PALETTE: readonly string[] = [
  'Me', 'Et', 'nPr', 'iPr', 'nBu', 'tBu',
  'Ph', 'Bn', 'Ac', 'CHO', 'CF3',
  'OH', 'OMe', 'OEt', 'NH2', 'NMe2', 'NO2', 'CN',
  'COOH', 'CO2Me', 'CO2Et', 'SO3H', 'SO2Me',
  'Boc', 'Cbz', 'Fmoc', 'Ts', 'Ms',
];

/** Detection signatures + miniature 2D previews keyed by upper-case group name. */
export const ABBREV_TEMPLATE_MAP: Record<string, AbbrevTemplate> = {
  ME: { key: 'ME', display: 'Me', preferredOrientation: 'outward', attachmentNode: 0, fragmentGraph: { atoms: ['C'], bonds: [] }, collapseSignature: { anchor: 'C', neighbors: [] }, preview: { atoms: [{ x: 20, y: 22, el: 'R', attach: true }, { x: 56, y: 22, el: 'C' }], bonds: [[0, 1, 1]] } },
  ET: { key: 'ET', display: 'Et', preferredOrientation: 'outward', attachmentNode: 0, fragmentGraph: { atoms: ['C', 'C'], bonds: [[0, 1, 1]] }, collapseSignature: { anchor: 'C', neighbors: [{ element: 'C', order: 1, minCount: 1 }] }, preview: { atoms: [{ x: 16, y: 22, el: 'R', attach: true }, { x: 46, y: 22, el: 'C' }, { x: 74, y: 22, el: 'C' }], bonds: [[0, 1, 1], [1, 2, 1]] } },
  NPR: { key: 'NPR', display: 'nPr', preferredOrientation: 'outward', attachmentNode: 0, fragmentGraph: { atoms: ['C', 'C', 'C'], bonds: [[0, 1, 1], [1, 2, 1]] }, collapseSignature: { anchor: 'C', neighbors: [{ element: 'C', order: 1, minCount: 1 }] }, preview: { atoms: [{ x: 14, y: 22, el: 'R', attach: true }, { x: 38, y: 22, el: 'C' }, { x: 58, y: 22, el: 'C' }, { x: 78, y: 22, el: 'C' }], bonds: [[0, 1, 1], [1, 2, 1], [2, 3, 1]] } },
  IPR: { key: 'IPR', display: 'iPr', preferredOrientation: 'outward', attachmentNode: 0, fragmentGraph: { atoms: ['C', 'C', 'C'], bonds: [[0, 1, 1], [0, 2, 1]] }, collapseSignature: { anchor: 'C', neighbors: [{ element: 'C', order: 1, minCount: 2 }] }, preview: { atoms: [{ x: 16, y: 22, el: 'R', attach: true }, { x: 44, y: 22, el: 'C' }, { x: 72, y: 12, el: 'C' }, { x: 72, y: 32, el: 'C' }], bonds: [[0, 1, 1], [1, 2, 1], [1, 3, 1]] } },
  NBU: { key: 'NBU', display: 'nBu', preferredOrientation: 'outward', attachmentNode: 0, fragmentGraph: { atoms: ['C', 'C', 'C', 'C'], bonds: [[0, 1, 1], [1, 2, 1], [2, 3, 1]] }, collapseSignature: { anchor: 'C', neighbors: [{ element: 'C', order: 1, minCount: 1 }] }, preview: { atoms: [{ x: 12, y: 22, el: 'R', attach: true }, { x: 30, y: 22, el: 'C' }, { x: 48, y: 22, el: 'C' }, { x: 66, y: 22, el: 'C' }, { x: 84, y: 22, el: 'C' }], bonds: [[0, 1, 1], [1, 2, 1], [2, 3, 1], [3, 4, 1]] } },
  TBU: { key: 'TBU', display: 'tBu', preferredOrientation: 'outward', attachmentNode: 0, fragmentGraph: { atoms: ['C', 'C', 'C', 'C'], bonds: [[0, 1, 1], [0, 2, 1], [0, 3, 1]] }, collapseSignature: { anchor: 'C', neighbors: [{ element: 'C', order: 1, minCount: 3 }] }, preview: { atoms: [{ x: 16, y: 22, el: 'R', attach: true }, { x: 44, y: 22, el: 'C' }, { x: 72, y: 10, el: 'C' }, { x: 72, y: 22, el: 'C' }, { x: 72, y: 34, el: 'C' }], bonds: [[0, 1, 1], [1, 2, 1], [1, 3, 1], [1, 4, 1]] } },
  PH: { key: 'PH', display: 'Ph', preferredOrientation: 'planar', attachmentNode: 0, fragmentGraph: { atoms: ['C', 'C', 'C', 'C', 'C', 'C'], bonds: [[0, 1, 2], [1, 2, 1], [2, 3, 2], [3, 4, 1], [4, 5, 2], [5, 0, 1]] }, collapseSignature: { anchor: 'C', neighbors: [{ element: 'C', order: 1, minCount: 1 }] }, preview: { atoms: [{ x: 16, y: 22, el: 'R', attach: true }, { x: 44, y: 22, el: 'C' }, { x: 56, y: 10, el: 'C' }, { x: 72, y: 10, el: 'C' }, { x: 84, y: 22, el: 'C' }, { x: 72, y: 34, el: 'C' }, { x: 56, y: 34, el: 'C' }], bonds: [[0, 1, 1], [1, 2, 1], [2, 3, 2], [3, 4, 1], [4, 5, 2], [5, 6, 1], [6, 1, 2]] } },
  BN: { key: 'BN', display: 'Bn', preferredOrientation: 'planar', attachmentNode: 0, fragmentGraph: { atoms: ['C', 'C', 'C', 'C', 'C', 'C', 'C'], bonds: [[0, 1, 1], [1, 2, 2], [2, 3, 1], [3, 4, 2], [4, 5, 1], [5, 6, 2], [6, 1, 1]] }, collapseSignature: { anchor: 'C', neighbors: [{ element: 'C', order: 1, minCount: 1 }] }, preview: { atoms: [{ x: 12, y: 22, el: 'R', attach: true }, { x: 30, y: 22, el: 'C' }, { x: 48, y: 22, el: 'C' }, { x: 60, y: 10, el: 'C' }, { x: 76, y: 10, el: 'C' }, { x: 88, y: 22, el: 'C' }, { x: 76, y: 34, el: 'C' }, { x: 60, y: 34, el: 'C' }], bonds: [[0, 1, 1], [1, 2, 1], [2, 3, 1], [3, 4, 2], [4, 5, 1], [5, 6, 2], [6, 7, 1], [7, 2, 2]] } },
  AC: { key: 'AC', display: 'Ac', preferredOrientation: 'outward', attachmentNode: 0, fragmentGraph: { atoms: ['C', 'O', 'C'], bonds: [[0, 1, 2], [0, 2, 1]] }, collapseSignature: { anchor: 'C', neighbors: [{ element: 'O', order: 2, minCount: 1 }] }, preview: { atoms: [{ x: 14, y: 22, el: 'R', attach: true }, { x: 40, y: 22, el: 'C' }, { x: 62, y: 12, el: 'O' }, { x: 62, y: 32, el: 'C' }], bonds: [[0, 1, 1], [1, 2, 2], [1, 3, 1]] } },
  CHO: { key: 'CHO', display: 'CHO', preferredOrientation: 'outward', attachmentNode: 0, fragmentGraph: { atoms: ['C', 'O'], bonds: [[0, 1, 2]] }, collapseSignature: { anchor: 'C', neighbors: [{ element: 'O', order: 2, minCount: 1 }] }, preview: { atoms: [{ x: 16, y: 22, el: 'R', attach: true }, { x: 44, y: 22, el: 'C' }, { x: 72, y: 22, el: 'O' }], bonds: [[0, 1, 1], [1, 2, 2]] } },
  CF3: { key: 'CF3', display: 'CF3', preferredOrientation: 'outward', attachmentNode: 0, fragmentGraph: { atoms: ['C', 'F', 'F', 'F'], bonds: [[0, 1, 1], [0, 2, 1], [0, 3, 1]] }, collapseSignature: { anchor: 'C', neighbors: [{ element: 'F', order: 1, minCount: 3 }] }, preview: { atoms: [{ x: 16, y: 22, el: 'R', attach: true }, { x: 44, y: 22, el: 'C' }, { x: 72, y: 10, el: 'F' }, { x: 72, y: 22, el: 'F' }, { x: 72, y: 34, el: 'F' }], bonds: [[0, 1, 1], [1, 2, 1], [1, 3, 1], [1, 4, 1]] } },
  OH: { key: 'OH', display: 'OH', preferredOrientation: 'outward', attachmentNode: 0, fragmentGraph: { atoms: ['O'], bonds: [] }, collapseSignature: { anchor: 'O', neighbors: [] }, preview: { atoms: [{ x: 20, y: 22, el: 'R', attach: true }, { x: 58, y: 22, el: 'O' }], bonds: [[0, 1, 1]] } },
  OME: { key: 'OME', display: 'OMe', preferredOrientation: 'outward', attachmentNode: 0, fragmentGraph: { atoms: ['O', 'C'], bonds: [[0, 1, 1]] }, collapseSignature: { anchor: 'O', neighbors: [{ element: 'C', order: 1, minCount: 1 }] }, preview: { atoms: [{ x: 12, y: 22, el: 'R', attach: true }, { x: 38, y: 22, el: 'O' }, { x: 68, y: 22, el: 'C' }], bonds: [[0, 1, 1], [1, 2, 1]] } },
  OET: { key: 'OET', display: 'OEt', preferredOrientation: 'outward', attachmentNode: 0, fragmentGraph: { atoms: ['O', 'C', 'C'], bonds: [[0, 1, 1], [1, 2, 1]] }, collapseSignature: { anchor: 'O', neighbors: [{ element: 'C', order: 1, minCount: 1 }] }, preview: { atoms: [{ x: 10, y: 22, el: 'R', attach: true }, { x: 34, y: 22, el: 'O' }, { x: 56, y: 22, el: 'C' }, { x: 78, y: 22, el: 'C' }], bonds: [[0, 1, 1], [1, 2, 1], [2, 3, 1]] } },
  NH2: { key: 'NH2', display: 'NH2', preferredOrientation: 'outward', attachmentNode: 0, fragmentGraph: { atoms: ['N'], bonds: [] }, collapseSignature: { anchor: 'N', neighbors: [] }, preview: { atoms: [{ x: 16, y: 22, el: 'R', attach: true }, { x: 56, y: 22, el: 'N' }], bonds: [[0, 1, 1]] } },
  NME2: { key: 'NME2', display: 'NMe2', preferredOrientation: 'outward', attachmentNode: 0, fragmentGraph: { atoms: ['N', 'C', 'C'], bonds: [[0, 1, 1], [0, 2, 1]] }, collapseSignature: { anchor: 'N', neighbors: [{ element: 'C', order: 1, minCount: 2 }] }, preview: { atoms: [{ x: 16, y: 22, el: 'R', attach: true }, { x: 40, y: 22, el: 'N' }, { x: 68, y: 12, el: 'C' }, { x: 68, y: 32, el: 'C' }], bonds: [[0, 1, 1], [1, 2, 1], [1, 3, 1]] } },
  NO2: { key: 'NO2', display: 'NO2', preferredOrientation: 'planar', attachmentNode: 0, fragmentGraph: { atoms: ['N', 'O', 'O'], bonds: [[0, 1, 2], [0, 2, 1]] }, collapseSignature: { anchor: 'N', neighbors: [{ element: 'O', order: 2, minCount: 1 }, { element: 'O', order: 1, minCount: 1 }] }, preview: { atoms: [{ x: 16, y: 22, el: 'R', attach: true }, { x: 42, y: 22, el: 'N' }, { x: 70, y: 12, el: 'O' }, { x: 70, y: 32, el: 'O' }], bonds: [[0, 1, 1], [1, 2, 2], [1, 3, 1]] } },
  CN: { key: 'CN', display: 'CN', preferredOrientation: 'outward', attachmentNode: 0, fragmentGraph: { atoms: ['C', 'N'], bonds: [[0, 1, 3]] }, collapseSignature: { anchor: 'C', neighbors: [{ element: 'N', order: 3, minCount: 1 }] }, preview: { atoms: [{ x: 16, y: 22, el: 'R', attach: true }, { x: 44, y: 22, el: 'C' }, { x: 74, y: 22, el: 'N' }], bonds: [[0, 1, 1], [1, 2, 3]] } },
  COOH: { key: 'COOH', display: 'COOH', preferredOrientation: 'planar', attachmentNode: 0, fragmentGraph: { atoms: ['C', 'O', 'O'], bonds: [[0, 1, 2], [0, 2, 1]] }, collapseSignature: { anchor: 'C', neighbors: [{ element: 'O', order: 2, minCount: 1 }, { element: 'O', order: 1, minCount: 1 }] }, preview: { atoms: [{ x: 12, y: 22, el: 'R', attach: true }, { x: 36, y: 22, el: 'C' }, { x: 62, y: 12, el: 'O' }, { x: 62, y: 32, el: 'O' }], bonds: [[0, 1, 1], [1, 2, 2], [1, 3, 1]] } },
  CO2ME: { key: 'CO2ME', display: 'CO2Me', preferredOrientation: 'planar', attachmentNode: 0, fragmentGraph: { atoms: ['C', 'O', 'O', 'C'], bonds: [[0, 1, 2], [0, 2, 1], [2, 3, 1]] }, collapseSignature: { anchor: 'C', neighbors: [{ element: 'O', order: 2, minCount: 1 }, { element: 'O', order: 1, minCount: 1 }] }, preview: { atoms: [{ x: 10, y: 22, el: 'R', attach: true }, { x: 32, y: 22, el: 'C' }, { x: 54, y: 12, el: 'O' }, { x: 54, y: 32, el: 'O' }, { x: 76, y: 32, el: 'C' }], bonds: [[0, 1, 1], [1, 2, 2], [1, 3, 1], [3, 4, 1]] } },
  CO2ET: { key: 'CO2ET', display: 'CO2Et', preferredOrientation: 'planar', attachmentNode: 0, fragmentGraph: { atoms: ['C', 'O', 'O', 'C', 'C'], bonds: [[0, 1, 2], [0, 2, 1], [2, 3, 1], [3, 4, 1]] }, collapseSignature: { anchor: 'C', neighbors: [{ element: 'O', order: 2, minCount: 1 }, { element: 'O', order: 1, minCount: 1 }] }, preview: { atoms: [{ x: 8, y: 22, el: 'R', attach: true }, { x: 28, y: 22, el: 'C' }, { x: 50, y: 12, el: 'O' }, { x: 50, y: 32, el: 'O' }, { x: 68, y: 32, el: 'C' }, { x: 86, y: 32, el: 'C' }], bonds: [[0, 1, 1], [1, 2, 2], [1, 3, 1], [3, 4, 1], [4, 5, 1]] } },
  SO3H: { key: 'SO3H', display: 'SO3H', preferredOrientation: 'planar', attachmentNode: 0, fragmentGraph: { atoms: ['S', 'O', 'O', 'O'], bonds: [[0, 1, 2], [0, 2, 2], [0, 3, 1]] }, collapseSignature: { anchor: 'S', neighbors: [{ element: 'O', order: 2, minCount: 2 }, { element: 'O', order: 1, minCount: 1 }] }, preview: { atoms: [{ x: 12, y: 22, el: 'R', attach: true }, { x: 36, y: 22, el: 'S' }, { x: 60, y: 10, el: 'O' }, { x: 60, y: 22, el: 'O' }, { x: 60, y: 34, el: 'O' }], bonds: [[0, 1, 1], [1, 2, 2], [1, 3, 2], [1, 4, 1]] } },
  SO2ME: { key: 'SO2ME', display: 'SO2Me', preferredOrientation: 'planar', attachmentNode: 0, fragmentGraph: { atoms: ['S', 'O', 'O', 'C'], bonds: [[0, 1, 2], [0, 2, 2], [0, 3, 1]] }, collapseSignature: { anchor: 'S', neighbors: [{ element: 'O', order: 2, minCount: 2 }, { element: 'C', order: 1, minCount: 1 }] }, preview: { atoms: [{ x: 10, y: 22, el: 'R', attach: true }, { x: 32, y: 22, el: 'S' }, { x: 54, y: 10, el: 'O' }, { x: 54, y: 34, el: 'O' }, { x: 72, y: 22, el: 'C' }], bonds: [[0, 1, 1], [1, 2, 2], [1, 3, 2], [1, 4, 1]] } },
  BOC: { key: 'BOC', display: 'Boc', preferredOrientation: 'outward', attachmentNode: 0, fragmentGraph: { atoms: ['C', 'O', 'O', 'C'], bonds: [[0, 1, 2], [0, 2, 1], [2, 3, 1]] }, collapseSignature: { anchor: 'N', neighbors: [{ element: 'C', order: 1, minCount: 1 }] }, preview: { atoms: [{ x: 8, y: 22, el: 'R', attach: true }, { x: 28, y: 22, el: 'N' }, { x: 48, y: 22, el: 'C' }, { x: 66, y: 12, el: 'O' }, { x: 66, y: 32, el: 'O' }, { x: 84, y: 32, el: 'C' }], bonds: [[0, 1, 1], [1, 2, 1], [2, 3, 2], [2, 4, 1], [4, 5, 1]] } },
  CBZ: { key: 'CBZ', display: 'Cbz', preferredOrientation: 'planar', attachmentNode: 0, fragmentGraph: { atoms: ['C', 'O', 'O', 'C', 'C', 'C', 'C', 'C', 'C'], bonds: [[0, 1, 2], [0, 2, 1], [2, 3, 1], [3, 4, 1], [4, 5, 2], [5, 6, 1], [6, 7, 2], [7, 8, 1], [8, 4, 2]] }, collapseSignature: { anchor: 'N', neighbors: [{ element: 'C', order: 1, minCount: 1 }] }, preview: { atoms: [{ x: 8, y: 22, el: 'R', attach: true }, { x: 24, y: 22, el: 'N' }, { x: 40, y: 22, el: 'C' }, { x: 54, y: 12, el: 'O' }, { x: 54, y: 32, el: 'O' }, { x: 68, y: 32, el: 'C' }, { x: 80, y: 22, el: 'Ph' }], bonds: [[0, 1, 1], [1, 2, 1], [2, 3, 2], [2, 4, 1], [4, 5, 1], [5, 6, 1]] } },
  FMOC: { key: 'FMOC', display: 'Fmoc', preferredOrientation: 'planar', attachmentNode: 0, fragmentGraph: { atoms: ['C', 'O', 'O', 'C'], bonds: [[0, 1, 2], [0, 2, 1], [2, 3, 1]] }, collapseSignature: { anchor: 'N', neighbors: [{ element: 'C', order: 1, minCount: 1 }] }, preview: { atoms: [{ x: 8, y: 22, el: 'R', attach: true }, { x: 24, y: 22, el: 'N' }, { x: 40, y: 22, el: 'C' }, { x: 54, y: 12, el: 'O' }, { x: 54, y: 32, el: 'O' }, { x: 70, y: 32, el: 'CH2' }, { x: 86, y: 20, el: 'Fm' }], bonds: [[0, 1, 1], [1, 2, 1], [2, 3, 2], [2, 4, 1], [4, 5, 1], [5, 6, 1]] } },
  TS: { key: 'TS', display: 'Ts', preferredOrientation: 'planar', attachmentNode: 0, fragmentGraph: { atoms: ['S', 'O', 'O', 'C'], bonds: [[0, 1, 2], [0, 2, 2], [0, 3, 1]] }, collapseSignature: { anchor: 'N', neighbors: [{ element: 'S', order: 1, minCount: 1 }] }, preview: { atoms: [{ x: 10, y: 22, el: 'R', attach: true }, { x: 28, y: 22, el: 'N' }, { x: 44, y: 22, el: 'S' }, { x: 60, y: 12, el: 'O' }, { x: 60, y: 32, el: 'O' }, { x: 76, y: 22, el: 'Ph' }], bonds: [[0, 1, 1], [1, 2, 1], [2, 3, 2], [2, 4, 2], [2, 5, 1]] } },
  MS: { key: 'MS', display: 'Ms', preferredOrientation: 'planar', attachmentNode: 0, fragmentGraph: { atoms: ['S', 'O', 'O', 'C'], bonds: [[0, 1, 2], [0, 2, 2], [0, 3, 1]] }, collapseSignature: { anchor: 'N', neighbors: [{ element: 'S', order: 1, minCount: 1 }] }, preview: { atoms: [{ x: 12, y: 22, el: 'R', attach: true }, { x: 30, y: 22, el: 'N' }, { x: 46, y: 22, el: 'S' }, { x: 62, y: 12, el: 'O' }, { x: 62, y: 32, el: 'O' }, { x: 78, y: 22, el: 'C' }], bonds: [[0, 1, 1], [1, 2, 1], [2, 3, 2], [2, 4, 2], [2, 5, 1]] } },
};

function normalizeGroupAliasKey(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, '');
}

/** Multi-letter palette groups (COOH, Ph, …): bond geometry should point *into* this atom. */
export function isFunctionalGroupAbbrevAtom(atom: Atom): boolean {
  const a = atom.alias?.trim();
  if (!a) return false;
  const k = normalizeGroupAliasKey(a);
  if (COMMON_GROUP_ABBREVIATIONS.has(k)) return true;
  return Object.prototype.hasOwnProperty.call(ABBREV_TEMPLATE_MAP, k);
}

/**
 * When one endpoint is a functional-group abbrev and the other is not, orient so the bond
 * runs from the plain atom toward the group (narrow stereo wedge remains at `from`).
 */
export function orientBondEndpointsForGroupAbbrevPair(
  endpointA: Atom,
  endpointB: Atom,
): { fromAtomId: string; toAtomId: string } {
  const aAbb = isFunctionalGroupAbbrevAtom(endpointA);
  const bAbb = isFunctionalGroupAbbrevAtom(endpointB);
  if (bAbb && !aAbb) return { fromAtomId: endpointA.id, toAtomId: endpointB.id };
  if (aAbb && !bAbb) return { fromAtomId: endpointB.id, toAtomId: endpointA.id };
  return { fromAtomId: endpointA.id, toAtomId: endpointB.id };
}

/** Coarse category for a known group key (case-insensitive). */
export function getAbbrevCategory(keyOrDisplay: string): AbbrevCategory {
  const k = keyOrDisplay.trim().toUpperCase();
  if (['ME', 'ET', 'NPR', 'IPR', 'NBU', 'TBU', 'CY', 'ALLYL', 'VINYL'].includes(k)) return 'alkyl';
  if (['PH', 'BN'].includes(k)) return 'aryl';
  if (['BOC', 'CBZ', 'FMOC', 'TS', 'MS'].includes(k)) return 'protecting_group';
  return 'functional';
}

/**
 * If `atomId` looks like the anchor of a known abbreviation by neighbor signature,
 * return the abbreviation's display name (e.g. "COOH"). Otherwise return null.
 */
export function detectExpandedAliasAtAtom(mol: Molecule, atomId: string): string | null {
  const a = mol.atoms.find(x => x.id === atomId);
  if (!a || a.alias?.trim()) return null;
  const nb = mol.bonds
    .filter(b => b.fromAtomId === atomId || b.toAtomId === atomId)
    .map(b => {
      const nId = b.fromAtomId === atomId ? b.toAtomId : b.fromAtomId;
      const n = mol.atoms.find(x => x.id === nId);
      return n ? { element: n.element.toUpperCase(), order: b.order } : null;
    })
    .filter((x): x is { element: string; order: number } => Boolean(x));

  const has = (el: string, order: number, minCount: number) =>
    nb.filter(x => x.element === el && x.order === order).length >= minCount;

  for (const k of Object.keys(ABBREV_TEMPLATE_MAP)) {
    const tpl = ABBREV_TEMPLATE_MAP[k];
    if (tpl.collapseSignature.anchor.toUpperCase() !== a.element.toUpperCase()) continue;
    const ok = tpl.collapseSignature.neighbors.every(s => has(s.element.toUpperCase(), s.order, s.minCount));
    if (ok) return tpl.display;
  }
  return null;
}

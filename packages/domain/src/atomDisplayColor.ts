import type { Atom } from './types';
import { canonicalElementSymbol, isKnownElementSymbol } from './aliases';
import { ELEMENT_COLORS } from './elements';

/** Default ink for skeletal carbons and unstyled labels (light theme). */
export const DEFAULT_ATOM_INK = '#0f172a';

/** Explicit H labels and H–heavy-atom bonds (when shown as a symbol or stub). */
export const EXPLICIT_HYDROGEN_COLOR = '#94a3b8';

const ELEMENT_LABEL_COLOR: Record<string, string> = ELEMENT_COLORS;

export type AtomLabelColorOptions = {
  /**
   * When true (settings “Color atom labels by element”), heteroatoms use palette
   * colors (N blue, O red, …). When false, all labels use default ink unless the
   * atom has an explicit custom `color`.
   */
  useElementColors?: boolean;
  /** Theme default structure ink (light black / elegant gray / ink white). */
  defaultInk?: string;
  /** Theme hydrogen label color. */
  hydrogenInk?: string;
};

const ink = (opts?: AtomLabelColorOptions) => opts?.defaultInk ?? DEFAULT_ATOM_INK;
const hInk = (opts?: AtomLabelColorOptions) => opts?.hydrogenInk ?? EXPLICIT_HYDROGEN_COLOR;

/** Palette / custom color used for atom labels (not bond-only overrides). */
export function resolveAtomLabelColor(atom: Atom, opts?: AtomLabelColorOptions): string {
  if (atom.color) return atom.color;
  if (opts?.useElementColors === false) return ink(opts);
  if (atom.element === 'H') return hInk(opts);
  const fromPalette = ELEMENT_LABEL_COLOR[atom.element];
  if (fromPalette && atom.element !== 'C') return fromPalette;
  return ink(opts);
}

/** Color for an explicit "H" glyph (hetero count or carbon with show-H), not D/T. */
export function explicitHydrogenLabelColor(atom: Atom, opts?: AtomLabelColorOptions): string {
  if (atom.color) return atom.color;
  if (opts?.useElementColors === false) return ink(opts);
  return hInk(opts);
}

/**
 * Bond stroke when inheriting from endpoints: prefer the non-carbon end, then the
 * other end, else default ink.
 */
export function resolveBondColorFromAtoms(
  from: Atom,
  to: Atom,
  opts?: AtomLabelColorOptions,
): string {
  const def = ink(opts);
  const pick = (a: Atom) => {
    const c = resolveAtomLabelColor(a, opts);
    if (a.element !== 'C' || c !== def) return c;
    return null;
  };
  return pick(from) ?? pick(to) ?? def;
}

/**
 * Two-letter symbols that steal organic formulas when matched greedily
 * (`CO` is carbon+oxygen, not cobalt; `NH` is nitrogen+hydrogen, not nihonium).
 */
const ORGANIC_TWO_LETTER_SKIP = new Set([
  'CO', 'NO', 'NH', 'HO', 'CN', 'CF', 'BH', 'HS', 'TS', 'MS', 'AC',
  'RF', 'DB', 'SG', 'MT', 'DS', 'RG', 'FL', 'MC', 'LV', 'OG',
]);

export type FormulaLabelColorToken = {
  text: string;
  /** Periodic symbol for this slice, or null for punctuation / abbreviation leftovers (Me, Ph). */
  element: string | null;
};

/** Longest organic element symbol at `s[i]` (skips Co/No/Nh in all-caps formulas). */
export const matchOrganicElementAt = (
  s: string,
  i: number,
): { element: string; length: number } | null => {
  const two = s.slice(i, i + 2);
  if (two.length === 2 && /[A-Za-z]{2}/.test(two)) {
    const second = two[1]!;
    const iupac =
      two[0] === two[0]!.toUpperCase() &&
      second === second.toLowerCase() &&
      second !== second.toUpperCase();
    if (isKnownElementSymbol(two) && canonicalElementSymbol(two).length === 2) {
      if (iupac || !ORGANIC_TWO_LETTER_SKIP.has(two.toUpperCase())) {
        return { element: canonicalElementSymbol(two), length: 2 };
      }
    }
  }
  const one = s[i];
  if (one && /[A-Za-z]/.test(one) && isKnownElementSymbol(one)) {
    return { element: canonicalElementSymbol(one), length: 1 };
  }
  return null;
};

/**
 * Split a condensed / alias formula into element tokens for per-glyph coloring.
 * `OH` → O, H; `NH2` → N, H, 2 (hydrogen color); `CO2H` → C, O, 2, H. Does not remap
 * leading H to carbon (attachment-atom parsing would).
 */
export function tokenizeFormulaLabelForColor(raw: string): FormulaLabelColorToken[] {
  const tokens: FormulaLabelColorToken[] = [];
  let i = 0;
  let lastEl: string | null = null;
  while (i < raw.length) {
    const c = raw[i]!;
    if (/\d/.test(c)) {
      let ds = c;
      i += 1;
      while (i < raw.length && /\d/.test(raw[i]!)) {
        ds += raw[i]!;
        i += 1;
      }
      tokens.push({ text: ds, element: lastEl });
      continue;
    }
    if (/[()+\-#=.]/.test(c)) {
      tokens.push({ text: c, element: null });
      lastEl = null;
      i += 1;
      continue;
    }
    const el = matchOrganicElementAt(raw, i);
    if (el) {
      tokens.push({ text: raw.slice(i, i + el.length), element: el.element });
      lastEl = el.element;
      i += el.length;
      continue;
    }
    tokens.push({ text: c, element: null });
    lastEl = null;
    i += 1;
  }
  return tokens;
}

/**
 * Color for one formula glyph. Hydrogen never inherits the attachment heteroatom
 * color (OH stays O red + H hydrogen; NH₂ stays N blue + H hydrogen).
 */
export function resolveFormulaGlyphColor(
  element: string | null,
  atom: Atom,
  opts?: AtomLabelColorOptions,
): string {
  if (opts?.useElementColors === false) {
    if (element && element === atom.element && atom.color) return atom.color;
    return ink(opts);
  }
  if (element === 'H') {
    if (atom.element === 'H' && atom.color) return atom.color;
    return hInk(opts);
  }
  if (!element) return ink(opts);
  if (element === atom.element && atom.color) return atom.color;
  if (element === 'C') return ink(opts);
  return ELEMENT_LABEL_COLOR[element] ?? ink(opts);
}

/** Per-character fills for a condensed / alias label (`OH`, `NH2`, `CH3`, `CO2H`). */
export function formulaLabelCharFills(
  raw: string,
  atom: Atom,
  opts?: AtomLabelColorOptions,
): string[] {
  const fills: string[] = [];
  for (const tok of tokenizeFormulaLabelForColor(raw)) {
    const color = resolveFormulaGlyphColor(tok.element, atom, opts);
    for (let n = 0; n < tok.text.length; n += 1) fills.push(color);
  }
  return fills;
}

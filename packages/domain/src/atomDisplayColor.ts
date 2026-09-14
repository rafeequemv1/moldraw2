import type { Atom } from './types';
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

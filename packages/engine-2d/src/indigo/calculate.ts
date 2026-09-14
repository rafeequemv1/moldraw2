/**
 * Indigo `calculate` — formula, MW, exact mass, composition (offline).
 *
 * Signature (indigo-ketcher WASM):
 *   calculate(input, options: MapStringString, selectedAtoms: VectorInt) → JSON string
 */
import type { IndigoKetcher } from './types';
import { getIndigoOrNull, loadIndigo } from './loadIndigo';
import { makeIndigoOptions } from './options';

export interface IndigoCalculatedProperties {
  molecularWeight: number | null;
  mostAbundantMass: number | null;
  monoisotopicMass: number | null;
  massComposition: string | null;
  /** Gross formula e.g. "C2 H6 O". */
  grossFormula: string | null;
  raw: Record<string, string>;
}

const parseNum = (v: string | undefined): number | null => {
  if (v == null || v === '') return null;
  // Reactions may return "[46] > [32]" — take first number.
  const m = String(v).match(/-?\d+(?:\.\d+)?/);
  if (!m) return null;
  const n = Number(m[0]);
  return Number.isFinite(n) ? n : null;
};

export const parseIndigoCalculateJson = (json: string): IndigoCalculatedProperties => {
  let raw: Record<string, string> = {};
  try {
    const parsed = JSON.parse(json) as Record<string, unknown>;
    for (const [k, v] of Object.entries(parsed)) {
      raw[k] = v == null ? '' : String(v);
    }
  } catch {
    raw = {};
  }
  return {
    molecularWeight: parseNum(raw['molecular-weight']),
    mostAbundantMass: parseNum(raw['most-abundant-mass']),
    monoisotopicMass: parseNum(raw['monoisotopic-mass']),
    massComposition: raw['mass-composition'] || null,
    grossFormula: raw['gross-formula'] || raw['gross'] || null,
    raw,
  };
};

/**
 * Run Indigo calculate on a molblock / SMILES. `selectedAtomIndices` are 0-based
 * atom indices in the input (empty = whole structure).
 */
export const indigoCalculate = (
  input: string,
  indigo: IndigoKetcher,
  selectedAtomIndices: number[] = [],
): IndigoCalculatedProperties | null => {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const opts = makeIndigoOptions(indigo);
  const selected = new indigo.VectorInt();
  for (const i of selectedAtomIndices) {
    if (Number.isFinite(i) && i >= 0) selected.push_back(Math.trunc(i));
  }
  try {
    const out = indigo.calculate(trimmed, opts, selected);
    if (typeof out !== 'string' || !out.trim()) return null;
    return parseIndigoCalculateJson(out);
  } catch (err) {
    console.warn('[indigo] calculate failed', err);
    return null;
  }
};

export const tryIndigoCalculate = async (
  input: string,
  selectedAtomIndices: number[] = [],
): Promise<IndigoCalculatedProperties | null> => {
  const indigo = getIndigoOrNull() ?? (await loadIndigo());
  if (!indigo) return null;
  return indigoCalculate(input, indigo, selectedAtomIndices);
};

/**
 * Indigo offline drug-like properties: logP, pKa, molar refractivity.
 */
import type { IndigoKetcher } from './types';
import { getIndigoOrNull, loadIndigo } from './loadIndigo';
import { makeIndigoOptions } from './options';

export interface IndigoDruglikeProperties {
  logP: number | null;
  pKa: number | null;
  molarRefractivity: number | null;
}

const toNum = (v: unknown): number | null => {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
};

export const indigoDruglikeProperties = (
  input: string,
  indigo: IndigoKetcher,
): IndigoDruglikeProperties | null => {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const opts = makeIndigoOptions(indigo);
  try {
    const logP = toNum(indigo.logp(trimmed, opts));
    const pKa = toNum(indigo.pka(trimmed, opts));
    const molarRefractivity = toNum(indigo.molarRefractivity(trimmed, opts));
    return { logP, pKa, molarRefractivity };
  } catch (err) {
    console.warn('[indigo] druglike properties failed', err);
    return null;
  }
};

export const tryIndigoDruglikeProperties = async (
  input: string,
): Promise<IndigoDruglikeProperties | null> => {
  const indigo = getIndigoOrNull() ?? (await loadIndigo());
  if (!indigo) return null;
  return indigoDruglikeProperties(input, indigo);
};

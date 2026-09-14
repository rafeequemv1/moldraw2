/**
 * Indigo `convert` — InChI / SMILES / CML / SMARTS / RXN / molfile round-trips.
 * Does not own the Molecule graph; callers parse molfile results into native types.
 */
import type { IndigoConvertFormat, IndigoKetcher } from './types';
import { getIndigoOrNull, loadIndigo } from './loadIndigo';
import { makeIndigoOptions } from './options';

export const indigoConvert = (
  input: string,
  outputFormat: IndigoConvertFormat,
  indigo: IndigoKetcher,
  extraOptions?: Readonly<Record<string, string>>,
): string | null => {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const opts = makeIndigoOptions(indigo);
  if (extraOptions) {
    for (const [key, value] of Object.entries(extraOptions)) {
      opts.set(key, value);
    }
  }
  const tryFormat = (format: string): string | null => {
    try {
      const out = indigo.convert(trimmed, format, opts);
      return typeof out === 'string' && out.trim() ? out : null;
    } catch (err) {
      console.warn(`[indigo] convert→${format} failed`, err);
      return null;
    }
  };

  const primary = tryFormat(outputFormat);
  if (primary) return primary;

  // Ketcher / Indigo MIME aliases used by some builds.
  if (outputFormat === 'inchi-key') {
    return tryFormat('chemical/x-inchi-key');
  }
  return null;
};

export const tryIndigoConvert = async (
  input: string,
  outputFormat: IndigoConvertFormat,
  extraOptions?: Readonly<Record<string, string>>,
): Promise<string | null> => {
  const indigo = getIndigoOrNull() ?? (await loadIndigo());
  if (!indigo) return null;
  return indigoConvert(input, outputFormat, indigo, extraOptions);
};

/** InChI → V2000 molfile (coords may be zero — caller should layout). */
export const indigoInchiToMolblock = (
  inchi: string,
  indigo: IndigoKetcher,
): string | null => {
  const mb = indigoConvert(inchi.trim(), 'molfile', indigo);
  return mb && mb.includes('V2000') ? mb : null;
};

/** Molblock → InChI string. */
export const indigoMolblockToInchi = (
  molblock: string,
  indigo: IndigoKetcher,
): string | null => {
  const out = indigoConvert(molblock, 'inchi', indigo);
  return out && out.startsWith('InChI=') ? out.trim() : null;
};

/**
 * ChemDraw CDXML text or CDX (base64) → V2000 molblock via Indigo.
 * Prefer this for complex ChemDraw documents; native CDXML is a fallback.
 */
export const indigoChemDrawToMolblock = (
  data: string,
  format: 'cdxml' | 'cdx',
  indigo: IndigoKetcher,
): string | null => {
  const input = data.trim();
  if (!input) return null;
  const opts = makeIndigoOptions(indigo);
  try {
    // Indigo auto-detects CDXML vs base64 CDX from the string; outputFormat is the target.
    const out = indigo.convert(input, 'molfile', opts);
    if (typeof out === 'string' && out.includes('V2000')) return out;
    // Explicit format hint if auto-detect fails (rare).
    void format;
    return null;
  } catch (err) {
    console.warn(`[indigo] ChemDraw (${format})→molfile failed`, err);
    return null;
  }
};

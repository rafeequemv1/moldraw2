/**
 * V2000 atom-line extras: charge, isotope (mass difference), stereo parity/care.
 * Shared by the core and engine molfile readers so import keeps stereo-relevant H.
 */

const MOST_ABUNDANT_MASS: Record<string, number> = {
  H: 1,
  D: 2,
  T: 3,
  B: 11,
  C: 12,
  N: 14,
  O: 16,
  F: 19,
  Si: 28,
  P: 31,
  S: 32,
  Cl: 35,
  Br: 80,
  I: 127,
};

export interface V2000AtomLineFields {
  charge: number;
  radical?: number;
  isotope?: number;
  mdlStereoCare?: number;
}

function fromChargeCode(code: number): Pick<V2000AtomLineFields, 'charge' | 'radical'> {
  if (code === 1) return { charge: 3 };
  if (code === 2) return { charge: 2 };
  if (code === 3) return { charge: 1 };
  if (code === 4) return { charge: 0, radical: 1 };
  if (code === 5) return { charge: -1 };
  if (code === 6) return { charge: -2 };
  if (code === 7) return { charge: -3 };
  return { charge: 0 };
}

function isotopeFromMassDiff(element: string, massDiff: number): number | undefined {
  if (!Number.isFinite(massDiff) || massDiff === 0) return undefined;
  const base = MOST_ABUNDANT_MASS[element];
  if (base == null) return undefined;
  const mass = base + massDiff;
  return mass > 0 ? mass : undefined;
}

function stereoCare(value: number): number | undefined {
  if (!Number.isFinite(value) || value < 1 || value > 3) return undefined;
  return value;
}

/**
 * Parse charge / isotope / stereo-care from a V2000 atom line.
 * `M  CHG` / `M  ISO` blocks override these when present.
 */
export function parseV2000AtomLineFields(
  line: string,
  element: string,
  tokenizedParts?: string[],
): V2000AtomLineFields {
  let massDiff = 0;
  let chargeCode = 0;
  let care = 0;

  if (tokenizedParts && tokenizedParts.length >= 5) {
    massDiff = parseInt(tokenizedParts[4] || '0', 10) || 0;
    chargeCode = parseInt(tokenizedParts[5] || '0', 10) || 0;
    care = parseInt(tokenizedParts[6] || '0', 10) || 0;
  } else {
    massDiff = parseInt(line.substring(34, 36).trim() || '0', 10) || 0;
    chargeCode = parseInt(line.substring(36, 39).trim() || '0', 10) || 0;
    care = parseInt(line.substring(39, 42).trim() || '0', 10) || 0;
  }

  const chg = fromChargeCode(chargeCode);
  const isotope = isotopeFromMassDiff(element, massDiff);
  const mdlStereoCare = stereoCare(care);
  return {
    charge: chg.charge,
    ...(chg.radical ? { radical: chg.radical } : {}),
    ...(isotope != null ? { isotope } : {}),
    ...(mdlStereoCare != null ? { mdlStereoCare } : {}),
  };
}

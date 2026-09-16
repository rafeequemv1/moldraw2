/**
 * Resolve a 2D atom alias → SMILES fragment for 3D expansion.
 *
 * Scalable design:
 *   1) Named abbrevs (Ph, Boc, TIPS…) → SMILES rows in ABBREV_TO_SMILES
 *   2) Any condensed formula → recursive parser → full SMILES (merge-first)
 *   3) Atom-accurate labels (CH3, Cl…) → clear alias only
 *
 * Geometry is never hard-coded; `@moldraw/engine` parses the SMILES.
 */

import { parseStrictAtomAlias } from '@moldraw/domain';
import { condensedToSmiles, normalizeCondensedKey } from './condensedFormulaExpand';

export type AliasAttachMode = 'merge-first' | 'bond-to-labeled' | 'clear';

export type AliasSmilesSpec = {
  smiles: string;
  attach: AliasAttachMode;
  /** Unbonded counterion after expand (`COONa` → Na⁺ beside carboxylate). */
  nearbyIon?: { element: string; charge: number };
};

/**
 * Named groups that are not linear condensed text (or need special attach).
 * Palette / ChemDraw abbrevs — add a SMILES row, nothing else.
 */
const ABBREV_TO_SMILES: Record<string, AliasSmilesSpec> = {
  ME: { smiles: '', attach: 'clear' },
  ET: { smiles: 'C', attach: 'bond-to-labeled' },
  NPR: { smiles: 'CC', attach: 'bond-to-labeled' },
  NBU: { smiles: 'CCC', attach: 'bond-to-labeled' },
  IBU: { smiles: 'CC(C)C', attach: 'merge-first' },
  SBU: { smiles: 'C(C)CC', attach: 'merge-first' },
  IPR: { smiles: 'C(C)C', attach: 'merge-first' },
  TBU: { smiles: 'C(C)(C)C', attach: 'merge-first' },

  PH: { smiles: 'c1ccccc1', attach: 'merge-first' },
  BN: { smiles: 'c1ccccc1', attach: 'bond-to-labeled' },
  OPH: { smiles: 'c1ccccc1', attach: 'bond-to-labeled' }, // labeled O
  SPH: { smiles: 'c1ccccc1', attach: 'bond-to-labeled' },

  OH: { smiles: '', attach: 'clear' },
  NH2: { smiles: '', attach: 'clear' },
  SH: { smiles: '', attach: 'clear' },

  CHO: { smiles: 'C=O', attach: 'merge-first' },
  AC: { smiles: 'C(=O)C', attach: 'merge-first' },
  COCH3: { smiles: 'C(=O)C', attach: 'merge-first' },
  COOH: { smiles: 'C(=O)O', attach: 'merge-first' },
  CO2H: { smiles: 'C(=O)O', attach: 'merge-first' },
  COONA: { smiles: 'C(=O)[O-]', attach: 'merge-first', nearbyIon: { element: 'Na', charge: 1 } },
  CO2NA: { smiles: 'C(=O)[O-]', attach: 'merge-first', nearbyIon: { element: 'Na', charge: 1 } },
  COOME: { smiles: 'C(=O)OC', attach: 'merge-first' },
  CO2ME: { smiles: 'C(=O)OC', attach: 'merge-first' },
  COOCH3: { smiles: 'C(=O)OC', attach: 'merge-first' },
  COOET: { smiles: 'C(=O)OCC', attach: 'merge-first' },
  CO2ET: { smiles: 'C(=O)OCC', attach: 'merge-first' },
  CONH2: { smiles: 'C(=O)N', attach: 'merge-first' },
  CN: { smiles: 'C#N', attach: 'merge-first' },
  HCN: { smiles: 'C#N', attach: 'merge-first' },
  CF3: { smiles: 'C(F)(F)F', attach: 'merge-first' },
  CCL3: { smiles: 'C(Cl)(Cl)Cl', attach: 'merge-first' },
  CCL2: { smiles: 'C(Cl)Cl', attach: 'merge-first' },
  NO2: { smiles: 'N(=O)=O', attach: 'merge-first' },
  NO: { smiles: 'N=O', attach: 'merge-first' },

  OME: { smiles: 'C', attach: 'bond-to-labeled' },
  OET: { smiles: 'CC', attach: 'bond-to-labeled' },
  OPR: { smiles: 'CCC', attach: 'bond-to-labeled' },
  NPRO: { smiles: 'CCC', attach: 'bond-to-labeled' },
  IPRO: { smiles: 'C(C)C', attach: 'bond-to-labeled' },
  NOBU: { smiles: 'CCCC', attach: 'bond-to-labeled' },
  TOBU: { smiles: 'C(C)(C)C', attach: 'bond-to-labeled' },
  OTBU: { smiles: 'C(C)(C)C', attach: 'bond-to-labeled' },

  SO3H: { smiles: 'S(=O)(=O)O', attach: 'merge-first' },
  SO2ME: { smiles: 'S(=O)(=O)C', attach: 'merge-first' },
  MS: { smiles: 'S(=O)(=O)C', attach: 'bond-to-labeled' },
  TS: { smiles: 'S(=O)(=O)c1ccc(C)cc1', attach: 'bond-to-labeled' },
  TOS: { smiles: 'S(=O)(=O)c1ccc(C)cc1', attach: 'bond-to-labeled' },

  BOC: { smiles: 'C(=O)OC(C)(C)C', attach: 'bond-to-labeled' },
  CBZ: { smiles: 'C(=O)OCc1ccccc1', attach: 'bond-to-labeled' },
  FMOC: { smiles: 'C(=O)OCC1c2ccccc2-c3ccccc13', attach: 'bond-to-labeled' },
  TFA: { smiles: 'C(=O)C(F)(F)F', attach: 'bond-to-labeled' },
  PMB: { smiles: 'Cc1ccc(OC)cc1', attach: 'bond-to-labeled' },
  TRT: { smiles: 'C(c1ccccc1)(c2ccccc2)c3ccccc3', attach: 'merge-first' },
  MOM: { smiles: 'COC', attach: 'bond-to-labeled' },
  THP: { smiles: 'C1CCCCO1', attach: 'bond-to-labeled' },

  // Common silyl / acetal protecting groups (on O or as whole label)
  TMS: { smiles: '[Si](C)(C)C', attach: 'bond-to-labeled' },
  TES: { smiles: '[Si](CC)(CC)CC', attach: 'bond-to-labeled' },
  TBS: { smiles: '[Si](C)(C)C(C)(C)C', attach: 'bond-to-labeled' },
  TBDMS: { smiles: '[Si](C)(C)C(C)(C)C', attach: 'bond-to-labeled' },
  TIPS: { smiles: '[Si](C(C)C)(C(C)C)C(C)C', attach: 'bond-to-labeled' },
  TBDPS: { smiles: '[Si](C(C)(C)C)(c1ccccc1)c2ccccc2', attach: 'bond-to-labeled' },
  SEM: { smiles: 'COCC[Si](C)(C)C', attach: 'bond-to-labeled' },
  MEM: { smiles: 'COCCOC', attach: 'bond-to-labeled' },
  BOM: { smiles: 'COCc1ccccc1', attach: 'bond-to-labeled' },

  // Vinyl / allyl / propargyl as whole labels on C
  VINYL: { smiles: 'C=C', attach: 'merge-first' },
  CHCH2: { smiles: 'C=C', attach: 'merge-first' },
  ALLYL: { smiles: 'CC=C', attach: 'merge-first' },
  PROPARGYL: { smiles: 'CC#C', attach: 'merge-first' },
  CCH: { smiles: 'C#C', attach: 'merge-first' },
};

const SINGLE_ATOM_CLEAR: Record<string, string> = {
  C: 'C',
  N: 'N',
  O: 'O',
  S: 'S',
  P: 'P',
  F: 'F',
  CL: 'Cl',
  BR: 'Br',
  I: 'I',
};

/**
 * Map any alias text to a SMILES expansion spec.
 * Returns null only when the label should stay display-only (unknown).
 */
export const resolveAliasToSmiles = (
  rawAlias: string,
  atomElement: string,
): AliasSmilesSpec | null => {
  const raw = rawAlias.trim();
  if (!raw) return null;
  const key = normalizeCondensedKey(raw);
  const el = atomElement.toUpperCase();

  if (key === 'NME2') {
    return el === 'N'
      ? { smiles: 'N(C)C', attach: 'merge-first' }
      : { smiles: 'N(C)C', attach: 'bond-to-labeled' };
  }

  if (key === 'OPH') {
    return el === 'O'
      ? { smiles: 'c1ccccc1', attach: 'bond-to-labeled' }
      : { smiles: 'Oc1ccccc1', attach: 'bond-to-labeled' };
  }
  if (key === 'SPH') {
    return el === 'S'
      ? { smiles: 'c1ccccc1', attach: 'bond-to-labeled' }
      : { smiles: 'Sc1ccccc1', attach: 'bond-to-labeled' };
  }
  if (key === 'PMB' && el === 'O') {
    return { smiles: 'Cc1ccc(OC)cc1', attach: 'bond-to-labeled' };
  }
  if (key === 'PMB' && el === 'C') {
    return { smiles: 'c1ccc(OC)cc1', attach: 'bond-to-labeled' };
  }

  const abbrev = ABBREV_TO_SMILES[key];
  if (abbrev) {
    if (abbrev.attach === 'clear') {
      if (key === 'OH' && el === 'C') return { smiles: 'O', attach: 'bond-to-labeled' };
      if (key === 'NH2' && el === 'C') return { smiles: 'N', attach: 'bond-to-labeled' };
      if (key === 'SH' && el === 'C') return { smiles: 'S', attach: 'bond-to-labeled' };
    }
    if (key === 'NO2' && el === 'C') {
      return { smiles: 'N(=O)=O', attach: 'bond-to-labeled' };
    }
    if (key === 'NO' && el === 'C') {
      return { smiles: 'N=O', attach: 'bond-to-labeled' };
    }
    if ((key === 'OME' || key === 'OET' || key === 'OPR' || key === 'OTBU' || key === 'TOBU') && el === 'C') {
      const map: Record<string, string> = {
        OME: 'OC',
        OET: 'OCC',
        OPR: 'OCCC',
        OTBU: 'OC(C)(C)C',
        TOBU: 'OC(C)(C)C',
      };
      return { smiles: map[key]!, attach: 'bond-to-labeled' };
    }
    return abbrev;
  }

  // Recursive condensed → full SMILES (branches, =/#, repeats)
  const parsed = condensedToSmiles(raw);
  if (parsed) {
    const { smiles, leadElement } = parsed;
    const lead = leadElement.toUpperCase();

    // Identity labels: CH3 / OH / Cl on matching element → clear only
    const clearEl = SINGLE_ATOM_CLEAR[lead];
    if (clearEl && smiles === clearEl && lead === el) {
      return { smiles: '', attach: 'clear' };
    }
    if (smiles === 'Cl' && el === 'CL') return { smiles: '', attach: 'clear' };
    if (smiles === 'Br' && el === 'BR') return { smiles: '', attach: 'clear' };

    // ChemDraw rule: first atom of SMILES *is* the labeled atom
    if (lead === el) {
      return { smiles, attach: 'merge-first' };
    }

    // Hetero FG written on carbon (OH, NH2, …) or mismatched lead
    return { smiles, attach: 'bond-to-labeled' };
  }

  // True atom-accurate labels (CH3, NH2, Cl…) — Ph etc. already handled above.
  const strict = parseStrictAtomAlias(raw);
  if (strict.ok) return { smiles: '', attach: 'clear' };

  return null;
};

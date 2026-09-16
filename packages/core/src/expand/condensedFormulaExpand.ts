/**
 * Condensed organic formula → SMILES (recursive descent).
 *
 * Supports:
 *   - Linear chains: CH2CH2COOMe, (CH2)3OH
 *   - Branches: CH(CH2OH)COOH, C(CH3)2CH2OH
 *   - Unsaturation: CH=CHCOOH, C#CPh / C≡CPh
 *   - Nested repeats: (CH2CH2)2OH
 *
 * ChemDraw atom-label rule: the first atom of the SMILES *is* the labeled atom
 * (use merge-first when grafting).
 */

import { normalizeAliasLabelCharacters } from '@moldraw/domain';

export type CondensedToken = {
  key: string;
  /** SMILES for this atom/group as a chain unit. */
  smiles: string;
  /** Leading element of this unit (for attach checks). */
  element: string;
};

/** Practical upper bound for generated Cn chains (not a whitelist of lengths). */
const MAX_FORMULA_CARBONS = 200;

/** Longest-match atom/group table. */
const ATOM_TABLE: readonly CondensedToken[] = [
  { key: 'COOME', smiles: 'C(=O)OC', element: 'C' },
  { key: 'COOET', smiles: 'C(=O)OCC', element: 'C' },
  { key: 'CONH2', smiles: 'C(=O)N', element: 'C' },
  { key: 'COOH', smiles: 'C(=O)O', element: 'C' },
  { key: 'COONA', smiles: 'C(=O)[O-]', element: 'C' },
  { key: 'CO2NA', smiles: 'C(=O)[O-]', element: 'C' },
  { key: 'COCH3', smiles: 'C(=O)C', element: 'C' },
  { key: 'SO2NH2', smiles: 'S(=O)(=O)N', element: 'S' },
  { key: 'SO2PH', smiles: 'S(=O)(=O)c1ccccc1', element: 'S' },
  { key: 'SO3H', smiles: 'S(=O)(=O)O', element: 'S' },
  { key: 'SO2ME', smiles: 'S(=O)(=O)C', element: 'S' },
  { key: 'OCH2PH', smiles: 'OCc1ccccc1', element: 'O' },
  { key: 'NHBOC', smiles: 'NC(=O)OC(C)(C)C', element: 'N' },
  { key: 'NHCBZ', smiles: 'NC(=O)OCc1ccccc1', element: 'N' },
  { key: 'NHAC', smiles: 'NC(=O)C', element: 'N' },
  { key: 'NME2', smiles: 'N(C)C', element: 'N' },
  { key: 'NHME', smiles: 'NC', element: 'N' },
  { key: 'NHET', smiles: 'NCC', element: 'N' },
  { key: 'CCL3', smiles: 'C(Cl)(Cl)Cl', element: 'C' },
  { key: 'CBR3', smiles: 'C(Br)(Br)Br', element: 'C' },
  { key: 'CF3', smiles: 'C(F)(F)F', element: 'C' },
  { key: 'CF2', smiles: 'C(F)(F)', element: 'C' },
  { key: 'CCL2', smiles: 'C(Cl)Cl', element: 'C' },
  { key: 'CHCL2', smiles: 'C(Cl)Cl', element: 'C' },
  { key: 'OTBU', smiles: 'OC(C)(C)C', element: 'O' },
  { key: 'OPH', smiles: 'Oc1ccccc1', element: 'O' },
  { key: 'SPH', smiles: 'Sc1ccccc1', element: 'S' },
  { key: 'OME', smiles: 'OC', element: 'O' },
  { key: 'OET', smiles: 'OCC', element: 'O' },
  { key: 'OPR', smiles: 'OCCC', element: 'O' },
  { key: 'OBU', smiles: 'OCCCC', element: 'O' },
  { key: 'NH2', smiles: 'N', element: 'N' },
  { key: 'NO2', smiles: 'N(=O)=O', element: 'N' },
  { key: 'CHO', smiles: 'C=O', element: 'C' },
  { key: 'CH3', smiles: 'C', element: 'C' },
  { key: 'CH2', smiles: 'C', element: 'C' },
  { key: 'NH', smiles: 'N', element: 'N' },
  { key: 'OH', smiles: 'O', element: 'O' },
  { key: 'SH', smiles: 'S', element: 'S' },
  { key: 'CN', smiles: 'C#N', element: 'C' },
  { key: 'PH', smiles: 'c1ccccc1', element: 'C' },
  { key: 'BN', smiles: 'Cc1ccccc1', element: 'C' },
  { key: 'AC', smiles: 'C(=O)C', element: 'C' },
  { key: 'CL', smiles: 'Cl', element: 'Cl' },
  { key: 'BR', smiles: 'Br', element: 'Br' },
  { key: 'CH', smiles: 'C', element: 'C' },
  { key: 'C', smiles: 'C', element: 'C' },
  { key: 'N', smiles: 'N', element: 'N' },
  { key: 'O', smiles: 'O', element: 'O' },
  { key: 'S', smiles: 'S', element: 'S' },
  { key: 'P', smiles: 'P', element: 'P' },
  { key: 'F', smiles: 'F', element: 'F' },
  { key: 'I', smiles: 'I', element: 'I' },
];

const ATOMS_LONGEST = [...ATOM_TABLE].sort((a, b) => b.key.length - a.key.length);

type AlkylBranch = 'n' | 'iso' | 'sec' | 'tert' | 'neo' | 'cyclo' | null;

/**
 * Map ChemDraw-style CnHm (and branched / cyclo / perfluoro) to condensed text
 * the recursive parser already understands. Expanded CH2… form (not `(CH2)n`)
 * so hetero prefixes like OC6H13 compose correctly.
 */
export const hydrocarbonFormulaToCondensed = (
  branch: AlkylBranch,
  n: number,
  h: number,
): string | null => {
  if (!Number.isFinite(n) || !Number.isFinite(h) || n < 1 || n > MAX_FORMULA_CARBONS) {
    return null;
  }

  // Phenyl (only fixed aryl formula we map)
  if (n === 6 && h === 5) return 'PH';

  // Vinyl / allyl (unsaturated radical CnH(2n-1))
  if (branch == null || branch === 'n') {
    if (n === 2 && h === 3) return 'CH=CH2';
    if (n === 3 && h === 5) return 'CH2CH=CH2'; // allyl
  }

  /**
   * CnH(2n-1) policy (accuracy-first — avoid surprise macrocycles):
   *  - `c-` / `cyclo-` → cycloalkyl for any n
   *  - `n-` → linear alkenyl
   *  - bare → linear alkenyl, EXCEPT C6H11 (ChemDraw ≈ cyclohexyl)
   * Long chains (C18H35 oleyl…) get a mid-chain double bond, not a ring.
   */
  if (h === 2 * n - 1 && n >= 3) {
    const linearAlkenyl = (): string => {
      if (n === 3) return 'CH2CH=CH2';
      // Short: terminal 1-alkenyl. Long (≥10): mid-chain (oleyl-like).
      if (n < 10) return `CH2${'CH2'.repeat(n - 3)}CH=CH2`;
      // attach-(CH2)_a-CH=CH-(CH2)_b-CH3 with a+b = n-3; prefer a≈8 for C18
      const a = Math.ceil((n - 3) / 2);
      const b = n - 3 - a;
      return `${'CH2'.repeat(a)}CH=CH${b > 0 ? 'CH2'.repeat(b) : ''}CH3`;
    };

    if (branch === 'cyclo') return `CYC${n}`;
    if (branch === 'n') return linearAlkenyl();
    if (branch == null) {
      // Only unambiguous bare cycloalkyl in ChemDraw atom labels
      if (n === 6) return 'CYC6';
      return linearAlkenyl();
    }
  }

  // Diene / cycloalkenyl formula CnH(2n-3): expand as linear terminal diene
  // (better than silent skip → bare C in 3D). Explicit cyclo still wins above.
  if (h === 2 * n - 3 && n >= 4 && (branch == null || branch === 'n')) {
    // attach-CH=CH-CH=CH-(CH2)_{n-5}-CH3  or short forms
    if (n === 4) return 'CH=CHCH=CH2';
    if (n === 5) return 'CH2CH=CHCH=CH2';
    return `CH2${'CH2'.repeat(n - 5)}CH=CHCH=CH2`;
  }

  // Saturated alkyl CnH(2n+1) — any n (C7H15, C15H31, …)
  if (h !== 2 * n + 1) return null;

  switch (branch) {
    case 'tert':
      // t-Cn: quaternary C with three methyls + (n-4) methylene spacer to attach
      if (n < 4) return null;
      if (n === 4) return 'C(CH3)3';
      return `${'CH2'.repeat(n - 4)}C(CH3)3`;
    case 'sec':
      if (n < 4) return null;
      return `CH(CH3)${'CH2'.repeat(n - 3)}CH3`;
    case 'iso':
      if (n < 3) return null;
      // Prefer CH(CH3)CH3 over CH(CH3)2 — parser treats `(X)2` as two SMILES
      // branches `C(C)(C)` (propane), not isopropyl `C(C)C`.
      if (n === 3) return 'CH(CH3)CH3';
      return `${'CH2'.repeat(n - 3)}CH(CH3)CH3`;
    case 'neo':
      if (n < 5) return null;
      if (n === 5) return 'CH2C(CH3)2CH3';
      return `${'CH2'.repeat(n - 5)}CH2C(CH3)2CH3`;
    case 'cyclo':
      return null; // cyclo saturated is CnH(2n-1), handled above
    case 'n':
    case null:
    default:
      if (n === 1) return 'CH3';
      return `${'CH2'.repeat(n - 1)}CH3`;
  }
};

const perfluoroToCondensed = (n: number, f: number): string | null => {
  if (n < 1 || n > MAX_FORMULA_CARBONS || f !== 2 * n + 1) return null;
  if (n === 1) return 'CF3';
  return `${'CF2'.repeat(n - 1)}CF3`;
};

/**
 * Rewrite CnHm / CnFm segments (with optional n-/i-/t-/c-… prefixes) anywhere
 * in the label so OC6H13, NHC4H9, n-C12H25, etc. all expand.
 */
export const rewriteHydrocarbonFormulas = (s: string): string => {
  let out = s;

  const apply = (re: RegExp, branch: AlkylBranch): void => {
    out = out.replace(re, (_m, nStr: string, hStr: string) => {
      const n = parseInt(nStr, 10);
      const h = parseInt(hStr, 10);
      return hydrocarbonFormulaToCondensed(branch, n, h) ?? _m;
    });
  };

  // Longest / explicit prefixes first (hyphen optional). Bare CnHm last.
  apply(/CYCLO-?C(\d+)H(\d+)/g, 'cyclo');
  apply(/TERT-?C(\d+)H(\d+)/g, 'tert');
  apply(/SEC-?C(\d+)H(\d+)/g, 'sec');
  apply(/ISO-?C(\d+)H(\d+)/g, 'iso');
  apply(/NEO-?C(\d+)H(\d+)/g, 'neo');
  apply(/T-C(\d+)H(\d+)/g, 'tert');
  apply(/S-C(\d+)H(\d+)/g, 'sec');
  apply(/I-C(\d+)H(\d+)/g, 'iso');
  apply(/N-C(\d+)H(\d+)/g, 'n');
  apply(/C-C(\d+)H(\d+)/g, 'cyclo'); // c-C6H11

  // Perfluoro CnF(2n+1): C4F9, C8F17
  out = out.replace(/C(\d+)F(\d+)/g, (m, nStr: string, fStr: string) => {
    const n = parseInt(nStr, 10);
    const f = parseInt(fStr, 10);
    return perfluoroToCondensed(n, f) ?? m;
  });

  // Bare hydrocarbon formulas (C6H13, C6H5, C6H11, …)
  apply(/C(\d+)H(\d+)/g, null);

  return out;
};

/** Normalize typed FG text for parsing (keeps = and #). */
export const normalizeCondensedKey = (raw: string): string => {
  let s = normalizeAliasLabelCharacters(raw)
    .toUpperCase()
    .replace(/[·•]/g, '')
    .replace(/\s+/g, '')
    .replace(/≡/g, '#');

  // CnHm / prefixes before hyphen-fold so n-C6H13 ≠ NC6H13
  s = rewriteHydrocarbonFormulas(s);

  // i-Pr / n-Bu → IPR / NBU (hyphens only as separators, not minus)
  s = s.replace(/(?<=[A-Z])-(?=[A-Z])/g, '');

  s = s.replace(/COOME|CO2ME|COOCH3|CO2CH3/g, 'COOME');
  s = s.replace(/COOET|CO2ET|COOC2H5|COOCH2CH3/g, 'COOET');
  s = s.replace(/COOH|CO2H/g, 'COOH');
  s = s.replace(/CONH2/g, 'CONH2');
  s = s.replace(/COCH3|COME/g, 'COCH3');
  s = s.replace(/SO2ME|SO2CH3/g, 'SO2ME');

  // Me/Et/Pr/Bu as alkyl (after COOMe rewrite)
  s = s.replace(/(^|[^A-Z0-9#=])ME(?![A-Z])/g, (_, p1: string) => `${p1}CH3`);
  s = s.replace(/(^|[^A-Z0-9#=])ET(?![A-Z])/g, (_, p1: string) => `${p1}CH2CH3`);
  s = s.replace(/(^|[^A-Z0-9#=])PR(?![A-Z])/g, (_, p1: string) => `${p1}CH2CH2CH3`);
  s = s.replace(/(^|[^A-Z0-9#=])BU(?![A-Z])/g, (_, p1: string) => `${p1}CH2CH2CH2CH3`);

  s = s.replace(/^HOOC/, 'COOH');
  s = s.replace(/^CH3OOC|^CH3O2C/, 'COOME');
  s = s.replace(/^CH3CH2OOC/, 'COOET');
  s = s.replace(/^HO(?=[A-Z(=])/, 'OH');
  s = s.replace(/^H2N/, 'NH2');
  s = s.replace(/^HS(?=[A-Z(=])/, 'SH');

  // Terminal-first → attachment-first (HOOCCH2 → CH2COOH)
  const rev = s.match(
    /^(COOH|COOME|COOET|COCH3|OH|NH2|SH|CN|CHO|NO2|PH|CL|BR|F|I|OME|OET|OPH)((?:CH2|CH3|CH)+)$/,
  );
  if (rev) {
    const head = rev[1]!;
    const chain = rev[2]!;
    const parts: string[] = [];
    let i = 0;
    while (i < chain.length) {
      if (chain.startsWith('CH3', i)) {
        parts.push('CH3');
        i += 3;
      } else if (chain.startsWith('CH2', i)) {
        parts.push('CH2');
        i += 3;
      } else if (chain.startsWith('CH', i)) {
        parts.push('CH');
        i += 2;
      } else break;
    }
    if (parts.length && i === chain.length) {
      s = [...parts].reverse().join('') + head;
    }
  }

  return s;
};

type ParseCtx = { s: string; i: number };

const peek = (ctx: ParseCtx): string => ctx.s[ctx.i] ?? '';
const atEnd = (ctx: ParseCtx): boolean => ctx.i >= ctx.s.length;

const readDigits = (ctx: ParseCtx): number => {
  let d = '';
  while (/\d/.test(peek(ctx))) {
    d += peek(ctx);
    ctx.i++;
  }
  if (!d) return 1;
  const n = parseInt(d, 10);
  return Number.isFinite(n) && n >= 1 && n <= 20 ? n : 1;
};

const matchAtom = (ctx: ParseCtx): CondensedToken | null => {
  const rest = ctx.s.slice(ctx.i);
  // Dynamic cycloalkyl from formula rewrite: CYC7, CYC15, … (any n≥3)
  const cyc = /^CYC(\d+)/.exec(rest);
  if (cyc) {
    const n = parseInt(cyc[1]!, 10);
    if (Number.isFinite(n) && n >= 3 && n <= MAX_FORMULA_CARBONS) {
      ctx.i += cyc[0].length;
      return { key: cyc[0], smiles: `C1${'C'.repeat(n - 1)}1`, element: 'C' };
    }
  }
  for (const tok of ATOMS_LONGEST) {
    if (rest.startsWith(tok.key)) {
      ctx.i += tok.key.length;
      return tok;
    }
  }
  return null;
};

/**
 * Parse a chain into SMILES. `afterAtom` means the next `(…)` is a branch
 * on the previous atom; at the start, `(CH2)3` is a linear repeat.
 */
const parseChain = (ctx: ParseCtx): string | null => {
  let out = '';
  let afterAtom = false;
  let pendingBond = '';

  while (!atEnd(ctx)) {
    const ch = peek(ctx);
    if (ch === ')') break;

    if (ch === '=' || ch === '#') {
      pendingBond = ch;
      ctx.i++;
      afterAtom = false; // next ( is linear repeat after bond, not a branch
      // Actually after bond, (CH2)2 should be linear. afterAtom=false is correct.
      continue;
    }

    if (ch === '(') {
      ctx.i++;
      const inner = parseChain(ctx);
      if (inner == null || peek(ctx) !== ')') return null;
      ctx.i++; // )
      const n = readDigits(ctx);
      if (afterAtom) {
        // Branches on previous atom: C(CH3)2 → C(C)(C)
        for (let k = 0; k < n; k++) out += `(${inner})`;
      } else {
        // Linear repeat: (CH2)3OH → CCC…
        for (let k = 0; k < n; k++) {
          if (k > 0 || out.length > 0) {
            // single bond between repeats unless pendingBond
            if (pendingBond) {
              out += pendingBond;
              pendingBond = '';
            }
          } else if (pendingBond) {
            out += pendingBond;
            pendingBond = '';
          }
          out += inner;
        }
        afterAtom = true;
      }
      continue;
    }

    const atom = matchAtom(ctx);
    if (!atom) return null;

    if (out.length > 0 || pendingBond) {
      out += pendingBond; // '' = single bond
      pendingBond = '';
    }
    out += atom.smiles;
    afterAtom = true;

    // Trailing branches immediately on this atom: handled by next loop iteration on '('
  }

  return out.length ? out : null;
};

export type CondensedSmilesResult = {
  smiles: string;
  leadElement: string;
};

const condensedToSmilesFromNormalized = (key: string): CondensedSmilesResult | null => {
  if (!key) return null;
  const ctx: ParseCtx = { s: key, i: 0 };
  const smiles = parseChain(ctx);
  if (smiles == null || !atEnd(ctx)) return null;

  const leadCtx: ParseCtx = { s: key, i: 0 };
  const findLead = (c: ParseCtx): string | null => {
    while (!atEnd(c)) {
      const ch = peek(c);
      if (ch === '=' || ch === '#') {
        c.i++;
        continue;
      }
      if (ch === '(') {
        c.i++;
        const innerLead = findLead(c);
        if (peek(c) === ')') c.i++;
        readDigits(c);
        if (innerLead) return innerLead;
        continue;
      }
      const atom = matchAtom(c);
      return atom?.element ?? null;
    }
    return null;
  };
  return { smiles, leadElement: findLead(leadCtx) ?? 'C' };
};

/**
 * Whole-label hydrocarbon / perfluoro formula → SMILES (C6H13, C4F9…).
 * Hetero-prefixed forms (OC6H13) go through {@link condensedToSmiles} instead.
 */
export const molecularFormulaGroupToSmiles = (key: string): CondensedSmilesResult | null => {
  const u = key.toUpperCase();
  const m = /^C(\d+)H(\d+)$/.exec(u);
  if (m) {
    const text = hydrocarbonFormulaToCondensed(null, parseInt(m[1]!, 10), parseInt(m[2]!, 10));
    return text ? condensedToSmilesFromNormalized(text) : null;
  }
  const mf = /^C(\d+)F(\d+)$/.exec(u);
  if (mf) {
    const text = perfluoroToCondensed(parseInt(mf[1]!, 10), parseInt(mf[2]!, 10));
    return text ? condensedToSmilesFromNormalized(text) : null;
  }
  return null;
};

/**
 * Convert any normalized/raw condensed formula to a full SMILES string.
 * Returns null if the string cannot be fully parsed.
 */
export const condensedToSmiles = (raw: string): CondensedSmilesResult | null => {
  const key = normalizeCondensedKey(raw);
  if (!key) return null;
  return condensedToSmilesFromNormalized(key);
};

// ── Compatibility helpers for aliasToSmiles / older call sites ──────────────

/** @deprecated Prefer condensedToSmiles — kept for token-table tooling. */
export const tokenizeCondensedFormula = (key: string): CondensedToken[] | null => {
  // Best-effort linear tokenize (no branches) for callers that still expect tokens.
  const ctx: ParseCtx = { s: key, i: 0 };
  const tokens: CondensedToken[] = [];
  while (!atEnd(ctx)) {
    const ch = peek(ctx);
    if (ch === '=' || ch === '#' || ch === '(' || ch === ')' || /\d/.test(ch)) {
      // Can't represent in flat token list
      return null;
    }
    const atom = matchAtom(ctx);
    if (!atom) return null;
    tokens.push(atom);
  }
  return tokens.length ? tokens : null;
};

export const condensedSidechainToSmiles = (tokens: CondensedToken[]): string | null => {
  if (tokens.length === 0) return '';
  return tokens.map(t => t.smiles).join('');
};

export const isChainToken = (t: CondensedToken): boolean =>
  t.element === 'C' && ['C', 'CH', 'CH2', 'CH3'].includes(t.key);

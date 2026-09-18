import type { Atom, Molecule } from './types';
import {
  getEffectiveValencyForImplicitHydrogen,
  getMaxFormalChargeMagnitude,
  getMaxValencyForElement,
} from './valency';

const UNICODE_SUBSCRIPTS = '₀₁₂₃₄₅₆₇₈₉';

/** Normalize pasted chemistry text: Unicode subscripts, typographic minus, superscript charge signs. */
export function normalizeAliasLabelCharacters(raw: string): string {
  return raw
    .trim()
    .replace(/\u2212/g, '-')
    .replace(/−/g, '-')
    .replace(/⁺/g, '+')
    .replace(/⁻/g, '-')
    .replace(/[₀-₉]/g, ch => '0123456789'[UNICODE_SUBSCRIPTS.indexOf(ch)] ?? ch);
}

/** True when `body` is only a periodic symbol (Fe, Cu, …) — used for Fe2+ vs NH2+. */
function isBareElementSymbol(body: string): boolean {
  const t = body.trim();
  if (!t) return false;
  const head = matchLeadingElement(t);
  return Boolean(head && head.length === t.length);
}

/** Prefixes where trailing digits after Hn are charge magnitude (NH22+), not CnHm formula digits. */
function isHCountChargePrefix(prefix: string): boolean {
  const p = prefix.trim();
  if (/^(NH\d*|OH\d*|SH\d*)$/i.test(p)) return true;
  // Condensed labels ending in NHn/OHn: (CH2)3NH22+
  return p.includes('(') && /(?:NH|OH|SH)\d+$/i.test(p);
}

/**
 * Split a typed label into body + trailing formal charge (NH2+, O-, Fe3+, N++, …).
 * Returns `charge: null` when no trailing charge token is present.
 *
 * Organic labels keep H-counts in the body: `NH2+` → body NH2, charge +1.
 * Metal charges use magnitude digits: `Fe2+` → body Fe, charge +2.
 * Trailing charge on condensed labels applies to the attachment atom, not internal heteroatoms.
 */
/** CnHm / CnFm labels with trailing +/− or magnitude (C6H13+, C6H132+). */
function splitHydrocarbonFormulaCharge(s: string): { body: string; charge: number } | null {
  const signM = s.match(/^C(\d+)H(\d+)([+]{1,4}|[-]{1,4})$/i);
  const magM = s.match(/^C(\d+)H(\d+)(\d)([+-])$/i);
  if (magM && magM[1] !== undefined && magM[2] !== undefined && magM[3] !== undefined && magM[4] !== undefined) {
    const n = parseInt(magM[3]!, 10);
    if (Number.isFinite(n) && n >= 2) {
      const magBody = `C${magM[1]}H${magM[2]}`;
      if (signM && signM[1] !== undefined && signM[2] !== undefined) {
        const signBody = `C${signM[1]}H${signM[2]}`;
        const c = parseInt(signM[1]!, 10);
        const signH = parseInt(signM[2]!, 10);
        const maxReasonableH = 2 * c + 5;
        const digitFoldedIntoH = `${magBody}${n}` === signBody;
        if (digitFoldedIntoH && signH <= maxReasonableH) {
          // C6H13+ — the trailing digit belongs to H count, not charge magnitude
        } else {
          return { body: magBody, charge: magM[4] === '+' ? n : -n };
        }
      } else {
        return { body: magBody, charge: magM[4] === '+' ? n : -n };
      }
    }
  }
  if (signM && signM[1] !== undefined && signM[2] !== undefined && signM[3] !== undefined) {
    const tok = signM[3];
    const body = `C${signM[1]}H${signM[2]}`;
    const q = tok.length;
    return { body, charge: tok[0] === '+' ? q : -q };
  }

  const signF = s.match(/^C(\d+)F(\d+)([+]{1,4}|[-]{1,4})$/i);
  const magF = s.match(/^C(\d+)F(\d+)(\d)([+-])$/i);
  if (magF && magF[1] !== undefined && magF[2] !== undefined && magF[3] !== undefined && magF[4] !== undefined) {
    const n = parseInt(magF[3]!, 10);
    if (Number.isFinite(n) && n >= 2) {
      const magBody = `C${magF[1]}F${magF[2]}`;
      if (signF && signF[1] !== undefined && signF[2] !== undefined) {
        const signBody = `C${signF[1]}F${signF[2]}`;
        const c = parseInt(signF[1]!, 10);
        const signFCount = parseInt(signF[2]!, 10);
        const maxReasonableF = 2 * c + 5;
        const digitFoldedIntoF = `${magBody}${n}` === signBody;
        if (!(digitFoldedIntoF && signFCount <= maxReasonableF)) {
          return { body: magBody, charge: magF[4] === '+' ? n : -n };
        }
      } else {
        return { body: magBody, charge: magF[4] === '+' ? n : -n };
      }
    }
  }
  if (signF && signF[1] !== undefined && signF[2] !== undefined && signF[3] !== undefined) {
    const tok = signF[3];
    const body = `C${signF[1]}F${signF[2]}`;
    const q = tok.length;
    return { body, charge: tok[0] === '+' ? q : -q };
  }
  return null;
}

export function splitAliasCharge(raw: string): { body: string; charge: number | null } {
  const s = normalizeAliasLabelCharacters(raw);
  if (!s) return { body: '', charge: null };

  // Fe+2 / Fe+3 (sign then digits).
  let m = s.match(/^(.*?)([+-])([0-9]+)$/);
  if (m && m[1] !== undefined && m[1].length > 0) {
    const n = parseInt(m[3]!, 10);
    if (Number.isFinite(n) && n > 0) {
      return { body: m[1], charge: m[2] === '+' ? n : -n };
    }
  }

  // Fe2+ / Cu2+ — only when the left side is a bare element (not NH2+ / CH3-).
  m = s.match(/^(.*?)([0-9]+)([+-])$/);
  if (m && m[1] !== undefined && m[1].length > 0) {
    const n = parseInt(m[2]!, 10);
    if (Number.isFinite(n) && n > 0 && isBareElementSymbol(m[1])) {
      return { body: m[1], charge: m[3] === '+' ? n : -n };
    }
  }

  // C6H13+ / C6H132+ — hydrocarbon molecular formula + charge.
  const hydro = splitHydrocarbonFormulaCharge(s);
  if (hydro) return { body: hydro.body, charge: hydro.charge };

  // NH22+ / (CH2)3NH22+ — H-count present, trailing digits are charge magnitude.
  m = s.match(/^(.*?H\d+)(\d+)([+-])$/i);
  if (m && m[1] !== undefined && m[1].length > 0 && isHCountChargePrefix(m[1])) {
    const n = parseInt(m[2]!, 10);
    if (Number.isFinite(n) && n > 0) {
      return { body: m[1], charge: m[3] === '+' ? n : -n };
    }
  }

  // NH2+ / O- / N++ — trailing sign(s); magnitude = number of signs.
  m = s.match(/^(.*?)([+]{1,4}|[-]{1,4})$/);
  if (m && m[1] !== undefined && m[1].length > 0) {
    const tok = m[2]!;
    const n = tok.length;
    return { body: m[1], charge: tok[0] === '+' ? n : -n };
  }

  return { body: s, charge: null };
}

/** Append ASCII charge for the alias editor draft (e.g. NH2 + charge 1 → NH2+). */
export function formatAliasWithCharge(body: string, charge: number): string {
  const b = body.trim();
  const q = charge || 0;
  if (!q) return b;
  const abs = Math.abs(q);
  const sign = q > 0 ? '+' : '-';
  if (abs === 1) return `${b}${sign}`;
  return `${b}${abs}${sign}`;
}

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
  'R', 'R1', 'R2', 'R3', 'AR', 'X',
  'ME', 'ET', 'NPR', 'IPR', 'NBU', 'TBU',
  'PH', 'BN', 'AC', 'CHO', 'CF3',
  'OH', 'HO', 'OME', 'OET', 'NH2', 'H2N', 'NME2', 'NO2', 'O2N', 'CN', 'HCN',
  'COOH', 'HOOC', 'CHO', 'OHC', 'COONA', 'CO2NA', 'NABH4', 'CO2ME', 'CO2ET', 'SO3H', 'SO2ME',
  'CH2OH', 'HOCH2', 'CH2OME', 'CH2NH2', 'CH2CL', 'CH2BR', 'CH2F', 'CH2CN',
  'BOC', 'CBZ', 'FMOC', 'TS', 'MS',
]);

const ELEMENT_LONGEST_FIRST: string[] = [...PERIODIC_SYMBOLS].sort(
  (a, b) => b.length - a.length || a.localeCompare(b),
);

export type AliasDisplayRun = { kind: 'base' | 'sub'; text: string };

/**
 * Two-letter IUPAC symbols that collide with common organic labels
 * (Co/CO, No/NO, Nh/NH, Cn/CN). IUPAC casing (`Co`) wins; `CO` / `co` stay organic.
 */
const ORGANIC_AMBIGUOUS_ELEMENTS = new Set(['Co', 'No', 'Nh', 'Cn']);

/** Superheavy symbols (Z ≥ 104) that steal organic hydrides if matched greedily (Bh vs BH4). */
const SUPERHEAVY_SYMBOLS = new Set([
  'Rf', 'Db', 'Sg', 'Bh', 'Hs', 'Mt', 'Ds', 'Rg', 'Cn', 'Nh', 'Fl', 'Mc', 'Lv', 'Ts', 'Og',
]);

function organicUppercaseFormula(raw: string): string {
  return raw.replace(/[a-z]/g, (ch, idx, s) => {
    if ((ch === 'n' || ch === 'm') && idx > 0 && s[idx - 1] === ')') return ch;
    return ch.toUpperCase();
  });
}

/**
 * Two-letter symbols that must stay organic (CO not Co) unless the user typed
 * IUPAC casing (`Co`).
 */
const ORGANIC_TWO_LETTER_SKIP = new Set([
  'CO', 'NO', 'NH', 'HO', 'CN', 'CF', 'BH', 'HS', 'TS', 'MS', 'AC',
  'RF', 'DB', 'SG', 'MT', 'DS', 'RG', 'FL', 'MC', 'LV', 'OG',
]);

/** Mixed-case tails inside formulas: CO2Me, NMe2, COOEt. Longest first. */
const FORMULA_MIXED_PREFIXES: ReadonlyArray<{ key: string; display: string }> = [
  { key: 'NME2', display: 'NMe2' },
  { key: 'COOME', display: 'COOMe' },
  { key: 'COOET', display: 'COOEt' },
  { key: 'CO2ME', display: 'CO2Me' },
  { key: 'CO2ET', display: 'CO2Et' },
  { key: 'OME', display: 'OMe' },
  { key: 'OET', display: 'OEt' },
  { key: 'TBU', display: 'tBu' },
  { key: 'NPR', display: 'nPr' },
  { key: 'IPR', display: 'iPr' },
  { key: 'NBU', display: 'nBu' },
  { key: 'ME', display: 'Me' },
  { key: 'ET', display: 'Et' },
  { key: 'PH', display: 'Ph' },
  { key: 'BN', display: 'Bn' },
  { key: 'AC', display: 'Ac' },
  { key: 'PR', display: 'Pr' },
  { key: 'BU', display: 'Bu' },
  { key: 'TS', display: 'Ts' },
  { key: 'MS', display: 'Ms' },
  { key: 'AR', display: 'Ar' },
];

/**
 * Rebuild an organic formula with IUPAC two-letter elements (`Na`, `Cl`) so
 * `coona` / `COONA` become `COONa` instead of all-caps `COONA`.
 */
function formatOrganicFormulaCasing(raw: string): string {
  let out = '';
  let i = 0;
  while (i < raw.length) {
    const c = raw[i]!;
    if (/\d/.test(c) || /[()+\-#=.]/.test(c)) {
      out += c;
      i += 1;
      continue;
    }
    if (
      (c === 'n' || c === 'm' || c === 'N' || c === 'M') &&
      out.endsWith(')') &&
      (i + 1 >= raw.length || !/[A-Za-z]/.test(raw[i + 1]!))
    ) {
      out += c.toLowerCase();
      i += 1;
      continue;
    }
    const restUpper = raw.slice(i).replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    // Prefer mixed abbrevs only at a letter start, matching the raw prefix length.
    let mixedHit: { display: string; consume: number } | null = null;
    for (const p of FORMULA_MIXED_PREFIXES) {
      if (!restUpper.startsWith(p.key)) continue;
      const consume = p.key.length;
      const slice = raw.slice(i, i + consume);
      if (slice.replace(/[^A-Za-z0-9]/g, '').toUpperCase() !== p.key) continue;
      if (!/^[A-Za-z]/.test(slice)) continue;
      mixedHit = { display: p.display, consume };
      break;
    }
    if (mixedHit) {
      out += mixedHit.display;
      i += mixedHit.consume;
      continue;
    }
    const two = raw.slice(i, i + 2);
    if (two.length === 2 && /[A-Za-z]{2}/.test(two) && isKnownElementSymbol(two)) {
      const canon = canonicalElementSymbol(two);
      if (canon.length === 2) {
        const iupac = isIupacTwoLetterCasing(two);
        if (iupac || !ORGANIC_TWO_LETTER_SKIP.has(two.toUpperCase())) {
          out += canon;
          i += 2;
          continue;
        }
      }
    }
    if (/[A-Za-z]/.test(c)) {
      out += c.toUpperCase();
      i += 1;
      continue;
    }
    out += c;
    i += 1;
  }
  return out;
}

function isIupacTwoLetterCasing(typed: string): boolean {
  if (typed.length < 2) return false;
  return /[A-Z]/.test(typed[0]!) && /[a-z]/.test(typed[1]!);
}

export type NearbyIonSpec = { element: string; charge: number };

/**
 * Typed ion formulas that expand to real chemistry (not a display alias).
 * `BH4` / `BH4-` → B with charge −1 (tetrahedral borohydride).
 * `NaBH4` stays a condensed alias (like COONa); expand only via show-explicit.
 */
export type TypedIonFormula =
  | {
      kind: 'single';
      element: string;
      charge: number;
      labelHCount: number;
    }
  | {
      kind: 'salt-pair';
      element: string;
      charge: number;
      labelHCount: number;
      nearbyIon: NearbyIonSpec;
    };

/** ChemDraw-like: `bh4` / `BH4-` → borohydride. `NaBH4` is a display alias. */
export function parseTypedIonFormula(raw: string): TypedIonFormula | null {
  const trimmed = normalizeAliasLabelCharacters(raw);
  if (!trimmed) return null;
  const { body, charge } = splitAliasCharge(trimmed);
  const key = body.replace(/\s+/g, '').toUpperCase();
  if (key === 'BH4') {
    // Explicit BH4+ is not borohydride; BH4 / BH4- default to B−.
    if (charge != null && charge !== -1) return null;
    return { kind: 'single', element: 'B', charge: -1, labelHCount: 4 };
  }
  return null;
}

function formatTypedIonFormulaDraft(body: string): string | null {
  const key = body.replace(/\s+/g, '').toUpperCase();
  if (key === 'BH4') return 'BH4';
  if (key === 'NABH4') return 'NaBH4';
  if (key === 'COONA') return 'COONa';
  if (key === 'CO2NA') return 'CO2Na';
  return null;
}

function formatTypedElementBody(body: string): string | null {
  const t = body.trim();
  if (!t) return null;
  if (isKnownElementSymbol(t)) {
    const canon = canonicalElementSymbol(t);
    const ambiguous = ORGANIC_AMBIGUOUS_ELEMENTS.has(canon);
    if (!ambiguous || isIupacTwoLetterCasing(t)) return canon;
    return null;
  }
  const hydride = t.match(/^([A-Za-z]{1,2})(H\d*)$/i);
  if (hydride?.[1] && isKnownElementSymbol(hydride[1])) {
    const elCanon = canonicalElementSymbol(hydride[1]);
    if (ORGANIC_AMBIGUOUS_ELEMENTS.has(elCanon) && !isIupacTwoLetterCasing(hydride[1])) {
      return null;
    }
    return `${elCanon}${hydride[2]!.replace(/^[hH]/, 'H')}`;
  }
  return null;
}

/**
 * Auto-capitalize typed atom labels (ChemDraw-like).
 * Two-letter elements keep IUPAC casing (`na` → `Na`, `He` stays `He`) so the
 * second letter is not forced uppercase. Organic formulas keep element casing:
 * `ch3oh` → `CH3OH`, `coona` → `COONa` (not `COONA`). Mixed abbrevs: `me` → `Me`.
 */
export function autocapitalizeAtomAliasDraft(raw: string): string {
  if (!raw) return raw;
  const lower = raw.toLowerCase();
  const mixed: Record<string, string> = {
    r: 'R',
    r1: 'R1',
    r2: 'R2',
    r3: 'R3',
    ar: 'Ar',
    x: 'X',
    me: 'Me',
    et: 'Et',
    npr: 'nPr',
    ipr: 'iPr',
    nbu: 'nBu',
    tbu: 'tBu',
    ph: 'Ph',
    bn: 'Bn',
    ac: 'Ac',
    ome: 'OMe',
    oet: 'OEt',
    nme2: 'NMe2',
    boc: 'Boc',
    cbz: 'Cbz',
    fmoc: 'Fmoc',
    ts: 'Ts',
    ms: 'Ms',
  };
  if (mixed[lower]) return mixed[lower]!;

  const { body, charge } = splitAliasCharge(raw);
  const formatted = formatTypedIonFormulaDraft(body) ?? formatTypedElementBody(body);
  if (formatted) {
    if (charge != null) return formatAliasWithCharge(formatted, charge);
    const signs = raw.match(/[+-]+$/);
    if (signs && body === raw.slice(0, raw.length - signs[0].length)) {
      return formatted + signs[0];
    }
    return formatted;
  }

  const organic = formatOrganicFormulaCasing(body || raw);
  if (charge != null) return formatAliasWithCharge(organic, charge);
  const signs = raw.match(/[+-]+$/);
  if (signs && body === raw.slice(0, raw.length - signs[0].length)) {
    return organic + signs[0];
  }
  if (body && body !== raw) return organicUppercaseFormula(raw);
  return organic;
}

const subscriptAfter = (prev: string): boolean =>
  /[A-Za-z]/.test(prev) || prev === ')';

/** True for parenthetical repeat labels: (CH2)3, -(CH2)n-, etc. */
export function looksLikeCondensedFormulaLabel(body: string): boolean {
  const s = body.trim();
  if (!s) return false;
  if (s.includes('(') && s.includes(')')) return true;
  if (/^-\(/.test(s)) return true;
  return false;
}

/** True when label should use condensed-formula validation and 3D parse checks. */
export function looksLikeExpandableFormulaLabel(body: string): boolean {
  const s = body.trim();
  if (!s) return false;
  if (looksLikeCondensedFormulaLabel(s)) return true;
  if (/^C\d+H\d+$/i.test(s)) return true;
  if (/^C\d+F\d+$/i.test(s)) return true;
  return false;
}

/** Lightweight syntax check for condensed organic labels (no SMILES expansion). */
export function validateCondensedFormulaLabelSyntax(body: string): string | null {
  const s = body.trim();
  if (!s) return 'Empty label';
  if (!/^[A-Za-z0-9()+#=.\-]+$/.test(s)) {
    return 'Unsupported characters in condensed formula (letters, digits, ( ) + - # = . only)';
  }
  let depth = 0;
  for (const ch of s) {
    if (ch === '(') depth++;
    else if (ch === ')') {
      depth--;
      if (depth < 0) return 'Unbalanced parentheses in label';
    }
  }
  if (depth !== 0) return 'Unbalanced parentheses in label';
  if (!/[A-Za-z]/.test(s)) return 'Formula must contain letters';
  return null;
}

/** ChemDraw-style display: digit runs after a letter or `)` use subscript glyphs. */
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
    const prev = base.length > 0 ? base[base.length - 1]! : '';
    if (isDigit(c) && base.length > 0 && subscriptAfter(prev)) {
      flushBase();
      let ds = '';
      while (i < s.length && isDigit(s[i])) {
        ds += s[i]!;
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
    // Repeat variable after a closing paren: (CH2)n, (CH2)m
    if (
      prev === ')' &&
      (c === 'n' || c === 'm' || c === 'N' || c === 'M') &&
      (i + 1 >= s.length || !isLetter(s[i + 1]!))
    ) {
      flushBase();
      runs.push({ kind: 'sub', text: c.toLowerCase() });
      i++;
      continue;
    }
    base += c;
    i++;
  }
  flushBase();
  return runs;
}

/** HCN, HCHO, HCOOH, H3C — leading H is a prefix; the attachment atom is carbon. */
function isOrganicHydrogenPrefixedCarbon(s: string): boolean {
  return /^H\d*C/i.test(s.trim());
}

/** "CO…" / "CON…" is almost always carbon, not cobalt (Co). Bare `Co` is cobalt. */
function isOrganicCarbonLead(s: string): boolean {
  const t = s.trim();
  if (/^CONH|^CONMe|^CONR|^COO/i.test(t)) return true;
  if (t === 'CO' || t === 'co') return true;
  if (t.length >= 3 && /^CO/i.test(t)) {
    const third = t[2];
    if (third && third === third.toUpperCase() && third !== third.toLowerCase()) return true;
    if (/^\d/.test(t.slice(2))) return true;
    if (third === '(') return true;
  }
  return false;
}

/** All-caps NO₂ / NO₃ / NO– style labels are nitrogen, not nobelium (`No`). */
function isNitrogenOxoLead(s: string): boolean {
  const t = s.trim();
  return (
    /^NO[23]\b/i.test(t) ||
    /^NOO/i.test(t) ||
    t === 'NO' ||
    t === 'no' ||
    /^NO[+-]/i.test(t)
  );
}

/** NH / NH2 / NMe2 / … are organic nitrogen, not nihonium (Nh). */
function isOrganicNitrogenLead(s: string): boolean {
  const t = s.trim();
  // Bare IUPAC "Nh" is nihonium — do not treat as organic NH.
  if (t === 'Nh' || t.startsWith('Nh')) return false;
  return (
    t === 'NH' ||
    t === 'nh' ||
    /^NH\d/i.test(t) ||
    /^NH[A-Za-z]/i.test(t) ||
    /^NMe/i.test(t) ||
    /^NEt/i.test(t) ||
    /^NPr/i.test(t) ||
    /^NBu/i.test(t) ||
    /^NR\b/i.test(t) ||
    /^N\d/i.test(t) ||
    /^N[+-]/i.test(t)
  );
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
  if (sym === 'Nh' && len === 2 && isOrganicNitrogenLead(t)) {
    return { element: 'N', length: 1 };
  }
  // Superheavies must not steal organic hydrides: BH4, HS, NH2 typed in all caps.
  if (SUPERHEAVY_SYMBOLS.has(sym) && len === 2 && !isIupacTwoLetterCasing(t.slice(0, 2))) {
    return { element: canonicalSymbol(t[0]!), length: 1 };
  }
  if (sym === 'H' && isOrganicHydrogenPrefixedCarbon(t)) {
    return { element: 'C', length: 1 };
  }
  return { element: sym, length: len };
}

type ClassifyResult =
  | { kind: 'strict'; element: string; labelHCount: number | null }
  | { kind: 'loose'; leadingElement: string }
  | { kind: 'error'; reason: string };

function classifyAlias(input: string): ClassifyResult {
  const { body } = splitAliasCharge(input);
  const s = body.trim();
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
  | {
      ok: true;
      element: string;
      labelHCount: number | null;
      charge: number | null;
      body: string;
/** Unbonded counterion to place near the labeled atom on expand (`COONa` → Na⁺). */
      nearbyIon?: NearbyIonSpec;
    }
  | { ok: false; reason: string };

function atomHasHeavyNeighbor(mol: Molecule, atomId: string): boolean {
  for (const b of mol.bonds) {
    if (b.fromAtomId !== atomId && b.toAtomId !== atomId) continue;
    const oid = b.fromAtomId === atomId ? b.toAtomId : b.fromAtomId;
    const o = mol.atoms.find(a => a.id === oid);
    if (o && o.element !== 'H') return true;
  }
  return false;
}

/**
 * Atom Label tool: apply any text as a display alias.
 * Chemistry-aware updates (element / BH4 / charge) still happen when they fit;
 * mismatches never block — the typed string stays on the current atom.
 * Trailing charges (`+`, `-`, `2+`, …) are parsed and applied as formal charge.
 */
export function validateAtomAliasForMolecule(
  mol: Molecule,
  atomId: string,
  rawAlias: string,
): ValidateAliasResult {
  const trimmed = normalizeAliasLabelCharacters(rawAlias);
  const atom = mol.atoms.find(a => a.id === atomId);
  if (!atom) return { ok: false, reason: 'Atom not found' };
  if (trimmed === '') {
    return { ok: true, element: atom.element, labelHCount: null, charge: null, body: '' };
  }

  const { body, charge: parsedCharge } = splitAliasCharge(trimmed);
  const bondSum = bondOrderSum(mol, atomId);
  const q = parsedCharge ?? atom.charge ?? 0;
  const upper = body.trim().toUpperCase();
  const labelBody = (body || trimmed).trim();

  /** Never block the label tool: keep the typed text on the current atom. */
  const verbatimAlias = (): ValidateAliasResult => ({
    ok: true,
    element: atom.element,
    labelHCount: null,
    charge: parsedCharge,
    body: labelBody,
  });

  const chargeOk = (el: string): boolean => {
    if (parsedCharge != null && Math.abs(parsedCharge) > getMaxFormalChargeMagnitude(el)) {
      return false;
    }
    return true;
  };

  // BH4 → real B− chemistry (implicit BH4), not a carbon alias string.
  const ion = parseTypedIonFormula(trimmed);
  if (ion) {
    if (!chargeOk(ion.element)) return verbatimAlias();
    const maxDraw = getMaxValencyForElement(ion.element, ion.charge);
    if (bondSum > maxDraw || atomHasHeavyNeighbor(mol, atomId)) return verbatimAlias();
    return {
      ok: true,
      element: ion.element,
      labelHCount: ion.labelHCount,
      charge: ion.charge,
      // Store the element so commit does not keep "BH4" as an alias label.
      body: ion.element,
      nearbyIon: ion.kind === 'salt-pair' ? ion.nearbyIon : undefined,
    };
  }

  // Generic substituent / group abbreviations (R, Me, Ph, NaBH4, COONa, …).
  if (COMMON_GROUP_ABBREVIATIONS.has(upper)) {
    if (!chargeOk(atom.element)) return verbatimAlias();
    const maxV = getMaxValencyForElement(atom.element, q);
    if (bondSum > maxV) return verbatimAlias();
    return {
      ok: true,
      element: atom.element,
      labelHCount: null,
      charge: parsedCharge,
      body: body.trim(),
    };
  }

  // Condensed / molecular formulas: (CH2)3CH3, C6H13, C18H37, -(CH2)n-
  if (looksLikeExpandableFormulaLabel(body.trim())) {
    if (validateCondensedFormulaLabelSyntax(body.trim())) return verbatimAlias();
    if (!chargeOk(atom.element)) return verbatimAlias();
    const maxV = getMaxValencyForElement(atom.element, q);
    if (bondSum > maxV) return verbatimAlias();
    return {
      ok: true,
      element: atom.element,
      labelHCount: null,
      charge: parsedCharge,
      body: body.trim(),
    };
  }

  const c = classifyAlias(body || trimmed);
  if (c.kind === 'error') {
    // Unknown token, symbols, free text: display alias on the current atom.
    return verbatimAlias();
  }

  if (c.kind === 'strict') {
    if (!chargeOk(c.element)) return verbatimAlias();
    // Drawing max uses the NEW element (Na may keep a ligand bond; He may not).
    const maxDraw = getMaxValencyForElement(c.element, q);
    if (bondSum > maxDraw) return verbatimAlias();
    const maxImplicit = getEffectiveValencyForImplicitHydrogen(c.element, q);
    const implicitH = Math.max(0, maxImplicit - bondSum);
    if (c.labelHCount !== null && c.labelHCount !== implicitH) {
      // CH3 / NH2 / … as a condensed alias when geometry does not match.
      return verbatimAlias();
    }
    return {
      ok: true,
      element: c.element,
      labelHCount: c.labelHCount,
      charge: parsedCharge,
      body: body.trim(),
    };
  }

  // loose formulas / groups: keep as alias on the current atom (do not require
  // the leading element to match — H2SO4 on C, CH3OH on C+, NaBH4 on C, …).
  if (!chargeOk(atom.element)) return verbatimAlias();
  const maxV = getMaxValencyForElement(atom.element, q);
  if (bondSum > maxV) return verbatimAlias();
  return {
    ok: true,
    element: atom.element,
    labelHCount: null,
    charge: parsedCharge,
    body: body.trim(),
  };
}

export function atomUsesHeteroStyleTrim(a: Atom): boolean {
  return (
    a.element !== 'C' ||
    Boolean(a.alias?.trim()) ||
    (a.charge ?? 0) !== 0 ||
    Boolean(a.showElementLabel)
  );
}

/** Expose for tests / tooling. */
export function isKnownElementSymbol(sym: string): boolean {
  return SYMBOL_SET.has(sym.trim().toUpperCase());
}

const CANONICAL_SYMBOL_BY_UPPER = new Map<string, string>(
  PERIODIC_SYMBOLS.map(s => [s.toUpperCase(), s] as const),
);

/**
 * Canonical IUPAC casing for a (case-insensitive) element symbol: `cl` → `Cl`,
 * `NA` → `Na`. Unknown symbols are returned trimmed but otherwise unchanged.
 */
export function canonicalElementSymbol(sym: string): string {
  const t = sym.trim();
  return CANONICAL_SYMBOL_BY_UPPER.get(t.toUpperCase()) ?? t;
}

/** All IUPAC element symbols (Z ≤ 118) in periodic order. */
export const ELEMENT_SYMBOLS: readonly string[] = PERIODIC_SYMBOLS;

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
  'R', 'R1', 'R2', 'Ar', 'X',
  '(CH2)n', '-(CH2)n-', 'CnH2n+1',
  'Me', 'Et', 'nPr', 'iPr', 'nBu', 'tBu',
  'Ph', 'Bn', 'Ac', 'CHO', 'CF3',
  'OH', 'OMe', 'OEt', 'NH2', 'NMe2', 'NO2', 'CN', 'HCN',
  'COOH', 'COONa', 'CO2Na', 'CO2Me', 'CO2Et', 'CH2OH', 'SO3H', 'SO2Me',
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
  HCN: { key: 'HCN', display: 'HCN', preferredOrientation: 'outward', attachmentNode: 0, fragmentGraph: { atoms: ['C', 'N'], bonds: [[0, 1, 3]] }, collapseSignature: { anchor: 'C', neighbors: [{ element: 'N', order: 3, minCount: 1 }] }, preview: { atoms: [{ x: 16, y: 22, el: 'H' }, { x: 44, y: 22, el: 'C', attach: true }, { x: 74, y: 22, el: 'N' }], bonds: [[0, 1, 1], [1, 2, 3]] } },
  COOH: { key: 'COOH', display: 'COOH', preferredOrientation: 'planar', attachmentNode: 0, fragmentGraph: { atoms: ['C', 'O', 'O'], bonds: [[0, 1, 2], [0, 2, 1]] }, collapseSignature: { anchor: 'C', neighbors: [{ element: 'O', order: 2, minCount: 1 }, { element: 'O', order: 1, minCount: 1 }] }, preview: { atoms: [{ x: 12, y: 22, el: 'R', attach: true }, { x: 36, y: 22, el: 'C' }, { x: 62, y: 12, el: 'O' }, { x: 62, y: 32, el: 'O' }], bonds: [[0, 1, 1], [1, 2, 2], [1, 3, 1]] } },
  COONA: { key: 'COONA', display: 'COONa', preferredOrientation: 'planar', attachmentNode: 0, fragmentGraph: { atoms: ['C', 'O', 'O'], bonds: [[0, 1, 2], [0, 2, 1]] }, collapseSignature: { anchor: 'C', neighbors: [{ element: 'O', order: 2, minCount: 1 }, { element: 'O', order: 1, minCount: 1 }] }, preview: { atoms: [{ x: 8, y: 22, el: 'R', attach: true }, { x: 30, y: 22, el: 'C' }, { x: 52, y: 12, el: 'O' }, { x: 52, y: 32, el: 'O' }, { x: 78, y: 32, el: 'Na' }], bonds: [[0, 1, 1], [1, 2, 2], [1, 3, 1]] } },
  CO2NA: { key: 'CO2NA', display: 'CO2Na', preferredOrientation: 'planar', attachmentNode: 0, fragmentGraph: { atoms: ['C', 'O', 'O'], bonds: [[0, 1, 2], [0, 2, 1]] }, collapseSignature: { anchor: 'C', neighbors: [{ element: 'O', order: 2, minCount: 1 }, { element: 'O', order: 1, minCount: 1 }] }, preview: { atoms: [{ x: 8, y: 22, el: 'R', attach: true }, { x: 30, y: 22, el: 'C' }, { x: 52, y: 12, el: 'O' }, { x: 52, y: 32, el: 'O' }, { x: 78, y: 32, el: 'Na' }], bonds: [[0, 1, 1], [1, 2, 2], [1, 3, 1]] } },
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

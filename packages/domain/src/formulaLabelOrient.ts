/**
 * ACS / ChemDraw condensed-label orientation.
 *
 * The bonding atom (C of CH₃, O of OH) sits on the parent bond; Hₙ / the rest
 * of the formula extend *away* from that bond:
 *   left of attachment:  H3C—, HO—, H2N—, HOOC—, NaOOC—, AcO—
 *   right of attachment: —CH3, —OH, —NH2, —COOH, —COONa, —OAc
 *
 * Abbreviations without an attachment glyph (Me, Ph, Boc) stay LTR and are
 * shifted as a block so the inward edge meets the atom.
 */
import { matchOrganicElementAt } from './atomDisplayColor';

export type OrientedFormulaLabel = {
  /** Reading-order display string (H3C or CH3). */
  text: string;
  /** UTF-16 index of the attachment glyph in `text`. */
  headIndex: number;
  /** Attachment token (`C`, `O`, `Na`, …). Empty in block mode. */
  head: string;
  tailGoesLeft: boolean;
  /**
   * `formula`: reverse around the attachment atom.
   * `block`: keep LTR (Me / Ph); caller places the box on the free side.
   */
  mode: 'formula' | 'block';
};

/** Organic abbreviations that must stay one token (not Ac=actinium, Me=Meitnerium). */
const ABBREV_UNITS = [
  'Fmoc',
  'Cbz',
  'Boc',
  'tBu',
  'nBu',
  'iPr',
  'nPr',
  'Me',
  'Et',
  'Ph',
  'Ac',
  'Bn',
  'Ts',
  'Ms',
  'Tf',
  'Ns',
  'Ar',
  'Cy',
].sort((a, b) => b.length - a.length || a.localeCompare(b));

const matchAbbrevAt = (s: string, i: number): number => {
  const rest = s.slice(i);
  for (const u of ABBREV_UNITS) {
    if (rest.length < u.length) continue;
    if (rest.slice(0, u.length).toLowerCase() === u.toLowerCase()) {
      const after = rest[u.length];
      if (after && /[a-z]/.test(after) && /[a-z]/.test(u[u.length - 1]!)) continue;
      return u.length;
    }
  }
  return 0;
};

const unitElement = (token: string): string => {
  const m = token.match(/^([A-Za-z]{1,2})/);
  if (!m) return '';
  const el = matchOrganicElementAt(m[1]!, 0);
  return el && el.length === m[1]!.length ? el.element : '';
};

const unitIsAttachment = (token: string, attachment: string): boolean =>
  unitElement(token).toUpperCase() === attachment.toUpperCase();

/**
 * Split a condensed / alias formula into reverseable units (`CH3` → C, H3).
 */
export function tokenizeFormulaUnits(raw: string): string[] {
  const s = raw.trim();
  const units: string[] = [];
  let i = 0;
  while (i < s.length) {
    const abbrevLen = matchAbbrevAt(s, i);
    if (abbrevLen > 0) {
      units.push(s.slice(i, i + abbrevLen));
      i += abbrevLen;
      continue;
    }
    const el = matchOrganicElementAt(s, i);
    if (el) {
      let text = s.slice(i, i + el.length);
      i += el.length;
      while (i < s.length && /\d/.test(s[i]!)) {
        text += s[i];
        i += 1;
      }
      units.push(text);
      continue;
    }
    if (/\d/.test(s[i]!)) {
      let ds = s[i]!;
      i += 1;
      while (i < s.length && /\d/.test(s[i]!)) {
        ds += s[i];
        i += 1;
      }
      if (units.length > 0) units[units.length - 1] += ds;
      else units.push(ds);
      continue;
    }
    units.push(s[i]!);
    i += 1;
  }
  return units;
}

const findAttachmentHeadIndex = (units: string[], attachment: string): number => {
  if (!attachment) return -1;
  return units.findIndex(u => unitIsAttachment(u, attachment));
};

/**
 * Bonding atom of a condensed / alias formula when the parent element is not
 * in the text (NH2 written on carbon → N). Hydrogen prefixes (H2N, HO, HOOC)
 * are not the attachment. Abbreviations with no element glyph (Ph, Me, Boc)
 * return ''.
 */
const inferFormulaAttachmentElement = (units: string[]): string => {
  const elements = units.map(unitElement).filter(Boolean);
  const heavy = elements.find(el => el.toUpperCase() !== 'H');
  return heavy ?? '';
};

/**
 * Re-order a condensed / alias formula so the attachment atom is toward the
 * parent bond and the rest of the group reads away from it.
 */
export function orientFormulaLabel(
  raw: string,
  attachmentElement: string,
  tailGoesLeft: boolean,
): OrientedFormulaLabel {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { text: '', headIndex: 0, head: '', tailGoesLeft, mode: 'block' };
  }

  const units = tokenizeFormulaUnits(trimmed);
  const hasParen = units.some(u => u === '(' || u === ')');
  let headI = hasParen ? -1 : findAttachmentHeadIndex(units, attachmentElement);
  // Parent carbon often carries NH2 / NO2 / OMe. The bonding glyph is the
  // group's own atom (N, O, …), not the carbon the label is stored on.
  if (headI < 0 && !hasParen) {
    const inferred = inferFormulaAttachmentElement(units);
    if (inferred) {
      const alt = findAttachmentHeadIndex(units, inferred);
      if (alt >= 0) headI = alt;
    }
  }

  if (headI < 0) {
    return {
      text: trimmed,
      headIndex: 0,
      head: '',
      tailGoesLeft,
      mode: 'block',
    };
  }

  const prefix = units.slice(0, headI);
  const head = units[headI]!;
  const suffix = units.slice(headI + 1);
  const out = tailGoesLeft
    ? [...[...suffix].reverse(), ...prefix, head]
    : [head, ...suffix, ...[...prefix].reverse()];
  const text = out.join('');
  const headIndex = tailGoesLeft
    ? [...suffix].reverse().join('').length + prefix.join('').length
    : 0;

  return { text, headIndex, head, tailGoesLeft, mode: 'formula' };
}

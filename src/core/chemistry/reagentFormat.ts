/**
 * Reaction-arrow label display: plain text, auto chemistry (unicode subscripts),
 * and LaTeX-oriented stripping for canvas (KaTeX preview lives in the UI).
 */

export type ReagentFormatMode = 'plain' | 'auto' | 'latex';

const SUB = '₀₁₂₃₄₅₆₇₈₉';

function digitToSub(d: string): string {
  const n = parseInt(d, 10);
  return Number.isNaN(n) || n > 9 ? d : SUB[n]!;
}

/** Convert numeric sequences after element symbols to unicode subscripts (H2SO4 → H₂SO₄). */
export function formatChemistryUnicode(text: string): string {
  if (!text.trim()) return text;
  const s = text.replace(/\\ce\{([^}]*)\}/g, (_, inner: string) => formatChemTokens(inner.trim()));
  const parts = s.split(/(\s+)/);
  return parts.map(part => (/\s+/.test(part) ? part : formatChemTokens(part))).join('');
}

/** Tokens separated by · • • intermediates — keep operators as separators */
function formatChemTokens(segment: string): string {
  if (!segment) return segment;
  const opSplit = segment.split(/([·•⋅])/);
  return opSplit.map(tok => (/^[·•⋅]$/.test(tok) ? tok : applyElementSubscripts(tok))).join('');
}

/** Apply subscripts to [Element][digits]+ repeating */
function applyElementSubscripts(s: string): string {
  return s.replace(/([A-Z][a-z]?)(\d+)/g, (_, el: string, nums: string) => {
    const subs = nums.split('').map((ch: string) => digitToSub(ch)).join('');
    return el + subs;
  });
}

/** Strip lightweight LaTeX / math for canvas fallbacks (readable unicode). */
export function simplifyLatexLikeForCanvas(text: string): string {
  let s = text.trim();
  s = s.replace(/\$\s*([^$]+)\s*\$/g, '$1');
  s = s.replace(/\\mathrm\{([^}]*)\}/g, '$1');
  s = s.replace(/\\text\{([^}]*)\}/g, '$1');
  s = s.replace(/\\ce\{([^}]*)\}/g, (_, inner: string) => formatChemistryUnicode(inner));
  const SUP = '⁰¹²³⁴⁵⁶⁷⁸⁹';
  s = s.replace(/\^(\d)/g, (_, d: string) => {
    const n = parseInt(d, 10);
    return Number.isNaN(n) || n > 9 ? d : SUP[n]!;
  });
  return formatChemistryUnicode(s);
}

/** Whether input looks like raw chemistry (digits touching symbols). */
export function looksLikeChemistryFormula(line: string): boolean {
  return /[A-Z][a-z]?\d|[A-Z]{2,}\d|\\ce\{/.test(line);
}

export function formatReagentLineForCanvas(
  line: string,
  mode: ReagentFormatMode | undefined,
): string {
  const m = mode ?? 'auto';
  if (m === 'plain') return line;
  if (m === 'latex') return simplifyLatexLikeForCanvas(line);
  if (m === 'auto') {
    const t = line.trim();
    if (!t) return line;
    if (looksLikeChemistryFormula(t) || /\\ce\{/.test(t)) return formatChemistryUnicode(t);
    return line;
  }
  return line;
}

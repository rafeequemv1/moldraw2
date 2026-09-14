/**
 * DOM-free text metrics for headless SVG export (Node / MCP / HTTP).
 *
 * When no `<canvas>` is available, `SvgExportContext.measureText` falls back to
 * these tables: per-glyph advance widths (1/1000 em) for the two font classes
 * the editor ships with (Helvetica/Arial-like sans and Times-like serif),
 * scaled linearly by font size. Unknown glyphs fall back to a per-class average.
 *
 * Accuracy is "good enough for label layout" (a few percent), not typographic.
 */

export type HeadlessFontSpec = {
  /** Font size in CSS px. */
  sizePx: number;
  bold: boolean;
  /** Times-like proportions when true; Helvetica-like otherwise. */
  serif: boolean;
};

/** Helvetica AFM advance widths (1/1000 em) for printable ASCII 0x20–0x7E. */
const SANS_ASCII: readonly number[] = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, // ' '..'/'
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, // 0-9
  278, 278, 584, 584, 584, 556, 1015, // : ; < = > ? @
  667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, // A-P
  778, 722, 667, 611, 722, 667, 944, 667, 667, 611, // Q-Z
  278, 278, 278, 469, 556, 333, // [ \ ] ^ _ `
  556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, // a-p
  556, 333, 500, 278, 556, 500, 722, 500, 500, 500, // q-z
  334, 260, 334, 584, // { | } ~
];

/** Times-Roman AFM advance widths (1/1000 em) for printable ASCII 0x20–0x7E. */
const SERIF_ASCII: readonly number[] = [
  250, 333, 408, 500, 500, 833, 778, 180, 333, 333, 500, 564, 250, 333, 250, 278, // ' '..'/'
  500, 500, 500, 500, 500, 500, 500, 500, 500, 500, // 0-9
  278, 278, 564, 564, 564, 444, 921, // : ; < = > ? @
  722, 667, 667, 722, 611, 556, 722, 722, 333, 389, 722, 611, 889, 722, 722, 556, // A-P
  722, 667, 556, 611, 722, 722, 944, 722, 722, 611, // Q-Z
  333, 278, 333, 469, 500, 333, // [ \ ] ^ _ `
  444, 500, 444, 500, 444, 333, 500, 500, 278, 278, 500, 278, 778, 500, 500, 500, // a-p
  500, 333, 389, 278, 500, 500, 722, 500, 500, 444, // q-z
  480, 200, 480, 541, // { | } ~
];

type VerticalMetrics = {
  /** Cap height (H, digits). */
  cap: number;
  /** x-height (a, c, e …). */
  xHeight: number;
  /** Ascender height (b, d, f, h, k, l, t). */
  ascender: number;
  /** Descender depth (g, j, p, q, y). */
  descender: number;
  /** Font-box ascent / descent (line box). */
  boxAscent: number;
  boxDescent: number;
};

const SANS_VERTICAL: VerticalMetrics = {
  cap: 0.718,
  xHeight: 0.523,
  ascender: 0.718,
  descender: 0.207,
  boxAscent: 0.905,
  boxDescent: 0.212,
};

const SERIF_VERTICAL: VerticalMetrics = {
  cap: 0.662,
  xHeight: 0.45,
  ascender: 0.683,
  descender: 0.217,
  boxAscent: 0.891,
  boxDescent: 0.216,
};

/** Bold faces are ~5–7 % wider in both families. */
const BOLD_WIDTH_FACTOR = 1.06;

/** Per-class fallback advances (1/1000 em) for non-ASCII glyphs. */
function fallbackAdvance(ch: string, serif: boolean): number {
  const code = ch.codePointAt(0) ?? 0;
  // Sub/superscript digits and signs (₀–₉, ⁰–⁹, ⁺ ⁻ ₊ ₋).
  if ((code >= 0x2080 && code <= 0x209c) || (code >= 0x2070 && code <= 0x207f)) {
    return serif ? 330 : 360;
  }
  // Greek letters (α, β, δ, π …).
  if (code >= 0x0370 && code <= 0x03ff) return serif ? 520 : 580;
  // Common typographic punctuation: en dash, bullets, degree, ±, ·, ×, →, ⇌.
  if (code === 0x2013) return 500; // –
  if (code === 0x2014) return 1000; // —
  if (code === 0x00b0 || code === 0x00b7) return 400; // ° ·
  if (code === 0x00b1 || code === 0x00d7 || code === 0x2212) return serif ? 564 : 584; // ± × −
  if (code >= 0x2190 && code <= 0x21ff) return 1000; // arrows
  // Latin-1 / Latin Extended letters — treat like their base class.
  if (code >= 0x00c0 && code <= 0x024f) {
    return ch === ch.toUpperCase() ? (serif ? 690 : 700) : serif ? 480 : 540;
  }
  // CJK and full-width forms.
  if (code >= 0x3000 && code <= 0x9fff) return 1000;
  if (code >= 0xff00 && code <= 0xffef) return 1000;
  // Generic average glyph.
  return serif ? 500 : 556;
}

function advance1000(ch: string, spec: HeadlessFontSpec): number {
  const code = ch.codePointAt(0) ?? 0;
  const table = spec.serif ? SERIF_ASCII : SANS_ASCII;
  let w: number;
  if (code >= 0x20 && code <= 0x7e) {
    w = table[code - 0x20] ?? (spec.serif ? 500 : 556);
  } else if (code === 0x00a0) {
    w = table[0]!; // nbsp
  } else if (code === 0x09) {
    w = table[0]! * 4;
  } else if (code < 0x20) {
    w = 0;
  } else {
    w = fallbackAdvance(ch, spec.serif);
  }
  return spec.bold ? w * BOLD_WIDTH_FACTOR : w;
}

/** Advance width of `text` in CSS px. */
export function headlessTextWidth(text: string, spec: HeadlessFontSpec): number {
  let total = 0;
  for (const ch of text) total += advance1000(ch, spec);
  return (total / 1000) * spec.sizePx;
}

const DESCENDER_CHARS = /[gjpqy,;()[\]{}@_|\u00b5\u03b2\u03b3\u03b6\u03b7\u03bc\u03be\u03c1\u03c6\u03c7\u03c8\u2080-\u209c]/u;
const ASCENDER_CHARS = /[bdfhklt!?'"|(){}[\]/\\#$%&*0-9@\u00c0-\u00de\u0391-\u03a9]/u;
const XHEIGHT_ONLY = /^[acegm-su-z\u03b1\u03b5\u03b9\u03ba\u03bd\u03bf\u03c0\u03c3\u03c4\u03c5\u03c9\u2080-\u209c.,:;\-–—·°±×=+\s]*$/u;

/** Tight (actual) ink extents above / below the alphabetic baseline, in CSS px. */
export function headlessVerticalExtents(
  text: string,
  spec: HeadlessFontSpec,
): { ascent: number; descent: number } {
  const v = spec.serif ? SERIF_VERTICAL : SANS_VERTICAL;
  const sample = text.length ? text : 'Hg';
  let ascentEm: number;
  if (/[A-Z\u00c0-\u00de\u0391-\u03a9]/u.test(sample)) {
    ascentEm = v.cap;
  } else if (ASCENDER_CHARS.test(sample)) {
    ascentEm = v.ascender;
  } else if (XHEIGHT_ONLY.test(sample)) {
    ascentEm = v.xHeight;
  } else {
    ascentEm = v.cap;
  }
  // Sub/superscript digits sit low / high; keep them inside the cap box.
  if (/[\u2070-\u207f]/u.test(sample)) ascentEm = Math.max(ascentEm, v.cap);
  const descentEm = DESCENDER_CHARS.test(sample) ? v.descender : 0.012;
  return { ascent: ascentEm * spec.sizePx, descent: descentEm * spec.sizePx };
}

/**
 * Full `TextMetrics`-shaped record for `CanvasRenderingContext2D.measureText`
 * emulation (textAlign is assumed `left`/`start`; callers using `center`
 * only read `width` and the vertical fields).
 */
export function headlessTextMetrics(text: string, spec: HeadlessFontSpec): TextMetrics {
  const width = headlessTextWidth(text, spec);
  const { ascent, descent } = headlessVerticalExtents(text, spec);
  const v = spec.serif ? SERIF_VERTICAL : SANS_VERTICAL;
  const boxAscent = v.boxAscent * spec.sizePx;
  const boxDescent = v.boxDescent * spec.sizePx;
  const m = {
    width,
    actualBoundingBoxLeft: 0,
    actualBoundingBoxRight: width,
    actualBoundingBoxAscent: ascent,
    actualBoundingBoxDescent: descent,
    fontBoundingBoxAscent: boxAscent,
    fontBoundingBoxDescent: boxDescent,
    emHeightAscent: boxAscent,
    emHeightDescent: boxDescent,
    hangingBaseline: v.cap * spec.sizePx,
    alphabeticBaseline: 0,
    ideographicBaseline: -boxDescent,
  };
  return m as unknown as TextMetrics;
}

const PT_TO_PX = 96 / 72;

/**
 * Parse a CSS `font` shorthand (as set on a canvas context) into the
 * size / weight / family class the tables need. Tolerates `pt`, `em`, and
 * `rem` sizes and generic-family keywords.
 */
export function fontSpecFromCss(font: string): HeadlessFontSpec {
  const src = font.trim();
  const bold = /\b(bold|bolder|[6-9]00)\b/i.test(src.replace(/\d+(\.\d+)?(px|pt|em|rem)/i, ''));
  const sizeMatch = /(\d+(?:\.\d+)?)(px|pt|em|rem)\b/i.exec(src);
  let sizePx = 16;
  if (sizeMatch) {
    const n = parseFloat(sizeMatch[1]!);
    const unit = sizeMatch[2]!.toLowerCase();
    sizePx = unit === 'pt' ? n * PT_TO_PX : unit === 'px' ? n : n * 16;
  }
  const family = sizeMatch ? src.slice(sizeMatch.index + sizeMatch[0].length) : src;
  const firstFamily = family.split(',')[0]?.trim().replace(/^["']|["']$/g, '') ?? '';
  const serif =
    /^(times( new roman)?|georgia|garamond|cambria|palatino|book antiqua|baskerville|serif)$/i.test(
      firstFamily,
    );
  return { sizePx, bold, serif };
}

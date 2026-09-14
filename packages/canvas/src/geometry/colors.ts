/**
 * Color helpers used by canvas rendering (translucent ring fills, etc.).
 */

const parseHexRgb = (hex: string): { r: number; g: number; b: number } | null => {
  let h = hex.replace('#', '').trim();
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  if (h.length !== 6) return null;
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
};

/** Convert a 3- or 6-digit hex color to an `rgba(r,g,b,a)` string. */
export const hexToRgba = (hex: string, alpha: number): string => {
  const rgb = parseHexRgb(hex);
  const a = Math.min(1, Math.max(0, alpha));
  if (!rgb) return `rgba(15,23,42,${a})`;
  return `rgba(${rgb.r},${rgb.g},${rgb.b},${a})`;
};

/** Mix a hex color toward white (`amount` 0–1). Used for highlighter fills. */
export const mixHexTowardWhite = (hex: string, amount: number): string => {
  const rgb = parseHexRgb(hex);
  const t = Math.min(1, Math.max(0, amount));
  if (!rgb) return '#bfdbfe';
  const mix = (c: number) => Math.round(c + (255 - c) * t);
  const toHex = (c: number) => mix(c).toString(16).padStart(2, '0');
  return `#${toHex(rgb.r)}${toHex(rgb.g)}${toHex(rgb.b)}`;
};

/**
 * Color helpers used by canvas rendering (translucent ring fills, etc.).
 */

/** Convert a 3- or 6-digit hex color to an `rgba(r,g,b,a)` string. */
export const hexToRgba = (hex: string, alpha: number): string => {
  let h = hex.replace('#', '').trim();
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  if (h.length !== 6) return `rgba(15,23,42,${alpha})`;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const a = Math.min(1, Math.max(0, alpha));
  return `rgba(${r},${g},${b},${a})`;
};

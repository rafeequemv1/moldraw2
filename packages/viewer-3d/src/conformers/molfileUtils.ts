/**
 * Normalize OpenChemLib molfile strings (may use `\r` only) to LF V2000 text.
 */
export const normalizeOclMolfile = (raw: string): string => {
  const text = String(raw ?? '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .trim();
  if (!text) return '';
  return text.endsWith('\n') ? text : `${text}\n`;
};

/** Count non-hydrogen atoms in a V2000 molblock (best-effort). */
export const countHeavyAtomsInMolblock = (molblock: string): number => {
  const lines = normalizeOclMolfile(molblock).split('\n');
  const countsIdx = lines.findIndex(l => l.includes('V2000') || l.includes('V3000'));
  if (countsIdx < 0) return 0;
  const n = parseInt(lines[countsIdx]!.substring(0, 3).trim() || '0', 10);
  if (!Number.isFinite(n) || n <= 0) return 0;
  let heavy = 0;
  for (let i = 0; i < n; i++) {
    const line = lines[countsIdx + 1 + i] ?? '';
    const parts = line.trim().split(/\s+/);
    const el =
      parts.length >= 4 && /^[A-Za-z*]{1,3}$/.test(parts[3]!)
        ? parts[3]!
        : line.substring(31, 34).trim();
    if (el && el !== 'H' && el !== 'D' && el !== 'T') heavy += 1;
  }
  return heavy;
};

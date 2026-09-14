/**
 * Locate the V2000/V3000 counts line in a molfile/SDF record.
 *
 * PubChem/OEChem sometimes omit one or more of the three header lines, so the
 * counts line is not always at index 3. Returns -1 when no counts line is found.
 */
export function findMolfileCountsLineIndex(lines: string[]): number {
  for (let i = 0; i < Math.min(lines.length, 32); i++) {
    const line = lines[i];
    if (!line) continue;
    if (/V2000|V3000/i.test(line)) return i;
  }
  // Fallback: first line that looks like "aaaabbb …" atom/bond counts.
  for (let i = 0; i < Math.min(lines.length, 32); i++) {
    const line = lines[i];
    if (!line) continue;
    const atoms = parseInt(line.substring(0, 3).trim() || '', 10);
    const bonds = parseInt(line.substring(3, 6).trim() || '', 10);
    if (Number.isFinite(atoms) && atoms > 0 && Number.isFinite(bonds) && bonds >= 0) {
      return i;
    }
  }
  return -1;
}

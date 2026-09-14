/** Repair V2000 bond rows where atom indices were concatenated (e.g. `1168` → 1–168). */
export function normalizeMolBondLines(molblock: string, maxAtoms = 999): string {
  const lines = molblock.replace(/\r\n/g, '\n').split('\n');
  const countsIdx = lines.findIndex(l => /V2000|V3000/i.test(l));
  if (countsIdx < 0) return molblock;

  const countsLine = lines[countsIdx]!;
  const numAtoms = parseInt(countsLine.substring(0, 3).trim() || '0', 10);
  const numBonds = parseInt(countsLine.substring(3, 6).trim() || '0', 10);
  if (!Number.isFinite(numAtoms) || numAtoms <= 0 || !Number.isFinite(numBonds) || numBonds < 0) {
    return molblock;
  }

  const bondStart = countsIdx + 1 + numAtoms;
  const atomMax = Math.min(maxAtoms, numAtoms);

  const splitIndices = (token: string): [number, number] | null => {
    const n = parseInt(token, 10);
    if (!Number.isFinite(n) || n <= atomMax) return null;
    const s = String(n);
    for (let i = 1; i < s.length; i++) {
      const a = parseInt(s.slice(0, i), 10);
      const b = parseInt(s.slice(i), 10);
      if (a >= 1 && a <= atomMax && b >= 1 && b <= atomMax) return [a, b];
    }
    return null;
  };

  for (let i = 0; i < numBonds; i++) {
    const idx = bondStart + i;
    const line = lines[idx];
    if (!line?.trim()) continue;

    const parts = line.trim().split(/\s+/);
    const first = parseInt(parts[0] ?? '', 10);
    const second = parseInt(parts[1] ?? '', 10);
    if (first >= 1 && first <= atomMax && second >= 1 && second <= atomMax) continue;

    const split = splitIndices(parts[0] ?? '');
    if (!split) continue;

    const order = parseInt(parts[1] ?? '1', 10);
    const stereo = parts[2] ?? '0';
    const rest = parts.slice(3).join(' ') || '0  0  0';
    lines[idx] =
      `${String(split[0]).padStart(3)}${String(split[1]).padStart(3)}${String(order).padStart(3)}  ${stereo}  ${rest}`;
  }

  return lines.join('\n');
}

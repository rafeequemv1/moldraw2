/**
 * Detect whether a V2000 molblock has non-flat 3D coordinates (any |z| > eps).
 */
import { normalizeOclMolfile } from '../conformers/molfileUtils';

const Z_EPS = 1e-3;

export const molblockHas3dCoords = (molblock: string): boolean => {
  const lines = normalizeOclMolfile(molblock).split('\n');
  const countsIdx = lines.findIndex(l => l.includes('V2000') || l.includes('V3000'));
  if (countsIdx < 0) return false;
  const n = parseInt(lines[countsIdx]!.substring(0, 3).trim() || '0', 10);
  if (!Number.isFinite(n) || n <= 0) return false;
  for (let i = 0; i < n; i++) {
    const line = lines[countsIdx + 1 + i] ?? '';
    // V2000: x y z in fixed columns 0–30, or whitespace-split first three floats.
    const parts = line.trim().split(/\s+/);
    let z = NaN;
    if (parts.length >= 3 && /^-?\d/.test(parts[0]!) && /^-?\d/.test(parts[1]!)) {
      z = parseFloat(parts[2]!);
    } else if (line.length >= 30) {
      z = parseFloat(line.substring(20, 30).trim());
    }
    if (Number.isFinite(z) && Math.abs(z) > Z_EPS) return true;
  }
  return false;
};

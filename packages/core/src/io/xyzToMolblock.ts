import { buildV2000Molblock, type MolblockAtomRow, type MolblockBondRow } from './buildV2000Molblock';
import { perceiveBondsFromAtomRows } from './perceiveBondsFromCoords';

/**
 * Parse XYZ text into a V2000 molblock.
 * Preserves Z when present (Å). Centers in XY.
 * Perceives bonds from covalent radii (XYZ has no connectivity).
 *
 * Standard XYZ: N, comment, then N atom lines (element x y z).
 */
export function xyzTextToMolblock(text: string): string | null {
  const lines = text
    .trim()
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(l => l.length > 0 && !l.startsWith('#'));
  if (lines.length < 2) return null;

  let atomStart = 0;
  const nHeader = parseInt(lines[0]!, 10);
  if (Number.isFinite(nHeader) && nHeader > 0) {
    // Prefer classic XYZ: count, comment, atoms.
    if (lines.length >= 2 + nHeader) {
      atomStart = 2;
    } else if (lines.length >= 1 + nHeader) {
      atomStart = 1;
    } else {
      return null;
    }
  } else {
    atomStart = 0;
  }

  const expected =
    Number.isFinite(nHeader) && nHeader > 0 ? nHeader : lines.length - atomStart;
  const rows: MolblockAtomRow[] = [];
  for (let i = 0; i < expected; i++) {
    const line = lines[atomStart + i];
    if (!line) break;
    const tok = line.split(/\s+/).filter(Boolean);
    if (tok.length < 3) continue;
    const sym = normalizeElement(tok[0]!);
    if (!sym) continue;
    const x = parseFloat(tok[1]!);
    const y = parseFloat(tok[2]!);
    const z = tok.length >= 4 ? parseFloat(tok[3]!) : 0;
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    rows.push({
      element: sym,
      x,
      y,
      z: Number.isFinite(z) ? z : 0,
    });
  }
  if (rows.length === 0) return null;

  const xs = rows.map(r => r.x);
  const ys = rows.map(r => r.y);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
  const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  const centered = rows.map(r => ({
    element: r.element,
    x: r.x - cx,
    y: r.y - cy,
    z: r.z ?? 0,
  }));

  const bonds: MolblockBondRow[] = perceiveBondsFromAtomRows(centered);
  return buildV2000Molblock(centered, bonds);
}

function normalizeElement(raw: string): string {
  const t = raw.replace(/[^A-Za-z]/g, '');
  if (!t) return '';
  if (t.length === 1) return t.toUpperCase();
  return t[0]!.toUpperCase() + t.slice(1).toLowerCase();
}

/**
 * Convert an MDL MOL V2000 block with 3D coordinates to XYZ text (Å).
 */
export function molblock3dToXyz(molblock: string, title: string): string {
  const atoms = parseMolblockAtoms3d(molblock);
  if (atoms.length === 0) return '';
  const comment = title.replace(/\s+/g, ' ').trim().slice(0, 200) || 'structure';
  const body = atoms
    .map(a => `${a.sym.padEnd(3)} ${fmt(a.x)} ${fmt(a.y)} ${fmt(a.z)}`)
    .join('\n');
  return `${atoms.length}\n${comment}\n${body}\n`;
}

export type Atom3d = { sym: string; x: number; y: number; z: number };

export function parseMolblockAtoms3d(molblock: string): Atom3d[] {
  const lines = molblock.split(/\r?\n/);
  if (lines.length < 5) return [];
  const countsLine = lines[3]?.trim() ?? '';
  const parts = countsLine.split(/\s+/).filter(Boolean);
  const numAtoms = parseInt(parts[0] || '0', 10);
  if (!Number.isFinite(numAtoms) || numAtoms <= 0) return [];
  const atoms: Atom3d[] = [];
  for (let i = 0; i < numAtoms; i++) {
    const line = lines[4 + i];
    if (!line) break;
    const atom = parseAtomLine(line);
    if (atom) atoms.push(atom);
  }
  return atoms;
}

function fmt(n: number): string {
  const s = n.toFixed(6);
  return s === '-0.000000' ? '0.000000' : s;
}

function parseAtomLine(line: string): Atom3d | null {
  const trimmed = line.trim();
  const tok = trimmed.split(/\s+/);
  if (tok.length >= 4) {
    const x = parseFloat(tok[0]!);
    const y = parseFloat(tok[1]!);
    const z = parseFloat(tok[2]!);
    const sym = normalizeElement(tok[3]!);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z) || !sym) return null;
    return { sym, x, y, z };
  }
  const x = parseFloat(line.substring(0, 10));
  const y = parseFloat(line.substring(10, 20));
  const z = parseFloat(line.substring(20, 30));
  const sym = normalizeElement(line.substring(31, 34).trim());
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z) || !sym) return null;
  return { sym, x, y, z };
}

function normalizeElement(raw: string): string {
  const t = raw.replace(/[^A-Za-z]/g, '');
  if (!t) return '';
  return t[0]!.toUpperCase() + (t.length > 1 ? t.slice(1).toLowerCase() : '');
}

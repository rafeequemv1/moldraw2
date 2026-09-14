import { parseMolblockAtoms3d } from './molblockToXyz';

/** Wavefront OBJ — atom vertices + bond edges when bonds are present in the molblock. */
export function molblockToObj(molblock: string, title: string): string {
  const atoms = parseMolblockAtoms3d(molblock);
  if (atoms.length === 0) return '';
  const bonds = parseMolblockBonds(molblock);
  const lines: string[] = [
    `# Moldraw OBJ — ${title.replace(/\s+/g, ' ').trim() || 'structure'}`,
    `o ${sanitize(title) || 'molecule'}`,
  ];
  for (const a of atoms) {
    lines.push(`v ${a.x.toFixed(6)} ${a.y.toFixed(6)} ${a.z.toFixed(6)}`);
  }
  for (const [i, j] of bonds) {
    lines.push(`l ${i + 1} ${j + 1}`);
  }
  return `${lines.join('\n')}\n`;
}

function sanitize(s: string): string {
  return s.replace(/[^\w.\-]+/g, '_').slice(0, 64);
}

function parseMolblockBonds(molblock: string): Array<[number, number]> {
  const lines = molblock.split(/\r?\n/);
  if (lines.length < 5) return [];
  const counts = (lines[3]?.trim() ?? '').split(/\s+/).filter(Boolean);
  const nAtoms = parseInt(counts[0] || '0', 10);
  const nBonds = parseInt(counts[1] || '0', 10);
  if (!Number.isFinite(nAtoms) || !Number.isFinite(nBonds) || nBonds <= 0) return [];
  const out: Array<[number, number]> = [];
  for (let i = 0; i < nBonds; i++) {
    const line = lines[4 + nAtoms + i];
    if (!line) break;
    const from = parseInt(line.substring(0, 3).trim(), 10) - 1;
    const to = parseInt(line.substring(3, 6).trim(), 10) - 1;
    if (Number.isFinite(from) && Number.isFinite(to) && from >= 0 && to >= 0) {
      out.push([from, to]);
    }
  }
  return out;
}

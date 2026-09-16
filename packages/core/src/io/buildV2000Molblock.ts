/**
 * Build a minimal MDL V2000 molblock from atom/bond tables (Å coordinates, y up).
 */
import { molfileBondOrder, molfileBondStereoCode } from '@moldraw/domain';

export type MolblockAtomRow = { element: string; x: number; y: number; z?: number };
export type MolblockBondRow = {
  from: number;
  to: number;
  order: number;
  stereo?: 'wedge' | 'dash' | 'wavy' | 'either' | 'cis_trans';
  /** When true, written as molfile bond type 4 (aromatic). */
  aromatic?: boolean;
  queryType?: 'any' | 'single_double' | 'single_aromatic' | 'double_aromatic';
};

export function buildV2000Molblock(atoms: MolblockAtomRow[], bonds: MolblockBondRow[]): string {
  const n = atoms.length;
  const m = bonds.length;
  let out = 'MolDraw\n  Moldraw\n\n';
  out += `${String(n).padStart(3, ' ')}${String(m).padStart(3, ' ')}  0  0  0  0  0  0  0  0999 V2000\n`;
  for (const a of atoms) {
    const x = a.x.toFixed(4).padStart(10, ' ');
    const y = a.y.toFixed(4).padStart(10, ' ');
    const z = (a.z ?? 0).toFixed(4).padStart(10, ' ');
    const sym = a.element.padEnd(3, ' ');
    out += `${x}${y}${z} ${sym} 0  0  0  0  0  0  0  0  0  0  0  0\n`;
  }
  for (const b of bonds) {
    const from = String(b.from + 1).padStart(3, ' ');
    const to = String(b.to + 1).padStart(3, ' ');
    const order = String(molfileBondOrder(b)).padStart(3, ' ');
    const stereo = String(molfileBondStereoCode(b)).padStart(3, ' ');
    out += `${from}${to}${order}${stereo}  0  0  0\n`;
  }
  out += 'M  END\n';
  return out;
}

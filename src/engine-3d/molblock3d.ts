/**
 * V2000 molblock writer for 3D conformers. Coordinates are written directly in
 * Ångström (no scaling, no Y flip) since the 3D viewer consumes Å.
 */
import type { Bond } from '@moldraw/domain';
import { normalizeElementSymbol } from '@moldraw/engine/data/periodicTable';
import type { Atom3D, Conformer } from './embed';

const pad = (s: string | number, n: number): string => String(s).padStart(n, ' ');
const fixed = (val: number): string => val.toFixed(4).padStart(10, ' ');

export const conformerToMolblock3D = (conf: Conformer, title = 'MolDraw3D'): string => {
  let out = `${title}\n  MolDrawEngine 3D\n\n`;
  out += `${pad(conf.atoms.length, 3)}${pad(conf.bonds.length, 3)}  0  0  0  0  0  0  0  0999 V2000\n`;

  const idToIndex = new Map<string, number>();
  conf.atoms.forEach((a: Atom3D, i) => {
    idToIndex.set(a.id, i + 1);
    const symbol = normalizeElementSymbol(a.element).padEnd(3, ' ');
    out += `${fixed(a.pos.x)}${fixed(a.pos.y)}${fixed(a.pos.z)} ${symbol} 0  0  0  0  0  0  0  0  0  0  0  0\n`;
  });

  conf.bonds.forEach((b: Bond) => {
    const from = pad(idToIndex.get(b.fromAtomId) ?? 0, 3);
    const to = pad(idToIndex.get(b.toAtomId) ?? 0, 3);
    const order = pad(b.aromatic ? 4 : b.order, 3);
    out += `${from}${to}${order}  0  0  0  0\n`;
  });

  conf.atoms.forEach((a, i) => {
    if (a.charge && a.charge !== 0) {
      out += `M  CHG  1 ${pad(i + 1, 3)} ${pad(a.charge, 3)}\n`;
    }
  });
  conf.atoms.forEach((a, i) => {
    if (a.isotope && a.isotope > 0) {
      out += `M  ISO  1 ${pad(i + 1, 3)} ${pad(Math.trunc(a.isotope), 3)}\n`;
    }
  });

  out += 'M  END\n';
  return out;
};

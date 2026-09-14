import { moleculeToMolblock } from '../io/molblock';
import { getMofBuilder } from './registry';

/** 1×1 pore molblock for library cards — authored 2D, not a 3D embed. */
export function mofPreviewMolblock(presetId: string): string | null {
  const builder = getMofBuilder(presetId);
  if (!builder) return null;
  const sheet = builder({ cols: 1, rows: 1, layers: 1, bondLength: 40, cx: 0, cy: 0 });
  if (sheet.atoms.length === 0) return null;
  return moleculeToMolblock({ atoms: sheet.atoms, bonds: sheet.bonds });
}

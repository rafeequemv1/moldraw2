import { moleculeToMolblock } from '../io/molblock';
import { getPolymerBuilder } from './registry';

/** Authored 2D molblock for library cards (SRU brackets are canvas-only). */
export function polymerPreviewMolblock(presetId: string): string | null {
  const builder = getPolymerBuilder(presetId);
  if (!builder) return null;
  const sheet = builder({ bondLength: 40, cx: 0, cy: 0 });
  if (sheet.atoms.length === 0) return null;
  return moleculeToMolblock({ atoms: sheet.atoms, bonds: sheet.bonds });
}

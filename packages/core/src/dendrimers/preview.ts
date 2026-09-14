import { moleculeToMolblock } from '../io/molblock';
import { getDendrimerBuilder } from './registry';

/** Authored 2D molblock for library cards. */
export function dendrimerPreviewMolblock(presetId: string): string | null {
  const builder = getDendrimerBuilder(presetId);
  if (!builder) return null;
  const sheet = builder({ bondLength: 40, cx: 0, cy: 0 });
  if (sheet.atoms.length === 0) return null;
  return moleculeToMolblock({ atoms: sheet.atoms, bonds: sheet.bonds });
}

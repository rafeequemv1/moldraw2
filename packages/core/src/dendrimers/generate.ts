import type { Molecule } from '@moldraw/domain';
import { dendrimerArrayAtoms } from '../align/dendrimerArray';
import { collectAtomsAsObjectCollection } from '../molecule/arrayCollection';
import { ensureFragmentIds } from '../molecule/fragmentIds';
import { deleteAtomSelection } from '../molecule/mutations';
import { DENDRIMER_PRESET_INFO_BY_ID, getDendrimerBuilder } from './registry';
import type { GenerateDendrimerOptions, GenerateDendrimerResult } from './types';

export function generateDendrimerInMolecule(
  prev: Molecule,
  options: GenerateDendrimerOptions,
): GenerateDendrimerResult {
  const builder = getDendrimerBuilder(options.presetId);
  if (!builder) {
    return { molecule: prev, newAtomIds: [], allAtomIds: [] };
  }

  let next = prev;
  const present = new Set(prev.atoms.map(a => a.id));
  const replace = (options.replaceAtomIds ?? []).filter(id => present.has(id));
  if (replace.length > 0) {
    next = deleteAtomSelection(next, replace);
  }

  const sheet = builder({
    bondLength: Math.max(16, options.bondLength),
    cx: options.cx,
    cy: options.cy,
  });
  next = {
    ...next,
    atoms: [...next.atoms, ...sheet.atoms],
    bonds: [...next.bonds, ...sheet.bonds],
  };
  next = ensureFragmentIds(next);
  const label = DENDRIMER_PRESET_INFO_BY_ID.get(options.presetId)?.label ?? 'Dendrimer';

  if (sheet.array) {
    const arrayed = dendrimerArrayAtoms(next, sheet.atomIds, {
      foldCount: sheet.array.foldCount,
      coreAtomIds: sheet.array.coreAtomIds,
      attachmentAtomIds: sheet.array.attachmentAtomIds,
    });
    next = arrayed.molecule;
    next = collectAtomsAsObjectCollection(next, arrayed.allAtomIds, label);
    return {
      molecule: next,
      newAtomIds: arrayed.newAtomIds,
      allAtomIds: arrayed.allAtomIds,
    };
  }

  next = collectAtomsAsObjectCollection(next, sheet.atomIds, label);
  return {
    molecule: next,
    newAtomIds: sheet.atomIds,
    allAtomIds: sheet.atomIds,
  };
}

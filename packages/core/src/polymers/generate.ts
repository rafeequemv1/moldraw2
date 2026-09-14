import type { Molecule } from '@moldraw/domain';
import { collectAtomsAsObjectCollection } from '../molecule/arrayCollection';
import { ensureFragmentIds } from '../molecule/fragmentIds';
import {
  addSruBracket,
  deleteAtomSelection,
  sruBracketBoxForAtoms,
} from '../molecule/mutations';
import { POLYMER_PRESET_INFO_BY_ID, getPolymerBuilder } from './registry';
import type { GeneratePolymerOptions, GeneratePolymerResult } from './types';

const newId = () => Math.random().toString(36).slice(2, 11);

export function generatePolymerInMolecule(
  prev: Molecule,
  options: GeneratePolymerOptions,
): GeneratePolymerResult {
  const builder = getPolymerBuilder(options.presetId);
  if (!builder) {
    return { molecule: prev, newAtomIds: [], allAtomIds: [] };
  }

  let next = prev;
  const replace = (options.replaceAtomIds ?? []).filter(id => next.atoms.some(a => a.id === id));
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

  const box = sruBracketBoxForAtoms(next, sheet.atomIds);
  let sruBracketId: string | undefined;
  if (box) {
    sruBracketId = newId();
    next = addSruBracket(next, {
      id: sruBracketId,
      atomIds: sheet.atomIds,
      x1: box.x1,
      y1: box.y1,
      x2: box.x2,
      y2: box.y2,
      subscript: sheet.subscript ?? 'n',
    });
  }

  next = ensureFragmentIds(next);
  const label = POLYMER_PRESET_INFO_BY_ID.get(options.presetId)?.label ?? 'Polymer';
  next = collectAtomsAsObjectCollection(next, sheet.atomIds, label);

  return {
    molecule: next,
    newAtomIds: sheet.atomIds,
    allAtomIds: sheet.atomIds,
    sruBracketId,
  };
}

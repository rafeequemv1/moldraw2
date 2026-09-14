import type { Molecule } from '@moldraw/domain';
import { resolveAliasToSmiles } from './aliasToSmiles';
import { graftSmilesOnAtom } from './graftSmilesOnAtom';

/**
 * Replace 2D group aliases with explicit atoms/bonds for 3D (and expand-alias).
 *
 * Scalable path — no per-group geometry presets:
 *   1. `resolveAliasToSmiles` maps any text (Ph, CH2CH2COOMe, Boc, …) → SMILES
 *   2. `graftSmilesOnAtom` parses that SMILES with the native engine and grafts
 *      it onto the labeled atom (merge-first or bond-to-labeled)
 *
 * Add new abbreviations by adding a SMILES row in `aliasToSmiles.ts`.
 * Arbitrary condensed text (branches, =/#, repeats) → SMILES via
 * `condensedToSmiles` — no per-string whitelist.
 */
export const expandAliasesFor3D = (mol: Molecule, targetAtomIds?: Set<string>): Molecule => {
  let next: Molecule = {
    ...mol,
    atoms: mol.atoms.map(a => ({ ...a })),
    bonds: mol.bonds.map(b => ({ ...b })),
  };

  const aliases = next.atoms.filter(a => {
    if (!a.alias?.trim()) return false;
    if (!targetAtomIds) return true;
    return targetAtomIds.has(a.id);
  });

  for (const a of aliases) {
    const raw = a.alias?.trim();
    if (!raw) continue;

    // Re-find atom on current molecule (ids stable; object may have been replaced).
    const live = next.atoms.find(x => x.id === a.id);
    if (!live?.alias?.trim()) continue;

    const spec = resolveAliasToSmiles(raw, live.element);
    if (!spec) continue;

    if (spec.attach === 'clear' || !spec.smiles.trim()) {
      live.alias = undefined;
      continue;
    }

    const grafted = graftSmilesOnAtom(next, live.id, spec.smiles, spec.attach);
    if (grafted) next = grafted;
  }

  return next;
};

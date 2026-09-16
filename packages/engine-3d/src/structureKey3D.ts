/**
 * Structure fingerprint for 3D sync — topology + stereo + aliases.
 * Ignores 2D canvas coordinates, display colors, and atom instance ids so
 * pan/drag/recolor and selecting an identical duplicate do not rebuild 3D.
 *
 * Aromatize / dearomatize is 2D depiction only (circle vs Kekulé). Bond
 * aromatic flags and Kekulé 1/2 orders on Hückel rings are canonicalized
 * so those commands do not invalidate the 3D pose or camera.
 *
 * Aliases are included so label / FG abbrev add·edit·delete invalidate 3D even
 * before expandAliasesFor3D adds explicit atoms.
 *
 * Atom ranks are document order within the (already-focused) fragment so a
 * duplicated copy yields the same key as its source.
 */
import type { Molecule } from '@moldraw/domain';
import { perceiveAromaticity } from '@moldraw/engine';

const normalizeAliasKey = (raw: string | undefined): string => {
  if (!raw) return '';
  return raw
    .trim()
    .toUpperCase()
    .replace(/[₀-₉]/g, ch => '0123456789'['₀₁₂₃₄₅₆₇₈₉'.indexOf(ch)] ?? ch)
    .replace(/\s+/g, '');
};

/**
 * Bonds that are aromatic for 3D chemistry: already flagged, plus Kekulé
 * rings that perceiveAromaticity would mark. Used so circle vs Kekulé share
 * a fingerprint without running SSSR when every multiple bond is already flagged.
 */
export const aromaticBondIdsFor3DKey = (mol: Molecule): ReadonlySet<string> => {
  const flagged = new Set<string>();
  let hasUnflaggedMultiple = false;
  for (const b of mol.bonds) {
    if (b.aromatic) flagged.add(b.id);
    else if ((b.order ?? 1) >= 2) hasUnflaggedMultiple = true;
  }
  if (!hasUnflaggedMultiple) return flagged;
  const perceived = perceiveAromaticity(mol);
  if (perceived === mol) return flagged;
  const ids = new Set(flagged);
  for (const b of perceived.bonds) {
    if (b.aromatic) ids.add(b.id);
  }
  return ids;
};

export const structureKeyFor3D = (mol: Molecule): string => {
  const idToRank = new Map<string, number>();
  mol.atoms.forEach((a, i) => idToRank.set(a.id, i));
  const aromaticIds = aromaticBondIdsFor3DKey(mol);

  const atoms = mol.atoms
    .map((a, i) =>
      [
        i,
        a.element,
        a.charge ?? 0,
        a.isotope ?? '',
        a.chiralParity ?? '',
        normalizeAliasKey(a.alias),
      ].join(':'),
    )
    .join(';');

  const bonds = [...mol.bonds]
    .map(b => {
      const i = idToRank.get(b.fromAtomId) ?? -1;
      const j = idToRank.get(b.toAtomId) ?? -1;
      const [x, y] = i < j ? [i, j] : [j, i];
      const ct = b.cisTransRef
        ? [
            idToRank.get(b.cisTransRef.ref1) ?? -1,
            idToRank.get(b.cisTransRef.ref2) ?? -1,
            b.cisTransRef.sameSide ? 1 : 0,
          ].join(',')
        : '';
      const orderTok = aromaticIds.has(b.id) ? 'a' : String(b.order ?? 1);
      return `${x}|${y}|${orderTok}|${b.stereo ?? ''}|${ct}`;
    })
    .sort()
    .join(';');

  return `${atoms}#${bonds}`;
};

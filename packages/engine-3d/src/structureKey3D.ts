/**
 * Structure fingerprint for 3D sync — topology + stereo + aliases.
 * Ignores 2D canvas coordinates, display colors, and atom instance ids so
 * pan/drag/recolor and selecting an identical duplicate do not rebuild 3D.
 *
 * Aliases are included so label / FG abbrev add·edit·delete invalidate 3D even
 * before expandAliasesFor3D adds explicit atoms.
 *
 * Atom ranks are document order within the (already-focused) fragment so a
 * duplicated copy yields the same key as its source.
 */
import type { Molecule } from '@moldraw/domain';

const normalizeAliasKey = (raw: string | undefined): string => {
  if (!raw) return '';
  return raw
    .trim()
    .toUpperCase()
    .replace(/[₀-₉]/g, ch => '0123456789'['₀₁₂₃₄₅₆₇₈₉'.indexOf(ch)] ?? ch)
    .replace(/\s+/g, '');
};

export const structureKeyFor3D = (mol: Molecule): string => {
  const idToRank = new Map<string, number>();
  mol.atoms.forEach((a, i) => idToRank.set(a.id, i));

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
      return `${x}|${y}|${b.order}|${b.aromatic ? 1 : 0}|${b.stereo ?? ''}|${ct}`;
    })
    .sort()
    .join(';');

  return `${atoms}#${bonds}`;
};

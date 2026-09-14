import type { Molecule } from '@moldraw/domain';

const HEX_RE = /^#[0-9A-Fa-f]{6}$/;

export function applyMarkupHighlight(
  prev: Molecule,
  color: string | null,
  atomIds: readonly string[],
  bondIds: readonly string[],
): Molecule {
  const atomSet = new Set(atomIds);
  const bondSet = new Set(bondIds);
  if (atomSet.size === 0 && bondSet.size === 0) return prev;
  const hex = color && HEX_RE.test(color) ? color : null;

  return {
    ...prev,
    atoms: prev.atoms.map(a => {
      if (!atomSet.has(a.id)) return a;
      if (!hex) {
        if (a.highlight == null) return a;
        const next = { ...a };
        delete next.highlight;
        return next;
      }
      return a.highlight === hex ? a : { ...a, highlight: hex };
    }),
    bonds: prev.bonds.map(b => {
      if (!bondSet.has(b.id)) return b;
      if (!hex) {
        if (b.highlight == null) return b;
        const next = { ...b };
        delete next.highlight;
        return next;
      }
      return b.highlight === hex ? b : { ...b, highlight: hex };
    }),
  };
}

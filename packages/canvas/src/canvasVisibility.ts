/**
 * Session-only canvas object visibility (hide without mutating the document).
 * Keys: `mol:<sortedAtomIds>` or `arrow|text|shape|image|stroke:<id>`.
 */
import type { Molecule } from '@moldraw/domain';

export type CanvasObjectKind =
  | 'molecule'
  | 'arrow'
  | 'text'
  | 'shape'
  | 'image'
  | 'stroke';

export type HiddenCanvasIds = ReadonlySet<string>;

export const moleculeVisibilityKey = (atomIds: readonly string[]): string =>
  `mol:${[...atomIds].sort().join(',')}`;

export const annotationVisibilityKey = (
  kind: Exclude<CanvasObjectKind, 'molecule'>,
  id: string,
): string => `${kind}:${id}`;

/** Filter a molecule for display / hit-testing while the editor store stays complete. */
export function applyCanvasVisibility(
  mol: Molecule,
  hidden: HiddenCanvasIds | undefined,
): Molecule {
  if (!hidden || hidden.size === 0) return mol;

  const hiddenAtoms = new Set<string>();
  for (const key of hidden) {
    if (key.startsWith('mol:')) {
      const ids = key.slice(4);
      if (ids) for (const id of ids.split(',')) if (id) hiddenAtoms.add(id);
    }
  }

  const atoms =
    hiddenAtoms.size === 0 ? mol.atoms : mol.atoms.filter(a => !hiddenAtoms.has(a.id));
  const atomKeep = new Set(atoms.map(a => a.id));
  const bonds =
    hiddenAtoms.size === 0
      ? mol.bonds
      : mol.bonds.filter(b => atomKeep.has(b.fromAtomId) && atomKeep.has(b.toAtomId));

  const hideAnn = (kind: string, id: string) => hidden.has(`${kind}:${id}`);

  return {
    ...mol,
    atoms,
    bonds,
    reactionArrows: mol.reactionArrows?.filter(a => !hideAnn('arrow', a.id)),
    canvasTexts: mol.canvasTexts?.filter(t => !hideAnn('text', t.id)),
    canvasShapes: mol.canvasShapes?.filter(s => !hideAnn('shape', s.id)),
    canvasImages: mol.canvasImages?.filter(i => !hideAnn('image', i.id)),
    strokes: mol.strokes?.filter(s => !hideAnn('stroke', s.id)),
  };
}

export function toggleHiddenId(prev: HiddenCanvasIds, id: string): Set<string> {
  const next = new Set(prev);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

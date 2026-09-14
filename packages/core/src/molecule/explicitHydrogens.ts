/**
 * Merge Indigo fold/unfold molblock onto the live Molecule graph.
 */
import type { Atom, Bond, Molecule } from '@moldraw/domain';
import { parseMolblock } from '../io/molblock';

const newId = () => Math.random().toString(36).slice(2, 11);

/**
 * Preserve heavy-atom IDs (aliases / colors / charges) by heavy-atom write order.
 * New H atoms get fresh IDs. Clears perspective pose (topology changed).
 */
export const mergeExplicitHydrogensFromMolblock = (
  prev: Molecule,
  molblock: string,
): Molecule | null => {
  const parsed = parseMolblock(molblock);
  if (parsed.atoms.length === 0) return null;

  const prevHeavy = prev.atoms.filter(a => a.element !== 'H');
  const nextHeavy = parsed.atoms.filter(a => a.element !== 'H');
  if (prevHeavy.length !== nextHeavy.length) {
    return {
      atoms: parsed.atoms,
      bonds: parsed.bonds,
      strokes: prev.strokes,
      reactionArrows: prev.reactionArrows,
      canvasTexts: prev.canvasTexts,
      canvasShapes: prev.canvasShapes,
      canvasImages: prev.canvasImages,
      ringFills: {},
      perspective3D: undefined,
    };
  }

  const idMap = new Map<string, string>();
  let heavyOrd = 0;
  for (const a of parsed.atoms) {
    if (a.element !== 'H') {
      idMap.set(a.id, prevHeavy[heavyOrd]!.id);
      heavyOrd += 1;
    } else {
      idMap.set(a.id, newId());
    }
  }

  const atoms: Atom[] = parsed.atoms.map(a => {
    const id = idMap.get(a.id)!;
    if (a.element !== 'H') {
      const base = prev.atoms.find(p => p.id === id)!;
      return {
        ...base,
        id,
        element: a.element,
        x: a.x,
        y: a.y,
        charge: a.charge ?? base.charge ?? 0,
        isotope: a.isotope ?? base.isotope,
      };
    }
    return {
      id,
      element: 'H',
      x: a.x,
      y: a.y,
      charge: a.charge ?? 0,
      isotope: a.isotope,
    };
  });

  const bonds: Bond[] = parsed.bonds.map(b => ({
    ...b,
    id: newId(),
    fromAtomId: idMap.get(b.fromAtomId) ?? b.fromAtomId,
    toAtomId: idMap.get(b.toAtomId) ?? b.toAtomId,
  }));

  return {
    ...prev,
    atoms,
    bonds,
    perspective3D: undefined,
  };
};

export const moleculeHasExplicitHydrogens = (mol: Molecule): boolean =>
  mol.atoms.some(a => a.element === 'H');

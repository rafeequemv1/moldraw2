import type { Molecule } from '@moldraw/domain';
import {
  layoutFragmentForAttachment,
  layoutFragmentPreserveOrientation,
} from './fragmentAttachmentLayout';
import { addBondSafe, canAddBond } from './mutations';
import {
  displayCoordsMolecule,
  joinAtomsIntoPerspectivePose,
} from './perspective3D';

const newId = () => Math.random().toString(36).substr(2, 9);

export function isFunctionalGroupAttachmentElement(element: string): boolean {
  const el = element.trim();
  return el === '*' || el === 'R' || el === 'R#' || el === 'X';
}

/** Strip the RDKit wildcard attachment atom; return the atom that should bond to the canvas. */
export function prepareFunctionalGroupFragment(mol: Molecule): {
  fragment: Molecule;
  connectionAtomId: string | null;
} {
  const attach = mol.atoms.find(a => isFunctionalGroupAttachmentElement(a.element));
  if (!attach) {
    return { fragment: mol, connectionAtomId: mol.atoms[0]?.id ?? null };
  }

  const attachBond = mol.bonds.find(
    b => b.fromAtomId === attach.id || b.toAtomId === attach.id,
  );
  if (!attachBond) {
    return {
      fragment: { ...mol, atoms: mol.atoms.filter(a => a.id !== attach.id) },
      connectionAtomId: null,
    };
  }

  const connectionAtomId =
    attachBond.fromAtomId === attach.id ? attachBond.toAtomId : attachBond.fromAtomId;

  return {
    fragment: {
      ...mol,
      atoms: mol.atoms.filter(a => a.id !== attach.id),
      bonds: mol.bonds.filter(b => b.id !== attachBond.id),
    },
    connectionAtomId,
  };
}

/** Place fragment so `connectionAtomId` bonds to `targetAtomId` (if valency allows). */
export function mergeFunctionalGroupOntoAtom(
  prev: Molecule,
  fragment: Molecule,
  targetAtomId: string,
  connectionAtomId: string,
  bondLengthPx: number,
  bondAngleSnapRad: number,
  /** When true, keep library orientation (no auto-extend / overlap spin). */
  preserveOrientation = false,
): Molecule {
  // Layout against display (perspective) coords so attach points match the canvas.
  const layoutParent = displayCoordsMolecule(prev);
  const positioned = preserveOrientation
    ? layoutFragmentPreserveOrientation(
        layoutParent,
        fragment,
        connectionAtomId,
        targetAtomId,
        bondLengthPx,
      )
    : layoutFragmentForAttachment(
        layoutParent,
        fragment,
        connectionAtomId,
        targetAtomId,
        bondLengthPx,
        bondAngleSnapRad,
      );

  const merged: Molecule = {
    ...prev,
    atoms: [...prev.atoms, ...positioned.atoms],
    bonds: [...prev.bonds, ...positioned.bonds],
  };

  const linkBond = {
    id: newId(),
    fromAtomId: targetAtomId,
    toAtomId: connectionAtomId,
    order: 1 as const,
  };
  if (!canAddBond(merged, linkBond)) return prev;

  return joinAtomsIntoPerspectivePose(
    addBondSafe(merged, linkBond),
    positioned.atoms.map(a => a.id),
    [targetAtomId],
  );
}

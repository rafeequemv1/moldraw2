import type { Atom, Molecule } from '@moldraw/domain';
import {
  layoutFragmentForAttachment,
  layoutFragmentPreserveOrientation,
} from './fragmentAttachmentLayout';
import { canAddBond } from './mutations';
import {
  fragmentOverlapsParent,
  nudgeFragmentClearOfParent,
  placementOverlapRadiusPx,
} from './fragmentPlacementOverlap';
import {
  isFunctionalGroupAttachmentElement,
  mergeFunctionalGroupOntoAtom,
  prepareFunctionalGroupFragment,
} from './functionalGroupFragment';
import {
  displayCoordsMolecule,
  joinAtomsIntoPerspectivePose,
} from './perspective3D';

export const PLACE_FRAGMENT_TOOL_ID = 'place_fragment';

export type FragmentPlacementSession = {
  fragment: Molecule;
  connectionAtomId: string | null;
  restoreTool: string;
  /** Functional groups stay in placement until another tool is chosen; templates place once. */
  kind: 'functional_group' | 'template';
};

export type FragmentPlacementCommit =
  | { type: 'attach'; targetAtomId: string }
  | { type: 'free'; x: number; y: number };

export function scaleFragmentToBondLength(mol: Molecule, targetBondLen = 40): Molecule {
  if (mol.bonds.length === 0) return mol;
  let sum = 0;
  for (const b of mol.bonds) {
    const a1 = mol.atoms.find(a => a.id === b.fromAtomId);
    const a2 = mol.atoms.find(a => a.id === b.toAtomId);
    if (a1 && a2) sum += Math.hypot(a1.x - a2.x, a1.y - a2.y);
  }
  const avg = sum / mol.bonds.length;
  const scaleRatio = avg === 0 ? 1 : targetBondLen / avg;
  if (Math.abs(scaleRatio - 1) < 0.02) return mol;

  let cx = 0;
  let cy = 0;
  for (const a of mol.atoms) {
    cx += a.x;
    cy += a.y;
  }
  cx /= mol.atoms.length || 1;
  cy /= mol.atoms.length || 1;

  return {
    ...mol,
    atoms: mol.atoms.map(a => ({
      ...a,
      x: cx + (a.x - cx) * scaleRatio,
      y: cy + (a.y - cy) * scaleRatio,
    })),
    bonds: mol.bonds.map(b => ({ ...b })),
  };
}

/**
 * Position fragment for attach preview — same layout as commit (auto-extend
 * direction from the target atom, fragment rotated to match).
 */
export function positionFragmentSnappedToAtom(
  parent: Molecule,
  fragment: Molecule,
  connectionAtomId: string,
  targetAtomId: string,
  bondLengthPx: number,
  bondAngleSnapRad: number,
): Molecule {
  return layoutFragmentForAttachment(
    parent,
    fragment,
    connectionAtomId,
    targetAtomId,
    bondLengthPx,
    bondAngleSnapRad,
  );
}

export type FragmentPlacementPreview = {
  placed: Molecule;
  snapTargetAtomId: string | null;
  canAttach: boolean;
};

function canAttachFragmentToTarget(
  parent: Molecule,
  placed: Molecule,
  targetAtomId: string,
  connectionAtomId: string,
  minSep: number,
): boolean {
  const exclude = new Set([targetAtomId]);
  if (fragmentOverlapsParent(parent, placed, exclude, minSep)) return false;

  const mergedForBondCheck: Molecule = {
    ...parent,
    atoms: [...parent.atoms, ...placed.atoms],
    bonds: [...parent.bonds, ...placed.bonds],
  };
  return canAddBond(
    mergedForBondCheck,
    {
      fromAtomId: targetAtomId,
      toAtomId: connectionAtomId,
      order: 1,
    },
    { strict: false },
  );
}

/**
 * Ghost / hit-test layout: snap to hovered atom when attach is clean; otherwise
 * follow the pointer without overlapping existing atoms.
 */
export function previewFragmentPlacement(
  parent: Molecule,
  fragment: Molecule,
  connectionAtomId: string | null,
  worldX: number,
  worldY: number,
  snapTargetAtomId: string | null,
  bondLengthPx: number,
  bondAngleSnapRad: number,
  /** Functional groups: keep library pose (no attach rotate). */
  preserveOrientation = false,
): FragmentPlacementPreview {
  const minSep = placementOverlapRadiusPx(bondLengthPx);
  const layoutParent = displayCoordsMolecule(parent);

  if (snapTargetAtomId && connectionAtomId) {
    const placed = preserveOrientation
      ? layoutFragmentPreserveOrientation(
          layoutParent,
          fragment,
          connectionAtomId,
          snapTargetAtomId,
          bondLengthPx,
        )
      : layoutFragmentForAttachment(
          layoutParent,
          fragment,
          connectionAtomId,
          snapTargetAtomId,
          bondLengthPx,
          bondAngleSnapRad,
        );
    const canAttach = canAttachFragmentToTarget(
      layoutParent,
      placed,
      snapTargetAtomId,
      connectionAtomId,
      minSep,
    );
    return { placed, snapTargetAtomId, canAttach };
  }

  let placed = placeFragmentAtConnectionPoint(fragment, connectionAtomId, worldX, worldY);
  placed = nudgeFragmentClearOfParent(layoutParent, placed, new Set(), minSep);
  return { placed, snapTargetAtomId: null, canAttach: false };
}

/** Move fragment so the connection atom (or centroid) sits at (x, y). */
export function placeFragmentAtConnectionPoint(
  fragment: Molecule,
  connectionAtomId: string | null,
  x: number,
  y: number,
): Molecule {
  if (fragment.atoms.length === 0) return fragment;

  let ax = x;
  let ay = y;
  const conn = connectionAtomId ? fragment.atoms.find(a => a.id === connectionAtomId) : null;
  if (conn) {
    ax = conn.x;
    ay = conn.y;
  } else {
    ax = fragment.atoms.reduce((s, a) => s + a.x, 0) / fragment.atoms.length;
    ay = fragment.atoms.reduce((s, a) => s + a.y, 0) / fragment.atoms.length;
  }

  const dx = x - ax;
  const dy = y - ay;
  return {
    ...fragment,
    atoms: fragment.atoms.map(a => ({ ...a, x: a.x + dx, y: a.y + dy })),
    bonds: fragment.bonds.map(b => ({ ...b })),
  };
}

/** α-carbon for amino acids: C bonded to N (typical backbone). */
export function inferTemplateConnectionAtomId(mol: Molecule): string | null {
  for (const a of mol.atoms) {
    if (a.element !== 'C') continue;
    const nbrIds = mol.bonds
      .filter(b => b.fromAtomId === a.id || b.toAtomId === a.id)
      .map(b => (b.fromAtomId === a.id ? b.toAtomId : b.fromAtomId));
    const nbrs = nbrIds
      .map(id => mol.atoms.find(x => x.id === id))
      .filter((x): x is Atom => Boolean(x));
    if (nbrs.some(n => n.element === 'N')) return a.id;
  }
  return mol.atoms.find(a => !isFunctionalGroupAttachmentElement(a.element))?.id ?? null;
}

export function prepareFragmentFromSmilesMol(
  mol: Molecule,
  kind: 'functional_group' | 'template',
): { fragment: Molecule; connectionAtomId: string | null } {
  if (kind === 'functional_group') {
    return prepareFunctionalGroupFragment(mol);
  }
  return { fragment: mol, connectionAtomId: inferTemplateConnectionAtomId(mol) };
}

export function commitFragmentPlacement(
  prev: Molecule,
  session: FragmentPlacementSession,
  commit: FragmentPlacementCommit,
  bondLengthPx: number,
  bondAngleSnapRad: number,
): { molecule: Molecule; newAtomIds: string[] } {
  if (commit.type === 'attach' && session.connectionAtomId) {
    const next = mergeFunctionalGroupOntoAtom(
      prev,
      session.fragment,
      commit.targetAtomId,
      session.connectionAtomId,
      bondLengthPx,
      bondAngleSnapRad,
      session.kind === 'functional_group',
    );
    const attached =
      next.atoms.length === prev.atoms.length + session.fragment.atoms.length;
    if (!attached) {
      return { molecule: prev, newAtomIds: [] };
    }
    return { molecule: next, newAtomIds: session.fragment.atoms.map(a => a.id) };
  }

  const x = commit.type === 'free' ? commit.x : 0;
  const y = commit.type === 'free' ? commit.y : 0;
  const minSep = placementOverlapRadiusPx(bondLengthPx);
  let placed = placeFragmentAtConnectionPoint(
    session.fragment,
    session.connectionAtomId,
    x,
    y,
  );
  // Nudge against the visible (perspective) parent so free place doesn't stack on the pose.
  placed = nudgeFragmentClearOfParent(
    displayCoordsMolecule(prev),
    placed,
    new Set(),
    minSep,
  );
  const newAtomIds = placed.atoms.map(a => a.id);
  return {
    molecule: joinAtomsIntoPerspectivePose(
      {
        ...prev,
        atoms: [...prev.atoms, ...placed.atoms],
        bonds: [...prev.bonds, ...placed.bonds],
      },
      newAtomIds,
    ),
    newAtomIds,
  };
}

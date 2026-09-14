/**
 * Classify heavy-atom skeleton nodes for ChemDraw-style 2D layout rules.
 * Hydrogen is never classified — implicit in 2D drawing.
 */
import { bondBetween, type MoleculeGraph } from '../graph';
import { isHeavyAtom } from './layoutGeometry';

export type SkeletonNodeKind =
  | 'ring'
  | 'chain'
  | 'junction'
  | 'carbonyl'
  | 'heteroLeaf'
  | 'other';

export interface SkeletonClassification {
  kind: Map<string, SkeletonNodeKind>;
  ringAtomSet: Set<string>;
  /** Atoms deferred to the hetero-decoration pass. */
  heteroPending: Set<string>;
}

const isCarbonylCarbon = (g: MoleculeGraph, atomId: string): boolean => {
  const node = g.nodes.get(atomId);
  if (!node || node.atom.element !== 'C') return false;
  return node.neighbors.some(nb => {
    const b = bondBetween(g, atomId, nb);
    return b != null && b.order >= 2 && g.atomById.get(nb)?.element === 'O';
  });
};

const heavyNeighbors = (g: MoleculeGraph, atomId: string): string[] =>
  (g.nodes.get(atomId)?.neighbors ?? []).filter(nb => isHeavyAtom(g.atomById.get(nb)?.element ?? ''));

const carbonNeighbors = (g: MoleculeGraph, atomId: string): string[] =>
  heavyNeighbors(g, atomId).filter(nb => g.atomById.get(nb)?.element === 'C');

/** True when `childId` continues a linear C–C spine from `parentId` through `rootId`. */
export const isChainContinuation = (
  g: MoleculeGraph,
  rootId: string,
  childId: string,
  parentId: string | null,
): boolean => {
  if (parentId === null) return false;
  if (g.atomById.get(rootId)?.element !== 'C') return false;
  if (g.atomById.get(childId)?.element !== 'C') return false;
  if (isCarbonylCarbon(g, rootId) || isCarbonylCarbon(g, childId)) return false;
  // Any other carbon neighbor means this is a branch/junction — use trigonal
  // slots, not zigzag (fixes isobutane overlapping path tip + methyl).
  const otherCarbons = carbonNeighbors(g, rootId).filter(
    nb => nb !== parentId && nb !== childId,
  );
  if (otherCarbons.length > 0) return false;
  if (heavyNeighbors(g, rootId).length >= 3) return false;
  return true;
};

export const classifySkeleton = (
  g: MoleculeGraph,
  ringAtomSet: Set<string>,
): SkeletonClassification => {
  const kind = new Map<string, SkeletonNodeKind>();
  const heteroPending = new Set<string>();

  for (const [id, node] of g.nodes) {
    const el = node.atom.element;
    if (!isHeavyAtom(el)) continue;

    if (el !== 'C') {
      kind.set(id, 'heteroLeaf');
      heteroPending.add(id);
      continue;
    }

    if (ringAtomSet.has(id)) {
      kind.set(id, 'ring');
      continue;
    }

    if (isCarbonylCarbon(g, id)) {
      kind.set(id, 'carbonyl');
      continue;
    }

    const cNbs = carbonNeighbors(g, id);
    const heavyNbs = heavyNeighbors(g, id);

    if (heavyNbs.length >= 3) {
      kind.set(id, 'junction');
    } else if (heavyNbs.length === 2 && cNbs.length === 2) {
      kind.set(id, 'chain');
    } else {
      kind.set(id, 'other');
    }
  }

  return { kind, ringAtomSet, heteroPending };
};

export const skeletonKind = (
  classification: SkeletonClassification,
  atomId: string,
): SkeletonNodeKind => classification.kind.get(atomId) ?? 'other';

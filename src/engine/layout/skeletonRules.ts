/**
 * ChemDraw-style direction rules for skeleton node types.
 * Chains: 120° C–C–C zigzag. Branches/carbonyls: 120° trigonal fan.
 */
import { bondBetween, type MoleculeGraph } from '../graph';
import {
  SQUARE,
  TRIGONAL,
  ZIGZAG,
  conflictsWith,
  dirBetween,
  type Vec,
} from './layoutGeometry';
import { isChainContinuation, type SkeletonClassification } from './skeletonClassify';

const bondOrderBetween = (g: MoleculeGraph, a: string, b: string): number => {
  const bnd = bondBetween(g, a, b);
  if (!bnd) return 1;
  return bnd.aromatic ? 1 : bnd.order;
};

const isCarbonylCarbon = (g: MoleculeGraph, atomId: string): boolean => {
  const node = g.nodes.get(atomId);
  if (!node || node.atom.element !== 'C') return false;
  return node.neighbors.some(nb => {
    const b = bondBetween(g, atomId, nb);
    return b != null && b.order >= 2 && g.atomById.get(nb)?.element === 'O';
  });
};

export interface ChildDirectionResult {
  dirs: number[];
  nextFlip: number;
}

/**
 * Bond directions for unplaced children at `rootId`.
 * Uses skeleton classification when available; falls back to chain/trigonal heuristics.
 */
export const computeChildDirections = (
  g: MoleculeGraph,
  rootId: string,
  parentId: string | null,
  childIds: string[],
  occupied: number[],
  prevBondDir: number,
  chainFlip: number,
  pos: Map<string, Vec>,
  _classification?: SkeletonClassification,
): ChildDirectionResult => {
  const n = childIds.length;
  if (n === 0) return { dirs: [], nextFlip: chainFlip };

  const base = pos.get(rootId)!;
  const toParent =
    parentId !== null && pos.has(parentId) ? dirBetween(base, pos.get(parentId)!) : null;

  // Single C–C chain continuation → 120° zigzag (±60° bond-direction turn).
  if (
    n === 1 &&
    isChainContinuation(g, rootId, childIds[0], parentId)
  ) {
    const outDir = prevBondDir + chainFlip * ZIGZAG;
    return { dirs: [outDir], nextFlip: -chainFlip };
  }

  // Carbonyl C: ChemDraw trigonal — C=O and C–OH/OR occupy the two free
  // 120° slots relative to the parent bond (never 180° opposite).
  if (isCarbonylCarbon(g, rootId) && toParent !== null) {
    const node = g.nodes.get(rootId)!;
    const doubleO = node.neighbors.find(nb => {
      const b = bondBetween(g, rootId, nb);
      return b != null && b.order >= 2 && g.atomById.get(nb)?.element === 'O';
    });
    const slotA = toParent + TRIGONAL;
    const slotB = toParent - TRIGONAL;
    const dirs: number[] = [];
    const used: number[] = [...occupied];
    // Prefer =O in the first free slot, then single-bond O / other children.
    const ordered = [...childIds].sort((a, b) => {
      const aD = a === doubleO ? 0 : 1;
      const bD = b === doubleO ? 0 : 1;
      return aD - bD;
    });
    const assigned = new Map<string, number>();
    for (const childId of ordered) {
      const pick = !conflictsWith(slotA, used) ? slotA : slotB;
      assigned.set(childId, pick);
      used.push(pick);
    }
    for (const childId of childIds) {
      dirs.push(assigned.get(childId) ?? slotA);
    }
    return { dirs, nextFlip: chainFlip };
  }

  // Single branch off a placed parent: pick a free 120° trigonal slot.
  if (n === 1 && toParent !== null) {
    const a = toParent + TRIGONAL;
    const b = toParent - TRIGONAL;
    const pick = !conflictsWith(a, occupied) ? a : b;
    return { dirs: [pick], nextFlip: chainFlip };
  }

  // Multi-child fan. Parent bond (if any) is an occupied slot:
  //   • 2–3 total bonds at atom → 120° trigonal (ChemDraw chain/branch)
  //   • 4+ bonds (quaternary) → 90° square projection (2D ChemDraw)
  const parentDir = toParent;
  const totalBonds = n + (parentDir !== null ? 1 : 0);
  const step = totalBonds >= 4 ? SQUARE : TRIGONAL;
  const dirs: number[] = [];
  if (parentDir !== null) {
    for (let k = 1; k <= n; k++) {
      dirs.push(parentDir + k * step);
    }
  } else {
    const back = prevBondDir + Math.PI;
    for (let i = 0; i < n; i++) {
      const spread = i - (n - 1) / 2;
      dirs.push(back + spread * step);
    }
  }
  return { dirs, nextFlip: chainFlip };
};

export const sortChildrenForLayout = (
  g: MoleculeGraph,
  rootId: string,
  children: string[],
  subtreeDepth: (start: string, from: string) => number,
  classification?: SkeletonClassification,
): string[] => {
  return [...children].sort((a, b) => {
    const aDouble = bondOrderBetween(g, rootId, a) >= 2 ? 0 : 1;
    const bDouble = bondOrderBetween(g, rootId, b) >= 2 ? 0 : 1;
    if (aDouble !== bDouble) return aDouble - bDouble;
    const aChain = classification ? classification.kind.get(a) === 'chain' : false;
    const bChain = classification ? classification.kind.get(b) === 'chain' : false;
    if (aChain !== bChain) return aChain ? -1 : 1;
    return subtreeDepth(b, rootId) - subtreeDepth(a, rootId);
  });
};

export const shouldUseChainZigzag = (
  g: MoleculeGraph,
  rootId: string,
  childId: string,
  parentId: string | null,
  unplacedCount: number,
): boolean =>
  unplacedCount === 1 && isChainContinuation(g, rootId, childId, parentId);

/** True when child dirs are a rigid multi-child fan that must not be collision-nudged.
 * Single-child placements still pick between ±120° slots with proximity checks
 * (critical for ortho substituents like aspirin acetoxy vs COOH). */
export const shouldKeepExactFan = (childCount: number): boolean => childCount >= 2;

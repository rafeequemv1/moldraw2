/**
 * Native soft clean2d — preserve orientation; tidy bond lengths and local angles.
 * Replaces Indigo clean2d for the common "already drawn" case.
 */
import type { Atom, Molecule } from '@moldraw/domain';
import { buildGraph, connectedComponents } from '../graph';
import { perceiveRings } from '../chem/rings';
import {
  hasReasonableExistingLayout,
  isLayoutCollapsed,
  needsAngleRelayout,
  normalizeBondLengthsInPlace,
} from './refineInPlace';
import { cleanupStructure } from './cleanupStructure';
import { TRIGONAL, vecAt, type Vec } from './layoutGeometry';
import { layoutComponentSkeleton } from './skeletonLayout';

export interface Clean2dOptions {
  bondLengthPx: number;
  /** When set, only relayout this BFS subgraph; rest stays fixed. */
  selectedAtomIds?: ReadonlySet<string>;
  preserveOrientation?: boolean;
}

const bondAngleDeg = (c: Vec, a: Vec, b: Vec): number => {
  const da = Math.atan2(a.y - c.y, a.x - c.x);
  const db = Math.atan2(b.y - c.y, b.x - c.x);
  let diff = Math.abs(da - db);
  if (diff > Math.PI) diff = 2 * Math.PI - diff;
  return (diff * 180) / Math.PI;
};

/** Reposition one heavy atom's neighbors to ~120° / 180° fan. */
const fixLocalFan = (mol: Molecule, atomId: string, bondLen: number): Molecule => {
  const g = buildGraph(mol);
  const node = g.nodes.get(atomId);
  if (!node) return mol;
  const center = mol.atoms.find(a => a.id === atomId);
  if (!center || center.element === 'H') return mol;
  const heavyNbs = node.neighbors.filter(nb => {
    const el = mol.atoms.find(a => a.id === nb)?.element ?? '';
    return el !== 'H' && el !== 'D';
  });
  if (heavyNbs.length < 2) return mol;

  const c = { x: center.x, y: center.y };
  const ref = mol.atoms.find(a => a.id === heavyNbs[0]!)!;
  const refDir = Math.atan2(ref.y - c.y, ref.x - c.x);
  const targetAngle = heavyNbs.length === 2 ? Math.PI : TRIGONAL;
  const pos = new Map(mol.atoms.map(a => [a.id, { x: a.x, y: a.y }]));

  for (let i = 1; i < heavyNbs.length; i++) {
    const nbId = heavyNbs[i]!;
    const dir = refDir + targetAngle * i;
    pos.set(nbId, vecAt(c, dir, bondLen));
  }

  return {
    ...mol,
    atoms: mol.atoms.map(a => {
      const p = pos.get(a.id);
      return p ? { ...a, x: p.x, y: p.y } : a;
    }),
  };
};

/** Fix worst local angles without full relayout. */
const fixBadAngles = (mol: Molecule, bondLen: number): Molecule => {
  const g = buildGraph(mol);
  let next = mol;
  for (const a of mol.atoms) {
    if (a.element === 'H' || a.element === 'D') continue;
    const nbs = (g.nodes.get(a.id)?.neighbors ?? []).filter(nb => {
      const el = mol.atoms.find(x => x.id === nb)?.element ?? '';
      return el !== 'H' && el !== 'D';
    });
    if (nbs.length < 2) continue;
    const c = { x: a.x, y: a.y };
    let worst = 0;
    for (let i = 0; i < nbs.length; i++) {
      for (let j = i + 1; j < nbs.length; j++) {
        const p1 = mol.atoms.find(x => x.id === nbs[i]!)!;
        const p2 = mol.atoms.find(x => x.id === nbs[j]!)!;
        const ang = bondAngleDeg(c, p1, p2);
        const err = Math.min(Math.abs(ang - 120), Math.abs(ang - 180));
        worst = Math.max(worst, err);
      }
    }
    if (worst > 25) next = fixLocalFan(next, a.id, bondLen);
  }
  return next;
};

const subsetMolecule = (mol: Molecule, atomIds: ReadonlySet<string>): Molecule => ({
  atoms: mol.atoms.filter(a => atomIds.has(a.id)),
  bonds: mol.bonds.filter(b => atomIds.has(b.fromAtomId) && atomIds.has(b.toAtomId)),
  strokes: mol.strokes ?? [],
  reactionArrows: mol.reactionArrows ?? [],
  canvasTexts: mol.canvasTexts ?? [],
  ...(mol.ringConformations ? { ringConformations: mol.ringConformations } : {}),
});

const bfsSubgraph = (mol: Molecule, seeds: ReadonlySet<string>): Set<string> => {
  const g = buildGraph(mol);
  const out = new Set<string>();
  const q = [...seeds];
  for (const s of seeds) out.add(s);
  while (q.length) {
    const u = q.shift()!;
    for (const nb of g.nodes.get(u)?.neighbors ?? []) {
      if (out.has(nb)) continue;
      out.add(nb);
      q.push(nb);
    }
  }
  return out;
};

const mergeCoords = (original: Molecule, laid: Molecule): Molecule => {
  const byId = new Map(laid.atoms.map(a => [a.id, a]));
  return {
    ...original,
    atoms: original.atoms.map(a => {
      const p = byId.get(a.id);
      return p ? { ...a, x: p.x, y: p.y } : a;
    }),
  };
};

/**
 * Soft clean2d: normalize bond lengths in place when layout is already good;
 * local angle fixes when needed; selected-atom subgraph relayout; full rebuild
 * only when collapsed.
 */
export const clean2d = (mol: Molecule, options: Clean2dOptions): Molecule => {
  const bondLen = options.bondLengthPx;
  if (mol.atoms.length < 2 || bondLen <= 0) return mol;

  if (isLayoutCollapsed(mol)) {
    return cleanupStructure(mol, {
      bondLengthPx: bondLen,
      preserveOrientation: options.preserveOrientation ?? true,
    });
  }

  const selection = options.selectedAtomIds;
  if (selection && selection.size > 0 && selection.size < mol.atoms.length) {
    const subgraph = bfsSubgraph(mol, selection);
    const subset = subsetMolecule(mol, subgraph);
    if (subset.atoms.length >= 3) {
      const rings = perceiveRings(subset);
      const g = buildGraph(subset);
      const comp = connectedComponents(subset)[0] ?? [];
      const pos = new Map<string, Vec>();
      for (const a of subset.atoms) pos.set(a.id, { x: a.x, y: a.y });
      const origin = { x: subset.atoms[0]!.x, y: subset.atoms[0]!.y };
      const laidPos = layoutComponentSkeleton({
        g,
        comp,
        rings,
        bondLen,
        origin,
        orig: pos,
        mode: 'correct',
      });
      const laidAtoms: Atom[] = subset.atoms.map(a => {
        const p = laidPos.get(a.id) ?? pos.get(a.id)!;
        return { ...a, x: p.x, y: p.y };
      });
      const laid = { ...subset, atoms: laidAtoms };
      const normalized = normalizeBondLengthsInPlace(laid, bondLen);
      return mergeCoords(mol, normalized);
    }
  }

  if (hasReasonableExistingLayout(mol) && !needsAngleRelayout(mol)) {
    return normalizeBondLengthsInPlace(mol, bondLen);
  }

  let next = normalizeBondLengthsInPlace(mol, bondLen);
  // Local fan-out swings substituents and looks like a rotation. Skip when
  // the user asked to keep the drawn heading (Cleanup / Smart Draw).
  if (needsAngleRelayout(next) && options.preserveOrientation === false) {
    next = fixBadAngles(next, bondLen);
  }
  if (!hasReasonableExistingLayout(next)) {
    return cleanupStructure(mol, {
      bondLengthPx: bondLen,
      preserveOrientation: options.preserveOrientation ?? true,
    });
  }
  return next;
};

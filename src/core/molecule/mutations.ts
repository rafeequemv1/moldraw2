/**
 * Pure `(prev: Molecule, args) => Molecule` mutations used by the App handlers.
 *
 * Each function takes a snapshot and returns a new molecule without touching
 * any component state. The handlers in App.tsx call these via
 * `updateMolecule(prev => mutateXxx(prev, args))`.
 *
 * Valency / lone-pair / ring constraints are checked here so invalid edits are
 * silently dropped (the function returns `prev` unchanged) — same behaviour
 * the App had before extraction.
 */
import type {
  Atom,
  Bond,
  CanvasImage,
  CanvasShape,
  CanvasText,
  Molecule,
  ReactionArrow,
  ReactionArrowKind,
  Stroke,
} from '@moldraw/domain';
import { getMaxValencyForElement, getMaxLonePairsForAtom } from '@moldraw/domain';
import { uniqueRingPaths } from '@moldraw/domain';
import { boatRingVertices } from '../geometry/boatRing';
import { chairRingVertices } from '../geometry/chairRing';
import { parseMolblock } from '../io/molblock';

const newId = () => Math.random().toString(36).substr(2, 9);

const bondOrderSumOf = (mol: Molecule, atomId: string): number =>
  mol.bonds
    .filter(b => b.fromAtomId === atomId || b.toAtomId === atomId)
    .reduce((s, b) => s + b.order, 0);

const isBondInRing = (mol: Molecule, bond: Pick<Bond, 'id' | 'fromAtomId' | 'toAtomId'>): boolean => {
  const queue: string[] = [bond.fromAtomId];
  const seen = new Set<string>([bond.fromAtomId]);
  while (queue.length) {
    const id = queue.shift()!;
    for (const b of mol.bonds) {
      if (b.id === bond.id) continue;
      const next = b.fromAtomId === id ? b.toAtomId : b.toAtomId === id ? b.fromAtomId : null;
      if (!next || seen.has(next)) continue;
      if (next === bond.toAtomId) return true;
      seen.add(next);
      queue.push(next);
    }
  }
  return false;
};

const wouldCloseRing = (mol: Molecule, fromAtomId: string, toAtomId: string): boolean =>
  isBondInRing(mol, { id: '__new_bond__', fromAtomId, toAtomId });

const neighborAtomIds = (mol: Molecule, atomId: string, excludeAtomId: string): string[] =>
  mol.bonds
    .map(b => (b.fromAtomId === atomId ? b.toAtomId : b.toAtomId === atomId ? b.fromAtomId : null))
    .filter((id): id is string => Boolean(id) && id !== excludeAtomId);

const linearlyAdjustedTripleBondAtoms = (mol: Molecule, bond: Bond): Atom[] => {
  const fromAtom = mol.atoms.find(a => a.id === bond.fromAtomId);
  const toAtom = mol.atoms.find(a => a.id === bond.toAtomId);
  if (!fromAtom || !toAtom) return mol.atoms;

  const dx = toAtom.x - fromAtom.x;
  const dy = toAtom.y - fromAtom.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) return mol.atoms;

  const ux = dx / len;
  const uy = dy / len;
  const fromNeighbors = neighborAtomIds(mol, fromAtom.id, toAtom.id);
  const toNeighbors = neighborAtomIds(mol, toAtom.id, fromAtom.id);
  const updates = new Map<string, { x: number; y: number }>();

  // Triple-bond atoms are sp-linear. If each endpoint has one attached
  // substituent, keep its distance but place it opposite the triple bond.
  if (fromNeighbors.length === 1) {
    const n = mol.atoms.find(a => a.id === fromNeighbors[0]);
    if (n) {
      const d = Math.hypot(n.x - fromAtom.x, n.y - fromAtom.y);
      updates.set(n.id, { x: fromAtom.x - ux * d, y: fromAtom.y - uy * d });
    }
  }
  if (toNeighbors.length === 1) {
    const n = mol.atoms.find(a => a.id === toNeighbors[0]);
    if (n) {
      const d = Math.hypot(n.x - toAtom.x, n.y - toAtom.y);
      updates.set(n.id, { x: toAtom.x + ux * d, y: toAtom.y + uy * d });
    }
  }

  if (updates.size === 0) return mol.atoms;
  return mol.atoms.map(a => {
    const p = updates.get(a.id);
    return p ? { ...a, x: p.x, y: p.y } : a;
  });
};

// ─── Atoms ────────────────────────────────────────────────────────────────

export const addAtom = (prev: Molecule, atom: Atom): Molecule => ({
  ...prev,
  atoms: [...prev.atoms, atom],
});

export const updateAtomElement = (
  prev: Molecule,
  atomId: string,
  element: string,
): Molecule => {
  const atom = prev.atoms.find(a => a.id === atomId);
  if (!atom) return prev;
  const orderSum = bondOrderSumOf(prev, atomId);
  const maxLP = getMaxLonePairsForAtom(element, atom.charge, orderSum);
  return {
    ...prev,
    atoms: prev.atoms.map(a =>
      a.id === atomId
        ? { ...a, element, alias: undefined, lonePairs: Math.min(a.lonePairs ?? 0, maxLP) }
        : a,
    ),
  };
};

export const updateAtomCharge = (prev: Molecule, atomId: string, delta: number): Molecule => ({
  ...prev,
  atoms: prev.atoms.map(a => {
    if (a.id !== atomId) return a;
    const nextCharge = a.charge + delta;
    const orderSum = bondOrderSumOf(prev, atomId);
    const maxLP = getMaxLonePairsForAtom(a.element, nextCharge, orderSum);
    return { ...a, charge: nextCharge, lonePairs: Math.min(a.lonePairs ?? 0, maxLP) };
  }),
});

export const updateAtomLonePairs = (
  prev: Molecule,
  atomId: string,
  delta: number,
): Molecule => ({
  ...prev,
  atoms: prev.atoms.map(a => {
    if (a.id !== atomId) return a;
    const orderSum = bondOrderSumOf(prev, atomId);
    const maxLP = getMaxLonePairsForAtom(a.element, a.charge, orderSum);
    const current = a.lonePairs ?? 0;
    const next = Math.max(0, Math.min(maxLP, current + delta));
    return next === current ? a : { ...a, lonePairs: next };
  }),
});

export const setAtomIsotope = (prev: Molecule, atomId: string, isotope?: number): Molecule => ({
  ...prev,
  atoms: prev.atoms.map(a => {
    if (a.id !== atomId) return a;
    const next = Number.isFinite(isotope) && isotope && isotope > 0 ? Math.trunc(isotope) : undefined;
    return next ? { ...a, isotope: next } : { ...a, isotope: undefined };
  }),
});

export const moveAtoms = (
  prev: Molecule,
  atomIds: string[],
  dx: number,
  dy: number,
): Molecule => {
  const set = new Set(atomIds);
  return {
    ...prev,
    atoms: prev.atoms.map(a => (set.has(a.id) ? { ...a, x: a.x + dx, y: a.y + dy } : a)),
  };
};

export const rotateAtoms = (
  prev: Molecule,
  atomIds: string[],
  cx: number,
  cy: number,
  deltaRad: number,
): Molecule => {
  if (atomIds.length === 0 || Math.abs(deltaRad) < 1e-7) return prev;
  const c = Math.cos(deltaRad);
  const s = Math.sin(deltaRad);
  const set = new Set(atomIds);
  return {
    ...prev,
    atoms: prev.atoms.map(a => {
      if (!set.has(a.id)) return a;
      const dx = a.x - cx;
      const dy = a.y - cy;
      return { ...a, x: cx + c * dx - s * dy, y: cy + s * dx + c * dy };
    }),
  };
};

// ─── Bonds ────────────────────────────────────────────────────────────────

/** Whether `bond` may be added to `prev` (valency, duplicates, ring rules). */
export const canAddBond = (
  prev: Molecule,
  bond: Pick<Bond, 'fromAtomId' | 'toAtomId' | 'order'>,
): boolean => {
  const duplicate = prev.bonds.some(
    b =>
      (b.fromAtomId === bond.fromAtomId && b.toAtomId === bond.toAtomId) ||
      (b.fromAtomId === bond.toAtomId && b.toAtomId === bond.fromAtomId),
  );
  if (duplicate) return false;

  const fromAtom = prev.atoms.find(a => a.id === bond.fromAtomId);
  const toAtom = prev.atoms.find(a => a.id === bond.toAtomId);
  if (!fromAtom || !toAtom) return false;
  if (bond.order === 3 && wouldCloseRing(prev, bond.fromAtomId, bond.toAtomId)) return false;

  const ringAtomIds = new Set(uniqueRingPaths(prev).flat());
  const nextFromDoubleCount =
    prev.bonds.filter(b => (b.fromAtomId === fromAtom.id || b.toAtomId === fromAtom.id) && b.order === 2).length +
    (bond.order === 2 ? 1 : 0);
  const nextToDoubleCount =
    prev.bonds.filter(b => (b.fromAtomId === toAtom.id || b.toAtomId === toAtom.id) && b.order === 2).length +
    (bond.order === 2 ? 1 : 0);
  if (bond.order === 2) {
    if (ringAtomIds.has(fromAtom.id) && nextFromDoubleCount > 1) return false;
    if (ringAtomIds.has(toAtom.id) && nextToDoubleCount > 1) return false;
  }

  const currentFromValency = bondOrderSumOf(prev, fromAtom.id);
  const currentToValency = bondOrderSumOf(prev, toAtom.id);
  const maxFromValency = getMaxValencyForElement(fromAtom.element, fromAtom.charge);
  const maxToValency = getMaxValencyForElement(toAtom.element, toAtom.charge);
  if (currentFromValency + bond.order > maxFromValency) return false;
  if (currentToValency + bond.order > maxToValency) return false;
  const maxFromLP = getMaxLonePairsForAtom(fromAtom.element, fromAtom.charge, currentFromValency + bond.order);
  const maxToLP = getMaxLonePairsForAtom(toAtom.element, toAtom.charge, currentToValency + bond.order);
  if ((fromAtom.lonePairs ?? 0) > maxFromLP) return false;
  if ((toAtom.lonePairs ?? 0) > maxToLP) return false;

  return true;
};

/**
 * Add a bond, but drop the edit if it would duplicate an existing edge,
 * exceed atomic valency, force two adjacent ring double bonds, etc.
 */
export const addBondSafe = (prev: Molecule, bond: Bond): Molecule => {
  if (!canAddBond(prev, bond)) return prev;
  return { ...prev, bonds: [...prev.bonds, bond] };
};

/**
 * Swap a bond's `fromAtomId` and `toAtomId`.
 *
 * Used by the wedge / dash tool's re-tap behavior to flip a stereo bond's
 * narrow→wide direction without changing any chemistry. Bond id, order, and
 * stereo flag are preserved — only the *depicted* direction changes (the
 * wedge "narrow end" follows `fromAtomId` in the renderer).
 *
 * Safe to call on any bond order / stereo combination; for non-stereo bonds
 * this is a chemically invisible no-op (the molecule renders identically),
 * so it's a free fail-safe for the canvas re-tap dispatcher.
 */
export const flipBondEndpoints = (prev: Molecule, bondId: string): Molecule => ({
  ...prev,
  bonds: prev.bonds.map(b =>
    b.id === bondId ? { ...b, fromAtomId: b.toAtomId, toAtomId: b.fromAtomId } : b,
  ),
});

/**
 * Flip wedge/dash narrow↔wide for every stereo bond incident on this atom
 * (invert depicted stereochemistry at that center).
 */
export const invertStereoAtAtom = (prev: Molecule, atomId: string): Molecule => ({
  ...prev,
  bonds: prev.bonds.map(b => {
    if (b.fromAtomId !== atomId && b.toAtomId !== atomId) return b;
    if (b.stereo !== 'wedge' && b.stereo !== 'dash') return b;
    return { ...b, fromAtomId: b.toAtomId, toAtomId: b.fromAtomId };
  }),
});

/** Swap (x,y) of two atoms — e.g. interchange two substituents on a stereocenter without redrawing bonds. */
export const swapAtomPositions = (prev: Molecule, atomIdA: string, atomIdB: string): Molecule => {
  const a = prev.atoms.find(x => x.id === atomIdA);
  const b = prev.atoms.find(x => x.id === atomIdB);
  if (!a || !b || atomIdA === atomIdB) return prev;
  return {
    ...prev,
    atoms: prev.atoms.map(at =>
      at.id === atomIdA ? { ...at, x: b.x, y: b.y } : at.id === atomIdB ? { ...at, x: a.x, y: a.y } : at,
    ),
  };
};

/**
 * Replace bond aromatic flags / Kekulé orders from an Indigo aromatize/dearomatize
 * molblock while preserving atom ids, coords, aliases, and bond ids.
 */
export const mergeBondOrdersFromMolblock = (
  prev: Molecule,
  molblock: string,
): Molecule => {
  const parsed = parseMolblock(molblock);
  if (parsed.bonds.length !== prev.bonds.length) return prev;
  return {
    ...prev,
    bonds: prev.bonds.map((b, i) => {
      const src = parsed.bonds[i]!;
      if (src.aromatic) {
        return { ...b, order: 1, aromatic: true };
      }
      const order = Math.max(1, Math.min(3, src.order || 1));
      const { aromatic: _a, ...rest } = b;
      void _a;
      return { ...rest, order, aromatic: undefined };
    }),
  };
};

/**
 * Apply atom-atom map numbers onto atoms by id. `mapsByAtomId` values ≤ 0 clear the map.
 */
export const applyAtomMaps = (
  prev: Molecule,
  mapsByAtomId: Record<string, number>,
): Molecule => {
  let changed = false;
  const atoms = prev.atoms.map(a => {
    if (!(a.id in mapsByAtomId)) return a;
    const n = Math.trunc(mapsByAtomId[a.id]!);
    const nextMap = n > 0 ? n : undefined;
    if ((a.atomMap ?? undefined) === nextMap) return a;
    changed = true;
    if (nextMap === undefined) {
      const { atomMap: _m, ...rest } = a;
      void _m;
      return rest;
    }
    return { ...a, atomMap: nextMap };
  });
  return changed ? { ...prev, atoms } : prev;
};

/** Clear all atom-atom maps on the molecule. */
export const clearAtomMaps = (prev: Molecule): Molecule => {
  let changed = false;
  const atoms = prev.atoms.map(a => {
    if (a.atomMap == null || a.atomMap === 0) return a;
    changed = true;
    const { atomMap: _m, ...rest } = a;
    void _m;
    return rest;
  });
  return changed ? { ...prev, atoms } : prev;
};

/** Update bond order/stereo, dropping the edit if it would violate valency. */
export const updateBondSafe = (
  prev: Molecule,
  bondId: string,
  patch: Partial<Pick<Bond, 'order' | 'stereo' | 'orderCycleRamp'>>,
): Molecule => {
  const existing = prev.bonds.find(b => b.id === bondId);
  if (!existing) return prev;
  const nextOrder = patch.order ?? existing.order;
  const nextStereo = 'stereo' in patch ? patch.stereo : existing.stereo;
  const nextRamp = 'orderCycleRamp' in patch ? patch.orderCycleRamp : existing.orderCycleRamp;

  const fromAtom = prev.atoms.find(a => a.id === existing.fromAtomId);
  const toAtom = prev.atoms.find(a => a.id === existing.toAtomId);
  if (!fromAtom || !toAtom) return prev;
  if (nextOrder === 3 && isBondInRing(prev, existing)) return prev;

  const ringAtomIds = new Set(uniqueRingPaths(prev).flat());
  if (nextOrder === 2) {
    const fromDoublesExcl = prev.bonds.filter(
      b => b.id !== existing.id && (b.fromAtomId === fromAtom.id || b.toAtomId === fromAtom.id) && b.order === 2,
    ).length;
    const toDoublesExcl = prev.bonds.filter(
      b => b.id !== existing.id && (b.fromAtomId === toAtom.id || b.toAtomId === toAtom.id) && b.order === 2,
    ).length;
    if (ringAtomIds.has(fromAtom.id) && fromDoublesExcl + 1 > 1) return prev;
    if (ringAtomIds.has(toAtom.id) && toDoublesExcl + 1 > 1) return prev;
  }

  const currentFromExcl = prev.bonds
    .filter(b => b.id !== existing.id && (b.fromAtomId === fromAtom.id || b.toAtomId === fromAtom.id))
    .reduce((sum, b) => sum + b.order, 0);
  const currentToExcl = prev.bonds
    .filter(b => b.id !== existing.id && (b.fromAtomId === toAtom.id || b.toAtomId === toAtom.id))
    .reduce((sum, b) => sum + b.order, 0);
  const maxFromValency = getMaxValencyForElement(fromAtom.element, fromAtom.charge);
  const maxToValency = getMaxValencyForElement(toAtom.element, toAtom.charge);
  if (currentFromExcl + nextOrder > maxFromValency) return prev;
  if (currentToExcl + nextOrder > maxToValency) return prev;
  const maxFromLP = getMaxLonePairsForAtom(fromAtom.element, fromAtom.charge, currentFromExcl + nextOrder);
  const maxToLP = getMaxLonePairsForAtom(toAtom.element, toAtom.charge, currentToExcl + nextOrder);
  if ((fromAtom.lonePairs ?? 0) > maxFromLP) return prev;
  if ((toAtom.lonePairs ?? 0) > maxToLP) return prev;

  return {
    ...prev,
    atoms: nextOrder === 3 ? linearlyAdjustedTripleBondAtoms(prev, existing) : prev.atoms,
    bonds: prev.bonds.map(b =>
      b.id === bondId
        ? {
            ...b,
            order: nextOrder,
            stereo: nextStereo,
            orderCycleRamp: nextRamp,
            ...(patch.order !== undefined ? { aromatic: undefined } : {}),
          }
        : b,
    ),
  };
};

// ─── Rings ────────────────────────────────────────────────────────────────

export interface AddRingParams {
  center: { x: number; y: number };
  numSides: number;
  /** True for benzene + cyclopentadiene; produces alternating double bonds. */
  isAromatic: boolean;
  /** Cyclopentadiene gets fixed 1,3-diene pattern instead of full alternation. */
  isCyclopentadiene?: boolean;
  angleOffset: number;
  rootAtomId?: string;
  attachedViaBond?: boolean;
  fusedBondId?: string;
  angleStep?: number;
  radius?: number;
}

export const addRing = (prev: Molecule, params: AddRingParams): Molecule => {
  const {
    center,
    numSides,
    isAromatic,
    isCyclopentadiene = false,
    angleOffset,
    rootAtomId,
    attachedViaBond,
    fusedBondId,
    angleStep = (Math.PI * 2) / numSides,
    radius = 40,
  } = params;

  const newAtoms: Atom[] = [];
  const newBonds: Bond[] = [];
  const atomIds: string[] = [];

  let a1: Atom | undefined;
  let a2: Atom | undefined;
  if (fusedBondId) {
    const bond = prev.bonds.find(b => b.id === fusedBondId);
    if (bond) {
      a1 = prev.atoms.find(a => a.id === bond.fromAtomId);
      a2 = prev.atoms.find(a => a.id === bond.toAtomId);
    }
  }

  // Fusion must only share the two bond endpoints — proximity merging of other
  // ring atoms collapses side-to-side fusion into a broken/overlapping ring.
  // For single-bond attach, keep a tight threshold so we don't snap onto neighbors.
  const overlapRadius = fusedBondId ? 0 : Math.min(14, radius * 0.28);

  for (let i = 0; i < numSides; i++) {
    const angle = angleOffset + i * angleStep;

    if (fusedBondId && a1 && a2) {
      if (i === 0) {
        atomIds.push(a1.id);
        continue;
      }
      if (i === 1) {
        atomIds.push(a2.id);
        continue;
      }
    } else if (i === 0 && rootAtomId && !attachedViaBond) {
      atomIds.push(rootAtomId);
      continue;
    }

    const newX = center.x + radius * Math.cos(angle);
    const newY = center.y + radius * Math.sin(angle);

    let overlap: Atom | undefined;
    if (overlapRadius > 0) {
      overlap = prev.atoms.find(a => {
        if (attachedViaBond && rootAtomId && a.id === rootAtomId) return false;
        return Math.hypot(a.x - newX, a.y - newY) < overlapRadius;
      });
    }

    if (overlap) {
      atomIds.push(overlap.id);
    } else {
      const id = newId();
      atomIds.push(id);
      newAtoms.push({ id, element: 'C', x: newX, y: newY, charge: 0 });
    }
  }

  // Phase selection for benzene-style alternation: minimise valency conflicts
  // by trying both staggered patterns and downgrading the fewest existing bonds.
  let bestPhase = 0;
  let bondsToDowngrade: string[] = [];

  if (isAromatic) {
    let minConflicts = Infinity;
    let bestDowngrades: string[] = [];

    for (let phase = 0; phase <= 1; phase++) {
      let conflicts = 0;
      const downgrades: string[] = [];
      const tempValencies: Record<string, number> = {};
      for (let i = 0; i < numSides; i++) {
        const nextIdx = (i + 1) % numSides;
        if (fusedBondId && i === 0) continue;
        const existingBond = prev.bonds.find(
          b =>
            (b.fromAtomId === atomIds[i] && b.toAtomId === atomIds[nextIdx]) ||
            (b.fromAtomId === atomIds[nextIdx] && b.toAtomId === atomIds[i]),
        );
        if (!existingBond) {
          const order = i % 2 === phase ? 2 : 1;
          tempValencies[atomIds[i]] = (tempValencies[atomIds[i]] || 0) + order;
          tempValencies[atomIds[nextIdx]] = (tempValencies[atomIds[nextIdx]] || 0) + order;
        }
      }

      for (const [id, addedValency] of Object.entries(tempValencies)) {
        const atom = prev.atoms.find(a => a.id === id);
        if (atom) {
          const currentV = bondOrderSumOf(prev, id);
          const maxV = getMaxValencyForElement(atom.element, atom.charge);
          if (currentV + addedValency > maxV) {
            const excess = currentV + addedValency - maxV;
            const connectedDoubleBonds = prev.bonds.filter(
              b => (b.fromAtomId === id || b.toAtomId === id) && b.order > 1,
            );
            let resolved = 0;
            for (const b of connectedDoubleBonds) {
              if (resolved >= excess) break;
              if (!downgrades.includes(b.id)) {
                downgrades.push(b.id);
                resolved += b.order - 1;
              }
            }
            if (resolved < excess) conflicts += excess - resolved;
          }
        }
      }

      if (
        conflicts < minConflicts ||
        (conflicts === minConflicts && downgrades.length < bestDowngrades.length)
      ) {
        minConflicts = conflicts;
        bestPhase = phase;
        bestDowngrades = downgrades;
      }
    }

    bondsToDowngrade = bestDowngrades;
  }

  for (let i = 0; i < numSides; i++) {
    const nextIdx = (i + 1) % numSides;
    if (fusedBondId && i === 0) continue;

    let order = 1;
    if (isAromatic) {
      if (isCyclopentadiene && numSides === 5) {
        order = i === 0 || i === 2 ? 2 : 1;
      } else {
        order = i % 2 === bestPhase ? 2 : 1;
      }
    }

    const existingBond = prev.bonds.find(
      b =>
        (b.fromAtomId === atomIds[i] && b.toAtomId === atomIds[nextIdx]) ||
        (b.fromAtomId === atomIds[nextIdx] && b.toAtomId === atomIds[i]),
    );
    if (!existingBond) {
      newBonds.push({ id: newId(), fromAtomId: atomIds[i], toAtomId: atomIds[nextIdx], order });
    }
  }

  if (rootAtomId && attachedViaBond && !fusedBondId) {
    const alreadyLinked = prev.bonds.some(
      b =>
        (b.fromAtomId === rootAtomId && b.toAtomId === atomIds[0]) ||
        (b.fromAtomId === atomIds[0] && b.toAtomId === rootAtomId),
    );
    if (!alreadyLinked && rootAtomId !== atomIds[0]) {
      newBonds.push({ id: newId(), fromAtomId: rootAtomId, toAtomId: atomIds[0], order: 1 });
    }
  }

  return {
    ...prev,
    atoms: [...prev.atoms, ...newAtoms],
    bonds: [
      ...prev.bonds.map(b => (bondsToDowngrade.includes(b.id) ? { ...b, order: 1 } : b)),
      ...newBonds,
    ],
  };
};

export const addChairRing = (
  prev: Molecule,
  center: { x: number; y: number },
  bondLengthPx: number,
  rootAtomId?: string,
  attachedViaBond?: boolean,
): Molecule => {
  const pts = chairRingVertices(center, bondLengthPx);
  const OVERLAP_RADIUS = 28;
  const ids: string[] = [];
  const newAtoms: Atom[] = [];

  for (let i = 0; i < pts.length; i++) {
    if (i === 0 && rootAtomId && !attachedViaBond) {
      ids.push(rootAtomId);
      continue;
    }
    const p = pts[i];
    const overlap = prev.atoms.find(a => Math.hypot(a.x - p.x, a.y - p.y) < OVERLAP_RADIUS);
    if (overlap) {
      ids.push(overlap.id);
    } else {
      const id = newId();
      ids.push(id);
      newAtoms.push({ id, element: 'C', x: p.x, y: p.y, charge: 0 });
    }
  }
  const newBonds: Bond[] = [];
  for (let i = 0; i < ids.length; i++) {
    const j = (i + 1) % ids.length;
    const exists = prev.bonds.some(
      b =>
        (b.fromAtomId === ids[i] && b.toAtomId === ids[j]) ||
        (b.fromAtomId === ids[j] && b.toAtomId === ids[i]),
    );
    if (!exists) {
      newBonds.push({ id: newId(), fromAtomId: ids[i], toAtomId: ids[j], order: 1 });
    }
  }
  if (rootAtomId && attachedViaBond) {
    const exists = prev.bonds.some(
      b =>
        (b.fromAtomId === rootAtomId && b.toAtomId === ids[0]) ||
        (b.fromAtomId === ids[0] && b.toAtomId === rootAtomId),
    );
    if (!exists) {
      newBonds.push({ id: newId(), fromAtomId: rootAtomId, toAtomId: ids[0], order: 1 });
    }
  }
  return { ...prev, atoms: [...prev.atoms, ...newAtoms], bonds: [...prev.bonds, ...newBonds] };
};

export const addBoatRing = (
  prev: Molecule,
  center: { x: number; y: number },
  bondLengthPx: number = 40,
  rootAtomId?: string,
  attachedViaBond?: boolean,
): Molecule => {
  const pts = boatRingVertices(center, bondLengthPx);
  const OVERLAP_RADIUS = 28;
  const ids: string[] = [];
  const newAtoms: Atom[] = [];

  for (let i = 0; i < pts.length; i++) {
    if (i === 0 && rootAtomId && !attachedViaBond) {
      ids.push(rootAtomId);
      continue;
    }
    const p = pts[i];
    const overlap = prev.atoms.find(a => Math.hypot(a.x - p.x, a.y - p.y) < OVERLAP_RADIUS);
    if (overlap) {
      ids.push(overlap.id);
    } else {
      const id = newId();
      ids.push(id);
      newAtoms.push({ id, element: 'C', x: p.x, y: p.y, charge: 0 });
    }
  }
  const newBonds: Bond[] = [];
  for (let i = 0; i < ids.length; i++) {
    const j = (i + 1) % ids.length;
    const exists = prev.bonds.some(
      b =>
        (b.fromAtomId === ids[i] && b.toAtomId === ids[j]) ||
        (b.fromAtomId === ids[j] && b.toAtomId === ids[i]),
    );
    if (!exists) {
      newBonds.push({ id: newId(), fromAtomId: ids[i], toAtomId: ids[j], order: 1 });
    }
  }
  if (rootAtomId && attachedViaBond) {
    const exists = prev.bonds.some(
      b =>
        (b.fromAtomId === rootAtomId && b.toAtomId === ids[0]) ||
        (b.fromAtomId === ids[0] && b.toAtomId === rootAtomId),
    );
    if (!exists) {
      newBonds.push({ id: newId(), fromAtomId: rootAtomId, toAtomId: ids[0], order: 1 });
    }
  }
  return { ...prev, atoms: [...prev.atoms, ...newAtoms], bonds: [...prev.bonds, ...newBonds] };
};

export const addChain = (
  prev: Molecule,
  points: { x: number; y: number }[],
  placementElement: string,
  startAtomId?: string,
): Molecule => {
  const newAtoms: Atom[] = [];
  const newBonds: Bond[] = [];
  const atomIds: string[] = [];

  for (let i = 0; i < points.length; i++) {
    if (i === 0 && startAtomId) {
      atomIds.push(startAtomId);
      continue;
    }
    const pt = points[i];
    const OVERLAP_RADIUS = 30;
    const candidate = prev.atoms.find(a => Math.hypot(a.x - pt.x, a.y - pt.y) < OVERLAP_RADIUS);
    // For attached chains, always materialize the first new zig vertex as a
    // fresh atom so the branch starts with a true zig-zag bond and never
    // reuses nearby structure.
    const overlap = startAtomId && i === 1 ? undefined : candidate;
    if (overlap) {
      atomIds.push(overlap.id);
    } else {
      const id = newId();
      atomIds.push(id);
      newAtoms.push({ id, element: placementElement, x: pt.x, y: pt.y, charge: 0 });
    }
  }

  for (let i = 0; i < atomIds.length - 1; i++) {
    const fromId = atomIds[i];
    const toId = atomIds[i + 1];
    const existingBond = prev.bonds.find(
      b =>
        (b.fromAtomId === fromId && b.toAtomId === toId) ||
        (b.fromAtomId === toId && b.toAtomId === fromId),
    );
    if (!existingBond) {
      newBonds.push({ id: newId(), fromAtomId: fromId, toAtomId: toId, order: 1 });
    }
  }

  return {
    ...prev,
    atoms: [...prev.atoms, ...newAtoms],
    bonds: [...prev.bonds, ...newBonds],
  };
};

// ─── Strokes / Reaction arrows / Canvas text ──────────────────────────────

export const addStroke = (prev: Molecule, stroke: Stroke): Molecule => ({
  ...prev,
  strokes: [...(prev.strokes || []), stroke],
});

export const addReactionArrow = (prev: Molecule, arrow: ReactionArrow): Molecule => ({
  ...prev,
  reactionArrows: [...(prev.reactionArrows || []), arrow],
});

export interface ReactionMultiStepStepInput {
  reagentAbove?: string;
  reagentBelow?: string;
  kind?: ReactionArrowKind;
  /** Override shaft length for this step (px). */
  segmentLength?: number;
}

export interface AddReactionMultiStepRouteInput {
  /** Stable id linking arrows; use a new id per synthetic route. */
  groupId: string;
  title?: string;
  startX: number;
  startY: number;
  /** Default horizontal length of each arrow shaft (px). */
  segmentLength: number;
  /** Gap between end of one arrow and start of the next (px). */
  gapBetweenSteps?: number;
  defaultKind?: ReactionArrowKind;
  /** One entry per synthetic step (left → right). */
  steps: ReactionMultiStepStepInput[];
}

/**
 * Lay out a horizontal multi-step reaction with shared `multiStepGroupId` / `stepIndex`
 * and optional group title in `reactionMultiStepGroups`.
 */
export const addReactionMultiStepRoute = (
  prev: Molecule,
  input: AddReactionMultiStepRouteInput,
): { molecule: Molecule; arrowIds: string[] } => {
  if (input.steps.length === 0) return { molecule: prev, arrowIds: [] };
  const gap = input.gapBetweenSteps ?? 72;
  const defaultKind = input.defaultKind ?? 'straight';
  const newArrows: ReactionArrow[] = [];
  let cursorX = input.startX;
  const y = input.startY;

  input.steps.forEach((step, i) => {
    const L = step.segmentLength ?? input.segmentLength;
    const x1 = cursorX;
    const x2 = cursorX + L;
    newArrows.push({
      id: newId(),
      x1,
      y1: y,
      x2,
      y2: y,
      kind: step.kind ?? defaultKind,
      reagentAbove: step.reagentAbove,
      reagentBelow: step.reagentBelow,
      multiStepGroupId: input.groupId,
      stepIndex: i,
    });
    cursorX = x2 + gap;
  });

  const prevMeta = prev.reactionMultiStepGroups ?? {};
  const mergedMeta = {
    ...prevMeta,
    [input.groupId]: {
      ...prevMeta[input.groupId],
      ...(input.title !== undefined && input.title !== '' ? { title: input.title } : {}),
    },
  };

  return {
    molecule: {
      ...prev,
      reactionArrows: [...(prev.reactionArrows ?? []), ...newArrows],
      reactionMultiStepGroups: mergedMeta,
    },
    arrowIds: newArrows.map(a => a.id),
  };
};

export const updateReactionArrow = (
  prev: Molecule,
  id: string,
  patch: Partial<Omit<ReactionArrow, 'id'>>,
): Molecule => {
  const partial = Object.fromEntries(
    Object.entries(patch).filter(([, v]) => v !== undefined),
  ) as Partial<Omit<ReactionArrow, 'id'>>;
  if (Object.keys(partial).length === 0) return prev;
  return {
    ...prev,
    reactionArrows: (prev.reactionArrows || []).map(a =>
      a.id === id ? { ...a, ...partial } : a,
    ),
  };
};

export const addCanvasText = (prev: Molecule, t: CanvasText): Molecule => ({
  ...prev,
  canvasTexts: [...(prev.canvasTexts || []), t],
});

export const addCanvasShape = (prev: Molecule, shape: CanvasShape): Molecule => ({
  ...prev,
  canvasShapes: [...(prev.canvasShapes || []), shape],
});

export const addCanvasImage = (prev: Molecule, image: CanvasImage): Molecule => ({
  ...prev,
  canvasImages: [...(prev.canvasImages || []), image],
});

export const updateCanvasText = (
  prev: Molecule,
  id: string,
  patch: Partial<CanvasText>,
): Molecule => ({
  ...prev,
  canvasTexts: (prev.canvasTexts || []).map(ct => (ct.id === id ? { ...ct, ...patch } : ct)),
});

// ─── Erase / clear / delete / duplicate ───────────────────────────────────

export type EraseHit =
  | { type: 'atom'; atomId: string }
  | { type: 'bond'; bondId: string }
  | { type: 'stroke'; strokeId: string }
  | { type: 'reactionArrow'; id: string }
  | { type: 'canvasText'; id: string }
  | { type: 'canvasShape'; id: string }
  | { type: 'canvasImage'; id: string };

export const eraseAt = (prev: Molecule, hit: EraseHit): Molecule => {
  if (hit.type === 'atom') {
    const id = hit.atomId;
    return {
      ...prev,
      atoms: prev.atoms.filter(a => a.id !== id),
      bonds: prev.bonds.filter(b => b.fromAtomId !== id && b.toAtomId !== id),
    };
  }
  if (hit.type === 'bond') return { ...prev, bonds: prev.bonds.filter(b => b.id !== hit.bondId) };
  if (hit.type === 'stroke')
    return { ...prev, strokes: (prev.strokes || []).filter(s => s.id !== hit.strokeId) };
  if (hit.type === 'canvasText')
    return { ...prev, canvasTexts: (prev.canvasTexts || []).filter(t => t.id !== hit.id) };
  if (hit.type === 'canvasShape')
    return { ...prev, canvasShapes: (prev.canvasShapes || []).filter(s => s.id !== hit.id) };
  if (hit.type === 'canvasImage')
    return { ...prev, canvasImages: (prev.canvasImages || []).filter(img => img.id !== hit.id) };
  return { ...prev, reactionArrows: (prev.reactionArrows || []).filter(a => a.id !== hit.id) };
};

export const clearAll = (): Molecule => ({
  atoms: [],
  bonds: [],
  canvasShapes: [],
  strokes: [],
  reactionArrows: [],
  canvasTexts: [],
  canvasImages: [],
});

export const deleteAtomSelection = (prev: Molecule, atomIds: string[]): Molecule => {
  const set = new Set(atomIds);
  return {
    ...prev,
    atoms: prev.atoms.filter(a => !set.has(a.id)),
    bonds: prev.bonds.filter(b => !set.has(b.fromAtomId) && !set.has(b.toAtomId)),
  };
};

export const deleteCanvasText = (prev: Molecule, id: string): Molecule => ({
  ...prev,
  canvasTexts: (prev.canvasTexts || []).filter(t => t.id !== id),
});

export const deleteReactionArrow = (prev: Molecule, id: string): Molecule => ({
  ...prev,
  reactionArrows: (prev.reactionArrows || []).filter(a => a.id !== id),
});

export const deleteStroke = (prev: Molecule, id: string): Molecule => ({
  ...prev,
  strokes: (prev.strokes || []).filter(s => s.id !== id),
});

export const deleteCanvasShape = (prev: Molecule, id: string): Molecule => ({
  ...prev,
  canvasShapes: (prev.canvasShapes || []).filter(s => s.id !== id),
});

export const deleteCanvasImage = (prev: Molecule, id: string): Molecule => ({
  ...prev,
  canvasImages: (prev.canvasImages || []).filter(img => img.id !== id),
});

/** Append imported atoms/bonds (ids must already be unique in the document). */
export const mergeImportedStructure = (
  prev: Molecule,
  atoms: Atom[],
  bonds: Bond[],
): Molecule => ({
  ...prev,
  atoms: [...prev.atoms, ...atoms],
  bonds: [...prev.bonds, ...bonds],
});

/** Replace atoms/bonds; optionally keep non-structural canvas layers. */
export const replaceStructureFromImport = (
  prev: Molecule,
  atoms: Atom[],
  bonds: Bond[],
  keepAnnotations: boolean,
): Molecule => {
  if (!keepAnnotations) {
    return { atoms, bonds };
  }
  return {
    atoms,
    bonds,
    strokes: prev.strokes,
    reactionArrows: prev.reactionArrows,
    canvasTexts: prev.canvasTexts,
    canvasShapes: prev.canvasShapes,
    canvasImages: prev.canvasImages,
    ringFills: prev.ringFills,
  };
};

/** Duplicate the given atoms (and bonds wholly between them) shifted by (dx, dy). */
export const duplicateAtoms = (
  prev: Molecule,
  atomIds: string[],
  dx: number,
  dy: number,
): { molecule: Molecule; newAtomIds: string[] } => {
  const set = new Set(atomIds);
  const idMap = new Map<string, string>();
  const newAtoms: Atom[] = [];
  prev.atoms.forEach(a => {
    if (set.has(a.id)) {
      const id = newId();
      idMap.set(a.id, id);
      newAtoms.push({ ...a, id, x: a.x + dx, y: a.y + dy });
    }
  });
  const newBonds: Bond[] = [];
  prev.bonds.forEach(b => {
    if (idMap.has(b.fromAtomId) && idMap.has(b.toAtomId)) {
      newBonds.push({
        ...b,
        id: newId(),
        fromAtomId: idMap.get(b.fromAtomId)!,
        toAtomId: idMap.get(b.toAtomId)!,
      });
    }
  });
  return {
    molecule: {
      ...prev,
      atoms: [...prev.atoms, ...newAtoms],
      bonds: [...prev.bonds, ...newBonds],
    },
    newAtomIds: newAtoms.map(a => a.id),
  };
};

export const duplicateReactionArrow = (
  prev: Molecule,
  id: string,
  dx: number,
  dy: number,
): { molecule: Molecule; newId: string } => {
  const src = prev.reactionArrows?.find(a => a.id === id);
  if (!src) return { molecule: prev, newId: '' };
  const nid = newId();
  const copy: ReactionArrow = {
    ...src,
    id: nid,
    x1: src.x1 + dx,
    y1: src.y1 + dy,
    x2: src.x2 + dx,
    y2: src.y2 + dy,
  };
  if (src.cx !== undefined) copy.cx = src.cx + dx;
  if (src.cy !== undefined) copy.cy = src.cy + dy;
  if (src.c1x !== undefined) copy.c1x = src.c1x + dx;
  if (src.c1y !== undefined) copy.c1y = src.c1y + dy;
  if (src.c2x !== undefined) copy.c2x = src.c2x + dx;
  if (src.c2y !== undefined) copy.c2y = src.c2y + dy;
  return {
    molecule: { ...prev, reactionArrows: [...(prev.reactionArrows ?? []), copy] },
    newId: nid,
  };
};

export const duplicateCanvasText = (
  prev: Molecule,
  id: string,
  dx: number,
  dy: number,
): { molecule: Molecule; newId: string } => {
  const src = prev.canvasTexts?.find(t => t.id === id);
  if (!src) return { molecule: prev, newId: '' };
  const nid = newId();
  const copy: CanvasText = { ...src, id: nid, x: src.x + dx, y: src.y + dy };
  return {
    molecule: { ...prev, canvasTexts: [...(prev.canvasTexts ?? []), copy] },
    newId: nid,
  };
};

export const duplicateStroke = (
  prev: Molecule,
  id: string,
  dx: number,
  dy: number,
): { molecule: Molecule; newId: string } => {
  const src = prev.strokes?.find(s => s.id === id);
  if (!src) return { molecule: prev, newId: '' };
  const nid = newId();
  const copy: Stroke = {
    ...src,
    id: nid,
    points: src.points.map(p => ({ x: p.x + dx, y: p.y + dy })),
  };
  return {
    molecule: { ...prev, strokes: [...(prev.strokes ?? []), copy] },
    newId: nid,
  };
};

export const duplicateCanvasShape = (
  prev: Molecule,
  id: string,
  dx: number,
  dy: number,
): { molecule: Molecule; newId: string } => {
  const src = prev.canvasShapes?.find(s => s.id === id);
  if (!src) return { molecule: prev, newId: '' };
  const nid = newId();
  const copy: CanvasShape = {
    ...src,
    id: nid,
    x1: src.x1 + dx,
    y1: src.y1 + dy,
    x2: src.x2 + dx,
    y2: src.y2 + dy,
  };
  return {
    molecule: { ...prev, canvasShapes: [...(prev.canvasShapes ?? []), copy] },
    newId: nid,
  };
};

export const duplicateCanvasImage = (
  prev: Molecule,
  id: string,
  dx: number,
  dy: number,
): { molecule: Molecule; newId: string } => {
  const src = prev.canvasImages?.find(img => img.id === id);
  if (!src) return { molecule: prev, newId: '' };
  const nid = newId();
  const copy: CanvasImage = {
    ...src,
    id: nid,
    x: src.x + dx,
    y: src.y + dy,
  };
  return {
    molecule: { ...prev, canvasImages: [...(prev.canvasImages ?? []), copy] },
    newId: nid,
  };
};

/** Apply an alias to a single atom (e.g. collapse-to-abbreviation menu item). */
export const setAtomAlias = (prev: Molecule, atomId: string, alias: string): Molecule => ({
  ...prev,
  atoms: prev.atoms.map(a => (a.id === atomId ? { ...a, alias } : a)),
});

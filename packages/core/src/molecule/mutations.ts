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
  CanvasOrbital,
  CanvasShape,
  CanvasText,
  Molecule,
  ReactionArrow,
  ReactionArrowKind,
  SruBracket,
  Stroke,
} from '@moldraw/domain';
import {
  bondSkipsCovalentValence,
  canApplyFormalChargeDelta,
  covalentBondOrderContribution,
  getMaxValencyForElement,
  getMaxLonePairsForAtom,
} from '@moldraw/domain';
import { pruneRingConformations, ringSignature, uniqueRingPaths } from '@moldraw/domain';
import { boatRingVertices } from '../geometry/boatRing';
import { chairRingVertices } from '../geometry/chairRing';
import { parseMolblock } from '../io/molblock';
import {
  displayCoordsMolecule,
  joinAtomsIntoPerspectivePose,
} from './perspective3D';

const newId = () => Math.random().toString(36).substr(2, 9);

/** World padding around member-atom AABB when placing / syncing SRU brackets. */
export const SRU_BRACKET_PAD = 18;

/** Axis-aligned padded box covering `atomIds`, or null when none are present. */
export const sruBracketBoxForAtoms = (
  mol: Molecule,
  atomIds: string[],
  pad: number = SRU_BRACKET_PAD,
): { x1: number; y1: number; x2: number; y2: number } | null => {
  const set = new Set(atomIds);
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const a of mol.atoms) {
    if (!set.has(a.id)) continue;
    minX = Math.min(minX, a.x);
    maxX = Math.max(maxX, a.x);
    minY = Math.min(minY, a.y);
    maxY = Math.max(maxY, a.y);
  }
  if (!Number.isFinite(minX)) return null;
  return { x1: minX - pad, y1: minY - pad, x2: maxX + pad, y2: maxY + pad };
};

/** Drop SRUs with no remaining atoms; filter stale atom ids. */
export const pruneSruBrackets = (mol: Molecule): Molecule => {
  if (!mol.sruBrackets?.length) return mol;
  const atomSet = new Set(mol.atoms.map(a => a.id));
  const next = mol.sruBrackets
    .map(b => ({ ...b, atomIds: b.atomIds.filter(id => atomSet.has(id)) }))
    .filter(b => b.atomIds.length > 0);
  if (
    next.length === mol.sruBrackets.length &&
    next.every((b, i) => b.atomIds.length === mol.sruBrackets![i].atomIds.length)
  ) {
    return mol;
  }
  return { ...mol, sruBrackets: next.length ? next : undefined };
};

/** Recompute SRU boxes from current member-atom positions (optionally only those touched). */
export const syncSruBracketsToAtoms = (
  mol: Molecule,
  touchedAtomIds?: readonly string[],
): Molecule => {
  if (!mol.sruBrackets?.length) return mol;
  const touched = touchedAtomIds ? new Set(touchedAtomIds) : null;
  let changed = false;
  const next = mol.sruBrackets.map(b => {
    if (touched && !b.atomIds.some(id => touched.has(id))) return b;
    const box = sruBracketBoxForAtoms(mol, b.atomIds);
    if (!box) return b;
    if (box.x1 === b.x1 && box.y1 === b.y1 && box.x2 === b.x2 && box.y2 === b.y2) return b;
    changed = true;
    return { ...b, ...box };
  });
  return changed ? { ...mol, sruBrackets: next } : mol;
};

const bondOrderSumOf = (mol: Molecule, atomId: string): number =>
  mol.bonds
    .filter(b => b.fromAtomId === atomId || b.toAtomId === atomId)
    .reduce((s, b) => s + covalentBondOrderContribution(b), 0);

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

export const addAtom = (prev: Molecule, atom: Atom): Molecule => {
  // Keep edits in the active 3D view: new atoms join the pose at canvas x/y
  // with z near the current pose mid-depth.
  return joinAtomsIntoPerspectivePose({ ...prev, atoms: [...prev.atoms, atom] }, [atom.id]);
};

export const updateAtomElement = (
  prev: Molecule,
  atomId: string,
  element: string,
): Molecule => {
  const atom = prev.atoms.find(a => a.id === atomId);
  if (!atom) return prev;
  const orderSum = bondOrderSumOf(prev, atomId);
  const maxLP = getMaxLonePairsForAtom(element, atom.charge, orderSum);
  const lonePairs = Math.min(atom.lonePairs ?? 0, maxLP);
  // Same element, nothing to clear → genuine no-op (keeps undo history / revision clean).
  if (atom.element === element && atom.alias == null && (atom.lonePairs ?? 0) === lonePairs) return prev;
  return {
    ...prev,
    atoms: prev.atoms.map(a =>
      a.id === atomId
        ? { ...a, element, alias: undefined, lonePairs }
        : a,
    ),
  };
};

export const updateAtomCharge = (prev: Molecule, atomId: string, delta: number): Molecule => {
  const atom = prev.atoms.find(a => a.id === atomId);
  if (!atom || !delta) return prev;
  const orderSum = bondOrderSumOf(prev, atomId);
  if (!canApplyFormalChargeDelta(atom.element, atom.charge ?? 0, delta, orderSum)) {
    return prev;
  }
  const nextCharge = (atom.charge ?? 0) + delta;
  const maxLP = getMaxLonePairsForAtom(atom.element, nextCharge, orderSum);
  return {
    ...prev,
    atoms: prev.atoms.map(a => {
      if (a.id !== atomId) return a;
      const next: typeof a = {
        ...a,
        charge: nextCharge,
        lonePairs: Math.min(a.lonePairs ?? 0, maxLP),
      };
      if (nextCharge === 0) {
        delete next.chargeOffset;
        delete next.chargeMarkStyle;
      } else if (Math.abs(nextCharge) !== 1) {
        delete next.chargeMarkStyle;
      } else {
        delete next.chargeMarkStyle;
      }
      return next;
    }),
  };
};

/** Set absolute formal charge (e.g. clear selected charge mark → 0). */
export const setAtomCharge = (
  prev: Molecule,
  atomId: string,
  charge: number,
  markStyle?: 'plain' | 'circled',
): Molecule => {
  const atom = prev.atoms.find(a => a.id === atomId);
  if (!atom) return prev;
  const nextCharge = Math.trunc(charge);
  const prevCharge = atom.charge ?? 0;
  const prevStyle = atom.chargeMarkStyle;
  const nextStyle =
    nextCharge === 0
      ? undefined
      : markStyle ??
        (Math.abs(nextCharge) === 1 ? (prevStyle ?? 'plain') : undefined);
  if (prevCharge === nextCharge && prevStyle === nextStyle) return prev;
  const orderSum = bondOrderSumOf(prev, atomId);
  const delta = nextCharge - prevCharge;
  // Clearing charge always allowed; non-zero targets respect valency caps.
  if (
    nextCharge !== 0 &&
    delta !== 0 &&
    !canApplyFormalChargeDelta(atom.element, prevCharge, delta, orderSum)
  ) {
    return prev;
  }
  const maxLP = getMaxLonePairsForAtom(atom.element, nextCharge, orderSum);
  return {
    ...prev,
    atoms: prev.atoms.map(a => {
      if (a.id !== atomId) return a;
      const next: typeof a = {
        ...a,
        charge: nextCharge,
        lonePairs: Math.min(a.lonePairs ?? 0, maxLP),
      };
      if (nextCharge === 0) {
        delete next.chargeOffset;
        delete next.chargeMarkStyle;
      } else if (nextStyle === 'circled' && Math.abs(nextCharge) === 1) {
        next.chargeMarkStyle = 'circled';
      } else {
        delete next.chargeMarkStyle;
      }
      return next;
    }),
  };
};

/**
 * Show or hide forced element labels (teaching: explicit "C" on skeletal carbons).
 * No-op when the atom set is unchanged.
 */
export const setAtomsShowElementLabel = (
  prev: Molecule,
  atomIds: string[],
  show: boolean,
): Molecule => {
  const idSet = new Set(atomIds);
  if (idSet.size === 0) return prev;
  let changed = false;
  const atoms = prev.atoms.map(a => {
    if (!idSet.has(a.id)) return a;
    const cur = Boolean(a.showElementLabel);
    if (cur === show) return a;
    changed = true;
    if (!show) {
      const { showElementLabel: _drop, ...rest } = a;
      void _drop;
      return rest;
    }
    return { ...a, showElementLabel: true };
  });
  return changed ? { ...prev, atoms } : prev;
};

/** Set or clear a partial-charge mark (δ+ / δ−). Values: +1, −1, or 0 to clear. */
export const setAtomDeltaCharge = (
  prev: Molecule,
  atomId: string,
  deltaCharge: number,
): Molecule => {
  const atom = prev.atoms.find(a => a.id === atomId);
  if (!atom) return prev;
  const next =
    deltaCharge > 0 ? 1 : deltaCharge < 0 ? -1 : 0;
  const cur = atom.deltaCharge ?? 0;
  if (cur === next) return prev;
  return {
    ...prev,
    atoms: prev.atoms.map(a => {
      if (a.id !== atomId) return a;
      if (next === 0) {
        const { deltaCharge: _d, deltaChargeOffset: _o, ...rest } = a;
        void _d;
        void _o;
        return rest;
      }
      return { ...a, deltaCharge: next };
    }),
  };
};

/**
 * Charge/δ mark position is a vector from the **atom center**.
 * Drag orbits on a small ring: never closer than R_MIN (label gap), never farther than R_MAX.
 */
export const CHARGE_MARK_R_MIN_PX = 14;
export const CHARGE_MARK_R_MAX_PX = 22;
export const CHARGE_MARK_R_DEFAULT_PX = 16;
/** @deprecated Use CHARGE_MARK_R_MAX_PX */
export const MAX_CHARGE_MARK_OFFSET_PX = CHARGE_MARK_R_MAX_PX;

/** Clamp to the orbital ring around the atom (preview and commit stay in sync). */
export const clampChargeMarkOffset = (x: number, y: number): { x: number; y: number } => {
  const d = Math.hypot(x, y);
  if (d < 1e-6) return { x: CHARGE_MARK_R_DEFAULT_PX, y: -3 };
  const r = Math.min(CHARGE_MARK_R_MAX_PX, Math.max(CHARGE_MARK_R_MIN_PX, d));
  return { x: (x / d) * r, y: (y / d) * r };
};

/** Set formal-charge mark position relative to atom center (`null` = default seat). */
export const setAtomChargeOffset = (
  prev: Molecule,
  atomId: string,
  offset: { x: number; y: number } | null,
): Molecule => {
  const atom = prev.atoms.find(a => a.id === atomId);
  if (!atom || !(atom.charge ?? 0)) return prev;
  return {
    ...prev,
    atoms: prev.atoms.map(a => {
      if (a.id !== atomId) return a;
      if (!offset) {
        const { chargeOffset: _drop, ...rest } = a;
        void _drop;
        return rest;
      }
      return { ...a, chargeOffset: clampChargeMarkOffset(offset.x, offset.y) };
    }),
  };
};

/** Set δ± mark position relative to atom center (`null` = default seat). */
export const setAtomDeltaChargeOffset = (
  prev: Molecule,
  atomId: string,
  offset: { x: number; y: number } | null,
): Molecule => {
  const atom = prev.atoms.find(a => a.id === atomId);
  if (!atom || !(atom.deltaCharge ?? 0)) return prev;
  return {
    ...prev,
    atoms: prev.atoms.map(a => {
      if (a.id !== atomId) return a;
      if (!offset) {
        const { deltaChargeOffset: _drop, ...rest } = a;
        void _drop;
        return rest;
      }
      return { ...a, deltaChargeOffset: clampChargeMarkOffset(offset.x, offset.y) };
    }),
  };
};

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

/** Prefer lone-pair dots above or below the atom (screen-upright). */
export const setAtomLonePairSide = (
  prev: Molecule,
  atomId: string,
  side: 'above' | 'below',
): Molecule => ({
  ...prev,
  atoms: prev.atoms.map(a => {
    if (a.id !== atomId) return a;
    const cur = a.lonePairSide ?? 'above';
    return cur === side ? a : { ...a, lonePairSide: side };
  }),
});

/** Set or clear a single free radical (unpaired electron) on an atom. */
export const setAtomRadical = (prev: Molecule, atomId: string, radical: number): Molecule => ({
  ...prev,
  atoms: prev.atoms.map(a => {
    if (a.id !== atomId) return a;
    const next = radical > 0 ? 1 : 0;
    const cur = a.radical ?? 0;
    if (next === cur) return a;
    return next > 0 ? { ...a, radical: next } : { ...a, radical: undefined };
  }),
});

/** Formal charge + radical in one step (radical cation / anion). */
export const setAtomRadicalIon = (
  prev: Molecule,
  atomId: string,
  charge: number,
  radical: number,
): Molecule => setAtomRadical(setAtomCharge(prev, atomId, charge), atomId, radical);

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
  const pose = prev.perspective3D;
  if (pose) {
    // Edits stay in the 3D perspective view: move pose + keep Atom.x/y in sync
    // with the projected depiction (so Clear does not snap back to pre-3D coords).
    const positions = { ...pose.positions };
    for (const id of atomIds) {
      const p = positions[id];
      if (p) positions[id] = { ...p, x: p.x + dx, y: p.y + dy };
    }
    const next: Molecule = {
      ...prev,
      atoms: prev.atoms.map(a => (set.has(a.id) ? { ...a, x: a.x + dx, y: a.y + dy } : a)),
      perspective3D: { ...pose, positions },
    };
    return syncSruBracketsToAtoms(next, atomIds);
  }
  const next: Molecule = {
    ...prev,
    atoms: prev.atoms.map(a => (set.has(a.id) ? { ...a, x: a.x + dx, y: a.y + dy } : a)),
  };
  return syncSruBracketsToAtoms(next, atomIds);
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
  const rotateXY = (x: number, y: number) => ({
    x: cx + c * (x - cx) - s * (y - cy),
    y: cy + s * (x - cx) + c * (y - cy),
  });
  const pose = prev.perspective3D;
  if (pose) {
    const positions = { ...pose.positions };
    for (const id of atomIds) {
      const p = positions[id];
      if (!p) continue;
      const r = rotateXY(p.x, p.y);
      positions[id] = { ...p, x: r.x, y: r.y };
    }
    const next: Molecule = {
      ...prev,
      atoms: prev.atoms.map(a => {
        if (!set.has(a.id)) return a;
        const r = rotateXY(a.x, a.y);
        return { ...a, x: r.x, y: r.y };
      }),
      perspective3D: { ...pose, positions },
    };
    return syncSruBracketsToAtoms(next, atomIds);
  }
  const next: Molecule = {
    ...prev,
    atoms: prev.atoms.map(a => {
      if (!set.has(a.id)) return a;
      const r = rotateXY(a.x, a.y);
      return { ...a, x: r.x, y: r.y };
    }),
  };
  return syncSruBracketsToAtoms(next, atomIds);
};

export const scaleAtoms = (
  prev: Molecule,
  atomIds: string[],
  cx: number,
  cy: number,
  factor: number,
  factorY?: number,
): Molecule => {
  if (atomIds.length === 0 || !Number.isFinite(factor)) return prev;
  const fx = Math.max(0.05, Math.min(20, factor));
  const fy = Math.max(0.05, Math.min(20, factorY ?? factor));
  if (Math.abs(fx - 1) < 1e-7 && Math.abs(fy - 1) < 1e-7) return prev;
  const set = new Set(atomIds);
  const scaleXY = (x: number, y: number) => ({
    x: cx + (x - cx) * fx,
    y: cy + (y - cy) * fy,
  });
  const pose = prev.perspective3D;
  if (pose) {
    const positions = { ...pose.positions };
    for (const id of atomIds) {
      const p = positions[id];
      if (!p) continue;
      const r = scaleXY(p.x, p.y);
      positions[id] = { ...p, x: r.x, y: r.y };
    }
    const next: Molecule = {
      ...prev,
      atoms: prev.atoms.map(a => {
        if (!set.has(a.id)) return a;
        const r = scaleXY(a.x, a.y);
        return { ...a, x: r.x, y: r.y };
      }),
      perspective3D: { ...pose, positions },
    };
    return syncSruBracketsToAtoms(next, atomIds);
  }
  const next: Molecule = {
    ...prev,
    atoms: prev.atoms.map(a => {
      if (!set.has(a.id)) return a;
      const r = scaleXY(a.x, a.y);
      return { ...a, x: r.x, y: r.y };
    }),
  };
  return syncSruBracketsToAtoms(next, atomIds);
};

/**
 * Reflect selected atoms across a vertical (`horizontal` flip) or horizontal
 * (`vertical` flip) axis through (cx, cy). Stereo wedge/dash bonds wholly inside
 * the selection have endpoints swapped so absolute stereochemistry is preserved.
 */
export const reflectAtoms = (
  prev: Molecule,
  atomIds: string[],
  cx: number,
  cy: number,
  axis: 'horizontal' | 'vertical',
): Molecule => {
  if (atomIds.length === 0) return prev;
  const set = new Set(atomIds);
  const reflectXY = (x: number, y: number) =>
    axis === 'horizontal' ? { x: 2 * cx - x, y } : { x, y: 2 * cy - y };

  const pose = prev.perspective3D;
  let next: Molecule;
  if (pose) {
    const positions = { ...pose.positions };
    for (const id of atomIds) {
      const p = positions[id];
      if (!p) continue;
      const r = reflectXY(p.x, p.y);
      positions[id] = { ...p, x: r.x, y: r.y };
    }
    next = {
      ...prev,
      atoms: prev.atoms.map(a => {
        if (!set.has(a.id)) return a;
        const r = reflectXY(a.x, a.y);
        return { ...a, x: r.x, y: r.y };
      }),
      perspective3D: { ...pose, positions },
    };
  } else {
    next = {
      ...prev,
      atoms: prev.atoms.map(a => {
        if (!set.has(a.id)) return a;
        const r = reflectXY(a.x, a.y);
        return { ...a, x: r.x, y: r.y };
      }),
    };
  }

  // Mirror inverts wedge/dash meaning unless we reverse directed stereo bonds.
  next = {
    ...next,
    bonds: next.bonds.map(b => {
      if (!set.has(b.fromAtomId) || !set.has(b.toAtomId)) return b;
      if (b.stereo !== 'wedge' && b.stereo !== 'dash') return b;
      return { ...b, fromAtomId: b.toAtomId, toAtomId: b.fromAtomId };
    }),
  };
  return syncSruBracketsToAtoms(next, atomIds);
};

// ─── Bonds ────────────────────────────────────────────────────────────────

/**
 * How strictly bond edits are policed.
 *
 * - `relaxed` (sketcher default): only *structural* problems are refused —
 *   self-bonds, duplicate edges, unknown atoms. Valency overflow, cumulated
 *   ring double bonds and ring triple bonds are allowed; the canvas flags the
 *   affected atoms with an octet warning so the user can finish the edit they
 *   are in the middle of (e.g. converting a Kekulé ring bond by bond).
 * - `strict`: legacy behaviour — chemically undefined results are refused.
 *   Used where the result must be well-defined (agents / API with
 *   `strict: true`, fragment auto-attach, explicit-H placement).
 */
export type BondChemistryMode = 'relaxed' | 'strict';

export interface BondEditOptions {
  /** Refuse chemically undefined results instead of allowing them (default: allow). */
  strict?: boolean;
}

/** Structural problems only (never allowed, in any mode). */
export const explainBondStructuralRejection = (
  prev: Molecule,
  bond: Pick<Bond, 'fromAtomId' | 'toAtomId'>,
): string | null => {
  if (bond.fromAtomId === bond.toAtomId) return 'a bond cannot connect an atom to itself';
  const duplicate = prev.bonds.find(
    b =>
      (b.fromAtomId === bond.fromAtomId && b.toAtomId === bond.toAtomId) ||
      (b.fromAtomId === bond.toAtomId && b.toAtomId === bond.fromAtomId),
  );
  if (duplicate) {
    return `atoms are already bonded (bond "${duplicate.id}", order ${duplicate.order}); use molecule.updateBond to change its order`;
  }
  const fromAtom = prev.atoms.find(a => a.id === bond.fromAtomId);
  const toAtom = prev.atoms.find(a => a.id === bond.toAtomId);
  if (!fromAtom) return `unknown atom id "${bond.fromAtomId}"`;
  if (!toAtom) return `unknown atom id "${bond.toAtomId}"`;
  return null;
};

/** Whether `bond` may be added to `prev` (valency, duplicates, ring rules). */
export const canAddBond = (
  prev: Molecule,
  bond: Pick<Bond, 'fromAtomId' | 'toAtomId' | 'order'> & {
    dative?: boolean;
    dotted?: boolean;
    queryType?: Bond['queryType'];
  },
  opts: BondEditOptions = { strict: true },
): boolean => {
  if (explainBondStructuralRejection(prev, bond)) return false;
  if (!opts.strict) return true;

  const fromAtom = prev.atoms.find(a => a.id === bond.fromAtomId)!;
  const toAtom = prev.atoms.find(a => a.id === bond.toAtomId)!;
  if (bond.order === 3 && wouldCloseRing(prev, bond.fromAtomId, bond.toAtomId)) return false;

  // Dative / dotted (H-bond) / query: allow without covalent valency checks.
  if (bondSkipsCovalentValence(bond)) return true;

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
 * Human/agent-readable reason why `canAddBond` would reject this bond, or
 * `null` when the bond is acceptable. Mirrors `canAddBond`'s rule order.
 */
export const explainBondRejection = (
  prev: Molecule,
  bond: Pick<Bond, 'fromAtomId' | 'toAtomId' | 'order'> & {
    dative?: boolean;
    dotted?: boolean;
    queryType?: Bond['queryType'];
  },
  opts: BondEditOptions = { strict: true },
): string | null => {
  const structural = explainBondStructuralRejection(prev, bond);
  if (structural) return structural;
  if (!opts.strict) return null;
  const fromAtom = prev.atoms.find(a => a.id === bond.fromAtomId)!;
  const toAtom = prev.atoms.find(a => a.id === bond.toAtomId)!;
  if (bond.order === 3 && wouldCloseRing(prev, bond.fromAtomId, bond.toAtomId)) {
    return 'a triple bond cannot close a ring';
  }
  if (bondSkipsCovalentValence(bond)) return null;
  const ringAtomIds = new Set(uniqueRingPaths(prev).flat());
  const doubleCount = (id: string) =>
    prev.bonds.filter(b => (b.fromAtomId === id || b.toAtomId === id) && b.order === 2).length;
  if (bond.order === 2) {
    if (ringAtomIds.has(fromAtom.id) && doubleCount(fromAtom.id) + 1 > 1) {
      return `ring atom "${fromAtom.id}" already has a double bond (cumulated ring double bonds are not allowed)`;
    }
    if (ringAtomIds.has(toAtom.id) && doubleCount(toAtom.id) + 1 > 1) {
      return `ring atom "${toAtom.id}" already has a double bond (cumulated ring double bonds are not allowed)`;
    }
  }
  const describeValency = (atom: Atom): string | null => {
    const current = bondOrderSumOf(prev, atom.id);
    const max = getMaxValencyForElement(atom.element, atom.charge);
    if (current + bond.order > max) {
      return `atom "${atom.id}" (${atom.element}${atom.charge ? `, charge ${atom.charge}` : ''}) would exceed its maximum valency ${max} (current bond-order sum ${current} + ${bond.order})`;
    }
    const maxLP = getMaxLonePairsForAtom(atom.element, atom.charge, current + bond.order);
    if ((atom.lonePairs ?? 0) > maxLP) {
      return `atom "${atom.id}" has ${atom.lonePairs} explicit lone pairs but only ${maxLP} fit after this bond`;
    }
    return null;
  };
  return describeValency(fromAtom) ?? describeValency(toAtom);
};

/**
 * Add a bond, but drop the edit if it would duplicate an existing edge,
 * exceed atomic valency, force two adjacent ring double bonds, etc.
 */
export const addBondSafe = (
  prev: Molecule,
  bond: Bond,
  opts: BondEditOptions = { strict: true },
): Molecule => {
  if (!canAddBond(prev, bond, opts)) return prev;
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
 * Replace bond aromatic flags / Kekulé orders from an aromatize/dearomatize
 * molblock while preserving atom ids, coords, aliases, and bond ids.
 * When `atomIds` is set, only bonds whose both endpoints are in that set change.
 */
export const mergeBondOrdersFromMolblock = (
  prev: Molecule,
  molblock: string,
  atomIds?: readonly string[],
): Molecule => {
  const parsed = parseMolblock(molblock);
  if (parsed.bonds.length !== prev.bonds.length) return prev;
  const limit =
    atomIds && atomIds.length > 0 ? new Set(atomIds) : null;
  return {
    ...prev,
    bonds: prev.bonds.map((b, i) => {
      if (limit && (!limit.has(b.fromAtomId) || !limit.has(b.toAtomId))) return b;
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

export type BondUpdatePatch = Partial<
  Pick<Bond, 'order' | 'stereo' | 'orderCycleRamp' | 'dative' | 'dotted' | 'aromatic' | 'queryType' | 'bold'>
>;

/**
 * Chemistry reason a bond update would be refused in `strict` mode, or `null`
 * when the result is well-defined. Structural problems (unknown bond / atoms)
 * are reported in every mode.
 */
export const explainBondUpdateRejection = (
  prev: Molecule,
  bondId: string,
  patch: BondUpdatePatch,
  opts: BondEditOptions = { strict: true },
): string | null => {
  const existing = prev.bonds.find(b => b.id === bondId);
  if (!existing) return `unknown bond id "${bondId}"`;
  const fromAtom = prev.atoms.find(a => a.id === existing.fromAtomId);
  const toAtom = prev.atoms.find(a => a.id === existing.toAtomId);
  if (!fromAtom || !toAtom) return `bond "${bondId}" references a missing atom`;
  if (!opts.strict) return null;

  const nextOrder = patch.order ?? existing.order;
  const nextDative = 'dative' in patch ? patch.dative : existing.dative;
  const nextDotted = 'dotted' in patch ? patch.dotted : existing.dotted;
  const nextQuery = 'queryType' in patch ? patch.queryType : existing.queryType;
  // Dative / dotted (H-bond) / query: no covalent valency / ring double rules.
  if (bondSkipsCovalentValence({ dative: nextDative, dotted: nextDotted, queryType: nextQuery })) return null;

  if (nextOrder === 3 && isBondInRing(prev, existing)) return 'a ring bond cannot be a triple bond';

  const ringAtomIds = new Set(uniqueRingPaths(prev).flat());
  if (nextOrder === 2) {
    const doublesExcl = (atomId: string) =>
      prev.bonds.filter(
        b => b.id !== existing.id && (b.fromAtomId === atomId || b.toAtomId === atomId) && b.order === 2,
      ).length;
    if (ringAtomIds.has(fromAtom.id) && doublesExcl(fromAtom.id) + 1 > 1) {
      return `ring atom "${fromAtom.id}" already has a double bond (cumulated ring double bonds are not allowed)`;
    }
    if (ringAtomIds.has(toAtom.id) && doublesExcl(toAtom.id) + 1 > 1) {
      return `ring atom "${toAtom.id}" already has a double bond (cumulated ring double bonds are not allowed)`;
    }
  }

  const describe = (atom: Atom): string | null => {
    const currentExcl = prev.bonds
      .filter(b => b.id !== existing.id && (b.fromAtomId === atom.id || b.toAtomId === atom.id))
      .reduce((sum, b) => sum + covalentBondOrderContribution(b), 0);
    const max = getMaxValencyForElement(atom.element, atom.charge);
    if (currentExcl + nextOrder > max) {
      return `atom "${atom.id}" (${atom.element}${atom.charge ? `, charge ${atom.charge}` : ''}) would exceed its maximum valency ${max} (other bonds ${currentExcl} + ${nextOrder})`;
    }
    const maxLP = getMaxLonePairsForAtom(atom.element, atom.charge, currentExcl + nextOrder);
    if ((atom.lonePairs ?? 0) > maxLP) {
      return `atom "${atom.id}" has ${atom.lonePairs} explicit lone pairs but only ${maxLP} fit after this change`;
    }
    return null;
  };
  return describe(fromAtom) ?? describe(toAtom);
};

/**
 * Update bond order/stereo/query flags.
 *
 * Relaxed by default: the patch is applied even when the result over-fills an
 * atom or puts two double bonds on one ring atom — the sketcher shows an octet
 * warning instead of refusing, so a user can convert a ring bond by bond.
 * With `{ strict: true }` a chemically undefined result leaves `prev` unchanged.
 */
export const updateBondSafe = (
  prev: Molecule,
  bondId: string,
  patch: BondUpdatePatch,
  opts: BondEditOptions = {},
): Molecule => {
  const existing = prev.bonds.find(b => b.id === bondId);
  if (!existing) return prev;
  if (explainBondUpdateRejection(prev, bondId, patch, opts)) return prev;
  const nextOrder = patch.order ?? existing.order;
  const nextStereo = 'stereo' in patch ? patch.stereo : existing.stereo;
  const nextRamp = 'orderCycleRamp' in patch ? patch.orderCycleRamp : existing.orderCycleRamp;
  const nextDative = 'dative' in patch ? patch.dative : existing.dative;
  const nextDotted = 'dotted' in patch ? patch.dotted : existing.dotted;
  const nextAromatic = 'aromatic' in patch ? patch.aromatic : existing.aromatic;
  const nextQuery = 'queryType' in patch ? patch.queryType : existing.queryType;
  const nextBold = 'bold' in patch ? patch.bold : existing.bold;

  const applyFlags = (b: Bond): Bond => ({
    ...b,
    order: nextOrder,
    stereo: nextStereo || undefined,
    orderCycleRamp: nextRamp || undefined,
    dative: nextDative ? true : undefined,
    dotted: nextDotted && !nextDative ? true : undefined,
    aromatic: nextAromatic && !nextDative && !nextDotted && !nextQuery ? true : undefined,
    queryType: nextQuery && !nextDative && !nextDotted ? nextQuery : undefined,
    bold: nextBold && !nextDative && !nextDotted && !nextQuery ? true : undefined,
  });

  // Dative / dotted (H-bond) / query: skip covalent valency / ring double rules.
  if (bondSkipsCovalentValence({ dative: nextDative, dotted: nextDotted, queryType: nextQuery })) {
    return {
      ...prev,
      bonds: prev.bonds.map(b =>
        b.id === bondId
          ? applyFlags({
              ...b,
              order: 1,
              stereo: undefined,
              orderCycleRamp: undefined,
            })
          : b,
      ),
    };
  }

  // Straighten sp-carbon neighbours for a new triple bond — but never for a
  // ring bond (relaxed mode lets one through): pulling ring atoms onto a line
  // would wreck the ring geometry the user is editing.
  const linearize = nextOrder === 3 && !isBondInRing(prev, existing);

  return {
    ...prev,
    atoms: linearize ? linearlyAdjustedTripleBondAtoms(prev, existing) : prev.atoms,
    bonds: prev.bonds.map(b => (b.id === bondId ? applyFlags(b) : b)),
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

  // Placement/fusion in display space while Structure Perspective is active.
  const display = displayCoordsMolecule(prev);
  const newAtoms: Atom[] = [];
  const newBonds: Bond[] = [];
  const atomIds: string[] = [];

  let a1: Atom | undefined;
  let a2: Atom | undefined;
  if (fusedBondId) {
    const bond = prev.bonds.find(b => b.id === fusedBondId);
    if (bond) {
      a1 = display.atoms.find(a => a.id === bond.fromAtomId);
      a2 = display.atoms.find(a => a.id === bond.toAtomId);
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
      overlap = display.atoms.find(a => {
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

  const next: Molecule = {
    ...prev,
    atoms: [...prev.atoms, ...newAtoms],
    bonds: [
      ...prev.bonds.map(b => (bondsToDowngrade.includes(b.id) ? { ...b, order: 1 } : b)),
      ...newBonds,
    ],
  };
  const nearIds = [a1?.id, a2?.id, rootAtomId].filter((id): id is string => !!id);
  return joinAtomsIntoPerspectivePose(
    next,
    newAtoms.map(a => a.id),
    nearIds,
  );
};

export const addChairRing = (
  prev: Molecule,
  center: { x: number; y: number },
  bondLengthPx: number,
  rootAtomId?: string,
  attachedViaBond?: boolean,
  rotationRad = 0,
): Molecule => {
  const display = displayCoordsMolecule(prev);
  const pts = chairRingVertices(center, bondLengthPx, rotationRad);
  // Only merge when nearly coincident — 28px was stealing nearby crowded atoms.
  const OVERLAP_RADIUS = Math.min(10, bondLengthPx * 0.22);
  const ids: string[] = [];
  const newAtoms: Atom[] = [];

  for (let i = 0; i < pts.length; i++) {
    if (i === 0 && rootAtomId && !attachedViaBond) {
      ids.push(rootAtomId);
      continue;
    }
    const p = pts[i];
    const overlap = display.atoms.find(a => Math.hypot(a.x - p.x, a.y - p.y) < OVERLAP_RADIUS);
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
  const next: Molecule = {
    ...prev,
    atoms: [...prev.atoms, ...newAtoms],
    bonds: [...prev.bonds, ...newBonds],
  };
  const withPose = joinAtomsIntoPerspectivePose(
    next,
    newAtoms.map(a => a.id),
    rootAtomId ? [rootAtomId] : undefined,
  );
  const cycleIds = ids.slice(0, 6);
  if (cycleIds.length === 6) {
    const sig = ringSignature(cycleIds);
    return {
      ...withPose,
      ringConformations: { ...(withPose.ringConformations || {}), [sig]: 'chair' },
    };
  }
  return withPose;
};

export const addBoatRing = (
  prev: Molecule,
  center: { x: number; y: number },
  bondLengthPx: number = 40,
  rootAtomId?: string,
  attachedViaBond?: boolean,
  rotationRad = 0,
): Molecule => {
  const display = displayCoordsMolecule(prev);
  const pts = boatRingVertices(center, bondLengthPx, rotationRad);
  const OVERLAP_RADIUS = Math.min(10, bondLengthPx * 0.22);
  const ids: string[] = [];
  const newAtoms: Atom[] = [];

  for (let i = 0; i < pts.length; i++) {
    if (i === 0 && rootAtomId && !attachedViaBond) {
      ids.push(rootAtomId);
      continue;
    }
    const p = pts[i];
    const overlap = display.atoms.find(a => Math.hypot(a.x - p.x, a.y - p.y) < OVERLAP_RADIUS);
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
  const next: Molecule = {
    ...prev,
    atoms: [...prev.atoms, ...newAtoms],
    bonds: [...prev.bonds, ...newBonds],
  };
  const withPose = joinAtomsIntoPerspectivePose(
    next,
    newAtoms.map(a => a.id),
    rootAtomId ? [rootAtomId] : undefined,
  );
  const cycleIds = ids.slice(0, 6);
  if (cycleIds.length === 6) {
    const sig = ringSignature(cycleIds);
    return {
      ...withPose,
      ringConformations: { ...(withPose.ringConformations || {}), [sig]: 'boat' },
    };
  }
  return withPose;
};

export const addChain = (
  prev: Molecule,
  points: { x: number; y: number }[],
  placementElement: string,
  startAtomId?: string,
): Molecule => {
  const display = displayCoordsMolecule(prev);
  const newAtoms: Atom[] = [];
  const newBonds: Bond[] = [];
  const atomIds: string[] = [];

  for (let i = 0; i < points.length; i++) {
    if (i === 0 && startAtomId) {
      atomIds.push(startAtomId);
      continue;
    }
    const pt = points[i];
    const OVERLAP_RADIUS = 10;
    const candidate = display.atoms.find(a => Math.hypot(a.x - pt.x, a.y - pt.y) < OVERLAP_RADIUS);
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

  return joinAtomsIntoPerspectivePose(
    {
      ...prev,
      atoms: [...prev.atoms, ...newAtoms],
      bonds: [...prev.bonds, ...newBonds],
    },
    newAtoms.map(a => a.id),
    startAtomId ? [startAtomId] : undefined,
  );
};

// ─── Strokes / Reaction arrows / Canvas text ──────────────────────────────

export const addStroke = (prev: Molecule, stroke: Stroke): Molecule => ({
  ...prev,
  strokes: [...(prev.strokes || []), stroke],
});

export const translateStroke = (prev: Molecule, id: string, dx: number, dy: number): Molecule => ({
  ...prev,
  strokes: (prev.strokes ?? []).map(s =>
    s.id === id
      ? { ...s, points: s.points.map(p => ({ x: p.x + dx, y: p.y + dy })) }
      : s,
  ),
});

export const translateStrokes = (
  prev: Molecule,
  ids: string[],
  dx: number,
  dy: number,
): Molecule => {
  if (ids.length === 0 || (dx === 0 && dy === 0)) return prev;
  const want = new Set(ids);
  return {
    ...prev,
    strokes: (prev.strokes ?? []).map(s =>
      want.has(s.id)
        ? { ...s, points: s.points.map(p => ({ x: p.x + dx, y: p.y + dy })) }
        : s,
    ),
  };
};

const offsetReactionArrowCoords = (
  a: ReactionArrow,
  dx: number,
  dy: number,
): ReactionArrow => {
  const next: ReactionArrow = {
    ...a,
    x1: a.x1 + dx,
    y1: a.y1 + dy,
    x2: a.x2 + dx,
    y2: a.y2 + dy,
  };
  if (a.cx !== undefined && a.cy !== undefined) {
    next.cx = a.cx + dx;
    next.cy = a.cy + dy;
  }
  if (a.c1x !== undefined && a.c1y !== undefined) {
    next.c1x = a.c1x + dx;
    next.c1y = a.c1y + dy;
  }
  if (a.c2x !== undefined && a.c2y !== undefined) {
    next.c2x = a.c2x + dx;
    next.c2y = a.c2y + dy;
  }
  if (a.pathPoints && a.pathPoints.length >= 2) {
    next.pathPoints = a.pathPoints.map(p => ({ x: p.x + dx, y: p.y + dy }));
  }
  return next;
};

export const translateReactionArrows = (
  prev: Molecule,
  ids: string[],
  dx: number,
  dy: number,
): Molecule => {
  if (ids.length === 0 || (dx === 0 && dy === 0)) return prev;
  const want = new Set(ids);
  return {
    ...prev,
    reactionArrows: (prev.reactionArrows ?? []).map(a =>
      want.has(a.id) ? offsetReactionArrowCoords(a, dx, dy) : a,
    ),
  };
};

export const translateCanvasTexts = (
  prev: Molecule,
  ids: string[],
  dx: number,
  dy: number,
): Molecule => {
  if (ids.length === 0 || (dx === 0 && dy === 0)) return prev;
  const want = new Set(ids);
  return {
    ...prev,
    canvasTexts: (prev.canvasTexts ?? []).map(t =>
      want.has(t.id) ? { ...t, x: t.x + dx, y: t.y + dy } : t,
    ),
  };
};

export const translateCanvasImages = (
  prev: Molecule,
  ids: string[],
  dx: number,
  dy: number,
): Molecule => {
  if (ids.length === 0 || (dx === 0 && dy === 0)) return prev;
  const want = new Set(ids);
  return {
    ...prev,
    canvasImages: (prev.canvasImages ?? []).map(img =>
      want.has(img.id) ? { ...img, x: img.x + dx, y: img.y + dy } : img,
    ),
  };
};

const pairKey = (a: string, b: string): string => (a < b ? `${a}\0${b}` : `${b}\0${a}`);

/**
 * Join a dragged atom into a stationary one (ChemDraw drop-to-attach).
 * Bonds on `sourceId` are retargeted to `targetId`; the source atom is removed.
 * An existing bond between the same pair wins over the retargeted one.
 */
export const mergeDraggedAtomInto = (
  prev: Molecule,
  sourceId: string,
  targetId: string,
): Molecule => {
  if (!sourceId || !targetId || sourceId === targetId) return prev;
  if (!prev.atoms.some(a => a.id === sourceId)) return prev;
  if (!prev.atoms.some(a => a.id === targetId)) return prev;

  const remap = (id: string): string => (id === sourceId ? targetId : id);
  const involvesSource = (b: Bond): boolean =>
    b.fromAtomId === sourceId || b.toAtomId === sourceId;
  const ordered = [
    ...prev.bonds.filter(b => !involvesSource(b)),
    ...prev.bonds.filter(involvesSource),
  ];
  const seen = new Set<string>();
  const bonds: Bond[] = [];
  for (const b of ordered) {
    const fromAtomId = remap(b.fromAtomId);
    const toAtomId = remap(b.toAtomId);
    if (fromAtomId === toAtomId) continue;
    const key = pairKey(fromAtomId, toAtomId);
    if (seen.has(key)) continue;
    seen.add(key);
    bonds.push(
      fromAtomId === b.fromAtomId && toAtomId === b.toAtomId
        ? b
        : { ...b, fromAtomId, toAtomId },
    );
  }

  const remapAnchor = (
    anchor: ReactionArrow['fromAnchor'],
  ): ReactionArrow['fromAnchor'] => {
    if (!anchor) return anchor;
    if ((anchor.type === 'atom' || anchor.type === 'lone_pair') && anchor.atomId === sourceId) {
      return { ...anchor, atomId: targetId };
    }
    return anchor;
  };

  const sruBrackets = (prev.sruBrackets ?? []).map(b => ({
    ...b,
    atomIds: [...new Set(b.atomIds.map(remap))],
  }));

  const next: Molecule = {
    ...prev,
    atoms: prev.atoms.filter(a => a.id !== sourceId),
    bonds,
    sruBrackets: sruBrackets.length ? sruBrackets : prev.sruBrackets,
    reactionArrows: prev.reactionArrows?.map(a => ({
      ...a,
      fromAnchor: remapAnchor(a.fromAnchor),
      toAnchor: remapAnchor(a.toAnchor),
    })),
    orbitals: prev.orbitals?.map(o =>
      o.atomId === sourceId ? { ...o, atomId: targetId } : o,
    ),
  };

  return syncSruBracketsToAtoms(
    pruneRingConformations(prunePerspectivePositions(pruneSruBrackets(next), new Set([sourceId]))),
    [targetId],
  );
};

/** Move atoms plus every marquee-selected annotation in one undo step. */
export const translateMarqueeSelection = (
  prev: Molecule,
  opts: {
    atomIds: string[];
    arrowIds: string[];
    strokeIds: string[];
    textIds: string[];
    shapeIds: string[];
    imageIds: string[];
    dx: number;
    dy: number;
    /** Dragged atom to absorb into `mergeTargetAtomId` after the translate. */
    mergeSourceAtomId?: string;
    mergeTargetAtomId?: string;
  },
): Molecule => {
  const { atomIds, arrowIds, strokeIds, textIds, shapeIds, imageIds, dx, dy } = opts;
  const merging = !!(opts.mergeSourceAtomId && opts.mergeTargetAtomId);
  if (dx === 0 && dy === 0 && !merging) return prev;
  let m = prev;
  if (atomIds.length > 0 && (dx !== 0 || dy !== 0)) {
    m = moveAtoms(m, atomIds, dx, dy);
  }
  m = translateReactionArrows(m, arrowIds, dx, dy);
  m = translateStrokes(m, strokeIds, dx, dy);
  m = translateCanvasTexts(m, textIds, dx, dy);
  m = translateCanvasShapes(m, shapeIds, dx, dy);
  m = translateCanvasImages(m, imageIds, dx, dy);
  if (opts.mergeSourceAtomId && opts.mergeTargetAtomId) {
    m = mergeDraggedAtomInto(m, opts.mergeSourceAtomId, opts.mergeTargetAtomId);
  }
  return m;
};

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
  patch: Partial<Omit<ReactionArrow, 'id'>> & {
    fromAnchor?: ReactionArrow['fromAnchor'] | null;
    toAnchor?: ReactionArrow['toAnchor'] | null;
  },
): Molecule => {
  const clearKeys: Array<'fromAnchor' | 'toAnchor'> = [];
  const partialEntries = Object.entries(patch).filter(([k, v]) => {
    if (v === undefined) return false;
    if ((k === 'fromAnchor' || k === 'toAnchor') && v === null) {
      clearKeys.push(k);
      return false;
    }
    return true;
  });
  const partial = Object.fromEntries(partialEntries) as Partial<Omit<ReactionArrow, 'id'>>;
  if (Object.keys(partial).length === 0 && clearKeys.length === 0) return prev;
  return {
    ...prev,
    reactionArrows: (prev.reactionArrows || []).map(a => {
      if (a.id !== id) return a;
      const next: ReactionArrow = { ...a, ...partial };
      for (const k of clearKeys) delete next[k];
      return next;
    }),
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

export const addCanvasOrbital = (prev: Molecule, orbital: CanvasOrbital): Molecule => ({
  ...prev,
  orbitals: [...(prev.orbitals || []), orbital],
});

export const deleteCanvasOrbital = (prev: Molecule, id: string): Molecule => ({
  ...prev,
  orbitals: (prev.orbitals || []).filter(o => o.id !== id),
});

export const updateCanvasOrbital = (
  prev: Molecule,
  id: string,
  patch: Partial<Omit<CanvasOrbital, 'id'>> & { atomId?: string | null },
): Molecule => {
  const list = prev.orbitals ?? [];
  if (!list.some(o => o.id === id)) return prev;
  return {
    ...prev,
    orbitals: list.map(o => {
      if (o.id !== id) return o;
      const next: CanvasOrbital = { ...o, ...patch, id: o.id };
      if (patch.atomId === null) delete next.atomId;
      return next;
    }),
  };
};

const pruneOrbitalsForRemovedAtoms = (mol: Molecule, removedAtomIds: Set<string>): Molecule => {
  if (removedAtomIds.size === 0 || !mol.orbitals?.length) return mol;
  const next = mol.orbitals.filter(o => !o.atomId || !removedAtomIds.has(o.atomId));
  return next.length === mol.orbitals.length ? mol : { ...mol, orbitals: next };
};

export const updateCanvasShape = (
  prev: Molecule,
  id: string,
  patch: Partial<Omit<CanvasShape, 'id'>>,
): Molecule => {
  const clearFill = 'fillColor' in patch && (patch.fillColor == null || patch.fillColor === '');
  const partial = Object.fromEntries(
    Object.entries(patch).filter(([k, v]) => {
      if (k === 'fillColor' && clearFill) return false;
      return v !== undefined;
    }),
  ) as Partial<Omit<CanvasShape, 'id'>>;
  if (Object.keys(partial).length === 0 && !clearFill) return prev;
  return {
    ...prev,
    canvasShapes: (prev.canvasShapes || []).map(s => {
      if (s.id !== id) return s;
      const next = { ...s, ...partial };
      if (clearFill) {
        const rest = { ...next };
        delete rest.fillColor;
        return rest;
      }
      return next;
    }),
  };
};

/** Reflect a canvas shape / glassware about its bbox center (left↔right or top↔bottom). */
export const reflectCanvasShape = (
  prev: Molecule,
  id: string,
  axis: 'horizontal' | 'vertical',
): Molecule => {
  const shapes = prev.canvasShapes ?? [];
  const src = shapes.find(s => s.id === id);
  if (!src) return prev;
  const cx = (src.x1 + src.x2) / 2;
  const cy = (src.y1 + src.y2) / 2;
  const rx = (x: number) => (axis === 'horizontal' ? 2 * cx - x : x);
  const ry = (y: number) => (axis === 'vertical' ? 2 * cy - y : y);
  const next: CanvasShape = {
    ...src,
    x1: rx(src.x1),
    y1: ry(src.y1),
    x2: rx(src.x2),
    y2: ry(src.y2),
    rotationRad:
      src.rotationRad != null && Math.abs(src.rotationRad) > 1e-9
        ? -src.rotationRad
        : src.rotationRad,
  };
  return {
    ...prev,
    canvasShapes: shapes.map(s => (s.id === id ? next : s)),
  };
};

export const addCanvasImage = (prev: Molecule, image: CanvasImage): Molecule => ({
  ...prev,
  canvasImages: [...(prev.canvasImages || []), image],
});

export const updateCanvasImage = (
  prev: Molecule,
  id: string,
  patch: Partial<Omit<CanvasImage, 'id' | 'dataUrl' | 'mimeType'>>,
): Molecule => {
  const partial = Object.fromEntries(
    Object.entries(patch).filter(([, v]) => v !== undefined),
  ) as Partial<Omit<CanvasImage, 'id' | 'dataUrl' | 'mimeType'>>;
  if (Object.keys(partial).length === 0) return prev;
  return {
    ...prev,
    canvasImages: (prev.canvasImages || []).map(img =>
      img.id === id ? { ...img, ...partial } : img,
    ),
  };
};

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
  | { type: 'canvasImage'; id: string }
  | { type: 'sruBracket'; id: string }
  | { type: 'canvasOrbital'; id: string };

const prunePerspectivePositions = (mol: Molecule, removedAtomIds: Set<string>): Molecule => {
  const pose = mol.perspective3D;
  if (!pose || removedAtomIds.size === 0) return mol;
  let changed = false;
  const positions = { ...pose.positions };
  for (const id of removedAtomIds) {
    if (id in positions) {
      delete positions[id];
      changed = true;
    }
  }
  if (!changed) return mol;
  if (Object.keys(positions).length === 0) {
    const { perspective3D: _pose, ...rest } = mol;
    void _pose;
    return rest;
  }
  return { ...mol, perspective3D: { ...pose, positions } };
};

export const eraseAt = (prev: Molecule, hit: EraseHit): Molecule => {
  if (hit.type === 'atom') {
    const id = hit.atomId;
    return pruneOrbitalsForRemovedAtoms(
      pruneRingConformations(
        prunePerspectivePositions(
          pruneSruBrackets({
            ...prev,
            atoms: prev.atoms.filter(a => a.id !== id),
            bonds: prev.bonds.filter(b => b.fromAtomId !== id && b.toAtomId !== id),
          }),
          new Set([id]),
        ),
      ),
      new Set([id]),
    );
  }
  if (hit.type === 'bond') {
    return pruneRingConformations({
      ...prev,
      bonds: prev.bonds.filter(b => b.id !== hit.bondId),
    });
  }
  if (hit.type === 'stroke')
    return { ...prev, strokes: (prev.strokes || []).filter(s => s.id !== hit.strokeId) };
  if (hit.type === 'canvasText')
    return { ...prev, canvasTexts: (prev.canvasTexts || []).filter(t => t.id !== hit.id) };
  if (hit.type === 'canvasShape')
    return { ...prev, canvasShapes: (prev.canvasShapes || []).filter(s => s.id !== hit.id) };
  if (hit.type === 'canvasImage')
    return { ...prev, canvasImages: (prev.canvasImages || []).filter(img => img.id !== hit.id) };
  if (hit.type === 'sruBracket')
    return { ...prev, sruBrackets: (prev.sruBrackets || []).filter(b => b.id !== hit.id) };
  if (hit.type === 'canvasOrbital') return deleteCanvasOrbital(prev, hit.id);
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
  sruBrackets: [],
  orbitals: [],
});

export const deleteAtomSelection = (prev: Molecule, atomIds: string[]): Molecule => {
  const set = new Set(atomIds);
  return pruneOrbitalsForRemovedAtoms(
    pruneRingConformations(
      prunePerspectivePositions(
        pruneSruBrackets({
          ...prev,
          atoms: prev.atoms.filter(a => !set.has(a.id)),
          bonds: prev.bonds.filter(b => !set.has(b.fromAtomId) && !set.has(b.toAtomId)),
        }),
        set,
      ),
    ),
    set,
  );
};

export const addSruBracket = (prev: Molecule, bracket: SruBracket): Molecule => ({
  ...prev,
  sruBrackets: [...(prev.sruBrackets || []), bracket],
});

export const updateSruBracket = (
  prev: Molecule,
  id: string,
  patch: Partial<Omit<SruBracket, 'id'>>,
): Molecule => {
  const partial = Object.fromEntries(
    Object.entries(patch).filter(([, v]) => v !== undefined),
  ) as Partial<Omit<SruBracket, 'id'>>;
  if (Object.keys(partial).length === 0) return prev;
  return {
    ...prev,
    sruBrackets: (prev.sruBrackets || []).map(b => (b.id === id ? { ...b, ...partial } : b)),
  };
};

export const deleteSruBracket = (prev: Molecule, id: string): Molecule => ({
  ...prev,
  sruBrackets: (prev.sruBrackets || []).filter(b => b.id !== id),
});

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

/** Translate many canvas shapes by the same world delta (grouped COF move). */
export const translateCanvasShapes = (
  prev: Molecule,
  ids: string[],
  dx: number,
  dy: number,
): Molecule => {
  if (ids.length === 0 || (dx === 0 && dy === 0)) return prev;
  const want = new Set(ids);
  return {
    ...prev,
    canvasShapes: (prev.canvasShapes || []).map(s =>
      want.has(s.id)
        ? { ...s, x1: s.x1 + dx, y1: s.y1 + dy, x2: s.x2 + dx, y2: s.y2 + dy }
        : s,
    ),
  };
};

export const deleteCanvasImage = (prev: Molecule, id: string): Molecule => ({
  ...prev,
  canvasImages: (prev.canvasImages || []).filter(img => img.id !== id),
});

/** Append imported atoms/bonds (ids must already be unique in the document). */
export const mergeImportedStructure = (
  prev: Molecule,
  atoms: Atom[],
  bonds: Bond[],
): Molecule =>
  joinAtomsIntoPerspectivePose(
    {
      ...prev,
      atoms: [...prev.atoms, ...atoms],
      bonds: [...prev.bonds, ...bonds],
    },
    atoms.map(a => a.id),
  );

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
  const display = displayCoordsMolecule(prev);
  const displayById = new Map(display.atoms.map(a => [a.id, a]));
  const set = new Set(atomIds);
  const idMap = new Map<string, string>();
  const newAtoms: Atom[] = [];
  prev.atoms.forEach(a => {
    if (set.has(a.id)) {
      const id = newId();
      idMap.set(a.id, id);
      const src = displayById.get(a.id) ?? a;
      newAtoms.push({ ...a, id, x: src.x + dx, y: src.y + dy });
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
  const newAtomIds = newAtoms.map(a => a.id);
  return {
    molecule: joinAtomsIntoPerspectivePose(
      {
        ...prev,
        atoms: [...prev.atoms, ...newAtoms],
        bonds: [...prev.bonds, ...newBonds],
      },
      newAtomIds,
    ),
    newAtomIds,
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

export interface MergeSketchAtom {
  tempId: string;
  element: string;
  x: number;
  y: number;
  charge?: number;
  alias?: string;
}

export interface MergeSketchBond {
  fromTempId: string;
  toTempId: string;
  order: number;
  stereo?: Bond['stereo'];
  aromatic?: boolean;
}

export interface MergeSketchInput {
  atoms: MergeSketchAtom[];
  bonds: MergeSketchBond[];
  snap?: { tempId: string; existingAtomId: string }[];
}

/**
 * Insert a recognized sketch in one undo step. Snapped temp ids reuse existing
 * atoms (and may update element/charge). New atoms/bonds get fresh ids.
 */
export const mergeSketch = (prev: Molecule, input: MergeSketchInput): Molecule => {
  if (input.atoms.length === 0) return prev;

  const idMap = new Map<string, string>();
  const usedExisting = new Set<string>();
  for (const s of input.snap ?? []) {
    if (!prev.atoms.some(a => a.id === s.existingAtomId)) continue;
    if (usedExisting.has(s.existingAtomId)) continue;
    idMap.set(s.tempId, s.existingAtomId);
    usedExisting.add(s.existingAtomId);
  }

  let atoms = prev.atoms;
  const newAtomIds: string[] = [];

  for (const sketchAtom of input.atoms) {
    const existingId = idMap.get(sketchAtom.tempId);
    if (existingId) {
      const element = sketchAtom.element || 'C';
      const charge = sketchAtom.charge ?? 0;
      const alias = sketchAtom.alias?.trim();
      if (element !== 'C' || charge !== 0 || alias) {
        atoms = atoms.map(a =>
          a.id === existingId
            ? {
                ...a,
                element: element !== 'C' ? element : a.element,
                charge: charge !== 0 ? charge : a.charge,
                ...(alias ? { alias } : {}),
              }
            : a,
        );
      }
      continue;
    }
    const id = newId();
    idMap.set(sketchAtom.tempId, id);
    newAtomIds.push(id);
    atoms = [
      ...atoms,
      {
        id,
        element: sketchAtom.element || 'C',
        x: sketchAtom.x,
        y: sketchAtom.y,
        charge: sketchAtom.charge ?? 0,
        ...(sketchAtom.alias?.trim() ? { alias: sketchAtom.alias.trim() } : {}),
      },
    ];
  }

  const existingPairs = new Set(
    prev.bonds.map(b => [b.fromAtomId, b.toAtomId].sort().join('|')),
  );
  const newBonds: Bond[] = [];
  for (const sketchBond of input.bonds) {
    const from = idMap.get(sketchBond.fromTempId);
    const to = idMap.get(sketchBond.toTempId);
    if (!from || !to || from === to) continue;
    const key = [from, to].sort().join('|');
    if (existingPairs.has(key)) continue;
    existingPairs.add(key);
    const order = Math.min(3, Math.max(1, Math.round(sketchBond.order) || 1));
    newBonds.push({
      id: newId(),
      fromAtomId: from,
      toAtomId: to,
      order,
      ...(sketchBond.stereo ? { stereo: sketchBond.stereo } : {}),
      ...(sketchBond.aromatic ? { aromatic: true } : {}),
    });
  }

  if (newAtomIds.length === 0 && newBonds.length === 0 && atoms === prev.atoms) {
    return prev;
  }

  const next: Molecule = {
    ...prev,
    atoms,
    bonds: [...prev.bonds, ...newBonds],
  };
  return newAtomIds.length > 0 ? joinAtomsIntoPerspectivePose(next, newAtomIds) : next;
};

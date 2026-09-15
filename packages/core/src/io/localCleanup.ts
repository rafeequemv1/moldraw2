/**
 * Splice an engine-cleaned subset back into the parent molecule.
 *
 * The "local cleanup" path sends only a connected sub-molecule to the worker
 * (so untouched fragments don't get re-laid-out). This helper takes the
 * cleaned molblock, aligns it to the original subset's centroid + scale +
 * orientation (rigid Procrustes), and returns a new `Molecule` where ONLY the
 * subset's atom positions changed — IDs, charges, aliases, lone pairs, bonds,
 * strokes, reaction arrows, canvas texts, and ring fills are all preserved.
 *
 * Orientation matters: cleanup routinely returns a layout that's
 * rotated relative to the user's drawing. Procrustes restores centroid and
 * heading; reflections are disabled so Cleanup does not flip the molecule.
 *
 * The caller is responsible for passing `subsetIdsInWriteOrder` exactly as
 * they were ordered when feeding `moleculeToMolblock`. The cleaned response
 * preserves index order (cleanup doesn't reorder atoms), so the i-th
 * cleaned atom maps to `subsetIdsInWriteOrder[i]`.
 *
 * Cleaned internal geometry is kept; each connected component is placed back
 * into its original local frame (centroid + Procrustes orientation) so
 * multi-molecule reactions are not reshuffled.
 */
import type { Molecule, Point, RingConformationByIndex } from '@moldraw/domain';
import { ringConformationsByAtomIndex } from '@moldraw/domain';
import { moleculeToMolblock, parseMolblock } from './molblock';

/** CLEANUP worker payload: molblock + chair/boat index locks (molfile cannot carry tags). */
export const buildCleanupWorkerPayload = (
  mol: Molecule,
  options: {
    bondLengthPx?: number;
    preferIndigo?: boolean;
    mode?: 'layout' | 'clean2d';
    selectedAtomIndices?: number[];
  } = {},
): {
  molBlock: string;
  bondLengthPx?: number;
  preferIndigo?: boolean;
  mode?: 'layout' | 'clean2d';
  selectedAtomIndices?: number[];
  ringConformationsByIndex?: RingConformationByIndex[];
} => {
  const ringConformationsByIndex = ringConformationsByAtomIndex(mol);
  return {
    molBlock: moleculeToMolblock(mol),
    ...options,
    ...(ringConformationsByIndex.length > 0 ? { ringConformationsByIndex } : {}),
  };
};

const isDepictedStereo = (stereo: string | undefined): boolean =>
  stereo === 'wedge' || stereo === 'dash' || stereo === 'wavy';

/** True when the subset has wedge/dash/wavy bonds (reflection would invert depiction). */
export const componentHasDepictedStereo = (
  mol: Molecule,
  atomIds: ReadonlySet<string>,
): boolean =>
  mol.bonds.some(
    b =>
      atomIds.has(b.fromAtomId) &&
      atomIds.has(b.toAtomId) &&
      isDepictedStereo(b.stereo),
  );

export const avgBondLength = (mol: Molecule): number => {
  if (mol.bonds.length === 0) return 40;
  let sum = 0;
  let count = 0;
  for (const b of mol.bonds) {
    const a1 = mol.atoms.find(a => a.id === b.fromAtomId);
    const a2 = mol.atoms.find(a => a.id === b.toAtomId);
    if (a1 && a2) {
      sum += Math.hypot(a1.x - a2.x, a1.y - a2.y);
      count += 1;
    }
  }
  return count === 0 ? 40 : sum / count;
};

/** Median bond length — stable when a few bonds are stretched or compressed. */
export const medianBondLength = (mol: Molecule): number => {
  const lens: number[] = [];
  for (const b of mol.bonds) {
    const a1 = mol.atoms.find(a => a.id === b.fromAtomId);
    const a2 = mol.atoms.find(a => a.id === b.toAtomId);
    if (a1 && a2) lens.push(Math.hypot(a1.x - a2.x, a1.y - a2.y));
  }
  if (lens.length === 0) return 40;
  lens.sort((a, b) => a - b);
  const mid = Math.floor(lens.length / 2);
  return lens.length % 2 === 1 ? lens[mid] : (lens[mid - 1] + lens[mid]) / 2;
};

/** Bond length for cleanup: explicit canvas setting, else median of current drawing. */
export const resolveCleanupBondLength = (mol: Molecule, bondLengthPx?: number): number => {
  if (bondLengthPx != null && bondLengthPx > 0) return bondLengthPx;
  const med = medianBondLength(mol);
  return med > 0 ? med : 40;
};

interface Mat2 {
  a: number;
  b: number;
  c: number;
  d: number;
}

const IDENTITY_2X2: Mat2 = { a: 1, b: 0, c: 0, d: 1 };

/**
 * Closed-form orthogonal Procrustes for 2D point sets that share a centroid
 * at the origin.
 *
 * For the optimal rotation R (det = +1) and reflection F (det = -1) we want:
 *   R that maximizes Σ (R·pᵢ)·qᵢ = a·(Sxx+Syy) + b·(Sxy−Syx)  with R = [[a,−b],[b, a]]
 *   F that maximizes Σ (F·pᵢ)·qᵢ = a·(Sxx−Syy) + b·(Sxy+Syx)  with F = [[a, b],[b,−a]]
 *
 * Each is a single atan2 to find the angle. Whichever yields the larger trace
 * (= smaller residual) wins, subject to `allowReflection`.
 */
const computeOptimalOrthogonal = (
  source: ReadonlyArray<Point>,
  target: ReadonlyArray<Point>,
  allowReflection: boolean,
): Mat2 => {
  let Sxx = 0;
  let Sxy = 0;
  let Syx = 0;
  let Syy = 0;
  for (let i = 0; i < source.length; i++) {
    const p = source[i];
    const q = target[i];
    Sxx += p.x * q.x;
    Sxy += p.x * q.y;
    Syx += p.y * q.x;
    Syy += p.y * q.y;
  }

  const Arot = Sxx + Syy;
  const Brot = Sxy - Syx;
  const normRot = Math.hypot(Arot, Brot);
  const Aref = Sxx - Syy;
  const Bref = Sxy + Syx;
  const normRef = Math.hypot(Aref, Bref);

  if (normRot < 1e-9 && (!allowReflection || normRef < 1e-9)) {
    return IDENTITY_2X2;
  }

  // Tie-break favors rotation: avoids spurious mirroring on near-symmetric
  // structures where rotation and reflection give similar residuals.
  if (allowReflection && normRef > normRot + 1e-9) {
    const cosT = Aref / normRef;
    const sinT = Bref / normRef;
    return { a: cosT, b: sinT, c: sinT, d: -cosT };
  }
  if (normRot < 1e-9) return IDENTITY_2X2;
  const cosT = Arot / normRot;
  const sinT = Brot / normRot;
  return { a: cosT, b: -sinT, c: sinT, d: cosT };
};

/**
 * Place cleaned coordinates onto the canvas without rigid-fitting them back
 * onto the original atom positions (which undoes layout improvement for
 * structures that are already a rotation/reflection of the ideal layout).
 *
 * Preserves the original centroid and average bond length; adopts the cleaned
 * internal geometry and orientation.
 */
export const mapCleanupPositions = (
  cleaned: ReadonlyArray<Point>,
  originals: ReadonlyArray<Point>,
  scaleRatio = 1,
): Point[] | null => {
  if (cleaned.length === 0 || cleaned.length !== originals.length) return null;

  const ox = originals.reduce((s, p) => s + p.x, 0) / originals.length;
  const oy = originals.reduce((s, p) => s + p.y, 0) / originals.length;
  const cx = cleaned.reduce((s, p) => s + p.x, 0) / cleaned.length;
  const cy = cleaned.reduce((s, p) => s + p.y, 0) / cleaned.length;

  return cleaned.map(p => ({
    x: ox + (p.x - cx) * scaleRatio,
    y: oy + (p.y - cy) * scaleRatio,
  }));
};

export interface AlignCleanedOptions {
  /**
   * Override the scale ratio (oldScale / newScale). When omitted, scale is
   * inferred from the average bond lengths via the caller; when no bonds
   * exist on either side the helper uses 1.
   */
  scaleRatio?: number;
  /**
   * Allow the optimal transform to include a reflection. Default `true`.
   * Pass `false` when the subset has stereo bonds (wedge / dash / wavy) —
   * mirroring inverts the depicted chirality even though the stereo flag
   * itself stays intact.
   */
  allowReflection?: boolean;
}

/**
 * Align `cleaned` onto `originals` via uniform scale + rotation (and optionally
 * reflection). Returned points are in the SAME order as the input `cleaned`,
 * so callers can splice positions back by index.
 *
 * Returns `null` if the inputs are empty or have mismatched lengths — the
 * caller should treat that as "leave the molecule untouched".
 */
export const alignCleanedPoints = (
  cleaned: ReadonlyArray<Point>,
  originals: ReadonlyArray<Point>,
  options: AlignCleanedOptions = {},
): Point[] | null => {
  if (cleaned.length === 0 || cleaned.length !== originals.length) return null;

  const ratio = options.scaleRatio ?? 1;
  const allowReflection = options.allowReflection ?? true;

  const ox = originals.reduce((s, p) => s + p.x, 0) / originals.length;
  const oy = originals.reduce((s, p) => s + p.y, 0) / originals.length;
  const cx = cleaned.reduce((s, p) => s + p.x, 0) / cleaned.length;
  const cy = cleaned.reduce((s, p) => s + p.y, 0) / cleaned.length;

  const cCentered: Point[] = cleaned.map(p => ({
    x: (p.x - cx) * ratio,
    y: (p.y - cy) * ratio,
  }));
  const oCentered: Point[] = originals.map(p => ({ x: p.x - ox, y: p.y - oy }));

  const R = computeOptimalOrthogonal(cCentered, oCentered, allowReflection);

  return cCentered.map(p => ({
    x: ox + R.a * p.x + R.b * p.y,
    y: oy + R.c * p.x + R.d * p.y,
  }));
};

export const spliceLocalCleanup = (
  prev: Molecule,
  subsetIdsInWriteOrder: string[],
  cleanedMolblock: string,
): Molecule => {
  const cleaned = parseMolblock(cleanedMolblock);
  if (cleaned.atoms.length !== subsetIdsInWriteOrder.length) {
    return prev;
  }

  const subsetIdSet = new Set(subsetIdsInWriteOrder);
  const idToOriginal = new Map<string, { x: number; y: number }>();
  for (const a of prev.atoms) {
    if (subsetIdSet.has(a.id)) idToOriginal.set(a.id, { x: a.x, y: a.y });
  }
  if (idToOriginal.size !== subsetIdsInWriteOrder.length) {
    return prev;
  }

  const originals: Point[] = subsetIdsInWriteOrder.map(id => idToOriginal.get(id)!);
  const cleanedPts: Point[] = cleaned.atoms.map(a => ({ x: a.x, y: a.y }));

  // Keep cleaned bond lengths; restore the subset's original orientation.
  const aligned = alignCleanedPoints(cleanedPts, originals, {
    scaleRatio: 1,
    allowReflection: false,
  });
  if (!aligned) return prev;

  const updates = new Map<string, { x: number; y: number }>();
  aligned.forEach((p, i) => {
    updates.set(subsetIdsInWriteOrder[i], { x: p.x, y: p.y });
  });

  const newAtoms = prev.atoms.map(a => {
    const upd = updates.get(a.id);
    return upd ? { ...a, x: upd.x, y: upd.y } : a;
  });

  return { ...prev, atoms: newAtoms };
};

/**
 * BFS the molecule starting from any of the seed atom IDs to discover the
 * full connected component (atoms reachable via bonds). Returns the atom IDs
 * in the order they appear in `mol.atoms` — this is the order
 * `moleculeToMolblock` will write, which we need for index-based splicing.
 *
 * Returns an empty array if no seed atom exists in the molecule.
 */
export const collectConnectedComponent = (
  mol: Molecule,
  seedAtomIds: Iterable<string>,
): string[] => {
  const adj = new Map<string, Set<string>>();
  for (const b of mol.bonds) {
    if (!adj.has(b.fromAtomId)) adj.set(b.fromAtomId, new Set());
    if (!adj.has(b.toAtomId)) adj.set(b.toAtomId, new Set());
    adj.get(b.fromAtomId)!.add(b.toAtomId);
    adj.get(b.toAtomId)!.add(b.fromAtomId);
  }

  const allIds = new Set(mol.atoms.map(a => a.id));
  const componentIds = new Set<string>();
  const queue: string[] = [];
  for (const seed of seedAtomIds) {
    if (allIds.has(seed) && !componentIds.has(seed)) {
      queue.push(seed);
      componentIds.add(seed);
      break;
    }
  }
  while (queue.length) {
    const id = queue.shift()!;
    const neighbors = adj.get(id);
    if (!neighbors) continue;
    for (const n of neighbors) {
      if (!componentIds.has(n)) {
        componentIds.add(n);
        queue.push(n);
      }
    }
  }
  return mol.atoms.filter(a => componentIds.has(a.id)).map(a => a.id);
};

/**
 * Connected components with atom IDs in `mol.atoms` write order (molblock order).
 */
export const listConnectedComponents = (mol: Molecule): string[][] => {
  const seen = new Set<string>();
  const out: string[][] = [];
  for (const a of mol.atoms) {
    if (seen.has(a.id)) continue;
    const comp = collectConnectedComponent(mol, [a.id]);
    for (const id of comp) seen.add(id);
    if (comp.length) out.push(comp);
  }
  return out;
};

/**
 * Place cleaned coordinates into each connected component's original local frame
 * (centroid + Procrustes orientation). Prevents multi-molecule reactions from
 * being reshuffled when the engine packs fragments into one layout.
 *
 * Atoms missing from `cleanedByAtomId` are left untouched.
 */
export const alignCleanupCoordsPerComponent = (
  prev: Molecule,
  cleanedByAtomId: ReadonlyMap<string, Point>,
): Molecule => {
  if (prev.atoms.length === 0 || cleanedByAtomId.size === 0) return prev;

  const byId = new Map(prev.atoms.map(a => [a.id, a]));
  const updates = new Map<string, Point>();

  for (const compIds of listConnectedComponents(prev)) {
    const ids: string[] = [];
    const originals: Point[] = [];
    const cleanedPts: Point[] = [];
    for (const id of compIds) {
      const c = cleanedByAtomId.get(id);
      const o = byId.get(id);
      if (!c || !o) continue;
      ids.push(id);
      originals.push({ x: o.x, y: o.y });
      cleanedPts.push(c);
    }
    if (ids.length === 0) continue;
    if (ids.length === 1) {
      // Keep lone atoms where the user drew them.
      updates.set(ids[0]!, originals[0]!);
      continue;
    }
    const aligned = alignCleanedPoints(cleanedPts, originals, {
      scaleRatio: 1,
      allowReflection: false,
    });
    if (!aligned) continue;
    for (let i = 0; i < ids.length; i++) updates.set(ids[i]!, aligned[i]!);
  }

  if (updates.size === 0) return applyCenteredChargeSeats(prev);
  return applyCenteredChargeSeats({
    ...prev,
    atoms: prev.atoms.map(a => {
      const u = updates.get(a.id);
      return u ? { ...a, x: u.x, y: u.y } : a;
    }),
  });
};

const CENTERED_CHARGE_OFFSET = { x: 0, y: -16 };

/** ± marks sit on the atom midline (12 o'clock) after cleanup, not leftover drag seats. */
const applyCenteredChargeSeats = (mol: Molecule): Molecule => {
  let changed = false;
  const atoms = mol.atoms.map(a => {
    const q = a.charge ?? 0;
    const dq = a.deltaCharge ?? 0;
    if (!q && !dq) return a;
    changed = true;
    return {
      ...a,
      ...(q ? { chargeOffset: CENTERED_CHARGE_OFFSET } : {}),
      ...(dq ? { deltaChargeOffset: CENTERED_CHARGE_OFFSET } : {}),
    };
  });
  return changed ? { ...mol, atoms } : mol;
};

/**
 * Merge a globally cleaned molblock back into the live molecule: keep stable
 * atom/bond ids and presentation, adopt cleaned coordinates ONLY — rematched
 * per connected component so reaction schemes stay in place.
 *
 * Cleanup must never add/remove atoms or bonds. Prefer index alignment when
 * counts match; if Indigo expands/contracts explicit H, fall back to matching
 * heavy-atom sequences. Never replace with freshly-parsed IDs.
 */
export const mergeGlobalCleanup = (prev: Molecule, cleanedMolblock: string): Molecule => {
  const cleaned = parseMolblock(cleanedMolblock);
  if (prev.atoms.length === 0) return prev;
  if (cleaned.atoms.length === 0) return prev;

  const finish = (mol: Molecule): Molecule => ({
    ...mol,
    strokes: prev.strokes,
    reactionArrows: prev.reactionArrows,
    canvasTexts: prev.canvasTexts,
    ringFills: prev.ringFills,
    ringFill: prev.ringFill,
  });

  if (prev.atoms.length === cleaned.atoms.length) {
    const cleanedById = new Map<string, Point>();
    for (let i = 0; i < prev.atoms.length; i++) {
      const a = cleaned.atoms[i]!;
      cleanedById.set(prev.atoms[i]!.id, { x: a.x, y: a.y });
    }
    return finish(alignCleanupCoordsPerComponent(prev, cleanedById));
  }

  // Indigo sometimes adds/drops explicit H vs the canvas graph.
  const heavyPrev = prev.atoms.filter(a => a.element !== 'H' && a.element !== 'D');
  const heavyLaid = cleaned.atoms.filter(a => a.element !== 'H' && a.element !== 'D');
  if (heavyPrev.length === 0 || heavyPrev.length !== heavyLaid.length) {
    console.warn(
      '[cleanup] atom count mismatch — refusing to replace molecule',
      prev.atoms.length,
      '→',
      cleaned.atoms.length,
    );
    return prev;
  }

  const cleanedById = new Map<string, Point>();
  for (let i = 0; i < heavyPrev.length; i++) {
    const a = heavyLaid[i]!;
    cleanedById.set(heavyPrev[i]!.id, { x: a.x, y: a.y });
  }
  return finish(alignCleanupCoordsPerComponent(prev, cleanedById));
};

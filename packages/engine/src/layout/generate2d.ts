/**
 * Native 2D coordinate generation ("cleanup").
 *
 * Unified carbon-skeleton graph traversal — see skeletonLayout.ts.
 * Output coordinates are canvas pixels at the requested bond length.
 */
import type { Atom, Molecule } from '@moldraw/domain';
import { lockedConformationAtomIds } from '@moldraw/domain';
import { buildGraph, connectedComponents } from '../graph';
import { perceiveRings } from '../chem/rings';
import type { Generate2DOptions } from '../types';
import { MOLBLOCK_SCALE } from '../types';
import { centroidOf, type Vec } from './layoutGeometry';
import { isAcceptableLayout } from './layoutQuality';
import { refine2DEnergy } from './refine2dEnergy';
import { layoutComponentSkeleton } from './skeletonLayout';

/**
 * Drop hydrogens before 2D layout. Explicit alkyl / aromatic `[H]` must not
 * participate in ChemDraw-style depiction (H is implicit on canvas). Bridging
 * H (degree > 1, rare) is also dropped for 2D — keep topology via heavy atoms only.
 */
export const stripTerminalHydrogensForLayout = (mol: Molecule): Molecule => {
  const keep = new Set(mol.atoms.filter(a => a.element !== 'H' && a.element !== 'D').map(a => a.id));
  if (keep.size === mol.atoms.length) return mol;
  return {
    ...mol,
    atoms: mol.atoms.filter(a => keep.has(a.id)),
    bonds: mol.bonds.filter(b => keep.has(b.fromAtomId) && keep.has(b.toAtomId)),
  };
};

const applyPositions = (mol: Molecule, pos: Map<string, Vec>): Molecule => {
  const origCx = mol.atoms.reduce((s, a) => s + a.x, 0) / Math.max(mol.atoms.length, 1);
  const origCy = mol.atoms.reduce((s, a) => s + a.y, 0) / Math.max(mol.atoms.length, 1);
  let nx = 0;
  let ny = 0;
  for (const a of mol.atoms) {
    const p = pos.get(a.id)!;
    nx += p.x;
    ny += p.y;
  }
  nx /= Math.max(mol.atoms.length, 1);
  ny /= Math.max(mol.atoms.length, 1);
  const dx = origCx - nx;
  const dy = origCy - ny;
  const atoms: Atom[] = mol.atoms.map(a => {
    const p = pos.get(a.id)!;
    return { ...a, x: p.x + dx, y: p.y + dy };
  });
  return { ...mol, atoms };
};

const layoutMolecule = (
  mol: Molecule,
  bondLen: number,
  mode: 'full' | 'correct',
  preserveOrientation: boolean,
): Molecule => {
  if (mol.atoms.length === 0 || bondLen <= 0) return mol;
  const g = buildGraph(mol);
  const rings = perceiveRings(mol);
  const orig = new Map<string, Vec>();
  for (const a of mol.atoms) orig.set(a.id, { x: a.x, y: a.y });
  const lockedAtomIds = lockedConformationAtomIds(mol);

  const pos = new Map<string, Vec>();
  let cursor: Vec = { x: 0, y: 0 };

  for (const comp of connectedComponents(mol)) {
    const origin = preserveOrientation || mode === 'correct' ? centroidOf(comp, orig) : cursor;
    const compPos = layoutComponentSkeleton({
      g,
      comp,
      rings,
      bondLen,
      origin,
      orig,
      mode,
      lockedAtomIds,
      preserveOrientation: preserveOrientation && mode === 'full',
    });
    for (const [id, p] of compPos) pos.set(id, p);
    if (mode === 'full' && !preserveOrientation) {
      const pts = comp.map(id => compPos.get(id)).filter(Boolean) as Vec[];
      if (pts.length) {
        cursor = { x: Math.max(...pts.map(p => p.x)) + bondLen * 6, y: 0 };
      }
    }
  }
  return applyPositions(mol, pos);
};

/**
 * Fast cleanup for existing drawings: correct bond angles (120° zig-zag chains / trigonal
 * branches) while keeping well-formed rings and overall orientation.
 */
export const correctLayoutInPlace = (mol: Molecule, bondLen: number): Molecule => {
  const seeded = layoutMolecule(mol, bondLen, 'correct', true);
  // Stage 2: spring refine when the corrected layout is still tangled.
  if (!isAcceptableLayout(seeded)) {
    return refine2DEnergy(seeded, { bondLengthPx: bondLen, onlyIfNeeded: false });
  }
  return seeded;
};

export const generate2D = (
  mol: Molecule,
  options: Generate2DOptions | number = {},
): Molecule => {
  const opts: Generate2DOptions =
    typeof options === 'number' ? { bondLengthPx: options } : options;
  const bondLen =
    opts.bondLengthPx != null && opts.bondLengthPx > 0 ? opts.bondLengthPx : MOLBLOCK_SCALE;
  // Strip explicit terminal H so polycyclic SMILES paste stays interactive and
  // matches ChemDraw-style heavy-atom depictions.
  const stripped = stripTerminalHydrogensForLayout(mol);
  const seeded = layoutMolecule(stripped, bondLen, 'full', opts.preserveOrientation ?? false);
  // Stage 2 energy refine — only when Stage 1 fails the quality gate (keeps
  // aspirin/benzene fast; untangles paclitaxel-scale polycyclics).
  // Cleanup may skip this and apply its own budgeted polish.
  if (!opts.skipEnergyRefine && !isAcceptableLayout(seeded)) {
    const refined = refine2DEnergy(seeded, { bondLengthPx: bondLen, onlyIfNeeded: false });
    return restoreLockedFromSeed(seeded, refined);
  }
  return seeded;
};

/** Keep chair/boat relative geometry after energy refine. */
const restoreLockedFromSeed = (seed: Molecule, refined: Molecule): Molecule => {
  const locked = lockedConformationAtomIds(seed);
  if (locked.size === 0) return refined;
  const srcById = new Map(seed.atoms.map(a => [a.id, a]));
  const tgtById = new Map(refined.atoms.map(a => [a.id, a]));
  const ids = [...locked].filter(id => srcById.has(id) && tgtById.has(id));
  if (ids.length === 0) return refined;
  let srcCx = 0;
  let srcCy = 0;
  let tgtCx = 0;
  let tgtCy = 0;
  for (const id of ids) {
    const s = srcById.get(id)!;
    const t = tgtById.get(id)!;
    srcCx += s.x;
    srcCy += s.y;
    tgtCx += t.x;
    tgtCy += t.y;
  }
  const n = ids.length;
  srcCx /= n;
  srcCy /= n;
  tgtCx /= n;
  tgtCy /= n;
  const lockedSet = new Set(ids);
  return {
    ...refined,
    atoms: refined.atoms.map(a => {
      if (!lockedSet.has(a.id)) return a;
      const s = srcById.get(a.id)!;
      return { ...a, x: tgtCx + (s.x - srcCx), y: tgtCy + (s.y - srcCy) };
    }),
    ringConformations: seed.ringConformations ?? refined.ringConformations,
  };
};

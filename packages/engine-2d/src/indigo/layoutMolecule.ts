/**
 * Indigo-only 2D layout for a Molecule graph.
 *
 * Native generate2D / cleanupStructure are disconnected from the live app path.
 * Coordinates come from Indigo WASM; IDs/aliases/charges are preserved via merge.
 */
import type { Molecule } from '@moldraw/domain';
import { moleculeToMolblock, parseMolblock } from '@moldraw/core';
import { mergeGlobalCleanup, resolveCleanupBondLength } from '@moldraw/core';
import { indigoLayoutMolblock, type IndigoLayoutOptions } from './layout2d';
import { getIndigoOrNull, loadIndigo, isIndigoReady } from './loadIndigo';
import type { IndigoKetcher } from './types';
import type { Generate2DOptions } from '@moldraw/engine';

export interface IndigoLayoutMoleculeResult {
  molecule: Molecule;
  source: 'indigo';
}

/** Uniformize average bond length to target canvas px. */
export const scaleMoleculeBonds = (mol: Molecule, bondLengthPx: number): Molecule => {
  if (mol.atoms.length === 0 || bondLengthPx <= 0) return mol;
  let sum = 0;
  let n = 0;
  for (const b of mol.bonds) {
    const a1 = mol.atoms.find(a => a.id === b.fromAtomId);
    const a2 = mol.atoms.find(a => a.id === b.toAtomId);
    if (!a1 || !a2) continue;
    const d = Math.hypot(a1.x - a2.x, a1.y - a2.y);
    if (d > 1e-6) {
      sum += d;
      n += 1;
    }
  }
  if (n === 0) return mol;
  const avg = sum / n;
  const factor = bondLengthPx / avg;
  if (!Number.isFinite(factor) || Math.abs(factor - 1) < 0.02) return mol;
  const cx = mol.atoms.reduce((s, a) => s + a.x, 0) / mol.atoms.length;
  const cy = mol.atoms.reduce((s, a) => s + a.y, 0) / mol.atoms.length;
  return {
    ...mol,
    atoms: mol.atoms.map(a => ({
      ...a,
      x: cx + (a.x - cx) * factor,
      y: cy + (a.y - cy) * factor,
    })),
  };
};

/**
 * Apply Indigo molblock coords onto `mol` by atom index.
 * Prefer mergeGlobalCleanup (centroid preserve). If that refuses (rare),
 * still apply parsed coords so Cleanup never looks like a no-op.
 */
const applyIndigoMolblock = (
  mol: Molecule,
  laidMb: string,
  bondLen: number,
): Molecule | null => {
  const merged = mergeGlobalCleanup(mol, laidMb);
  if (merged !== mol) {
    return scaleMoleculeBonds(merged, bondLen);
  }
  // merge refused (atom-count mismatch). Try heavy-only index map: Indigo
  // sometimes expands/contracts explicit H vs our canvas graph.
  const laid = parseMolblock(laidMb);
  if (laid.atoms.length === 0) return null;
  if (laid.atoms.length === mol.atoms.length) {
    const next = {
      ...mol,
      atoms: mol.atoms.map((a, i) => ({
        ...a,
        x: laid.atoms[i]!.x,
        y: laid.atoms[i]!.y,
      })),
    };
    return scaleMoleculeBonds(next, bondLen);
  }
  // Match by element sequence ignoring H on both sides.
  const heavyPrev = mol.atoms.filter(a => a.element !== 'H' && a.element !== 'D');
  const heavyLaid = laid.atoms.filter(a => a.element !== 'H' && a.element !== 'D');
  if (heavyPrev.length === 0 || heavyPrev.length !== heavyLaid.length) return null;
  const coordById = new Map<string, { x: number; y: number }>();
  for (let i = 0; i < heavyPrev.length; i++) {
    coordById.set(heavyPrev[i]!.id, { x: heavyLaid[i]!.x, y: heavyLaid[i]!.y });
  }
  const next = {
    ...mol,
    atoms: mol.atoms.map(a => {
      const c = coordById.get(a.id);
      return c ? { ...a, x: c.x, y: c.y } : a;
    }),
  };
  return scaleMoleculeBonds(next, bondLen);
};

/**
 * Sync Indigo layout. Requires WASM already loaded (`loadIndigo()` first).
 * Returns null on failure — never falls back to native layout.
 */
export const layoutMoleculeIndigoSync = (
  mol: Molecule,
  options: Generate2DOptions & IndigoLayoutOptions = {},
  indigo?: IndigoKetcher | null,
): Molecule | null => {
  if (mol.atoms.length === 0) return mol;
  const eng = indigo ?? getIndigoOrNull();
  if (!eng) return null;
  const bondLen =
    options.bondLengthPx != null && options.bondLengthPx > 0
      ? options.bondLengthPx
      : resolveCleanupBondLength(mol, undefined);
  const mb = moleculeToMolblock(mol);
  const laid = indigoLayoutMolblock(mb, eng, {
    mode: options.mode ?? 'layout',
    selectedAtomIndices: options.selectedAtomIndices,
  });
  if (!laid) return null;
  return applyIndigoMolblock(mol, laid, bondLen);
};

/**
 * Async Indigo layout — loads WASM if needed. No native fallback.
 */
export const layoutMoleculeIndigo = async (
  mol: Molecule,
  options: Generate2DOptions & IndigoLayoutOptions = {},
): Promise<IndigoLayoutMoleculeResult> => {
  if (mol.atoms.length === 0) {
    return { molecule: mol, source: 'indigo' };
  }
  const eng = getIndigoOrNull() ?? (await loadIndigo());
  if (!eng) {
    throw new Error('Indigo WASM is required for 2D layout but failed to load');
  }
  const next = layoutMoleculeIndigoSync(mol, options, eng);
  if (!next) {
    throw new Error('Indigo 2D layout failed (topology mismatch or empty result)');
  }
  return { molecule: next, source: 'indigo' };
};

/**
 * Drop-in async replacement for cleanupStructure — Indigo only.
 */
export const cleanupWithIndigo = async (
  mol: Molecule,
  options: {
    bondLengthPx?: number;
    mode?: IndigoLayoutOptions['mode'];
    selectedAtomIndices?: number[];
  } = {},
): Promise<IndigoLayoutMoleculeResult> => {
  const bondLen = resolveCleanupBondLength(mol, options.bondLengthPx);
  return layoutMoleculeIndigo(mol, {
    bondLengthPx: bondLen,
    mode: options.mode ?? 'layout',
    selectedAtomIndices: options.selectedAtomIndices,
  });
};

export { isIndigoReady };

/**
 * Stable connected-component (fragment) ids for Objects panel keys.
 */
import type { Molecule } from '@moldraw/domain';
import { documentFragmentBoxes } from '../align/selectionArrange';

const newId = () => Math.random().toString(36).slice(2, 11);

export const fragmentOutlineKey = (fragmentId: string): string => `mol:${fragmentId}`;

export const parseFragmentOutlineKey = (key: string): string | null =>
  key.startsWith('mol:') && !key.includes(',') ? key.slice(4) : null;

/**
 * Assign / preserve fragment ids per connected component.
 * Prefer majority vote of existing atom→fragment mappings so Objects keys stay stable
 * across small edits.
 */
export function ensureFragmentIds(mol: Molecule): Molecule {
  if (mol.atoms.length === 0) {
    if (!mol.fragmentByAtomId) return mol;
    const next = { ...mol };
    delete next.fragmentByAtomId;
    return next;
  }

  const boxes = documentFragmentBoxes(mol);
  const prev = mol.fragmentByAtomId ?? {};
  const next: Record<string, string> = {};
  const used = new Set<string>();

  for (const box of boxes) {
    const votes = new Map<string, number>();
    for (const id of box.atomIds) {
      const fid = prev[id];
      if (!fid) continue;
      votes.set(fid, (votes.get(fid) ?? 0) + 1);
    }
    let best: string | null = null;
    let bestN = 0;
    for (const [fid, n] of votes) {
      if (used.has(fid)) continue;
      if (n > bestN) {
        best = fid;
        bestN = n;
      }
    }
    const fragmentId = best ?? newId();
    used.add(fragmentId);
    for (const id of box.atomIds) next[id] = fragmentId;
  }

  const prevKeys = Object.keys(prev);
  const nextKeys = Object.keys(next);
  if (
    prevKeys.length === nextKeys.length &&
    nextKeys.every(k => prev[k] === next[k])
  ) {
    return mol;
  }
  return { ...mol, fragmentByAtomId: next };
}

/** Group atom ids by their fragment id (after ensure). */
export function fragmentIdsForAtomIds(mol: Molecule, atomIds: string[]): string[] {
  const ensured = ensureFragmentIds(mol);
  const map = ensured.fragmentByAtomId ?? {};
  const out: string[] = [];
  const seen = new Set<string>();
  for (const id of atomIds) {
    const fid = map[id];
    if (!fid || seen.has(fid)) continue;
    seen.add(fid);
    out.push(fid);
  }
  return out;
}

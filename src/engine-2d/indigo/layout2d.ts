/**
 * Indigo 2D layout / clean2d — returns a V2000 molblock with new coordinates.
 *
 * Does not own the Molecule graph: callers merge coords back onto the existing
 * atoms (aliases, charges, strokes preserved). Native cleanupStructure remains
 * the offline fallback when Indigo is not loaded.
 */
import type { IndigoKetcher } from './types';
import { getIndigoOrNull, loadIndigo } from './loadIndigo';
import { makeIndigoOptions } from './options';

export type IndigoLayoutMode = 'layout' | 'clean2d';

export interface IndigoLayoutOptions {
  /** Prefer full smart layout (default) or soft clean2d. */
  mode?: IndigoLayoutMode;
  /**
   * 0-based atom indices for soft `clean2d` only. Empty = tidy whole structure
   * gently (still softer than full `layout`).
   */
  selectedAtomIndices?: number[];
}

/**
 * Run Indigo layout/clean2d on a molblock. Returns laid-out molfile text, or
 * null if Indigo is unavailable / failed.
 */
export const indigoLayoutMolblock = (
  molblock: string,
  indigo: IndigoKetcher,
  options: IndigoLayoutOptions = {},
): string | null => {
  const trimmed = molblock.trim();
  if (!trimmed) return null;
  const mode = options.mode ?? 'layout';
  const opts = makeIndigoOptions(indigo);
  try {
    if (mode === 'clean2d') {
      const selected = new indigo.VectorInt();
      for (const i of options.selectedAtomIndices ?? []) {
        if (Number.isFinite(i) && i >= 0) selected.push_back(Math.trunc(i));
      }
      const out = indigo.clean2d(trimmed, 'molfile', opts, selected);
      return typeof out === 'string' && out.includes('V2000') ? out : null;
    }
    const out = indigo.layout(trimmed, 'molfile', opts);
    return typeof out === 'string' && out.includes('V2000') ? out : null;
  } catch (err) {
    console.warn('[indigo] layout failed', err);
    return null;
  }
};

/**
 * Ensure Indigo is loaded, then layout. Returns null when WASM is missing or
 * layout fails (caller should use native cleanup).
 */
export const tryIndigoLayoutMolblock = async (
  molblock: string,
  options: IndigoLayoutOptions = {},
): Promise<string | null> => {
  const indigo = getIndigoOrNull() ?? (await loadIndigo());
  if (!indigo) return null;
  return indigoLayoutMolblock(molblock, indigo, options);
};

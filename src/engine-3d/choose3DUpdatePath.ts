/**
 * Decide how the 3D viewer should update after a molecule change.
 *
 * Chemistry edits (bond order/stereo/connectivity) use progressive rebuild.
 * Import / paste / Calculate structure always use the same progressive
 * center-out path. Region refine is only for non-topology local tweaks.
 */
export type Viewer3DUpdatePath =
  | { kind: 'region'; dirtyAtomIds: string[]; instant: boolean }
  | { kind: 'progressive' }
  | { kind: 'large-preview' }
  | { kind: 'none' };

/**
 * Heavy-atom budgets for native 3D (H excluded).
 * Bench (single-structure progressive, no multi-conformer):
 *   insulin PubChem CID 16129672 ≈ 405 heavy → ~10s progressive OK;
 *   alkane-C500 progressive timed out at 45s; light embed OK to 500+.
 * Multi-conformer sampling stays on much lower caps (OCL ~80, MMFF94 ~180).
 * - ≤ FULL: progressive UFF (Calculate structure / import)
 * - FULL…PREVIEW: light embed / preview only (no full UFF)
 * - > PREVIEW: flat connectivity preview (UI freeze guard)
 */
export const NATIVE_3D_FULL_HEAVY_LIMIT = 400;
export const NATIVE_3D_PREVIEW_HEAVY_LIMIT = 700;

export interface Choose3DUpdatePathInput {
  heavyCount: number;
  /** Absolute heavy-atom count change vs previous molecule. */
  heavyDelta: number;
  majorChange: boolean;
  /** Bond order/stereo/connectivity or element/charge changed. */
  topologyChanged?: boolean;
  dirtyAtomIds: string[];
  /** True when lastGood3D is a real optimized conformer (not flat 2D seed). */
  hasOptimized3D: boolean;
  fullHeavyLimit?: number;
  previewHeavyLimit?: number;
}

/** Max dirty atoms still treated as a local edit (vs major rebuild). */
export const localEditDirtyBudget = (heavyCount: number): number =>
  Math.max(20, Math.floor(heavyCount * 0.55));

/**
 * Progressive rebuild for chemistry edits and imports. Region refine only for
 * tiny local geometry tweaks when topology did not change.
 */
export const choose3DUpdatePath = (input: Choose3DUpdatePathInput): Viewer3DUpdatePath => {
  const fullHeavyLimit = input.fullHeavyLimit ?? NATIVE_3D_FULL_HEAVY_LIMIT;
  const previewHeavyLimit = input.previewHeavyLimit ?? NATIVE_3D_PREVIEW_HEAVY_LIMIT;
  const { heavyCount, heavyDelta, dirtyAtomIds, hasOptimized3D, topologyChanged } = input;
  const dirtyCount = dirtyAtomIds.length;

  if (heavyCount <= 0) return { kind: 'none' };
  if (heavyCount > previewHeavyLimit) return { kind: 'large-preview' };

  const localBudget = localEditDirtyBudget(heavyCount);
  // Import / paste: many new heavy atoms, or no seed yet.
  const isImportScale = heavyDelta >= 6 || !hasOptimized3D;

  // Bond order / stereo / add-delete / element edits → full progressive rebuild
  // so the 3D viewer always matches the new chemistry (not a stale region pose).
  if (topologyChanged && !isImportScale && hasOptimized3D) {
    if (heavyCount > fullHeavyLimit) return { kind: 'large-preview' };
    return { kind: 'progressive' };
  }

  // Local edit with a usable 3D seed → region refine (never progressive).
  if (
    hasOptimized3D &&
    !isImportScale &&
    dirtyCount > 0 &&
    dirtyCount <= localBudget &&
    heavyCount > 12
  ) {
    const instant = dirtyCount <= 8 && heavyCount <= 140;
    return { kind: 'region', dirtyAtomIds, instant };
  }

  // Fallback: seed exists but dirty set is huge (rare) — still region if not import.
  if (hasOptimized3D && !isImportScale && dirtyCount > 0 && heavyCount > 12) {
    return { kind: 'region', dirtyAtomIds, instant: false };
  }

  // Import / Calculate structure / major rebuild — same progressive path for
  // all molecules up to the full UFF limit (cholesterol, paclitaxel, …).
  if (heavyCount > fullHeavyLimit) return { kind: 'large-preview' };
  return { kind: 'progressive' };
};

/** Sources that count as a real 3D seed for region refine. */
export const isOptimized3DSource = (source: string): boolean => {
  if (!source) return false;
  if (source.startsWith('preview-flat')) return false;
  if (source.startsWith('preview-connectivity')) return false;
  if (source === 'native-3d-fallback' || source === 'native-3d-large') return false;
  return (
    source.startsWith('native-3d') ||
    source === 'preview-native-3d' ||
    source.includes('progressive') ||
    source.includes('region')
  );
};

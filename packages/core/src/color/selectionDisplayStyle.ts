import type { Molecule } from '@moldraw/domain';

export const LABEL_FONT_SIZE_PRESETS_PT = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24] as const;
export const BOND_THICKNESS_PRESETS_PX = [1, 1.5, 2, 2.5, 3, 4, 5, 6] as const;

function clampFontPt(pt: number): number {
  return Math.max(6, Math.min(48, pt));
}

function clampThicknessPx(px: number): number {
  return Math.max(0.5, Math.min(14, px));
}

function clampOpacity(op: number): number {
  return Math.max(0, Math.min(1, op));
}

/**
 * Multiply a perspective (or empty) opacity map by per-atom `opacity` overrides.
 */
export function mergeDocumentAtomOpacity(
  mol: Molecule,
  base: Map<string, number>,
): Map<string, number> {
  let out: Map<string, number> | null = null;
  for (const a of mol.atoms) {
    if (a.opacity == null) continue;
    const o = clampOpacity(a.opacity);
    if (!out) out = new Map(base);
    out.set(a.id, (out.get(a.id) ?? 1) * o);
  }
  return out ?? base;
}

/**
 * Apply or clear per-atom label font size, per-bond thickness, and/or opacity
 * for a selection. `null` clears the override; `undefined` leaves unchanged.
 */
export function applySelectionDisplayStyle(
  prev: Molecule,
  opts: {
    atomIds: string[];
    bondIds?: string[];
    labelFontSizePt?: number | null;
    bondThicknessPx?: number | null;
    /** 0–1; applies to selected atoms and selected/touching bonds. */
    opacity?: number | null;
  },
): Molecule {
  const { labelFontSizePt, bondThicknessPx, opacity } = opts;
  if (
    labelFontSizePt === undefined &&
    bondThicknessPx === undefined &&
    opacity === undefined
  ) {
    return prev;
  }

  let next = prev;
  const atomSet = new Set(opts.atomIds);
  const bondSet =
    opts.bondIds && opts.bondIds.length > 0 ? new Set(opts.bondIds) : null;

  const bondHits = (b: { id: string; fromAtomId: string; toAtomId: string }) =>
    bondSet
      ? bondSet.has(b.id)
      : atomSet.has(b.fromAtomId) || atomSet.has(b.toAtomId);

  if (labelFontSizePt !== undefined && atomSet.size > 0) {
    next = {
      ...next,
      atoms: next.atoms.map(a => {
        if (!atomSet.has(a.id)) return a;
        if (labelFontSizePt === null) {
          if (a.labelFontSizePt == null) return a;
          const { labelFontSizePt: _drop, ...rest } = a;
          return rest;
        }
        const pt = clampFontPt(labelFontSizePt);
        return a.labelFontSizePt === pt ? a : { ...a, labelFontSizePt: pt };
      }),
    };
  }

  if (bondThicknessPx !== undefined) {
    next = {
      ...next,
      bonds: next.bonds.map(b => {
        if (!bondHits(b)) return b;
        if (bondThicknessPx === null) {
          if (b.thicknessPx == null) return b;
          const { thicknessPx: _drop, ...rest } = b;
          return rest;
        }
        const px = clampThicknessPx(bondThicknessPx);
        return b.thicknessPx === px ? b : { ...b, thicknessPx: px };
      }),
    };
  }

  if (opacity !== undefined) {
    if (atomSet.size > 0) {
      next = {
        ...next,
        atoms: next.atoms.map(a => {
          if (!atomSet.has(a.id)) return a;
          if (opacity === null) {
            if (a.opacity == null) return a;
            const { opacity: _drop, ...rest } = a;
            return rest;
          }
          const op = clampOpacity(opacity);
          return a.opacity === op ? a : { ...a, opacity: op };
        }),
      };
    }
    // Opacity stays inside the selection: explicit bondIds, or bonds with BOTH
    // ends selected (ring-only). Do not fade substituent bonds leaving the ring.
    const opacityBondHit = (b: { id: string; fromAtomId: string; toAtomId: string }) => {
      if (bondSet) return bondSet.has(b.id);
      if (atomSet.size === 0) return false;
      return atomSet.has(b.fromAtomId) && atomSet.has(b.toAtomId);
    };
    const hasBondTargets = next.bonds.some(opacityBondHit);
    if (hasBondTargets) {
      next = {
        ...next,
        bonds: next.bonds.map(b => {
          if (!opacityBondHit(b)) return b;
          if (opacity === null) {
            if (b.opacity == null) return b;
            const { opacity: _drop, ...rest } = b;
            return rest;
          }
          const op = clampOpacity(opacity);
          return b.opacity === op ? b : { ...b, opacity: op };
        }),
      };
    }
  }

  return next;
}

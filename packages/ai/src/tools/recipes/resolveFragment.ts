import type { AiExecutionContext, AiToolResult } from '../../types';
import { buildCanvasStateSnapshot, type CanvasStateMolecule } from '@moldraw/core';
import { toolFail } from '../types';

export type FragmentSelector = {
  moleculeIndex?: number;
  smilesIncludes?: string;
  atomIds?: string[];
  useSelection?: boolean;
};

export type ResolvedFragment = {
  atomIds: string[];
  moleculeIndex?: number;
  bbox?: CanvasStateMolecule['bbox'];
};

function hasExplicitSelector(sel: FragmentSelector): boolean {
  return (
    sel.atomIds != null ||
    sel.moleculeIndex != null ||
    (sel.smilesIncludes != null && sel.smilesIncludes.length > 0)
  );
}

/**
 * Resolve atom ids for a single fragment from index / SMILES / explicit ids / selection.
 */
export function resolveFragmentAtomIds(
  ctx: AiExecutionContext,
  sel: FragmentSelector,
): { ok: true; data: ResolvedFragment } | { ok: false; error: AiToolResult } {
  if (sel.atomIds && sel.atomIds.length > 0) {
    return { ok: true, data: { atomIds: sel.atomIds } };
  }

  const snap = buildCanvasStateSnapshot(ctx.getMolecule(), {
    includeCoords: false,
    includeAnnotations: false,
    includeSmiles: true,
  });

  if (sel.moleculeIndex != null) {
    const mol = snap.molecules[sel.moleculeIndex];
    if (!mol) {
      return {
        ok: false,
        error: toolFail(
          'EXECUTION',
          `No molecule at index ${sel.moleculeIndex} (count=${snap.molecules.length}).`,
        ),
      };
    }
    return {
      ok: true,
      data: { atomIds: mol.atomIds, moleculeIndex: mol.index, bbox: mol.bbox },
    };
  }

  if (sel.smilesIncludes) {
    const needle = sel.smilesIncludes.toLowerCase();
    const matches = snap.molecules.filter(
      m => m.smiles != null && m.smiles.toLowerCase().includes(needle),
    );
    if (matches.length === 0) {
      return {
        ok: false,
        error: toolFail(
          'EXECUTION',
          `SMILES matched 0/${snap.molecules.length} fragments for "${sel.smilesIncludes}".`,
        ),
      };
    }
    if (matches.length > 1) {
      return {
        ok: false,
        error: toolFail(
          'EXECUTION',
          `SMILES matched ${matches.length}/${snap.molecules.length} fragments for "${sel.smilesIncludes}"; use moleculeIndex.`,
        ),
      };
    }
    const mol = matches[0]!;
    return {
      ok: true,
      data: { atomIds: mol.atomIds, moleculeIndex: mol.index, bbox: mol.bbox },
    };
  }

  const useSelection = sel.useSelection !== false;
  if (useSelection && !hasExplicitSelector(sel)) {
    const atomIds = ctx.getSelection?.()?.atomIds ?? [];
    if (atomIds.length === 0) {
      return {
        ok: false,
        error: toolFail(
          'EXECUTION',
          'No fragment selected. Pass moleculeIndex, smilesIncludes, atomIds, or select atoms on the canvas.',
        ),
      };
    }
    return { ok: true, data: { atomIds } };
  }

  return {
    ok: false,
    error: toolFail(
      'EXECUTION',
      'No fragment selector. Pass moleculeIndex, smilesIncludes, atomIds, or select atoms.',
    ),
  };
}

/**
 * Union atom ids from moleculeIndexes, explicit atomIds, or selection (for align/distribute).
 */
export function resolveMultiFragmentAtomIds(
  ctx: AiExecutionContext,
  opts: {
    moleculeIndexes?: number[];
    atomIds?: string[];
    useSelection?: boolean;
    minFragments: number;
  },
): { ok: true; data: { atomIds: string[]; fragmentCount: number } } | { ok: false; error: AiToolResult } {
  if (opts.atomIds && opts.atomIds.length > 0) {
    const snap = buildCanvasStateSnapshot(ctx.getMolecule(), {
      includeCoords: false,
      includeAnnotations: false,
      includeSmiles: false,
    });
    const selected = new Set(opts.atomIds);
    const fragmentCount = snap.molecules.filter(m => m.atomIds.some(id => selected.has(id))).length;
    if (fragmentCount < opts.minFragments) {
      return {
        ok: false,
        error: toolFail(
          'EXECUTION',
          `Need at least ${opts.minFragments} molecules; atomIds cover ${fragmentCount}.`,
        ),
      };
    }
    return { ok: true, data: { atomIds: opts.atomIds, fragmentCount } };
  }

  if (opts.moleculeIndexes && opts.moleculeIndexes.length > 0) {
    if (opts.moleculeIndexes.length < opts.minFragments) {
      return {
        ok: false,
        error: toolFail(
          'EXECUTION',
          `Need at least ${opts.minFragments} moleculeIndexes (got ${opts.moleculeIndexes.length}).`,
        ),
      };
    }
    const snap = buildCanvasStateSnapshot(ctx.getMolecule(), {
      includeCoords: false,
      includeAnnotations: false,
      includeSmiles: false,
    });
    const atomIds: string[] = [];
    for (const idx of opts.moleculeIndexes) {
      const mol = snap.molecules[idx];
      if (!mol) {
        return {
          ok: false,
          error: toolFail(
            'EXECUTION',
            `No molecule at index ${idx} (count=${snap.molecules.length}).`,
          ),
        };
      }
      atomIds.push(...mol.atomIds);
    }
    return {
      ok: true,
      data: { atomIds, fragmentCount: opts.moleculeIndexes.length },
    };
  }

  const useSelection = opts.useSelection !== false;
  if (useSelection) {
    const atomIds = ctx.getSelection?.()?.atomIds ?? [];
    if (atomIds.length === 0) {
      return {
        ok: false,
        error: toolFail(
          'EXECUTION',
          `Nothing selected. Pass moleculeIndexes (≥${opts.minFragments}) or select atoms spanning that many molecules.`,
        ),
      };
    }
    const snap = buildCanvasStateSnapshot(ctx.getMolecule(), {
      includeCoords: false,
      includeAnnotations: false,
      includeSmiles: false,
    });
    const selected = new Set(atomIds);
    const fragmentCount = snap.molecules.filter(m => m.atomIds.some(id => selected.has(id))).length;
    if (fragmentCount < opts.minFragments) {
      return {
        ok: false,
        error: toolFail(
          'EXECUTION',
          `Need at least ${opts.minFragments} molecules in selection (found ${fragmentCount}).`,
        ),
      };
    }
    return { ok: true, data: { atomIds, fragmentCount } };
  }

  return {
    ok: false,
    error: toolFail(
      'EXECUTION',
      `Pass moleculeIndexes (≥${opts.minFragments}), atomIds, or select atoms.`,
    ),
  };
}

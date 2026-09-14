import { CMD } from '@moldraw/core';
import { applyDisplayStyleInputSchema } from '../../schemas/tools';
import type { RegisteredAiTool } from '../types';
import { dispatchCommand, toolFail, toolOk } from '../types';

/**
 * Per-atom label font size, per-bond thickness, and/or opacity.
 * Overrides Settings defaults; null clears the override.
 */
export const applyDisplayStyleTool: RegisteredAiTool = {
  id: 'molecule.apply_display_style',
  category: 'recipe',
  description:
    'Set label font size (pt), bond thickness (px), and/or opacity (0–1) for the selection, all atoms, or one element. ' +
    'Use for “make labels bigger”, “thicker bonds”, “make selection transparent/50% opacity”, “fade oxygen”. ' +
    'Overrides Settings; pass null to clear overrides. Does not change global Settings font family / bold.',
  inputSchema: applyDisplayStyleInputSchema,
  handler: (input, ctx) => {
    const {
      labelFontSizePt,
      bondThicknessPx,
      opacity,
      atomIds: rawAtomIds,
      bondIds: rawBondIds,
      element: rawEl,
      all = false,
      useSelection = true,
    } = input as {
      labelFontSizePt?: number | null;
      bondThicknessPx?: number | null;
      opacity?: number | null;
      atomIds?: string[];
      bondIds?: string[];
      element?: string;
      all?: boolean;
      useSelection?: boolean;
    };

    if (
      labelFontSizePt === undefined &&
      bondThicknessPx === undefined &&
      opacity === undefined
    ) {
      return toolFail(
        'VALIDATION',
        'Provide labelFontSizePt, bondThicknessPx, and/or opacity (number, or null to clear).',
      );
    }

    const mol = ctx.getMolecule();
    let atomIds = rawAtomIds?.filter(Boolean) ?? [];
    let bondIds = rawBondIds?.filter(Boolean) ?? [];

    if (atomIds.length === 0 && bondIds.length === 0) {
      if (rawEl) {
        const element = rawEl.trim();
        if (!/^[A-Z][a-z]?$/.test(element)) {
          return toolFail(
            'VALIDATION',
            `Invalid element symbol "${rawEl}". Use O, N, Cl, etc.`,
          );
        }
        atomIds = mol.atoms.filter(a => a.element === element).map(a => a.id);
        if (atomIds.length === 0) {
          return toolFail('EXECUTION', `No ${element} atoms on the canvas.`);
        }
      } else if (all) {
        atomIds = mol.atoms.map(a => a.id);
        bondIds = mol.bonds.map(b => b.id);
      } else if (useSelection) {
        const sel = ctx.getSelection?.();
        atomIds = sel?.atomIds ?? [];
        bondIds = sel?.bondIds ?? [];
      }
    }

    if (atomIds.length === 0 && bondIds.length === 0) {
      return toolFail(
        'EXECUTION',
        'Nothing to style. Select atoms/bonds, pass atomIds/bondIds, element, or all:true.',
      );
    }

    // Font size needs atoms; thickness/opacity can use bonds or atoms-adjacent bonds.
    if (labelFontSizePt !== undefined && atomIds.length === 0) {
      return toolFail(
        'EXECUTION',
        'labelFontSizePt needs atom targets (selection, atomIds, element, or all).',
      );
    }

    const result = dispatchCommand(ctx, CMD.ApplySelectionDisplayStyle, {
      atomIds,
      bondIds: bondIds.length > 0 ? bondIds : undefined,
      labelFontSizePt,
      bondThicknessPx,
      opacity,
    });
    if (!result.ok) return result;

    if (atomIds.length > 0 || bondIds.length > 0) {
      ctx.setSelection?.({ atomIds, bondIds });
    }

    return toolOk({
      atomCount: atomIds.length,
      bondCount: bondIds.length,
      labelFontSizePt: labelFontSizePt ?? 'unchanged',
      bondThicknessPx: bondThicknessPx ?? 'unchanged',
      opacity: opacity ?? 'unchanged',
      note: 'Per-object overrides applied. Global Settings font/bond defaults unchanged.',
    });
  },
};

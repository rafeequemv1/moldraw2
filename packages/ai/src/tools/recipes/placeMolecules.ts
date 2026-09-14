/**
 * Import several named/SMILES structures into a neat viewport grid in one call.
 * Prefer this over N× importSmiles so the model cannot scatter structures.
 */
import { z } from 'zod';
import type { RegisteredAiTool } from '../types';
import { toolFail, toolOk } from '../types';

export const placeMoleculesInputSchema = z.object({
  /** Structures to place left→right, top→bottom (3-column grid). */
  molecules: z
    .array(
      z.object({
        /** SMILES or common name / CAS (PubChem when resolveVia is auto). */
        smiles: z
          .string()
          .min(1)
          .describe('SMILES string, or a common name / CAS number (resolved via PubChem when available).'),
        /** Optional label under the structure. */
        label: z
          .string()
          .describe('Caption text drawn under the structure (e.g. the compound name).')
          .optional(),
      }),
    )
    .min(1)
    .max(24)
    .describe('Structures to place (1-24) in a grid, filled left-to-right then top-to-bottom.'),
  /**
   * Clear the canvas first. Default false — never wipe follow-up work unless
   * the user explicitly asked to start fresh.
   */
  clear: z
    .boolean()
    .describe('true clears the whole canvas before placing. Default false (place beside existing content).')
    .optional(),
  /** Grid columns (default 3). */
  cols: z
    .number()
    .int()
    .min(1)
    .max(6)
    .describe('Number of grid columns (1-6, default 3).')
    .optional(),
});

export const placeMoleculesTool: RegisteredAiTool = {
  id: 'molecule.place_molecules',
  category: 'recipe',
  description:
    'Add 2+ molecules in a neat grid (preferred over repeated importSmiles). Pass molecules[{smiles, label?}]. clear defaults false — keep existing canvas. Use for “add 5 drugs”, “draw these structures”, etc.',
  inputSchema: placeMoleculesInputSchema,
  handler: async (input, ctx) => {
    const parsed = placeMoleculesInputSchema.safeParse(input);
    if (!parsed.success) {
      return toolFail('VALIDATION', 'Invalid place_molecules input', parsed.error.flatten());
    }
    if (!ctx.importSmiles && !ctx.applyCommand) {
      return toolFail(
        'NO_DISPATCHER',
        'molecule.place_molecules requires ctx.importSmiles or ctx.applyCommand.',
      );
    }

    const { molecules, clear = false } = parsed.data;

    if (clear) {
      if (!ctx.applyCommand) {
        return toolFail('NO_DISPATCHER', 'clear requires applyCommand');
      }
      const cleared = ctx.applyCommand('molecule.clearAll', {});
      if (!cleared.ok) {
        return toolFail('EXECUTION', cleared.error?.message ?? 'clearAll failed');
      }
    }

    const placed: Array<{ smiles: string; label?: string; newAtomIds: string[]; ok: boolean; error?: string }> =
      [];
    const allNewIds: string[] = [];
    let isFirst = true;
    const placeBeside =
      !clear && (ctx.getMolecule().atoms.length > 0);

    for (const m of molecules) {
      const smiles = m.smiles.trim();
      const label = m.label?.trim();
      if (!smiles) {
        placed.push({ smiles, label, newAtomIds: [], ok: false, error: 'empty smiles' });
        continue;
      }

      if (ctx.importSmiles) {
        const r = await ctx.importSmiles(smiles, {
          mode: 'merge',
          placement: 'viewport_center',
          useViewportGrid: true,
          compoundName: label,
          focus: false,
          // First structure opens a fresh neat grid (beside existing content if any).
          startFreshGrid: isFirst,
          placeBesideExisting: isFirst && placeBeside,
        });
        isFirst = false;
        if (!r.ok) {
          placed.push({
            smiles,
            label,
            newAtomIds: [],
            ok: false,
            error: r.error ?? 'Import failed',
          });
          continue;
        }
        const ids = r.newAtomIds ?? [];
        allNewIds.push(...ids);
        placed.push({ smiles, label, newAtomIds: ids, ok: true });
      } else {
        const r = ctx.applyCommand!('molecule.importSmiles', {
          smiles,
          mode: 'merge',
          placement: 'viewport_center',
        });
        if (!r.ok) {
          placed.push({
            smiles,
            label,
            newAtomIds: [],
            ok: false,
            error: r.error?.message ?? 'Import failed',
          });
          continue;
        }
        const ids = (r.extra as { newAtomIds?: string[] } | undefined)?.newAtomIds ?? [];
        allNewIds.push(...ids);
        placed.push({ smiles, label, newAtomIds: ids, ok: true });
      }
    }

    const okCount = placed.filter(p => p.ok).length;
    if (okCount === 0) {
      return toolFail(
        'EXECUTION',
        placed.map(p => p.error).filter(Boolean).join('; ') || 'No molecules imported',
      );
    }

    // One focus at the end so the viewport does not jump between grid slots.
    if (allNewIds.length > 0 && ctx.focusAtoms) {
      ctx.focusAtoms(allNewIds);
    }

    return toolOk({
      requested: molecules.length,
      placed: okCount,
      failed: molecules.length - okCount,
      newAtomIds: allNewIds,
      layout: 'viewport_grid',
      results: placed,
    });
  },
};

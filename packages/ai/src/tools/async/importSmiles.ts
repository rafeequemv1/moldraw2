import { schemas } from '@moldraw/core';
import type { RegisteredAiTool } from '../types';
import { toolFail, toolOk } from '../types';

/** Coerce common LLM argument aliases into `{ smiles: string }`. */
function normalizeImportSmilesInput(input: unknown): unknown {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return input;
  const o = { ...(input as Record<string, unknown>) };
  if (typeof o.smiles !== 'string' || !o.smiles.trim()) {
    const alt =
      o.SMILES ??
      o.name ??
      o.compound ??
      o.compoundName ??
      o.query ??
      o.structure ??
      o.value;
    if (typeof alt === 'string' && alt.trim()) {
      o.smiles = alt.trim();
    } else if (alt && typeof alt === 'object' && !Array.isArray(alt)) {
      const nested = alt as Record<string, unknown>;
      const nestedVal = nested.value ?? nested.smiles ?? nested.SMILES ?? nested.name;
      if (typeof nestedVal === 'string' && nestedVal.trim()) o.smiles = nestedVal.trim();
    }
  } else {
    o.smiles = o.smiles.trim();
  }
  return o;
}

export const importSmilesTool: RegisteredAiTool = {
  id: 'command.molecule.importSmiles',
  category: 'async',
  description:
    'Import ONE structure from SMILES or a common name/CAS. For 2+ molecules use molecule.place_molecules (neat grid). Pass { smiles: "testosterone" } or { smiles: "c1ccccc1" }.',
  inputSchema: schemas.importSmiles,
  handler: async (input, ctx) => {
    const parsed = schemas.importSmiles.safeParse(normalizeImportSmilesInput(input));
    if (!parsed.success) {
      return toolFail('VALIDATION', 'Invalid input for molecule.importSmiles', parsed.error.flatten());
    }
    const { smiles, mode, placement } = parsed.data;
    if (ctx.importSmiles) {
      const r = await ctx.importSmiles(smiles, {
        mode: mode ?? 'merge',
        placement: placement ?? 'viewport_center',
        useViewportGrid: (placement ?? 'viewport_center') === 'viewport_center',
      });
      if (!r.ok) return toolFail('EXECUTION', r.error ?? 'Import failed');
      return toolOk({ newAtomIds: r.newAtomIds });
    }
    if (ctx.applyCommand) {
      const r = ctx.applyCommand('molecule.importSmiles', {
        smiles,
        mode: mode ?? 'merge',
        placement,
      });
      if (!r.ok) {
        return toolFail(
          (r.error?.code as 'VALIDATION' | 'EXECUTION') ?? 'EXECUTION',
          r.error?.message ?? 'Import failed',
        );
      }
      const extra = (r.extra as { newAtomIds?: string[] } | undefined) ?? {};
      return toolOk({ newAtomIds: extra.newAtomIds });
    }
    return toolFail(
      'NO_DISPATCHER',
      'molecule.importSmiles requires ctx.importSmiles or ctx.applyCommand.',
    );
  },
};
